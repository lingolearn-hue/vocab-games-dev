// Dynamic grammar mini-quizzes.
//
// Distinct from the static, hand-authored exercises in public/grammar/*.json
// (GrammarTrainer's fill-blank/pick-correct/tile-order patterns). Those are
// reviewed content with a fixed pool of questions. These are generated
// fresh from real vocab data every time — no authoring, no fixed pool, no
// data file to bloat or get corrupted. Only grammar points that are fully
// deterministic from vocab data alone (gender → article, singular → plural,
// ...) are good candidates for this; anything needing real syntax judgment
// (word order, subjunktiv...) should stay hand-authored in the static
// pattern files instead.
//
// Each generator takes the active language's vocab entries and returns one
// fresh question: { prompt, correctAnswer, options }. `hasQuiz(quizType)`
// lets calling UI code (GrammarDictionary, GrammarTrainer) know whether to
// show a "practice this" trigger at all for a given static pattern, via
// that pattern's own `quizType` field in the grammar JSON.

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── German articles ─────────────────────────────────────────────────────

const DE_ARTICLE_CONFIGS = {
  'de-articles-nom-def':   { map: { m: 'der',   f: 'die',  n: 'das' }, options: ['der', 'die', 'das'] },
  'de-articles-nom-indef': { map: { m: 'ein',   f: 'eine', n: 'ein' }, options: ['ein', 'eine'] },
  'de-articles-acc-def':   { map: { m: 'den',   f: 'die',  n: 'das' }, options: ['den', 'die', 'das'] },
  'de-articles-acc-indef': { map: { m: 'einen', f: 'eine', n: 'ein' }, options: ['einen', 'eine', 'ein'] },
  'de-articles-dat-def':   { map: { m: 'dem',   f: 'der',  n: 'dem' }, options: ['dem', 'der'] },
}

function generateGermanArticleQuestion(quizType, vocabEntries, level) {
  const config = DE_ARTICLE_CONFIGS[quizType]
  if (!config) return null
  const nouns = vocabEntries.filter(e => e.pos === 'noun' && ['m', 'f', 'n'].includes(e.gender))
  // Scope to the pattern's own level so e.g. A1 grammar only draws A1
  // words; fall back to the full noun pool if a level has too few (or no)
  // gendered nouns of its own, rather than showing "not enough vocab".
  const scoped = level ? nouns.filter(e => e.level === level) : nouns
  const pool = scoped.length >= 4 ? scoped : nouns
  if (pool.length === 0) return null
  const entry = pickRandom(pool)
  const correctAnswer = config.map[entry.gender]
  return {
    prompt: entry.entry,
    correctAnswer,
    options: [...config.options].sort(() => Math.random() - 0.5),
  }
}

// ── Registry ─────────────────────────────────────────────────────────────

export const QUIZ_GENERATORS = {
  'de-articles-nom-def':   (entries, level) => generateGermanArticleQuestion('de-articles-nom-def', entries, level),
  'de-articles-nom-indef': (entries, level) => generateGermanArticleQuestion('de-articles-nom-indef', entries, level),
  'de-articles-acc-def':   (entries, level) => generateGermanArticleQuestion('de-articles-acc-def', entries, level),
  'de-articles-acc-indef': (entries, level) => generateGermanArticleQuestion('de-articles-acc-indef', entries, level),
  'de-articles-dat-def':   (entries, level) => generateGermanArticleQuestion('de-articles-dat-def', entries, level),
}

export function hasQuiz(quizType) {
  return !!quizType && !!QUIZ_GENERATORS[quizType]
}

export function generateQuestion(quizType, vocabEntries, level) {
  const gen = QUIZ_GENERATORS[quizType]
  return gen ? gen(vocabEntries, level) : null
}
