import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { srsPick, getScore } from '../engine/srs'
import { resolveFacet } from '../engine/facets'
import RubyText from '../components/RubyText'
import DirectionToggle from '../components/DirectionToggle'
import ReadingToggle from '../components/ReadingToggle'
import ReadingOnlyToggle from '../components/ReadingOnlyToggle'
import FacetsByBoxToggle from '../components/FacetsByBoxToggle'
import HelpButton from '../components/HelpButton'
import SpeakButton from '../components/SpeakButton'
import './Typing.css'

// Normalise a string for loose comparison:
// lowercase, trim, collapse whitespace, strip diacritics
function normalise(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Check if user input matches any accepted answer. `siblings` (entries
// sharing the same headword as `entry`, e.g. both senses of German
// "Leiter" — leader vs ladder) are included for entry->translation, since
// the prompt itself doesn't disambiguate which sense was intended; the
// player has no way to know which one was drawn, so any valid sense's
// translation must count as correct. Not needed for translation->entry:
// there the prompt is itself one specific gloss, so the expected answer
// (the shared headword spelling) is unambiguous regardless of collisions.
function isCorrect(input, entry, direction, siblings) {
  const norm = normalise(input)
  if (norm === '') return false
  if (direction === 'entry->translation') {
    const pool = siblings && siblings.length > 0 ? siblings : [entry]
    return pool.some(e => e.translation.some(t => normalise(t) === norm))
  } else {
    // translation->entry: accept entry and all translations
    if (normalise(entry.entry) === norm) return true
    if (entry.translation.some(t => normalise(t) === norm)) return true
    return false
  }
}

export default function Typing() {
  const { direction, showReading, readingOnly, facetsByBox, scoreActions, scores, settings, goBack, getEntriesForGame } = useApp()
  const language = useApp().activeLanguage ?? 'zh'
  const { entries: activeEntries, isEmpty: levelEmpty } = getEntriesForGame('typing')
  const { requireCorrect, skipEnabled } = settings.typing

  // Groups entries by headword so a homograph's siblings (e.g. both senses
  // of German "Leiter") can be found at answer-check time — see isCorrect's
  // own comment for why this is needed.
  const headwordSiblings = useMemo(() => {
    const m = new Map()
    for (const e of activeEntries) {
      const key = e.entry
      const list = m.get(key)
      if (list) list.push(e)
      else m.set(key, [e])
    }
    return m
  }, [activeEntries])

  const [entry,       setEntry]       = useState(null)
  const [input,       setInput]       = useState('')
  const [feedback,    setFeedback]    = useState(null)  // null | 'correct' | 'wrong'
  const [showAnswer,  setShowAnswer]  = useState(false)
  const [mustRetype,  setMustRetype]  = useState(false) // after wrong: require correct retype
  const [retypeVal,   setRetypeVal]   = useState('')
  const [score,       setScore]       = useState(0)
  const [streak,      setStreak]      = useState(0)
  const [total,       setTotal]       = useState(0)
  const [correct,     setCorrect]     = useState(0)
  const [seenIds,     setSeenIds]     = useState(new Set())

  const inputRef  = useRef(null)
  const retypeRef = useRef(null)

  const nextEntry = useCallback(() => {
    const pool = activeEntries.filter(e => !seenIds.has(e.id))
    const src  = pool.length > 0 ? pool : activeEntries
    const [e]  = srsPick(src, 'typing')
    if (!e) return
    setEntry(e)
    setInput('')
    setFeedback(null)
    setShowAnswer(false)
    setMustRetype(false)
    setRetypeVal('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [activeEntries, seenIds])

  const entriesKey = activeEntries.map(e => e.id).join(',')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- advances to a fresh entry whenever the pool changes
    if (activeEntries.length > 0) nextEntry()
  }, [entriesKey])

  // Focus input on mount and when feedback clears
  useEffect(() => {
    if (!feedback && !mustRetype) inputRef.current?.focus()
    if (mustRetype) retypeRef.current?.focus()
  }, [feedback, mustRetype])

  // When facetsByBox is on, this word's own score (0-5, same scale as the
  // Leitner boxes) drives its display facet instead of the manual toggles.
  const entryBox       = entry ? getScore(entry.id, 'typing') : 0
  const facet          = facetsByBox ? resolveFacet(entryBox, language) : null
  const effDirection   = facet ? facet.direction   : direction
  const effShowReading = facet ? facet.showReading : showReading
  const effReadingOnly = facet ? facet.readingOnly : readingOnly

  function getPromptText() {
    if (!entry) return ''
    if (effDirection === 'entry->translation') {
      if (effReadingOnly && (language === 'zh' || language === 'ja') && entry.reading) return entry.reading
      return entry.entry
    }
    return entry.translation[0]
  }

  function getPromptReading() {
    if (!entry || effDirection !== 'entry->translation') return null
    if (effReadingOnly && (language === 'zh' || language === 'ja') && entry.reading) return null  // already showing reading as the main text
    return effShowReading ? entry.reading : null
  }

  function getAcceptedAnswers() {
    if (!entry) return []
    const readingAlt = (effReadingOnly && (language === 'zh' || language === 'ja') && entry.reading) ? [entry.reading] : []
    if (effDirection === 'entry->translation') {
      const siblings = headwordSiblings.get(entry.entry)
      const pool = siblings && siblings.length > 0 ? siblings : [entry]
      return [...new Set(pool.flatMap(e => e.translation))]
    }
    return [entry.entry, ...readingAlt, ...entry.translation]
  }

  function submit() {
    if (!entry || feedback) return
    if (input.trim() === '') return

    const ok = isCorrect(input, entry, direction, headwordSiblings.get(entry.entry))
    setTotal(t => t + 1)
    setFeedback(ok ? 'correct' : 'wrong')
    setShowAnswer(true)

    if (ok) {
      const mult = Math.min(3, 1 + streak * 0.25)
      setScore(s => s + Math.round(10 * mult))
      setStreak(s => s + 1)
      setCorrect(c => c + 1)
      scoreActions.correct(entry.id, 'typing')
      setSeenIds(prev => new Set([...prev, entry.id]))
      // Auto-advance after delay
      setTimeout(() => nextEntry(), 1200)
    } else {
      setStreak(0)
      scoreActions.wrong(entry.id, 'typing')
      if (requireCorrect) {
        setMustRetype(true)
        setRetypeVal('')
        setTimeout(() => retypeRef.current?.focus(), 50)
      }
    }
  }

  function submitRetype() {
    if (!entry || !mustRetype) return
    const ok = isCorrect(retypeVal, entry, direction, headwordSiblings.get(entry.entry))
    if (ok) {
      setMustRetype(false)
      nextEntry()
    } else {
      // Shake and clear
      retypeRef.current?.classList.add('shake')
      setTimeout(() => {
        retypeRef.current?.classList.remove('shake')
        setRetypeVal('')
        retypeRef.current?.focus()
      }, 400)
    }
  }

  function skip() {
    if (!entry || mustRetype) return
    if (feedback === null) {
      setTotal(t => t + 1)
      setStreak(0)
      scoreActions.wrong(entry.id, 'typing')
    }
    nextEntry()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    if (e.key === 'Escape') {
      if (mustRetype) return
      skip()
    }
  }

  function onRetypeKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); submitRetype() }
  }

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
  const entryScore = entry ? scores[entry.id]?.typing?.score ?? 0 : 0

  if (!entry) {
    return (
      <div className="ty-screen">
        <div className="ty-header">
          <button className="ty-back" onClick={goBack}>← Back</button>
        </div>
        <div className="ty-empty">No words loaded.</div>
      </div>
    )
  }

  return (
    <div className={`ty-screen ${feedback || ''}`}>
      <div className="ty-header">
        <button className="ty-back" onClick={goBack}>← Back</button>
        <div className="ty-stats">
          <span className="ty-score">{score}</span>
          {streak > 1 && <span className="ty-streak">🔥 {streak}</span>}
          {total > 0 && <span className="ty-acc">{accuracy}%</span>}
        </div>
        <div className="ty-header-right">
          {(language === 'zh' || language === 'ja') && <ReadingOnlyToggle />}
          <DirectionToggle />
          <ReadingToggle />
          <FacetsByBoxToggle />
          <HelpButton
            title="Typing"
            description="Type the correct answer from memory and press Enter to check. Getting it wrong may ask you to retype the correct answer before moving on."
            buttons={[
              { icon: '⇵', label: 'Reading only', desc: '(zh/ja) Show reading instead of hanzi/kanji' },
              { icon: '⇄', label: 'Direction',    desc: 'Swap which side is the prompt — word or translation' },
              { icon: 'ふ/子', label: 'Reading',  desc: 'Show or hide the furigana/pinyin annotation' },
              { icon: '🧩', label: 'Train all facets', desc: "Each word's own score drives its display (translation flip, no reading, reading-only) so it's trained on every facet over time" },
            ]}
          />
        </div>
      </div>

      {levelEmpty && (
        <div className="level-warning">
          ⚠ <strong>No entries at selected level</strong> — showing all levels instead. Change in Settings.
        </div>
      )}
      {/* Prompt card */}
      <div className="ty-card-area">
        <div className={`ty-card ${feedback || ''}`}>
          <div className="ty-prompt">
            <RubyText
              text={getPromptText()}
              reading={getPromptReading()}
              visible={!!getPromptReading()}
              size="lg"
            />
            <SpeakButton
              text={entry?.entry}
              language={language}
              size="md"
            />
          </div>

          {/* Score dots */}
          <div className="ty-score-dots">
            {[1,2,3,4,5].map(i => (
              <span key={i} className={`ty-dot ${i <= entryScore ? 'filled' : ''}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="ty-input-area">

        {/* Main input (hidden after wrong + requireCorrect) */}
        {!mustRetype && (
          <div className="ty-input-wrap">
            <input
              ref={inputRef}
              className={`ty-input ${feedback || ''}`}
              type="text"
              placeholder={effDirection === 'entry->translation' ? 'Type the translation…' : 'Type the word…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!!feedback}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {!feedback && (
              <button className="ty-submit" onClick={submit}>→</button>
            )}
          </div>
        )}

        {/* Answer reveal */}
        {showAnswer && (
          <div className={`ty-answer-reveal ${feedback}`}>
            {feedback === 'correct' ? (
              <span className="ty-correct-msg">✓ Correct!</span>
            ) : (
              <div className="ty-wrong-reveal">
                <span className="ty-wrong-msg">✗ Answer{getAcceptedAnswers().length > 1 ? 's' : ''}:</span>
                <span className="ty-answer-text">
                  {getAcceptedAnswers().join(' · ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Retype prompt */}
        {mustRetype && (
          <div className="ty-retype-area">
            <p className="ty-retype-hint">Type it correctly to continue:</p>
            <div className="ty-input-wrap">
              <input
                ref={retypeRef}
                className="ty-input ty-retype"
                type="text"
                placeholder="Retype the correct answer…"
                value={retypeVal}
                onChange={e => setRetypeVal(e.target.value)}
                onKeyDown={onRetypeKeyDown}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button className="ty-submit" onClick={submitRetype}>→</button>
            </div>
          </div>
        )}

        <div className="ty-keyboard-hint">
          Enter to check{skipEnabled ? ' · Esc to skip' : ''}
        </div>
      </div>
    </div>
  )
}
