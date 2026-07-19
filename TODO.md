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

## Category system (topic tagging)
- [x] Taxonomy designed: 8 parents (Nature, People, Life, Time, Places,
      Society, Science, Abstract) with ~25 leaves, per-language display
      labels. Lives in `src/engine/categories.js` — see its header comment
      and `README.md` "Category system" section for the design rationale.
- [x] Two-level chooser UI (parent row + on-demand leaf drill-down), wired
      into Setup (global filter) and Vocab Browser (local filter).
- [x] German A1 (678 words) — tagged, high precision.
- [x] Japanese N5/N4 (1,415 words) — tagged, high precision.
- [x] Chinese HSK1-3 (1,210 words) — tagged, high precision.
- [x] German A2 (2,057 words) — tagged; first pass leaned too hard on a
      generic fallback bucket (62% landed in "Concepts"), caught via spot
      check and redone by hand — now ~14% Concepts, in line with the others.
      Lesson: always spot-check a random sample before trusting a
      keyword-driven tagging pass, especially at >1000 words.
- [x] Taxonomy restructured: removed "Time" as its own parent, added
      "Culture" parent (time/politics/music/art leaves), added "traffic"
      leaf under Places. Now 9 parents, ~32 leaves.
- [x] German B1 (6,441 words) — tagged via keyword pass against English
      glosses + heavy iterative spot-checking (~10 rounds). Concepts
      fallback down from 62.5% to 54.5%. Found and fixed ~35 polysemy bugs
      (short/boot/field/little/degree/bill/bear/bat/right/player/show/
      button/plant/course/article/nail/jam/taste/branch/law/clip/country/
      head-shower/and/or/while, etc.) — single English keywords collide
      constantly with unrelated senses; multi-word phrase requirements and
      targeted idiom-scrub lists (see `IDIOM_SCRUBS` in the tagging script)
      fixed most of it. ~54.5% Concepts is treated as B1's real ceiling,
      not a bug — B1 vocab is structurally more abstract than A1/A2.
- [ ] Continue category tagging: German B2/C1/C2, Chinese HSK4-7, Spanish,
      French, English (entirely untagged). Reuse the B1 keyword set as a
      starting point but expect a fresh round of spot-check-driven fixes
      per language/level — polysemy bugs are language- and vocab-specific.
- [ ] Check existing categories: A1/A2 (German), N5/N4 (Japanese), HSK1-3
      (Chinese) were tagged before the taxonomy restructure (new Culture
      parent, traffic/music/art leaves, calendar→time rename) and before
      the polysemy-bug lessons learned during B1. Worth a fresh spot check
      to see if any of that earlier work has the same class of bugs, and
      whether words now belonging in the new leaves (music/art/traffic)
      got missed or mis-bucketed under the old taxonomy.
- [ ] Science parent (Physics/Chemistry/Biology leaves) currently has ~1
      word tagged (Japanese "biology") — will need real content once
      higher levels (which actually contain science vocab) get tagged.

## Options menu
- [ ] Check export/import function — flagged for review, not yet verified
      against current data shape (categories arrays, POS field, per-level
      schema changes made this session).



## Session hygiene
- [ ] This chat has been running very long (multiple big features across
      many turns) and has started showing reliability issues. Plan: start a
      fresh conversation after each natural milestone (e.g. right after a
      push) rather than continuing indefinitely in one thread. Memory
      carries durable facts/preferences across chats; this TODO + the repo
      itself is the source of truth a new chat should read first.


- [ ] Main repo (`vocab-games`) `dev` branch is stale (~v0.46, pre-dates all
      the lost-session recovery work) — decide whether to retire it or
      fast-forward it from the current `main`/recovered line.
- [ ] Document the `vendor/language-decks/` + `tools/extract-examples.js`
      pattern as "the process" for future language/example data work
      (currently only documented in `vendor/language-decks/README.md`).
