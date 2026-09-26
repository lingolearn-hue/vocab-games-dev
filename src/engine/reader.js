/**
 * Reader lookup engine.
 *
 * Builds a lookup index from loaded vocab entries, then for any position
 * in a text finds the longest matching entry (phrase before word before char).
 *
 * For CJK (no spaces): tries substrings of decreasing length from position.
 * For spaced languages: tries multi-word and single-word matches.
 *
 * Japanese conjugation: when no direct match is found, tries stripping known
 * verb/adjective suffixes and reconstructing dictionary forms. Text-specific —
 * only resolves forms whose stems + candidates appear in the vocab index,
 * so false positives are impossible for words not in the list.
 */

const CJK_LANGS = new Set(['zh', 'ja', 'ko'])
const CJK_MAX_LEN = 8

// ── Japanese deinflection tables ──────────────────────────────────────────────

// Polite/progressive suffixes to strip — leaves either ichidan stem or godan i-stem
const POLITE_SUFFIXES = [
  'ませんでした',
  'ていました', 'ていません', 'ています', 'ていた', 'ている',
  'でした',
  'ました', 'ません', 'なかった',
  'ます',
]

// Te-form / plain past suffixes that directly encode the godan class
// [suffix, array of dictionary forms to try by appending to the pre-suffix stem]
const TE_TA_FORMS = [
  ['いって',  ['いく']],         // 行って → 行く (irregular)
  ['きて',    ['くる']],          // 来て → 来る (irregular)
  ['して',    ['する', 'す']],    // して → する / 話して → 話す
  ['した',    ['する', 'す']],
  ['きた',    ['くる']],
  ['いった',  ['いく']],
  ['って',    ['う', 'つ', 'る']], // te-form: 待って → 待つ, 言って → 言う
  ['った',    ['う', 'つ', 'る']], // plain-past counterpart of って — was missing entirely, e.g. 言った → 言う, 待った → 待つ
  ['んで',    ['ぬ', 'ぶ', 'む']],
  ['いで',    ['ぐ']],
  ['いて',    ['く']],
  ['た',      ['る']],            // ichidan: 食べた → 食べる
  ['て',      ['る']],
]

// Godan i-stem (連用形) ending → dictionary form ending
// e.g. 飲み → 飲む, 書き → 書く, 話し → 話す
const ISTEM_MAP = [
  ['き', 'く'], ['ぎ', 'ぐ'], ['し', 'す'], ['ち', 'つ'],
  ['に', 'ぬ'], ['び', 'ぶ'], ['み', 'む'], ['い', 'う'],
]

// Godan a-stem (未然形) ending → dictionary form (for ない-form)
// e.g. 飲ま → 飲む, 書か → 書く
const ASTEM_MAP = [
  ['か', 'く'], ['が', 'ぐ'], ['さ', 'す'], ['た', 'つ'],
  ['な', 'ぬ'], ['ば', 'ぶ'], ['ま', 'む'], ['わ', 'う'],
  ['ら', 'る'],  // careful: also ichidan if verb ends in る
]

// い-adjective [suffix_to_strip, replacement]
const IADJ_DEINFLECTIONS = [
  ['くありませんでした', 'い'], ['くありません', 'い'],
  ['くなかった', 'い'], ['くなります', 'い'], ['くなった', 'い'],
  ['かった', 'い'], ['くない', 'い'], ['くて', 'い'], ['く', 'い'],
  ['さ', 'い'],
]

// な-adjective / copula [suffix_to_strip, replacement]
const NADJ_DEINFLECTIONS = [
  ['ではなかった', ''], ['ではない', ''], ['じゃない', ''],
  ['でした', ''], ['です', ''], ['な', ''], ['に', ''], ['で', ''],
]

function iStemToDict(stem, lookup) {
  for (const [ending, dict] of ISTEM_MAP) {
    if (stem.endsWith(ending)) {
      const candidate = stem.slice(0, -ending.length) + dict
      if (candidate.length >= 2 && lookup.has(candidate)) return lookup.get(candidate)[0]
    }
  }
  return null
}

function aStemToDict(stem, lookup) {
  for (const [ending, dict] of ASTEM_MAP) {
    if (stem.endsWith(ending)) {
      const candidate = stem.slice(0, -ending.length) + dict
      if (candidate.length >= 2 && lookup.has(candidate)) return lookup.get(candidate)[0]
    }
  }
  return null
}

