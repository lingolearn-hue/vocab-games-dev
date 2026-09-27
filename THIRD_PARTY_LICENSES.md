# Third-Party Licenses

This project uses the following third-party resources. Their licenses are noted below.
The project's own license is in `LICENSE`.

---

## Vocabulary Data

### Chinese (Mandarin) — DrKameleon Complete HSK Vocabulary
- **Source**: https://github.com/drkameleon/complete-hsk-vocabulary
- **Author**: Yanis Zafirópulos (drkameleon)
- **License**: MIT
- **Used for**: Chinese vocabulary lists, HSK levels 1–6/9
- **Note**: When using this dataset, keep this attribution notice.

### Japanese — jlpt-word-list
- **Source**: https://github.com/elzup/jlpt-word-list
- **Author**: elzup
- **License**: MIT
- **Used for**: Japanese vocabulary data (`public/vocab/ja-en.json`)

### Language Learning Decks
- **Source**: https://github.com/vbvss199/Language-Learning-decks
- **Copyright**: (c) 2025 GENERAL NEURO
- **License**: MIT
- **Licensing analysis**: this repo's own `attributions.md` cites
  `wordfreq` (CC BY-SA 4.0) as an underlying source for the word-
  frequency lists their pipeline starts from. Assessed and accepted:
  bare word-frequency data is a factual compilation with thin-to-no
  copyright protection on its own (cf. *Feist v. Rural Telephone* —
  facts and simple factual arrangements aren't protectable, only a
  sufficiently original selection/arrangement is); the actual
  copyrightable content in vbvss199's output (definitions, example
  sentences, CEFR levels, POS tags) is independently LLM-generated,
  not reproduced or adapted from wordfreq's own expression. Note:
  their output *does* carry a `word_frequency` field with real,
  frequency-correlated rank values (verified: common words like 人
  rank near 0, less common words rank higher) — an earlier version of
  this note incorrectly claimed this field was always 0 based on a
  single sample; that was wrong and is corrected here. This field is
  never imported into our vocab files regardless of the licensing
  conclusion, precisely because it's the one piece of their output
  that plausibly does carry over wordfreq's own specific arrangement.
  On the whole, vbvss199's MIT relicensing of their output (excluding
  the frequency-rank field) is treated as valid, and this project
  proceeds on that basis.
- **Used for**: vocabulary deck data — likely the original source for
  the German/Spanish/French base vocabulary (structural match found:
  the first commit creating those files has bare, uncategorized
  entries consistent with this repo's Gemini-cleaned frequency-list
  pipeline), though this was never explicitly confirmed in code or
  docs. Also the source for a pending Japanese/Korean vocabulary merge
  — see `TODO_vocab.md`. In both cases, only `word`/`english_translation`/
  `romanization`/`example_sentence_*`/`pos`/`cefr_level` fields are
  used; the `word_frequency` field is dropped on import.
- **Files referenced for the pending Japanese/Korean merge** (see
  `TODO_vocab.md`):
  - https://github.com/vbvss199/Language-Learning-decks/blob/main/japanese/kanji.json
  - https://github.com/vbvss199/Language-Learning-decks/blob/main/japanese/hiragana.json
  - https://github.com/vbvss199/Language-Learning-decks/blob/main/japanese/katakana.json
  - https://github.com/vbvss199/Language-Learning-decks/blob/main/korean/korean.json

---

## Vocabulary Enrichment Data (categories, gender, conjugation)

These were used as fill-only sources to populate specific fields on top of
the vocabulary lists above — not as vocabulary sources themselves. Each
entry below states exactly what data was extracted and where it landed.

### French gender — replaced with original work
Originally sourced from Lexique383 (New, Pallier, Ferrand & Matos —
lexique.org; "distributed for research use," not a standard open
license) for ~1,735 nouns; replaced with an original rule/extraction/
manual pipeline (`tools/fr_gender_rules.py`, `fr_gender_from_examples.py`,
`fr_gender_manual.py`). Contested or unresolved entries were left blank
rather than guessed or left on the old source — see `TODO_vocab.md` for the
open list and `REVIEW-VOCAB.md` for full methodology notes.

### Spanish gender — replaced with original work
Originally sourced from doozan/spanish_data (Wiktionary-derived,
CC-BY-SA) for ~9,000 nouns; replaced with an original rule/extraction/
manual pipeline (`tools/es_gender_rules.py`, `es_gender_from_examples.py`,
`es_gender_manual.py`). Contested or unresolved entries were left blank
rather than guessed or left on the old source — see `TODO_vocab.md` for the
open list and `REVIEW-VOCAB.md` for full methodology notes.

### German verb conjugation — replaced with original work
Originally sourced from german-verbs-database
(https://github.com/viorelsfetea/german-verbs-database,
Wiktionary-derived, CC-BY-SA) for 2,758 verbs; replaced with an original
rule-based generator plus a manual auxiliary-classification pass
(`tools/de_conjugation_rules.py`, `de_conjugation_manual.py`). Contested
or unresolved fields were left blank rather than guessed or left on the
old source — see `TODO_vocab.md` for the open list and `REVIEW-VOCAB.md` for
full methodology notes.

---

## JavaScript Dependencies

All npm dependencies are MIT licensed unless noted otherwise.
See `package.json` for the full dependency list.
Run `npm list --depth=0` for installed versions.

Key dependencies:
- **React** — MIT — https://reactjs.org
- **Vite** — MIT — https://vitejs.dev

---

## Notes

- Starter mnemonics for Chinese and Japanese were written specifically for this project and are original content.
- Grammar pattern data (`public/grammar/`) is original content.
- Reader passages and dialogue scripts (`public/reader/`, `public/dialogues/`) are original content.
