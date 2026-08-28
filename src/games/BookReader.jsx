import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { buildLookup, splitSentences } from '../engine/reader'
import { speakAndWait, stop as stopSpeech, isSupported as speechSupported } from '../engine/speech'
import { parseBookFile } from '../engine/bookParser'
import { bookIdFor, saveBook, listBooks, deleteBook, updateProgress } from '../engine/bookLibrary'
import { TextWithLookup } from '../components/TextWithLookup'
import HelpButton from '../components/HelpButton'
import './BookReader.css'

const SENTENCE_PAUSE_MS = 500

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Screen Wake Lock — see GradedReader.jsx for the same pattern and rationale
// (keeps the screen from dimming during hands-free read-aloud playback).
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) return await navigator.wakeLock.request('screen')
  } catch { /* unsupported, denied, or page not visible — fine without it */ }
  return null
}
function releaseWakeLock(lock) {
  try { lock?.release?.() } catch { /* already released */ }
}

/**
 * Library — open an EPUB or MOBI file from the device and read it with the
 * same tap-to-look-up-any-word support as Graded Reader, plus sentence-by-
 * sentence read-aloud. Unlike Graded Reader, there's no curated passage data
 * or precomputed lemma/surface-form table for arbitrary book text — lookup
 * runs live against buildLookup()+tokenise() on whatever's on screen, the
 * same direct/longest-match logic those already do, just without the
 * offline fugashi surface-forms merge Graded Reader layers on top for its
 * curated passages. No translations exist for arbitrary book text either,
 * so there's no EN toggle or per-passage vocab-practice shortcuts here —
 * just reading, lookup, and audio.
 *
 * Books are persisted to IndexedDB (see bookLibrary.js) — the browser can't
 * re-supply the original File object on its own, so what's actually kept
 * is the fully parsed result (title, cover, chapter text) plus reading
 * progress, keyed by filename+size so re-picking the same file recognizes
 * it as the same book rather than duplicating it.
 */