// Causative renyoukei (使役連用形) ending → dictionary form, e.g.
// 思わせ (from 思わせる, causative of 思う) → 思う, 書かせ → 書く. Godan
// causatives are built as a-stem + せ (思う → 思わ+せる), so each ending
// pairs the a-row kana with its dictionary-form終止形 row, mirroring
// ASTEM_MAP. させ is ambiguous on its own — it's both the godan す-verb
// causative (話す → 話させる) and the ichidan causative (食べる →
// 食べさせる, base + させる with no row-shift at all) — so that one case
// tries both reconstructions rather than a fixed pair.
const CAUSATIVE_STEM_MAP = [
  ['わせ', 'う'], ['かせ', 'く'], ['がせ', 'ぐ'],
  ['たせ', 'つ'], ['なせ', 'ぬ'], ['ばせ', 'ぶ'], ['ませ', 'む'], ['らせ', 'る'],
]

function causativeStemToDict(stem, lookup) {
  if (stem.endsWith('させ')) {
    const base = stem.slice(0, -2)
    if (lookup.has(base + 'す')) return lookup.get(base + 'す')[0] // godan す-verb: 話させ → 話す
    if (lookup.has(base + 'る')) return lookup.get(base + 'る')[0] // ichidan: 食べさせ → 食べる
  }
  for (const [ending, dict] of CAUSATIVE_STEM_MAP) {
    if (stem.endsWith(ending)) {
      const candidate = stem.slice(0, -ending.length) + dict
      if (candidate.length >= 2 && lookup.has(candidate)) return lookup.get(candidate)[0]
    }
  }
  return null
}

function resolveConjugated(surface, lookup) {
  if (surface.length < 2) return null

  // 0. Bare i-stem (連用形) used standalone as a noun — a common Japanese
  // pattern where a verb's continuative stem functions as a noun with no
  // suffix at all, e.g. 成り立ち → 成り立つ, 始まり → 始まる, 動き → 動く.
  // iStemToDict() below is otherwise only tried after stripping a polite
  // suffix (~ます etc.); this tries the whole surface directly first,
  // since a nominalized stem has no suffix to strip in the first place.
  const bareIstem = iStemToDict(surface, lookup)
  if (bareIstem) return bareIstem

  // 1. Polite / progressive forms → leaves i-stem or ichidan stem
  for (const suffix of POLITE_SUFFIXES) {
    if (surface.length <= suffix.length || !surface.endsWith(suffix)) continue
    const stem = surface.slice(0, -suffix.length)
    if (!stem) continue
    // Ichidan: stem + る
    const ichidan = stem + 'る'
    if (lookup.has(ichidan)) return lookup.get(ichidan)[0]
    // Godan: stem is i-stem → convert
    const godan = iStemToDict(stem, lookup)
    if (godan) return godan
    // Causative: stem is a causative renyoukei (思わせ → 思う), e.g.
    // 思わせました, 食べさせます
    const causative = causativeStemToDict(stem, lookup)
    if (causative) return causative
    // Irregular: する、くる
    if (lookup.has(stem)) return lookup.get(stem)[0]
  }

  // 2. Te-form / plain past — suffix encodes conjugation class
  for (const [suffix, endings] of TE_TA_FORMS) {
    if (surface.length <= suffix.length || !surface.endsWith(suffix)) continue
    const stem = surface.slice(0, -suffix.length)
    for (const ending of endings) {
      const candidate = stem + ending
      if (candidate.length >= 2 && lookup.has(candidate)) return lookup.get(candidate)[0]
    }
    // Also try ichidan (for て/た)
    if (suffix === 'て' || suffix === 'た') {
      const ichidan = stem + 'る'
      if (lookup.has(ichidan)) return lookup.get(ichidan)[0]
      // Causative-past/te: 思わせた/思わせて → stem "思わせ" → 思う
      const causative = causativeStemToDict(stem, lookup)
      if (causative) return causative
    }
  }

  // 3. Negative ない-form → a-stem conversion
  if (surface.length > 2 && surface.endsWith('ない')) {
    const stem = surface.slice(0, -2)
    // Ichidan: stem + る (e.g. 食べない → 食べる)
    const ichidan = stem + 'る'
    if (lookup.has(ichidan)) return lookup.get(ichidan)[0]
    // Godan: a-stem → dict
    const godan = aStemToDict(stem, lookup)
    if (godan) return godan
  }

  // 4. い-adjective inflections
  for (const [suffix, replacement] of IADJ_DEINFLECTIONS) {
    if (surface.length <= suffix.length || !surface.endsWith(suffix)) continue
    const candidate = surface.slice(0, -suffix.length) + replacement
    if (candidate.length >= 2 && lookup.has(candidate)) return lookup.get(candidate)[0]
  }

  // 5. な-adjective / copula inflections
  for (const [suffix, replacement] of NADJ_DEINFLECTIONS) {
    if (!suffix || surface.length <= suffix.length || !surface.endsWith(suffix)) continue
    const candidate = surface.slice(0, -suffix.length) + replacement
    if (candidate.length >= 1 && lookup.has(candidate)) return lookup.get(candidate)[0]
  }

  return null
}

