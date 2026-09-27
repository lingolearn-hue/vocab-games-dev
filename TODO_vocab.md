# TODO (vocab data) / Future Improvements

Vocab-data-specific tasks, split out from the shared `TODO.md` (which
covers the whole app across multiple threads) since this file is
maintained by the vocab-curation thread specifically. See
`REVIEW-VOCAB.md` for full methodology write-ups; this file tracks
only the concrete remaining work items.

## Resolved: license question — vbvss199 "Language Learning Decks" and wordfreq (CC BY-SA)

The vbvss199 repo's own `attributions.md` cites `wordfreq` (CC BY-SA
4.0, share-alike) as an underlying data source for the word-frequency
lists their decks are built from. Decision: proceed treating vbvss199's
MIT license as valid — see the full reasoning in
`THIRD_PARTY_LICENSES.md`'s "Language Learning Decks" entry (bare
frequency data is a thin-protection factual compilation; the actual
copyrightable content is independently LLM-generated; `word_frequency`
is always 0 in their output, so wordfreq's own values aren't even
present). As a defensive practice regardless of this conclusion, the
`word_frequency` field is never imported into any of our vocab files —
apply this when doing the JA/KO merge below.

## Open: Japanese/Korean merge from vbvss199 decks — files downloaded, not yet processed

Four files downloaded to `/home/claude/vbvss_downloads/` (this path is
local-session-only, not committed — re-download from the links below
if starting a new session):
- `japanese/kanji.json` — 24,158 entries
- `japanese/hiragana.json` — 3,880 entries
- `japanese/katakana.json` — 9,164 entries
- `korean/korean.json` — 24,041 entries (this would be a **new**
  language for the project — no existing `ko-en.json`)

Direct links: see the "Language Learning Decks" entry in
`THIRD_PARTY_LICENSES.md`.

**Schema is much richer than ours**: each entry has `word`,
`useful_for_flashcard` (bool), `cefr_level`, `english_translation`,
`romanization`, `example_sentence_native`, `example_sentence_english`,
`pos`, `word_frequency`. Korean entries additionally have a
`definitions` array with per-sense `gloss` + `hanja` (Sino-Korean
etymology) for polysemous words. None of this has been reviewed for
accuracy yet — before merging, need the same verify-before-trust pass
applied to every other external source this session (the vbvss199
reference files diffed earlier turned out generally reliable but not
error-free; no reason to assume this dataset is different, and it's
far larger and unaudited by comparison).

**No longer blocked** — the licensing question above is resolved.
Remember to drop `word_frequency` on import regardless.



Structural fix complete: leading parentheticals repositioned to the
end across all of `zh-en.json` (1,291→0), using the mechanical/safe
`reposition()` function in `tools/zh_gloss_cleanup.py`. Phase 2 —
individual review of the ~1,231 remaining entries where a gloss is
long (>35 chars) *and* contains a parenthetical, to judge case-by-case
whether the content is genuinely reducible (redundant "e.g."
enumeration, hedging) or necessary (idiom explanation, grammatical
function note, sense disambiguation) — is NOT automatable, confirmed
during review that no reliable heuristic distinguishes the two. ~3
batches (~200 entries) reviewed so far, ~10-15% found trimmable. Use
`tools/zh_gloss_cleanup.py`'s `find_phase2_candidates()` to pull the
next batch; full methodology and examples in `REVIEW-VOCAB.md`'s
"Gloss formatting cleanup" section.

## Open: license-replacement gaps (contested/unresolved fields left blank)

Per an explicit decision to prioritize a clean MIT license over data
completeness: `THIRD_PARTY_LICENSES.md` now shows all three vocabulary
enrichment sources (Spanish gender, French gender, German verb
conjugation) as fully replaced with original work. Fields where the
original CC-BY-SA-derived source and our own rule/manual classification
disagreed, or where neither had a confident answer, were deliberately
left blank rather than guessed at or silently kept on the old source.
Full methodology in `REVIEW-VOCAB.md`; this section tracks only the
concrete remaining gaps.

- **Spanish gender** (`public/vocab/es-en.json`): 246 nouns have
  `gender: null`. Mostly epicene person-nouns where our classification
  (`el/la agente`, `el/la testigo`, etc.) disagreed with the old
  source's flat masculine tag, plus a handful of true homographs
  (`cometa`, `guía`) and unstable loanwords (`party`, `magazine`,
  `blockchain`).
- **French gender** (`public/vocab/fr-en.json`): 321 nouns have
  `gender: null`. Same pattern — mostly person-nouns where French's
  distinct-feminine-spelling behavior (`citoyen`/`citoyenne`) makes a
  simple epicene/masculine call contested, plus loanwords and a few
  homographs.
- **German verb conjugation** (`public/conjugations/de.json`): 457
  verbs have at least one null field among presentTense/pastTense/
  pastParticiple/auxiliary (719 null fields total). Mostly missing
  entries in the compiled strong-verb table (rare irregular verbs not
  yet added), dual-paradigm verbs where a weak and strong conjugation
  both exist for different senses (`hängen`, `bewegen`, `verwenden`),
  and a handful of compound/multi-prefix verbs beyond the
  single-prefix model's scope. Note: this file's tooling
  (`tools/de_conjugation_manual.py`) was reconstructed from a lost
  local session and may cover somewhat fewer verbs than the original
  pass — legitimate room to extend further.

**To close further**: extend `tools/{es,fr}_gender_manual.py` and
`tools/de_conjugation_rules.py`/`de_conjugation_manual.py` with
additional verified entries, following the same discipline used
throughout — classify from real knowledge, validate, don't guess.