export default function BookReader() {
  const { activeEntries, activeLanguage, showReading, scores, goBack } = useApp()

  const [libraryBooks, setLibraryBooks] = useState([])
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [book, setBook] = useState(null)           // { id, title, cover, chapters: [{title, text}] }
  const [chapterIndex, setChapterIndex] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const lookup = useMemo(() => buildLookup(activeEntries), [activeEntries])

  const refreshLibrary = useCallback(async () => {
    try {
      setLibraryBooks(await listBooks())
    } catch { /* IndexedDB unavailable (private browsing, etc.) — library just stays empty */ }
    finally {
      setLibraryLoaded(true)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time initial load of the persisted library on mount
    refreshLibrary()
  }, [refreshLibrary])

  function openBook(record) {
    setBook(record)
    setChapterIndex(record.chapters.length === 1 ? 0 : (record.lastChapterIndex ?? null))
    setError(null)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const parsed = await parseBookFile(file)
      const id = bookIdFor(file)
      const existing = libraryBooks.find(b => b.id === id)
      const record = {
        id,
        name: file.name,
        title: parsed.title,
        cover: parsed.cover ?? null,
        chapters: parsed.chapters,
        lastChapterIndex: existing?.lastChapterIndex ?? null,
        addedAt: existing?.addedAt ?? Date.now(),
        lastOpenedAt: Date.now(),
      }
      await saveBook(record)
      await refreshLibrary()
      openBook(record)
    } catch (err) {
      setError(err.message || 'Could not read this file.')
    } finally {
      setLoading(false)
    }
  }

  function closeBook() {
    setBook(null)
    setChapterIndex(null)
    setError(null)
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!window.confirm('Remove this book from your library? This only removes it from here — the original file on your device is untouched.')) return
    await deleteBook(id)
    await refreshLibrary()
  }

  function openChapter(i) {
    setChapterIndex(i)
    if (book?.id) updateProgress(book.id, { chapterIndex: i })
  }

  function backFromReading() {
    // A single-chapter book never had a meaningful chapter list to return
    // to — go straight back to the library instead of a one-item list.
    if (book && book.chapters.length === 1) closeBook()
    else setChapterIndex(null)
  }

  // ── Reading view for the active chapter ────────────────────────────────────
  const chapter = book && chapterIndex != null ? book.chapters[chapterIndex] : null

  const paragraphs = useMemo(() => {
    if (!chapter) return []
    return chapter.text.split(/\n\s*\n/).filter(Boolean)
  }, [chapter])

  // Sentences grouped by paragraph, each carrying its flat index into the
  // full sentence list — same structure Graded Reader uses, so read-aloud
  // can walk sentences in order while rendering still groups by paragraph.
  const paragraphGroups = useMemo(() => {
    let i = 0
    return paragraphs.map(p =>
      splitSentences(p, activeLanguage).map(s => ({ text: s, index: i++ }))
    )
  }, [paragraphs, activeLanguage])
  const sentences = useMemo(() => paragraphGroups.flat().map(s => s.text), [paragraphGroups])

  const [readingIndex, setReadingIndex] = useState(-1)
  const playingRef = useRef(false)
  const wakeLockRef = useRef(null)
  const sentenceRefs = useRef([])

  useEffect(() => {
    if (readingIndex < 0) return
    sentenceRefs.current[readingIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [readingIndex])

  const stopPlaying = useCallback(() => {
    playingRef.current = false
    stopSpeech()
    setReadingIndex(-1)
    releaseWakeLock(wakeLockRef.current)
    wakeLockRef.current = null
  }, [])

  async function playChapter() {
    if (playingRef.current || sentences.length === 0) return
    playingRef.current = true
    wakeLockRef.current = await requestWakeLock()
    const rate = 0.9
    for (let i = 0; i < sentences.length; i++) {
      if (!playingRef.current) break
      setReadingIndex(i)
      await speakAndWait(sentences[i], activeLanguage, { rate })
      if (playingRef.current && i < sentences.length - 1) await sleep(SENTENCE_PAUSE_MS)
    }
    playingRef.current = false
    setReadingIndex(-1)
    releaseWakeLock(wakeLockRef.current)
    wakeLockRef.current = null
  }

  // Stop playback when switching chapters or leaving the screen
  useEffect(() => {
    return () => stopPlaying()
  }, [chapterIndex, stopPlaying])

  // ── Render: library grid — stored books + add-book tile ────────────────────
  if (!book) {
    return (
      <div className="br-screen">
        <div className="br-header">
          <button className="br-back" onClick={goBack}>← Back</button>
          <span className="br-title">Library</span>
          <HelpButton
            title="Library"
            description="Open an EPUB or MOBI file from your device and read it with the same tap-to-look-up-any-word support as Graded Reader, plus sentence-by-sentence read-aloud. Books you open are kept here (cover, title, and reading progress) so you can pick up where you left off — the original file itself isn't touched or re-read. Older MOBI files (the MOBI6/PalmDOC format) are supported; newer MOBI files built on KF8 may not extract cleanly — convert to EPUB if that happens."
          />
        </div>
        <div className="br-library-grid">
          <button className="br-book-card br-book-card--add" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            <span className="br-add-icon">{loading ? '…' : '+'}</span>
            <span className="br-add-label">{loading ? 'Opening…' : 'Add book'}</span>
          </button>
          {libraryBooks.map(b => (
            <button key={b.id} className="br-book-card" onClick={() => openBook(b)}>
              <span className="br-book-cover-wrap">
                {b.cover
                  ? <img className="br-book-cover" src={b.cover} alt="" />
                  : <span className="br-book-cover br-book-cover--placeholder">📕</span>}
                <span className="br-book-delete" onClick={e => handleDelete(b.id, e)} title="Remove from library">✕</span>
              </span>
              <span className="br-book-card-title">{b.title}</span>
            </button>
          ))}
        </div>
        {libraryLoaded && libraryBooks.length === 0 && (
          <p className="br-picker-text">Open a book from your device to start reading in {activeLanguage ? activeLanguage.toUpperCase() : 'your selected language'}.</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,.mobi,.azw,.azw3"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        {error && <p className="br-error">⚠ {error}</p>}
      </div>
    )
  }

  // ── Render: book loaded, no chapter chosen yet — chapter list ──────────────
  if (chapterIndex == null) {
    return (
      <div className="br-screen">
        <div className="br-header">
          <button className="br-back" onClick={closeBook}>← Back</button>
          <span className="br-title br-reading-title">{book.title}</span>
          <HelpButton title="Library" description="Pick a chapter to start reading." />
        </div>
        <div className="br-chapter-list">
          {book.chapters.map((c, i) => (
            <button key={i} className="br-chapter-item" onClick={() => openChapter(i)}>
              <span className="br-chapter-num">{i + 1}</span>
              <span className="br-chapter-title">{c.title}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Render: reading a chapter ───────────────────────────────────────────────
  const isPlaying = readingIndex >= 0

  return (
    <div className="br-screen">
      <div className="br-header">
        <button className="br-back" onClick={backFromReading}>← Back</button>
        <span className="br-title br-reading-title">{chapter.title}</span>
        {speechSupported() && (
          <button
            className={`br-play-btn ${isPlaying ? 'is-playing' : ''}`}
            onClick={isPlaying ? stopPlaying : playChapter}
            title={isPlaying ? 'Stop reading aloud' : 'Read this chapter aloud'}
          >
            {isPlaying ? '⏹️' : '🔊'}
          </button>
        )}
        <HelpButton
          title="Library"
          description="Tap any word for its translation. Tap 🔊 to have the chapter read aloud sentence by sentence — the currently-spoken sentence is highlighted and kept in view."
        />
      </div>

      <div className="br-body">
        <div className="br-text">
          {paragraphGroups.map((group, pi) => (
            <p key={pi} className="br-paragraph">
              {group.map(({ text: sentence, index: i }) => (
                <span
                  key={i}
                  ref={el => { sentenceRefs.current[i] = el }}
                  className={`br-sentence ${readingIndex === i ? 'br-sentence-active' : ''}`}
                >
                  <TextWithLookup text={sentence} language={activeLanguage} lookup={lookup} scores={scores} showReading={showReading} />
                  {' '}
                </span>
              ))}
            </p>
          ))}
        </div>

        <div className="br-legend">
          <span className="br-legend-item br-legend--mastered">mastered</span>
          <span className="br-legend-item br-legend--learning">learning</span>
          <span className="br-legend-item br-legend--unseen">unseen</span>
          <span className="br-legend-item br-legend--unknown">not in list</span>
        </div>
      </div>
    </div>
  )
}