// ── Lookup builder ────────────────────────────────────────────────────────────

export function buildLookup(entries) {
  const map = new Map()
  function add(key, e) {
    const existing = map.get(key)
    if (existing) {
      if (!existing.includes(e)) existing.push(e)
    } else {
      map.set(key, [e])
    }
  }
  for (const e of entries) {
    add(e.entry.toLowerCase(), e)
    // German: index without article
    const stripped = e.entry.replace(/^(der|die|das|den|dem|des)\s+/i, '')
    if (stripped !== e.entry) add(stripped.toLowerCase(), e)
  }
  // Second pass, after every literal dictionary form is indexed: also index
  // Japanese entries by their kana reading. A1 Graded Reader passages are
  // written kanji-free by house convention (see AUTHORING-TEXTS.md), so a
  // word like 農場 ("farm") appears in text only as のうじょう. Without this,
  // that string never matches anything in the lookup, and the longest-match
  // tokeniser below falls through character-by-character, latching onto
  // short, often unrelated single/two-kana matches instead — e.g. mistaking
  // part of a real word for an unrelated short one. (Confirmed directly:
  // fugashi's own tokenizer independently mis-splits のうじょう into 嚢
  // "sack" + a suffix fragment, neither of which is 農場 — same failure
  // shape from the opposite direction.)
  // Reading collisions (homophones sharing one kana spelling, e.g. かみ =
  // 紙/髪/神) all get indexed under the same key (each still independently
  // reachable, same as any other homograph collision — see the note on
  // multi-entry keys above) rather than the first one winning outright.
  // Kept as a separate pass (rather than inline above) so literal
  // dictionary-form matches are always indexed first and a reading-based
  // key for a different entry can never push a dictionary-form entry out
  // of that entry's own primary slot.
  // Harmless for non-Japanese entries: `reading` is empty for de/es/fr, and
  // zh readings are pinyin (Latin script), which never appears literally in
  // Chinese passage text, so those keys simply never match anything.
  for (const e of entries) {
    if (!e.reading || e.reading === e.entry) continue
    add(e.reading.toLowerCase(), e)
  }
  return map
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────

export function tokenise(text, lookup, language) {
  if (!text) return []
  return CJK_LANGS.has(language)
    ? tokeniseCJK(text, lookup, language)
    : tokeniseSpaced(text, lookup)
}

function tokeniseCJK(text, lookup, language) {
  const isJapanese = language === 'ja'
  const spans = []
  let i = 0

  while (i < text.length) {
    let matched = null

    // 1. Direct longest-match (dictionary form in text)
    for (let len = Math.min(CJK_MAX_LEN, text.length - i); len >= 1; len--) {
      const substr = text.slice(i, i + len)
      if (lookup.has(substr.toLowerCase())) {
        const candidates = lookup.get(substr.toLowerCase())
        matched = { text: substr, entry: candidates[0], entries: candidates, start: i, end: i + len }
        break
      }
    }

    // 2. Japanese conjugation resolution — try substrings of decreasing length
    if (!matched && isJapanese) {
      // Try longer windows first (conjugated forms can be longer than dict forms)
      const maxLen = Math.min(CJK_MAX_LEN + 6, text.length - i)
      for (let len = maxLen; len >= 2; len--) {
        const substr = text.slice(i, i + len)
        const entry = resolveConjugated(substr, lookup)
        if (entry) {
          matched = { text: substr, entry, start: i, end: i + len, conjugated: true }
          break
        }
      }
    }

    if (matched) {
      spans.push(matched)
      i = matched.end
    } else {
      // Plain character — merge with previous plain span
      if (spans.length > 0 && spans[spans.length - 1].entry === null) {
        spans[spans.length - 1].text += text[i]
        spans[spans.length - 1].end = i + 1
      } else {
        spans.push({ text: text[i], entry: null, start: i, end: i + 1 })
      }
      i++
    }
  }
  return spans
}

function tokeniseSpaced(text, lookup) {
  const spans = []
  const parts = text.split(/(\s+|[.,!?;:"""''()[\]{}—–\-/\\])/)
  const words = []
  let pos = 0
  for (const part of parts) {
    words.push({
      text: part,
      isWord: /\S/.test(part) && !/^[.,!?;:"""''()[\]{}—–\-/\\]$/.test(part),
      pos,
    })
    pos += part.length
  }

  let i = 0
  while (i < words.length) {
    if (!words[i].isWord) {
      spans.push({ text: words[i].text, entry: null, start: words[i].pos, end: words[i].pos + words[i].text.length })
      i++
      continue
    }

    let matched = null
    for (let phraseLen = 3; phraseLen >= 1 && !matched; phraseLen--) {
      const wordTokens = []
      let j = i
      while (wordTokens.length < phraseLen && j < words.length) {
        if (words[j].isWord) wordTokens.push(j)
        j++
      }
      if (wordTokens.length < phraseLen) continue
      const phrase = wordTokens.map(idx => words[idx].text).join(' ')
      if (lookup.has(phrase.toLowerCase())) {
        const candidates = lookup.get(phrase.toLowerCase())
        const startPos = words[i].pos
        const lastWord = words[wordTokens[wordTokens.length - 1]]
        matched = { text: phrase, entry: candidates[0], entries: candidates, start: startPos, end: lastWord.pos + lastWord.text.length }
        i = j
      }
    }

    if (matched) {
      spans.push(matched)
    } else {
      spans.push({ text: words[i].text, entry: null, start: words[i].pos, end: words[i].pos + words[i].text.length })
      i++
    }
  }
  return spans
}

