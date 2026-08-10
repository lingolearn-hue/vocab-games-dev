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
// fresh question: { prompt, correctAnswer, options }, where `options` is an
// array of { id, label } — `id` is what's compared against `correctAnswer`,
// `label` is what's displayed (kept separate so two options can share a
// surface form, e.g. "ein" for masc/neut, while still being distinct,
// disambiguated buttons). `hasQuiz(quizType)` lets calling UI code
// (GrammarDictionary, GrammarTrainer) know whether to show a "practice
// this" trigger at all for a given static pattern, via that pattern's own
// `quizType` field in the grammar JSON.

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── German articles ─────────────────────────────────────────────────────

const GENDER_ORDER = ['m', 'f', 'n']

const DE_ARTICLE_CONFIGS = {
  'de-articles-nom-def':   { m: 'der',  f: 'die',  n: 'das' },
  'de-articles-nom-indef': { m: 'Ein (m)', f: 'Eine', n: 'Ein (n)' },
  'de-articles-acc-def':   { m: 'den',  f: 'die',  n: 'das' },
  'de-articles-acc-indef': { m: 'einen', f: 'eine', n: 'ein' },
  'de-articles-dat-def':   { m: 'Dem (m)', f: 'Der', n: 'Dem (n)' },
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
  // Options are always ordered m, f, n (never shuffled) so the article
  // pattern stays consistent across questions. Each gender is its own
  // option even when two genders share the same surface form (e.g. "ein"
  // for masc/neut nominative indefinite) — `id` (the gender) is what's
  // actually compared for correctness, `label` is only for display, so
  // those forms get disambiguated labels like "Ein (m)" / "Ein (n)".
  const options = GENDER_ORDER.map(g => ({
    id: g,
    label: config[g],
  }))
  return {
    prompt: entry.entry,
    correctAnswer: entry.gender,
    options,
  }
}

// ── German verbs (sein, haben, regular) ─────────────────────────────────

// Nine pronoun prompts, each mapped to which of the six distinct verb-form
// "groups" it takes. er/sie(she)/es share a form; sie(they)/Sie share a
// form (formal address uses the same conjugation as 3rd person plural).
// sie (she) and sie (they) are spelled identically, so prompts disambiguate
// them in the label.
const PRONOUNS = [
  { id: 'ich',    label: 'ich',         group: 'ich' },
  { id: 'du',     label: 'du',          group: 'du' },
  { id: 'er',     label: 'er',          group: 'er' },
  { id: 'sie_sg', label: 'sie (she)',   group: 'er' },
  { id: 'es',     label: 'es',          group: 'er' },
  { id: 'wir',    label: 'wir',         group: 'wir' },
  { id: 'ihr',    label: 'ihr',         group: 'ihr' },
  { id: 'sie_pl', label: 'sie (they)',  group: 'sie' },
  { id: 'Sie',    label: 'Sie (formal)', group: 'sie' },
]

const DE_VERB_FORMS = {
  sein:  { ich: 'bin',  du: 'bist',  er: 'ist', wir: 'sind',  ihr: 'seid', sie: 'sind' },
  haben: { ich: 'habe', du: 'hast',  er: 'hat', wir: 'haben', ihr: 'habt', sie: 'haben' },
}

function generateGermanVerbQuestion(verb) {
  const forms = DE_VERB_FORMS[verb]
  if (!forms) return null
  const pronoun = pickRandom(PRONOUNS)
  const correctForm = forms[pronoun.group]
  // Distractors: the other distinct forms of the same verb (never a form
  // that happens to equal the correct one, since some groups share forms).
  const otherForms = [...new Set(Object.values(forms))].filter(f => f !== correctForm)
  const wrong = otherForms.sort(() => Math.random() - 0.5).slice(0, 2)
  const options = [correctForm, ...wrong]
    .sort(() => Math.random() - 0.5)
    .map(f => ({ id: f, label: f }))
  return {
    prompt: pronoun.label,
    correctAnswer: correctForm,
    options,
  }
}

// Ten fully regular stems — no vowel change, no spelling-adjustment -e-
// needed (stem doesn't end in -t/-d/-m/-n-after-consonant), so the plain
// ending set (-e/-st/-t/-en/-t/-en) always applies exactly as written.
const DE_REGULAR_STEMS = ['mach', 'lern', 'kauf', 'spiel', 'wohn', 'sag', 'frag', 'hol', 'brauch', 'koch']

const DE_REGULAR_ENDINGS = { ich: 'e', du: 'st', er: 't', wir: 'en', ihr: 't', sie: 'en' }

