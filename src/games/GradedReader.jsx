import { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { buildLookup, tokenise, loadReaderPassages, loadSurfaceForms, splitSentences } from '../engine/reader'
import { speakAndWait, stop as stopSpeech, isSupported as speechSupported } from '../engine/speech'
import { TextWithLookup } from '../components/TextWithLookup'
import LevelChooser from '../components/LevelChooser'
import HelpButton from '../components/HelpButton'
import './GradedReader.css'

// Tags that get a display label; others shown as-is
const TAG_LABELS = {
  'fiction':     'Fiction',
  'non-fiction': 'Non-fiction',
  'biography':   'Biography',
  'essay':       'Essay',
  'beginner':    'Beginner',
  'intermediate':'Intermediate',
  'advanced':    'Advanced',
}

function tagLabel(tag) {
  if (TAG_LABELS[tag]) return TAG_LABELS[tag]
  if (tag.startsWith('topic:'))  return tag.slice(6).replace(/-/g, ' ')
  if (tag.startsWith('series:')) return tag.slice(7)
  return tag
}

const CUSTOM_PASSAGE_KEY = 'vocabCustomPassage'
const FINISHED_KEY = 'vocabFinishedPassages'
const LAST_PASSAGE_KEY = 'vocabLastPassage'

function loadLastPassage() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_PASSAGE_KEY) || 'null')
    return saved && typeof saved === 'object' && saved.id ? saved : null
  } catch {
    return null
  }
}

function loadFinishedPassages() {
  try {
    const saved = JSON.parse(localStorage.getItem(FINISHED_KEY) || '[]')
    return new Set(Array.isArray(saved) ? saved : [])
  } catch {
    return new Set()
  }
}

function loadSavedCustomPassage() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_PASSAGE_KEY) || 'null')
    return saved && typeof saved === 'object' ? saved : { title: '', text: '' }
  } catch {
    return { title: '', text: '' }
  }
}

