# TODO / Future Improvements

## Data quality
- [x] German `pos` field cleanup — done. `Vogelsang` fixed (`unclear`→`noun`),
      `adjektiv`→`adj` (79 words) and `num`→`numeral` (5 words) unified.
      Corresponding example-sentence keys migrated, zero gaps.
- [x] French `pos` field has corrupted values in `fr-en.json` — fixed
      (32 rows: `verbs`→`verb`, `adverbs`→`adv`, `nom`→`noun`, `num`→
      `numeral`, plus 9 leaked-word values mapped to correct POS).
- [x] Vulgarity/sensitive-term scan across all 6 vocab lists — done. Profanity
      + sensitive biological terms tagged `vulgar` in `categories` (filtered
      out by default, toggle in Settings → Content). Identity-based slurs
      (`marica` es, `玻璃` zh) removed outright. Mistagged gloss fixed
      (`だらしない` ja had a stray "a slut" sense in its translation).
- [x] German example sentences — 100% coverage, all levels.
- [x] Japanese example sentences — 100% coverage, all JLPT levels (N5-N1).
- [x] Chinese example sentences — 100% coverage through HSK1-6.
- [ ] Chinese HSK7 (~577 words, mostly idioms/advanced vocab) + "old-X" legacy
      level tail (~39 words) still missing example sentences — the only
      remaining gap across all six languages.

## Facets / Leitner
- [ ] StrokeOrder doesn't have a `facetsByBox` equivalent — could tie its
      existing "show character / recall from memory" toggle to the box
      instead of manual control, matching the other games.
- [ ] Per-facet accuracy breakdown in Stats (e.g. "weakest at reading-only
      recall") — box already implies which facet was tested, so this is
      mostly a reporting task on existing data.

## Content coverage
- [x] Japanese N4/N5 "thin coverage" — turned out to be a data bug, not a
      real gap. 2,128 of 7,972 words had the wrong JLPT level (mostly N3
      words mistagged N2). Rebuilt every level directly from the elzup
      source CSVs. Corrected distribution: N5: 749, N4: 682, N3: 2,131,
      N2: 1,741, N1: 2,669 (was N5: 532, N4: 7, N3: 401, N2: 3,409, N1: 2,951).
- [ ] `?` help buttons not yet added to Adventure/AdventureChapter, Settings,
      Stats screens.

## Motivation / retention
- [ ] Streak/heatmap using the day-lock mechanism — box selection is already
      day-aware, so "days practiced" data is basically already there.
- [ ] One-time nudge/tooltip pointing returning users at `facetsByBox` (🧩)
      so it doesn't sit undiscovered behind a small icon.

## English vocab list
- [ ] `en-en.json` is a 20-entry stub, not a real list. Considered adopting
      vbvss199's `english.json` directly (20,708 words, real CEFR/POS/example
      sentences) — open design question is what goes in `translation` since
      the word already *is* English (duplicate word / definition / skip).
- [ ] Considered "reverse index" idea (pick a source language, learn English
      via its existing translation glosses) — decided against for now:
      requires 5 new generated files + per-source reverse indexes + new
      "pick source language" UI concept, uneven/unknown match rates per
      language. If revisited, pilot with German only first (most developed
      list) before committing to all five.

## Housekeeping
- [ ] Main repo (`vocab-games`) `dev` branch is stale (~v0.46, pre-dates all
      the lost-session recovery work) — decide whether to retire it or
      fast-forward it from the current `main`/recovered line.
- [ ] Document the `vendor/language-decks/` + `tools/extract-examples.js`
      pattern as "the process" for future language/example data work
      (currently only documented in `vendor/language-decks/README.md`).