function generateGermanRegularVerbQuestion() {
  const stem = pickRandom(DE_REGULAR_STEMS)
  const pronoun = pickRandom(PRONOUNS)
  const correctForm = stem + DE_REGULAR_ENDINGS[pronoun.group]
  const otherEndings = [...new Set(Object.values(DE_REGULAR_ENDINGS))].filter(e => e !== DE_REGULAR_ENDINGS[pronoun.group])
  const wrong = otherEndings.sort(() => Math.random() - 0.5).slice(0, 2).map(e => stem + e)
  const options = [correctForm, ...wrong]
    .sort(() => Math.random() - 0.5)
    .map(f => ({ id: f, label: f }))
  return {
    prompt: `${pronoun.label} ___ (${stem}en)`,
    correctAnswer: correctForm,
    options,
  }
}

// ── Verb-second (V2) word order ─────────────────────────────────────────
//
// Small compositional templates rather than one big bracket list: pick a
// subject + regular verb + a sensible object for that specific verb, and
// either lead with the subject (baseline order) or with a time adverb
// (forces subject/verb inversion — the part that actually tests the V2
// rule, since English doesn't invert here). Conjugation reuses the same
// ending rule as the regular-verb quiz above.
//
// Verb/object pairs are curated (not crossed freely) so sentences stay
// sensible — "Ich lerne ein Auto" isn't a real thing to say. Verbs that
// don't naturally take a simple noun object (sagen/fragen want a clause
// or person, wohnen wants a location) are left out of this generator
// entirely; they're untouched in the standalone conjugation quiz.
// Objects are kept feminine/neuter/uncountable on purpose (Fußball is the
// one masculine exception, but it never takes an article here) so nothing
// needs accusative case-declension to stay correct.

const V2_VERB_OBJECTS = {
  kauf:   ['ein Auto', 'ein Buch', 'eine Banane'],
  lern:   ['Deutsch', 'Spanisch'],
  brauch: ['Zeit', 'Geld', 'ein Auto'],
  koch:   ['Suppe', 'Reis'],
  spiel:  ['Fußball', 'Klavier'],
  mach:   ['Hausaufgaben', 'eine Pause'],
  hol:    ['ein Buch', 'die Post'],
}

const V2_SUBJECTS = [
  { pronoun: 'ich', group: 'ich' },
  { pronoun: 'du',  group: 'du' },
  { pronoun: 'er',  group: 'er' },
  { pronoun: 'sie', group: 'er' },
  { pronoun: 'wir', group: 'wir' },
]
const V2_ADVERBS = ['heute', 'jetzt', 'morgen']

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Builds one sentence as a lowercase word list with the verb already
// inserted in its correct (position-2) slot. Capitalization is applied
// separately by whoever renders the words, based on which word ends up
// first — so the same base words can be freely reordered for wrong-answer
// variants without re-deriving casing each time.
function buildV2Core() {
  const subject = pickRandom(V2_SUBJECTS)
  const stem = pickRandom(Object.keys(V2_VERB_OBJECTS))
  const verb = stem + DE_REGULAR_ENDINGS[subject.group]
  const object = pickRandom(V2_VERB_OBJECTS[stem])
  const inversion = Math.random() < 0.5
  // `base` is the fixed non-verb sequence in its natural order; the verb
  // always gets inserted right after index 0 (position 2 overall) for the
  // correct sentence.
  const base = inversion ? [pickRandom(V2_ADVERBS), subject.pronoun, object] : [subject.pronoun, object]
  const words = [base[0], verb, ...base.slice(1)]
  return { words, verb, base }
}

function renderWords(words) {
  return words.map((w, i) => (i === 0 ? capitalize(w) : w)).join(' ')
}

function generateGermanV2TilesQuestion() {
  const { words } = buildV2Core()
  const n = words.length
  let shuffledIdx
  do {
    shuffledIdx = words.map((_, i) => i).sort(() => Math.random() - 0.5)
  } while (n > 2 && shuffledIdx.every((v, i) => v === i))
  // Casing is baked into the correct-order rendering, then tiles are
  // handed out in that already-cased form — matches how the static
  // patterns store tiles (e.g. "Ich" pre-capitalized), since there's only
  // one accepted order here (no alternates to worry about re-casing for).
  const cased = words.map((w, i) => (i === 0 ? capitalize(w) : w))
  const tiles = shuffledIdx.map(i => cased[i])
  const order = cased.map((_, p) => shuffledIdx.indexOf(p))
  return {
    tiles,
    answers: [{ order, note: null }],
  }
}