export default function GradedReader() {
  const { activeEntries, loadedLists, selectedIds, showReading, scores, goBack, activeLanguage, setScreen, setSessionEntries, settings } = useApp()

  const [passages,        setPassages]        = useState([])
  const [surfaceForms,    setSurfaceForms]     = useState({})
  const [loading,         setLoading]         = useState(true)
  const [activePassage,   setActivePassage]   = useState(null)
  const [pastedText,      setPastedText]      = useState(() => loadSavedCustomPassage().text)
  const [pastedTitle,     setPastedTitle]     = useState(() => loadSavedCustomPassage().title)
  const [mode,            setMode]            = useState('library')
  const [customPassage,   setCustomPassage]   = useState(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [activeTags,      setActiveTags]      = useState(new Set())
  const [search,          setSearch]          = useState('')
  // Passage ids (already namespaced by language, e.g. "de-p1") the user has
  // marked as finished — persisted across sessions. Only library passages
  // get this treatment; custom pasted text has no stable id worth tracking.
  const [finishedPassages, setFinishedPassages] = useState(loadFinishedPassages)
  // "Continue reading" — last-opened library passage id + scroll position,
  // so reopening the Reader can offer to jump back in rather than always
  // dumping back to the library list. Custom pasted text isn't tracked
  // (no stable id worth persisting across sessions).
  const [lastPassage, setLastPassage] = useState(loadLastPassage)
  const readingBodyRef = useRef(null)
  const textAreaRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(FINISHED_KEY, JSON.stringify([...finishedPassages]))
  }, [finishedPassages])

  function toggleFinished(id) {
    setFinishedPassages(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Persist the pasted/custom text as the user types, so it survives a
  // refresh or navigating away — this was previously pure in-memory state
  // and got silently lost. Debounced by a tick via the effect dependency
  // array rather than on every keystroke's own handler, but still cheap
  // since it's just localStorage.setItem with a small JSON blob.
  useEffect(() => {
    localStorage.setItem(CUSTOM_PASSAGE_KEY, JSON.stringify({ title: pastedTitle, text: pastedText }))
  }, [pastedTitle, pastedText])

  const language = useMemo(() => {
    if (activeLanguage) return activeLanguage
    const firstList = selectedIds.map(id => loadedLists[id]).find(Boolean)
    return firstList?.language ?? 'zh'
  }, [activeLanguage, selectedIds, loadedLists])

  const lookup = useMemo(() => buildLookup(activeEntries), [activeEntries])

  // Merge in surface-form (inflected → dictionary form) matches so reading
  // stats/the Vocab Quiz count and the highlighted text agree — both use
  // this augmented lookup rather than the raw one. buildLookup() returns a
  // Map with lowercased keys, so this has to match that convention (an
  // earlier version of this used plain-object access here, which silently
  // produced a broken lookup — caught via a real-browser crash, not code
  // review — since tokenise()/TextWithLookup expect a Map with .has/.get).
  const augmentedLookup = useMemo(() => {
    const langForms = surfaceForms[language] ?? {}
    if (!Object.keys(langForms).length) return lookup
    const merged = new Map(lookup)
    for (const [surface, lemma] of Object.entries(langForms)) {
      const surfaceKey = surface.toLowerCase()
      const lemmaKey = lemma.toLowerCase()
      if (!merged.has(surfaceKey) && lookup.has(lemmaKey)) {
        merged.set(surfaceKey, { ...lookup.get(lemmaKey), _surface: surface })
      }
    }
    return merged
  }, [lookup, surfaceForms, language])

  useEffect(() => {
    loadSurfaceForms().then(setSurfaceForms)
  }, [])

  useEffect(() => {
    if (!activeLanguage) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off an async fetch on language change
    setLoading(true)
    loadReaderPassages(`${activeLanguage}-en`).then(data => {
      setPassages(data?.passages ?? [])
      setLoading(false)
    })
  }, [activeLanguage])

  // Derive available levels and tags from passages
  const availableLevels = useMemo(() => {
    const s = new Set(passages.map(p => p.level).filter(Boolean))
    // Sort: A1<A2<B1<B2<C1<C2, then N5<N4<N3<N2<N1, then HSK1..7(7-9)
    const order = ['A1','A2','B1','B2','C1','C2','N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','HSK7']
    return [...s].sort((a,b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      return a.localeCompare(b)
    })
  }, [passages])

  const availableTags = useMemo(() => {
    const allTags = new Set(passages.flatMap(p => p.tags ?? []))
    // Exclude level-like tags (beginner/intermediate/advanced) — now handled by level chips
    const levelLike = new Set(['beginner','intermediate','advanced'])
    const typeTags  = ['fiction','non-fiction','biography','essay'].filter(t => allTags.has(t))
    const topicTags = [...allTags].filter(t => !levelLike.has(t) && !['fiction','non-fiction','biography','essay'].includes(t)).sort()
    return [...typeTags, ...topicTags]
  }, [passages])

  // Active levels (multi-select, same null=all pattern as the rest of the app) + active tags (multi)
  const [activeLevels, setActiveLevels] = useState(null)

  const filteredPassages = useMemo(() => {
    const q = search.trim().toLowerCase()
    return passages.filter(p => {
      if (activeLevels && !activeLevels.includes(p.level)) return false
      if (activeTags.size > 0) {
        const ptags = new Set(p.tags ?? [])
        if (![...activeTags].every(t => ptags.has(t))) return false
      }
      if (q) {
        const textMatch = p.title?.toLowerCase().includes(q) ||
                           p.text?.toLowerCase().includes(q) ||
                           p.titleTranslation?.toLowerCase().includes(q)
        // Auto-tag detection: typing a tag name (or part of one) — "beginner",
        // "biography", a topic like "food" — filters by tag too, so search
        // alone covers what used to need separate Type/Topic chip rows.
        const tagMatch = (p.tags ?? []).some(t => tagLabel(t).toLowerCase().includes(q))
        if (!textMatch && !tagMatch) return false
      }
      return true
    })
  }, [passages, activeLevels, activeTags, search])

  function toggleTag(tag) {
    setActiveTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  function openPassage(p, restoreScroll) {
    setActivePassage(p)
    setCustomPassage(null)
    setShowTranslation(false)
    const saved = { id: p.id, scrollTop: restoreScroll ? (loadLastPassage()?.scrollTop ?? 0) : 0 }
    setLastPassage(saved)
    localStorage.setItem(LAST_PASSAGE_KEY, JSON.stringify(saved))
  }

  // Save scroll position for "continue reading" as the user scrolls the
  // passage, and restore it (if resuming the same passage) once the DOM
  // for the new passage has actually rendered.
  useEffect(() => {
    const el = readingBodyRef.current
    if (!el || !activePassage) return
    if (lastPassage?.id === activePassage.id && lastPassage.scrollTop > 0) {
      el.scrollTop = lastPassage.scrollTop
    }
    function onScroll() {
      const next = { id: activePassage.id, scrollTop: el.scrollTop }
      localStorage.setItem(LAST_PASSAGE_KEY, JSON.stringify(next))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [activePassage])

  function openCustom() {
    if (!pastedText.trim()) return
    setCustomPassage({ id: 'custom', title: pastedTitle || 'Custom text', text: pastedText, translation: null })
    setActivePassage(null)
    setShowTranslation(false)
  }

  const currentPassage = activePassage ?? customPassage

  // Vocab actually appearing in this passage, resolved back to full entries —
  // feeds the "Vocab Quiz" flashcard-session button below.
  const passageEntries = useMemo(() => {
    if (!currentPassage) return []
    const spans = tokenise(currentPassage.text, augmentedLookup, language)
    const ids = new Set(spans.filter(s => s.entry).map(s => s.entry.id))
    return activeEntries.filter(e => ids.has(e.id))
  }, [currentPassage, augmentedLookup, language, activeEntries])

  function startVocabQuiz() {
    if (passageEntries.length === 0) return
    setSessionEntries(passageEntries)
    setScreen('flashcard')
  }

  // ── Read-aloud ─────────────────────────────────────────────────────────
  // Speaks the passage sentence-by-sentence (not as one long utterance) so
  // the UI can highlight reading progress and so play/pause has a clean
  // boundary to stop at rather than cutting off mid-sentence.
  const [readingIndex, setReadingIndex] = useState(-1)  // -1 = not playing
  const playingRef = useRef(false)

  // Paragraph-aware sentence splitting — splitSentences() on the whole
  // passage text was flattening every paragraph into one continuous run,
  // silently dropping the \n\n paragraph breaks that exist in the source
  // data (confirmed on the fairy tale content: 6 real paragraphs collapsed
  // into a single wall of text). Split into paragraphs first, then
  // sentences within each; `sentences` stays a flat array (read-aloud/
  // scroll-to/translation-pairing all index into it by flat position),
  // `paragraphGroups` groups those same sentence objects for rendering
  // so paragraph spacing survives.
  const paragraphGroups = useMemo(() => {
    if (!currentPassage) return []
    let idx = 0
    return currentPassage.text
      .split(/\n\s*\n/)
      .map(para => splitSentences(para, language).map(text => ({ text, index: idx++ })))
      .filter(group => group.length > 0)
  }, [currentPassage, language])

  const sentences = useMemo(
    () => paragraphGroups.flat().map(s => s.text),
    [paragraphGroups]
  )
  const sentenceRefs = useRef([])

  // Sentence-level tap-to-translate — naive index-pairing between the
  // source and English sentence splits (no per-sentence data exists; the
  // `translation` field is one flat string per passage). Only trusted when
  // both sides split into the same number of sentences: a real-passage
  // scan found this holds ~75-95% of the time depending on language (worst
  // case Japanese, 9/36 mismatched — translators don't always keep a 1:1
  // sentence count with the source). When counts don't match, pairing is
  // silently disabled for that passage rather than showing a wrong
  // translation next to the right sentence; the full-passage EN toggle
  // still works regardless since it doesn't depend on alignment.
  // Same paragraph-first splitting applied here too, so pairing stays
  // aligned by paragraph order, not just overall count.
  const englishSentences = useMemo(() => {
    if (!currentPassage?.translation) return []
    return currentPassage.translation
      .split(/\n\s*\n/)
      .flatMap(para => splitSentences(para, 'en'))
  }, [currentPassage])
  const sentenceTranslationsAligned = language !== 'en' &&
    englishSentences.length > 0 && englishSentences.length === sentences.length
  const [expandedSentence, setExpandedSentence] = useState(null)

  function toggleSentenceTranslation(i) {
    if (!sentenceTranslationsAligned) return
    setExpandedSentence(prev => (prev === i ? null : i))
  }

  // Keep the currently-spoken sentence in view during read-aloud — without
  // this, playback on a long passage would keep highlighting sentences the
  // user has already scrolled past, defeating the point of a hands-free
  // read-along.
  useEffect(() => {
    if (readingIndex < 0) return
    sentenceRefs.current[readingIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [readingIndex])

  async function playPassage() {
    if (playingRef.current || sentences.length === 0) return
    playingRef.current = true
    const rate = settings.listeningSpeechRate ?? 0.9
    for (let i = 0; i < sentences.length; i++) {
      if (!playingRef.current) break
      setReadingIndex(i)
      await speakAndWait(sentences[i], language, { rate })
    }
    playingRef.current = false
    setReadingIndex(-1)
  }

  function stopPassage() {
    playingRef.current = false
    stopSpeech()
    setReadingIndex(-1)
  }

  // Stop any in-progress read-aloud when switching passages or leaving the screen
  useEffect(() => {
    setExpandedSentence(null)
    return () => { playingRef.current = false; stopSpeech() }
  }, [currentPassage])

  // ── List view ──────────────────────────────────────────────────────────────
  if (!currentPassage) {
    return (
      <div className="gr-screen">
        <div className="gr-header">
          <button className="gr-back" onClick={goBack}>← Back</button>
          <span className="gr-title">Reader</span>
          <div className="gr-header-tabs">
            <button className={`gr-tab ${mode === 'library' ? 'active' : ''}`} onClick={() => setMode('library')}>Library</button>
            <button className={`gr-tab ${mode === 'paste'   ? 'active' : ''}`} onClick={() => setMode('paste')}>Paste</button>
          </div>
          <HelpButton
            title="Graded Reader"
            description="Browse passages by level, search titles/text/topics, or paste your own text to read. Tap 📇 on a passage to quiz yourself on just its vocab, and tap ✓ Mark as Finished when you're done — your progress and last-read spot are saved automatically."
          />
        </div>

        {mode === 'library' ? (
          <div className="gr-body">
            {loading ? (
              <div className="gr-empty">Loading…</div>
            ) : passages.length === 0 ? (
              <div className="gr-empty">
                {activeLanguage ? 'No passages available for this language yet.' : 'Select a language on the home screen first.'}
              </div>
            ) : (
              <>
                {/* ── "Continue reading" — resume the last-opened passage,
                     if it's still in this language's library ── */}
                {(() => {
                  if (!lastPassage) return null
                  const resume = passages.find(p => p.id === lastPassage.id)
                  if (!resume) return null
                  return (
                    <button className="gr-continue-banner" onClick={() => openPassage(resume, true)}>
                      <span className="gr-continue-icon">📖</span>
                      <span className="gr-continue-text">
                        <span className="gr-continue-label">Continue reading</span>
                        <span className="gr-continue-title">{resume.title}</span>
                      </span>
                      <span className="gr-continue-arrow">→</span>
                    </button>
                  )
                })()}

                {/* ── Reading progress summary ── */}
                {passages.length > 0 && (
                  <div className="gr-progress-summary">
                    ✓ {passages.filter(p => finishedPassages.has(p.id)).length} of {passages.length} finished
                  </div>
                )}

                {/* ── Filters — level chips, search, and a single flat tag row, all
                     sharing the same horizontal padding so they read as one
                     aligned block instead of separately-indented rows ── */}
                {(() => {
                  if (availableLevels.length === 0 && availableTags.length === 0) return null
                  return (
                    <div className="gr-filters">
                      {availableLevels.length > 0 && (
                        <LevelChooser levels={availableLevels} value={activeLevels} onChange={setActiveLevels} className="gr-filter-levels" />
                      )}
                      <div className="gr-search-row">
                        <input
                          className="gr-search"
                          type="text"
                          placeholder="Search titles, text, or topics…"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                          <button className="gr-search-clear" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
                        )}
                      </div>
                      {availableTags.length > 0 && (
                        <div className="gr-tag-scroll">
                          {availableTags.map(tag => (
                            <button key={tag} className={`gr-tag-chip ${activeTags.has(tag) ? 'active' : ''}`} onClick={() => toggleTag(tag)}>
                              {tagLabel(tag)}
                            </button>
                          ))}
                        </div>
                      )}
                      {(activeTags.size > 0 || activeLevels || search) && (
                        <button className="gr-tag-clear" onClick={() => { setActiveTags(new Set()); setActiveLevels(null); setSearch('') }}>✕ Clear filters</button>
                      )}
                    </div>
                  )
                })()}

                {filteredPassages.length === 0 ? (
                  <div className="gr-empty">No passages match the selected filters.</div>
                ) : (
                  <div className="gr-passage-list">
                    {(() => {
                      const seriesMap = {}
                      const standalones = []
                      filteredPassages.forEach(p => {
                        if (p.series) {
                          if (!seriesMap[p.series]) seriesMap[p.series] = []
                          seriesMap[p.series].push(p)
                        } else {
                          standalones.push(p)
                        }
                      })

                      const renderCard = (p) => {
                        const passageSpans = tokenise(p.text, augmentedLookup, language)
                        const matchedIds = [...new Set(passageSpans.filter(s => s.entry).map(s => s.entry.id))]
                        const knownCount = matchedIds.filter(id => (scores[id]?.global ?? 'unseen') !== 'unseen').length
                        return (
                          <button key={p.id} className="gr-passage-card" onClick={() => openPassage(p)}>
                            <div className="gr-passage-card-top">
                              <span className="gr-passage-title">{p.title}</span>
                              <span className="gr-passage-card-badges">
                                {finishedPassages.has(p.id) && <span className="gr-finished-check" title="Finished">✓</span>}
                                {p.level && <span className="gr-passage-level">{p.level}</span>}
                              </span>
                            </div>
                            {p.titleTranslation && <span className="gr-passage-subtitle">{p.titleTranslation}</span>}
                            <div className="gr-passage-card-bottom">
                              <span className="gr-passage-stats">{matchedIds.length} vocab · {knownCount} known</span>
                              {p.tags && (
                                <div className="gr-passage-tags">
                                  {p.tags.filter(t => !t.startsWith('series:') && !['beginner','intermediate','advanced'].includes(t)).slice(0, 3).map(t => (
                                    <span key={t} className="gr-passage-tag">{tagLabel(t)}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      }

                      return (
                        <>
                          {Object.entries(seriesMap).map(([seriesName, seriesPassages]) => (
                            <div key={seriesName} className="gr-series">
                              <div className="gr-series-header">
                                <span className="gr-series-icon">📚</span>
                                <span className="gr-series-name">{seriesName}</span>
                                <span className="gr-series-count">{seriesPassages.length} level{seriesPassages.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="gr-series-cards">
                                {seriesPassages.map(renderCard)}
                              </div>
                            </div>
                          ))}
                          {standalones.length > 0 && (
                            <div className="gr-series">
                              {Object.keys(seriesMap).length > 0 && (
                                <div className="gr-series-header">
                                  <span className="gr-series-icon">📄</span>
                                  <span className="gr-series-name">Standalone</span>
                                  <span className="gr-series-count">{standalones.length}</span>
                                </div>
                              )}
                              <div className="gr-series-cards">
                                {standalones.map(renderCard)}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="gr-body">
            <div className="gr-paste-area">
              <input className="gr-paste-title" placeholder="Title (optional)" value={pastedTitle} onChange={e => setPastedTitle(e.target.value)} />
              <textarea ref={textAreaRef} className="gr-paste-input" placeholder="Paste or type your text here…" value={pastedText} onChange={e => setPastedText(e.target.value)} rows={10} />
              <button className="gr-paste-btn" disabled={!pastedText.trim()} onClick={openCustom}>Read →</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Reading view ───────────────────────────────────────────────────────────
  return (
    <div className="gr-screen">
      <div className="gr-header">
        <button className="gr-back" onClick={() => { setActivePassage(null); setCustomPassage(null) }}>← Back</button>
        <span className="gr-title gr-reading-title">{currentPassage.title}</span>
        {speechSupported() && sentences.length > 0 && (
          <button
            className={`gr-play-btn ${readingIndex >= 0 ? 'is-playing' : ''}`}
            onClick={readingIndex >= 0 ? stopPassage : playPassage}
            title={readingIndex >= 0 ? 'Stop reading aloud' : 'Read passage aloud'}
          >
            {readingIndex >= 0 ? '⏸' : '🔊'}
          </button>
        )}
        {currentPassage.translation && (
          <button className={`gr-trans-toggle ${showTranslation ? 'active' : ''}`} onClick={() => setShowTranslation(t => !t)}>EN</button>
        )}
        <HelpButton
          title="Graded Reader"
          description="Read short passages at your level. Tap any word for its translation, tap elsewhere in a sentence to translate that sentence (when available), toggle EN for a full translation, and tap 🔊 to have the passage read aloud sentence by sentence."
        />
      </div>

      <div className="gr-body gr-reading-body" ref={readingBodyRef}>
        <div className="gr-cover-placeholder" aria-hidden="true">🖼️</div>

        <div className="gr-text">
          {paragraphGroups.map((group, pi) => (
            <p key={pi} className="gr-paragraph">
              {group.map(({ text: sentence, index: i }) => (
                <span
                  key={i}
                  ref={el => { sentenceRefs.current[i] = el }}
                  className={`gr-sentence ${readingIndex === i ? 'gr-sentence-active' : ''} ${sentenceTranslationsAligned ? 'gr-sentence-tappable' : ''}`}
                  onClick={sentenceTranslationsAligned ? () => toggleSentenceTranslation(i) : undefined}
                >
                  <TextWithLookup text={sentence} language={language} lookup={augmentedLookup} scores={scores} showReading={showReading} />
                  {' '}
                  {expandedSentence === i && (
                    <span className="gr-sentence-translation" onClick={e => e.stopPropagation()}>
                      {englishSentences[i]}
                    </span>
                  )}
                </span>
              ))}
            </p>
          ))}
        </div>

        {showTranslation && currentPassage.translation && (
          <div className="gr-translation"><p>{currentPassage.translation}</p></div>
        )}

        <div className="gr-legend">
          <span className="gr-legend-item gr-legend--mastered">mastered</span>
          <span className="gr-legend-item gr-legend--learning">learning</span>
          <span className="gr-legend-item gr-legend--unseen">unseen</span>
          <span className="gr-legend-item gr-legend--unknown">not in list</span>
        </div>

        {activePassage && (
          <button
            className={`gr-finish-btn ${finishedPassages.has(activePassage.id) ? 'is-finished' : ''}`}
            onClick={() => toggleFinished(activePassage.id)}
          >
            {finishedPassages.has(activePassage.id) ? '✓ Finished' : 'Mark as Finished'}
          </button>
        )}

        {passageEntries.length > 0 && (
          <button className="gr-vocab-fab" onClick={startVocabQuiz} title="Practice this passage's vocab as flashcards">
            📇 Vocab Quiz <span className="gr-vocab-fab-count">{passageEntries.length}</span>
          </button>
        )}
      </div>
    </div>
  )
}