/**
 * Splits passage text into sentences for the Graded Reader's read-aloud
 * feature — each sentence is spoken (and highlighted) individually via
 * speakAndWait() rather than handing the whole passage to the TTS engine
 * at once, which gives cleaner pacing and lets the UI show reading
 * progress. CJK languages use full-width punctuation (。！？); everything
 * else uses standard Latin sentence-ending punctuation. Keeps the
 * delimiter attached to its sentence; drops empty fragments (e.g. from
 * trailing whitespace or consecutive punctuation).
 */
export function splitSentences(text, language) {
  if (!text) return []
  const isCJK = CJK_LANGS.has(language)
  // Allow closing quote/bracket characters, and optionally a trailing
  // comma, to sit between the terminal punctuation and the sentence
  // boundary. Dialogue routinely ends like "Hallo?" or 「こんにちは。」, and
  // dialogue tags routinely follow as '"...?", fragte er.' — the comma
  // there is what a naive fix (closers alone) still misses. Without all
  // of this, the boundary lookahead never finds whitespace/EOS
  // immediately after the bare punctuation mark, and the entire clause
  // before it gets silently dropped from the match, leaving only the
  // trailing quote/comma as its own "sentence". A single optional space
  // is also tolerated before the closer — French typography places a
  // space before a closing guillemet (e.g. "toi. »", not "toi.»"),
  // without which that space-plus-quote splits off as its own stray
  // one-character "sentence" and shifts every sentence index after it by
  // one. This doesn't guarantee a linguistically ideal boundary right at
  // a dialogue tag (a tag can end up as its own short "sentence" rather
  // than joined to the quote before it) — but no content is ever lost,
  // which is what matters here.
  const closers = '"\'\u201d\u2019\u00bb\u300d\u300f)\\]'
  const re = isCJK
    ? new RegExp(`[^。！？]*[。！？]+[${closers}]*|[^。！？]+$`, 'g')
    : new RegExp(`[^.!?]*[.!?]+\\s?[${closers}]*,?(?=\\s|$)|[^.!?]+$`, 'g')
  const matches = text.match(re) ?? [text]
  return matches.map(s => s.trim()).filter(Boolean)
}