function generateGermanV2McQuestion() {
  const { words, verb, base } = buildV2Core()
  const correctSentence = renderWords(words)
  // Wrong variants: same fixed non-verb sequence, verb inserted at a
  // different (incorrect) slot — verb-first, or verb pushed to the end.
  // For the inversion case, also cover the classic learner mistake of not
  // inverting at all (adverb, subject, verb, object).
  const wrongSlots = base.length === 2
    ? [0, 2] // subject-first sentences: [verb,subj,obj] / [subj,obj,verb]
    : [2, 3] // adverb-first sentences: [adv,subj,verb,obj] / [adv,subj,obj,verb]
  const wrongSentences = wrongSlots.map(slot => {
    const rest = [...base]
    rest.splice(Math.min(slot, rest.length), 0, verb)
    return renderWords(rest)
  })
  const options = [correctSentence, ...wrongSentences]
    .sort(() => Math.random() - 0.5)
    .map(s => ({ id: s, label: s }))
  return {
    prompt: 'Which word order is correct?',
    correctAnswer: correctSentence,
    options,
  }
}

// ── German modal verbs (können, müssen) ─────────────────────────────────
//
// Same fixed-paradigm mechanism as sein/haben, but the prompt is a full
// sentence with the modal blanked out — "Ich ___ Klavier spielen." — since
// modal usage is really about the whole construction (modal + object +
// infinitive at the end), not just the bare conjugated form in isolation.
// Reuses the curated verb/object pairs from V2 for the infinitive + object.

const DE_MODAL_FORMS = {
  können: { ich: 'kann',  du: 'kannst', er: 'kann',  wir: 'können', ihr: 'könnt', sie: 'können' },
  müssen: { ich: 'muss',  du: 'musst',  er: 'muss',  wir: 'müssen', ihr: 'müsst', sie: 'müssen' },
}

// Plain surface form of each pronoun for use inside a composed sentence
// (as opposed to PRONOUNS' disambiguating label, e.g. "sie (she)", which
// is only useful for the bare-prompt sein/haben/regular quizzes above).
const PRONOUN_TEXT = { ich: 'ich', du: 'du', er: 'er', sie_sg: 'sie', es: 'es', wir: 'wir', ihr: 'ihr', sie_pl: 'sie', Sie: 'Sie' }

function generateGermanModalQuestion(modal) {
  const forms = DE_MODAL_FORMS[modal]
  if (!forms) return null
  const pronoun = pickRandom(PRONOUNS)
  const correctForm = forms[pronoun.group]
  const stem = pickRandom(Object.keys(V2_VERB_OBJECTS))
  const object = pickRandom(V2_VERB_OBJECTS[stem])
  const sentence = `${capitalize(PRONOUN_TEXT[pronoun.id])} ___ ${object} ${stem}en.`
  const otherForms = [...new Set(Object.values(forms))].filter(f => f !== correctForm)
  const wrong = otherForms.sort(() => Math.random() - 0.5).slice(0, 2)
  const options = [correctForm, ...wrong]
    .sort(() => Math.random() - 0.5)
    .map(f => ({ id: f, label: f }))
  return {
    prompt: sentence,
    correctAnswer: correctForm,
    options,
  }
}

// ── German prepositions (fixed accusative / dative sets) ────────────────
//
// One curated, correctly-cased example sentence per preposition (rather
// than one shared template crossed against all of them — "durch meinen
// Vater" and "für den Park" aren't equally sensible). The blank is the
// preposition itself; distractors are drawn from the *same* case-family,
// so picking correctly means actually knowing which preposition fits the
// sentence, not just noticing which case the noun phrase is in.

const DE_ACC_PREP_SENTENCES = {
  durch: 'Wir gehen ___ den Park.',
  für: 'Das Geschenk ist ___ meinen Vater.',
  gegen: 'Er läuft ___ die Wand.',
  ohne: 'Ich gehe nicht ___ dich.',
  um: 'Wir laufen ___ die Ecke.',
}

const DE_DAT_PREP_SENTENCES = {
  aus: 'Sie kommt ___ der Stadt.',
  bei: 'Ich wohne ___ meiner Familie.',
  mit: 'Ich fahre ___ dem Bus.',
  nach: 'Wir gehen ___ Hause.',
  seit: 'Ich lerne Deutsch ___ einem Jahr.',
  von: 'Das Buch ist ___ meiner Schwester.',
  zu: 'Ich gehe ___ der Schule.',
}

function generateGermanPrepositionQuestion(sentenceMap) {
  const preps = Object.keys(sentenceMap)
  const correct = pickRandom(preps)
  const wrong = preps.filter(p => p !== correct).sort(() => Math.random() - 0.5).slice(0, 2)
  const options = [correct, ...wrong]
    .sort(() => Math.random() - 0.5)
    .map(p => ({ id: p, label: p }))
  return {
    prompt: sentenceMap[correct],
    correctAnswer: correct,
    options,
  }
}

