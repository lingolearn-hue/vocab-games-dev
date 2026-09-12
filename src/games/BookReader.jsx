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
const SCROLL_SAVE_DEBOUNCE_MS = 600

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Defined outside the component so the react-hooks/purity rule doesn't
// flag it — it's only ever called from event handlers, never during
// render, but the rule can't tell that for a plain function nested inside
// component scope.
function now() {
  return Date.now()
}

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
 * sentence read-aloud. No translation data exists for arbitrary book text,
 * so the sentence menu's "Translate" option stays disabled here (Graded
 * Reader's curated passages mostly do have one).
 *
 * Books are persisted to IndexedDB (bookLibrary.js) — the browser can't
 * re-supply the original File object on its own, so what's kept is the
 * fully parsed result (title, cover, chapter text) plus reading progress
 * (chapter, paragraph-reveal count, scroll position — mirroring Graded
 * Reader's own "continue reading" mechanism), keyed by filename+size so
 * re-picking the same file is recognized as the same book.
 */
export default function BookReader() {
  const { activeEntries, activeLanguage, showReading, scores, goBack } = useApp()

  const [libraryBooks, setLibraryBooks] = useState([])
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [book, setBook] = useState(null)
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

  const [revealedCount, setRevealedCount] = useState(1)
  const readingBodyRef = useRef(null)
  const paragraphRefs = useRef([])
  const [nearBottom, setNearBottom] = useState(true)
  const pendingScrollRef = useRef(false)
  const scrollSaveTimer = useRef(null)

  function openBook(record) {
    setBook(record)
    const single = record.chapters.length === 1
    const targetChapter = single ? 0 : (record.lastChapterIndex ?? null)
    setChapterIndex(targetChapter)
    setRevealedCount(targetChapter === record.lastChapterIndex ? (record.lastRevealedCount || 1) : 1)
    setError(null)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
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
        lastRevealedCount: existing?.lastRevealedCount ?? 1,
        lastScrollTop: existing?.lastScrollTop ?? 0,
        addedAt: existing?.addedAt ?? now(),
        lastOpenedAt: now(),
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
    const resuming = book?.lastChapterIndex === i
    const startRevealed = resuming ? (book.lastRevealedCount || 1) : 1
    setChapterIndex(i)
    setRevealedCount(startRevealed)
    if (book?.id) updateProgress(book.id, { chapterIndex: i, revealedCount: startRevealed, scrollTop: resuming ? book.lastScrollTop : 0 })
  }

  function backFromReading() {
    if (book && book.chapters.length === 1) closeBook()
    else setChapterIndex(null)
  }

  const chapter = book && chapterIndex != null ? book.chapters[chapterIndex] : null

  const paragraphs = useMemo(() => {
    if (!chapter) return []
    return chapter.text.split(/\n\s*\n/).filter(Boolean)
  }, [chapter])

  const paragraphGroups = useMemo(() => {
    let i = 0
    return paragraphs.map(p =>
      splitSentences(p, activeLanguage).map(s => ({ text: s, index: i++ }))
    )
  }, [paragraphs, activeLanguage])
  const sentences = useMemo(() => paragraphGroups.flat().map(s => s.text), [paragraphGroups])

  useEffect(() => {
    const el = readingBodyRef.current
    if (!el || !book || chapterIndex == null) return
    if (book.lastChapterIndex === chapterIndex && book.lastScrollTop > 0) {
      el.scrollTop = book.lastScrollTop
    }
    function onScroll() {
      clearTimeout(scrollSaveTimer.current)
      scrollSaveTimer.current = setTimeout(() => {
        if (book?.id) updateProgress(book.id, { chapterIndex, revealedCount, scrollTop: el.scrollTop })
      }, SCROLL_SAVE_DEBOUNCE_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      clearTimeout(scrollSaveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- book identity intentionally excluded: only re-run on chapter/reveal change, not every progress write to `book` itself
  }, [chapterIndex, revealedCount])

  useEffect(() => {
    const el = readingBodyRef.current
    if (!el || !chapter) return
    const THRESHOLD = 80
    function checkNearBottom() {
      setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD)
    }
    checkNearBottom()
    el.addEventListener('scroll', checkNearBottom, { passive: true })
    return () => el.removeEventListener('scroll', checkNearBottom)
  }, [chapter])

  useEffect(() => {
    if (!pendingScrollRef.current) return
    pendingScrollRef.current = false
    paragraphRefs.current[revealedCount - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [revealedCount])

  function handleContinueOrBack() {
    if (revealedCount < paragraphGroups.length && nearBottom) {
      pendingScrollRef.current = true
      setRevealedCount(c => c + 1)
    } else {
      paragraphRefs.current[revealedCount - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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

  async function playChapter(startAt = 0) {
    if (playingRef.current || sentences.length === 0) return
    if (revealedCount < paragraphGroups.length) setRevealedCount(paragraphGroups.length)
    playingRef.current = true
    wakeLockRef.current = await requestWakeLock()
    const rate = 0.9
    for (let i = startAt; i < sentences.length; i++) {
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

  useEffect(() => {
    return () => stopPlaying()
  }, [chapterIndex, stopPlaying])

  // ── Sentence mini-overlay: listen from here / mark spot / translate ───────
  // Two ways to open it: (1) tap the sentence itself, not a word — works
  // because TextWithLookup's word spans already call e.stopPropagation()
  // on tap, the same mechanism Graded Reader's own tap-to-translate relies
  // on, so a plain onClick here only ever fires for taps that land outside
  // any word; (2) long-press anywhere in the sentence, including directly
  // on a word, which is the more standard mobile gesture for "more options"
  // and doesn't require hunting for a gap between words.
  const [sentenceMenu, setSentenceMenu] = useState(null)

  const LONG_PRESS_MS = 500
  const LONG_PRESS_MOVE_TOLERANCE = 10
  const DISMISS_GRACE_MS = 400
  const longPressState = useRef({ timer: null, startX: 0, startY: 0, index: null, cleanup: null })
  const menuOpenedAtRef = useRef(0)

  useEffect(() => {
    const state = longPressState.current
    return () => {
      clearTimeout(state.timer)
      state.cleanup?.()
    }
  }, [])

  function cancelLongPress() {
    clearTimeout(longPressState.current.timer)
  }

  function openSentenceMenu(i) {
    menuOpenedAtRef.current = now()
    setSentenceMenu(i)
  }

  function handleSentencePointerDown(i, e) {
    // Only the primary button/first touch point starts a long-press —
    // ignore right-clicks, secondary touches, etc.
    if (e.button != null && e.button !== 0) return
    longPressState.current.cleanup?.() // in case a prior gesture never cleanly ended
    longPressState.current.startX = e.clientX
    longPressState.current.startY = e.clientY
    longPressState.current.index = i
    cancelLongPress()

    // Move/up are tracked on the document rather than this span, so a
    // drag that crosses out of the sentence's own bounds still gets seen
    // (a plain onPointerMove prop here would stop firing the moment the
    // cursor leaves this element). setPointerCapture looks like the more
    // obvious fix for that, but it has a real side effect: captured
    // elements also become the target of the resulting compatibility
    // mouse events, including the plain 'click' after a short tap — which
    // broke word lookup entirely, since the click would target this
    // sentence span instead of the word underneath. Plain document
    // listeners, added and removed per gesture, avoid that.
    function onMove(ev) {
      const dx = ev.clientX - longPressState.current.startX
      const dy = ev.clientY - longPressState.current.startY
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) endGesture()
    }
    function endGesture() {
      cancelLongPress()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', endGesture)
      document.removeEventListener('pointercancel', endGesture)
      longPressState.current.cleanup = null
    }
    longPressState.current.cleanup = endGesture
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', endGesture)
    document.addEventListener('pointercancel', endGesture)

    longPressState.current.timer = setTimeout(() => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', endGesture)
      document.removeEventListener('pointercancel', endGesture)
      longPressState.current.cleanup = null
      if (navigator.vibrate) navigator.vibrate(12) // subtle haptic cue, where supported
      openSentenceMenu(i)
    }, LONG_PRESS_MS)
  }

  // A long-press opens the menu right where the finger/cursor still is. On
  // release, the browser still synthesizes a trailing 'click' at (or near)
  // those same coordinates — and by then the menu overlay has rendered on
  // top, so that trailing click can land on the overlay (which would
  // instantly dismiss what it just opened) or, depending on exactly how
  // the browser resolves the click's target, back on the original
  // sentence/word underneath (which would re-toggle the menu or fire word
  // lookup). A short time-based grace period after opening is far more
  // robust than trying to track exactly which element that trailing click
  // ends up targeting.
  function handleSentenceClickCapture(e) {
    if (now() - menuOpenedAtRef.current < DISMISS_GRACE_MS) {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  function handleOverlayDismiss() {
    if (now() - menuOpenedAtRef.current < DISMISS_GRACE_MS) return
    setSentenceMenu(null)
  }

  function markThisSpot(i) {
    let count = 0
    let targetParagraph = paragraphGroups.length
    for (let p = 0; p < paragraphGroups.length; p++) {
      count += paragraphGroups[p].length
      if (i < count) { targetParagraph = p + 1; break }
    }
    const nextRevealed = Math.max(revealedCount, targetParagraph)
    setRevealedCount(nextRevealed)
    setSentenceMenu(null)
    requestAnimationFrame(() => {
      sentenceRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    if (book?.id) {
      const el = readingBodyRef.current
      updateProgress(book.id, { chapterIndex, revealedCount: nextRevealed, scrollTop: el?.scrollTop ?? 0 })
    }
  }

  function listenFromHere(i) {
    setSentenceMenu(null)
    stopPlaying()
    playChapter(i)
  }

  if (!book) {
    return (
      <div className="br-screen">
        <div className="br-header">
          <button className="br-back" onClick={goBack}>← Back</button>
          <span className="br-title">Library</span>
          <HelpButton
            title="Library"
            description="Open an EPUB or MOBI file from your device and read it with the same tap-to-look-up-any-word support as Graded Reader, plus sentence-by-sentence read-aloud. Tap a sentence (not a word), or long-press anywhere in it, for options: listen from there, mark it as your reading position, or translate it. Books you open are kept here (cover, title, and reading progress) so you can pick up exactly where you left off. Older MOBI files (the MOBI6/PalmDOC format) are supported; newer MOBI files built on KF8 may not extract cleanly — convert to EPUB if that happens."
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

  const isPlaying = readingIndex >= 0

  return (
    <div className="br-screen">
      <div className="br-header">
        <button className="br-back" onClick={backFromReading}>← Back</button>
        <span className="br-title br-reading-title">{chapter.title}</span>
        <div className="br-header-icons">
          {speechSupported() && (
            <button
              className={`br-play-btn ${isPlaying ? 'is-playing' : ''}`}
              onClick={isPlaying ? stopPlaying : () => playChapter(0)}
              title={isPlaying ? 'Stop reading aloud' : 'Read this chapter aloud'}
            >
              {isPlaying ? '⏹️' : '🔊'}
            </button>
          )}
          <HelpButton
            title="Library"
            description="Tap any word for its translation. Tap a sentence itself (not a word), or long-press anywhere in it — including on a word — for a menu: listen from there, mark it as your reading position to resume from later, or translate it (not available for imported books). Tap 🔊 to read the whole chapter aloud from the top."
          />
        </div>
      </div>

      <div className="br-body" ref={readingBodyRef}>
        {paragraphGroups.length > 1 && (
          <div className="br-progress">
            <div className="br-progress-track">
              <div className="br-progress-fill" style={{ width: `${(Math.min(revealedCount, paragraphGroups.length) / paragraphGroups.length) * 100}%` }} />
            </div>
            <span className="br-progress-label">Paragraph {Math.min(revealedCount, paragraphGroups.length)} of {paragraphGroups.length}</span>
          </div>
        )}

        <div className="br-text">
          {paragraphGroups.slice(0, revealedCount).map((group, pi) => (
            <p key={pi} className="br-paragraph" ref={el => { paragraphRefs.current[pi] = el }}>
              {group.map(({ text: sentence, index: i }) => (
                <span
                  key={i}
                  ref={el => { sentenceRefs.current[i] = el }}
                  className={`br-sentence br-sentence-tappable ${readingIndex === i ? 'br-sentence-active' : ''}`}
                  onClick={() => openSentenceMenu(i)}
                  onClickCapture={handleSentenceClickCapture}
                  onPointerDown={e => handleSentencePointerDown(i, e)}
                >
                  <TextWithLookup text={sentence} language={activeLanguage} lookup={lookup} scores={scores} showReading={showReading} />
                  {' '}
                </span>
              ))}
            </p>
          ))}
        </div>

        {(revealedCount < paragraphGroups.length || !nearBottom) && (
          <button className="br-continue-reveal-btn" onClick={handleContinueOrBack}>
            {revealedCount < paragraphGroups.length && nearBottom ? 'Continue reading ↓' : '↓ Back to last paragraph'}
          </button>
        )}

        <div className="br-legend">
          <span className="br-legend-item br-legend--mastered">mastered</span>
          <span className="br-legend-item br-legend--learning">learning</span>
          <span className="br-legend-item br-legend--unseen">unseen</span>
          <span className="br-legend-item br-legend--unknown">not in list</span>
        </div>
      </div>

      {sentenceMenu != null && (
        <div className="br-sentence-menu-overlay" onClick={handleOverlayDismiss}>
          <div className="br-sentence-menu" onClick={e => e.stopPropagation()}>
            <button className="br-sentence-menu-btn" onClick={() => listenFromHere(sentenceMenu)}>
              🔊 Listen from here
            </button>
            <button className="br-sentence-menu-btn" onClick={() => markThisSpot(sentenceMenu)}>
              🔖 Mark as reading position
            </button>
            <button className="br-sentence-menu-btn br-sentence-menu-btn--disabled" disabled title="Not available for imported books">
              🌐 Translate sentence
            </button>
            <button className="br-sentence-menu-cancel" onClick={() => setSentenceMenu(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