/**
 * Aligns two sentence lists (source-language and its translation) that
 * don't necessarily have the same count — very common even in careful
 * translation, since a translator routinely combines two source sentences
 * into one, or splits one into two, wherever the target language reads
 * better that way. Returns an array the same length as `srcSentences`,
 * one translation-text entry per source sentence.
 *
 * When the counts already match, returns the translations unchanged
 * (exact 1:1 is always the right answer when it's available). Otherwise,
 * falls back to a length-proportional heuristic: total the character
 * length of each side, then walk the source sentences accumulating
 * length, pulling in however many translation sentences are needed to
 * match the same proportion of the translation's total length so far.
 * This is a simplified version of the classical Gale-Church approach to
 * bilingual sentence alignment (aligned sentence pairs tend to have
 * roughly proportional character lengths); it isn't a real translation
 * aligner and won't always land on a perfect boundary, but it reliably
 * keeps a merged/split sentence pair together rather than shifting every
 * later sentence index by one, which is what a naive positional mapping
 * (or leaving translation unavailable entirely) would do instead.
 */
export function alignSentencesByLength(srcSentences, tgtSentences) {
  if (srcSentences.length === tgtSentences.length) return tgtSentences.slice()
  if (tgtSentences.length === 0) return srcSentences.map(() => '')
  if (srcSentences.length === 0) return []
  const srcLens = srcSentences.map(s => s.length)
  const tgtLens = tgtSentences.map(s => s.length)
  const srcTotal = srcLens.reduce((a, b) => a + b, 0) || 1
  const tgtTotal = tgtLens.reduce((a, b) => a + b, 0)
  const scale = tgtTotal / srcTotal

  const result = []
  let srcAccum = 0, tgtAccum = 0, tgtIdx = 0, tgtStart = 0
  for (let i = 0; i < srcSentences.length; i++) {
    srcAccum += srcLens[i]
    const goal = srcAccum * scale
    const remainingSrc = srcSentences.length - 1 - i
    const remainingTgtCapacity = tgtSentences.length - tgtIdx
    // Reserve enough target sentences for whatever's left, but never more
    // than actually remain — translation can compress several source
    // sentences into fewer target ones, in which case there just isn't a
    // full target sentence to spare for every remaining source sentence,
    // and later ones legitimately end up sharing/repeating text instead.
    const reserve = Math.max(0, Math.min(remainingSrc, remainingTgtCapacity - 1))
    while (tgtIdx < tgtSentences.length - reserve && tgtAccum < goal) {
      tgtAccum += tgtLens[tgtIdx]
      tgtIdx++
    }
    const chunk = tgtSentences.slice(tgtStart, tgtIdx).join(' ')
    // Heavy compression can mean this source sentence's turn consumed no
    // new target text at all — repeat the previous chunk rather than
    // leaving it with nothing.
    result.push(chunk || (result[result.length - 1] ?? ''))
    tgtStart = tgtIdx
  }
  if (tgtStart < tgtSentences.length) {
    result[result.length - 1] += (result[result.length - 1] ? ' ' : '') + tgtSentences.slice(tgtStart).join(' ')
  }
  return result
}

// ── Passage loader ────────────────────────────────────────────────────────────

export async function loadReaderPassages(listId) {
  try {
    const res = await fetch(`./reader/${listId}.json`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

/**
 * Loads the { lang: { surface: lemma } } map generated by
 * tools/generate_reader_surface_forms.py — currently covers German and
 * Japanese only. Consumed by TextWithLookup's existing `surfaceForms` prop
 * (same shape Adventure chapters already use), so inflected words like
 * "aßen" or "Kindern" resolve back to their dictionary-form vocab entry.
 */
export async function loadSurfaceForms() {
  try {
    const res = await fetch('./reader/surface-forms.json')
    if (!res.ok) return {}
    return res.json()
  } catch {
    return {}
  }
}