// ── German modal word order ──────────────────────────────────────────────
//
// Same shape as the V2 word-order generator above, but with a second fixed
// element: the infinitive always sits at the very end, after the modal
// (position 2) and everything else. Reuses the same curated verb/object
// pairs and subject/adverb pools as V2 for consistency.

function buildModalOrderCore() {
  const modal = pickRandom(['können', 'müssen'])
  const forms = DE_MODAL_FORMS[modal]
  const subject = pickRandom(V2_SUBJECTS)
  const modalForm = forms[subject.group]
  const stem = pickRandom(Object.keys(V2_VERB_OBJECTS))
  const object = pickRandom(V2_VERB_OBJECTS[stem])
  const infinitive = stem + 'en'
  const inversion = Math.random() < 0.5
  // `base` is the fixed non-modal sequence in its natural order; the modal
  // always gets inserted right after index 0 (position 2 overall).
  const base = inversion
    ? [pickRandom(V2_ADVERBS), subject.pronoun, object, infinitive]
    : [subject.pronoun, object, infinitive]
  const words = [base[0], modalForm, ...base.slice(1)]
  return { words, modalForm, base }
}

function generateGermanModalTilesQuestion() {
  const { words } = buildModalOrderCore()
  let shuffledIdx
  do {
    shuffledIdx = words.map((_, i) => i).sort(() => Math.random() - 0.5)
  } while (shuffledIdx.every((v, i) => v === i))
  const cased = words.map((w, i) => (i === 0 ? capitalize(w) : w))
  const tiles = shuffledIdx.map(i => cased[i])
  const order = cased.map((_, p) => shuffledIdx.indexOf(p))
  return {
    tiles,
    answers: [{ order, note: null }],
  }
}

function generateGermanModalMcQuestion() {
  const { words, modalForm, base } = buildModalOrderCore()
  const correctSentence = renderWords(words)
  // Wrong variants: modal inserted at an incorrect slot — modal-first, or
  // modal pushed all the way to the end (where the infinitive belongs).
  // For the inversion case, also covers not inverting at all.
  const wrongSlots = base.length === 3
    ? [0, 3] // subject-first: [modal,subj,obj,inf] / [subj,obj,inf,modal]
    : [2, 4] // adverb-first: [adv,subj,modal,obj,inf] / [adv,subj,obj,inf,modal]
  const wrongSentences = wrongSlots.map(slot => {
    const rest = [...base]
    rest.splice(Math.min(slot, rest.length), 0, modalForm)
    return renderWords(rest)
  })
  const options = [correctSentence, ...wrongSentences]
    .sort(() => Math.random() - 0.5)
    .map(s => ({ id: s, label: s }))
  return {
    prompt: 'Which word order is correct?',
    correctAnswer: correctSentence,
    options,
  }
}

// ── Registry ─────────────────────────────────────────────────────────────

export const QUIZ_GENERATORS = {
  'de-articles-nom-def':   (entries, level) => generateGermanArticleQuestion('de-articles-nom-def', entries, level),
  'de-articles-nom-indef': (entries, level) => generateGermanArticleQuestion('de-articles-nom-indef', entries, level),
  'de-articles-acc-def':   (entries, level) => generateGermanArticleQuestion('de-articles-acc-def', entries, level),
  'de-articles-acc-indef': (entries, level) => generateGermanArticleQuestion('de-articles-acc-indef', entries, level),
  'de-articles-dat-def':   (entries, level) => generateGermanArticleQuestion('de-articles-dat-def', entries, level),
  'de-verb-sein':          () => generateGermanVerbQuestion('sein'),
  'de-verb-haben':         () => generateGermanVerbQuestion('haben'),
  'de-verb-regular':       () => generateGermanRegularVerbQuestion(),
  'de-verb-second-mc':     () => generateGermanV2McQuestion(),
  'de-verb-second-tiles':  () => generateGermanV2TilesQuestion(),
  'de-verb-koennen':       () => generateGermanModalQuestion('können'),
  'de-verb-muessen':       () => generateGermanModalQuestion('müssen'),
  'de-prep-accusative':    () => generateGermanPrepositionQuestion(DE_ACC_PREP_SENTENCES),
  'de-prep-dative':        () => generateGermanPrepositionQuestion(DE_DAT_PREP_SENTENCES),
  'de-modal-order-mc':     () => generateGermanModalMcQuestion(),
  'de-modal-order-tiles':  () => generateGermanModalTilesQuestion(),
}

export function hasQuiz(quizType) {
  return !!quizType && !!QUIZ_GENERATORS[quizType]
}

export function generateQuestion(quizType, vocabEntries, level) {
  const gen = QUIZ_GENERATORS[quizType]
  return gen ? gen(vocabEntries, level) : null
}
