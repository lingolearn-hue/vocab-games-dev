import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { buildLookup, splitSentences } from '../engine/reader'
import { speakAndWait, stop as stopSpeech, isSupported as speechSupported } from '../engine/speech'
import { parseBookFile } from '../engine/bookParser'
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
 */
export default function BookReader() {
  const { activeEntries, activeLanguage, showReading, scores, goBack } = useApp()

  const [book, setBook] = useState(null)           // { title, chapters: [{title, text}] }
  const [chapterIndex, setChapterIndex] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const lookup = useMemo(() => buildLookup(activeEntries), [activeEntries])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const parsed = await parseBookFile(file)
      setBook(parsed)
      setChapterIndex(parsed.chapters.length === 1 ? 0 : null)
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

  // ── Render: no book loaded yet — file picker ───────────────────────────────
  if (!book) {
    return (
      <div className="br-screen">
        <div className="br-header">
          <button className="br-back" onClick={goBack}>← Back</button>
          <span className="br-title">Library</span>
          <HelpButton
            title="Library"
            description="Open an EPUB or MOBI file from your device and read it with the same tap-to-look-up-any-word support as Graded Reader, plus sentence-by-sentence read-aloud. Older MOBI files (the MOBI6/PalmDOC format) are supported; newer MOBI files built on KF8 may not extract cleanly — convert to EPUB if that happens."
          />
        </div>
        <div className="br-picker">
          <div className="br-picker-icon">📚</div>
          <p className="br-picker-text">Open a book from your device to start reading in {activeLanguage ? activeLanguage.toUpperCase() : 'your selected language'}.</p>
          <button className="br-picker-btn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            {loading ? 'Opening…' : 'Choose file (.epub / .mobi)'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.mobi,.azw,.azw3"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          {error && <p className="br-error">⚠ {error}</p>}
        </div>
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
            <button key={i} className="br-chapter-item" onClick={() => setChapterIndex(i)}>
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
        <button className="br-back" onClick={() => setChapterIndex(null)}>← Back</button>
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
