# Vocab Games

A React/Vite PWA for vocabulary learning across six languages (German,
Spanish, French, English, Chinese, Japanese), built around a custom Leitner
spaced-repetition engine.

## Quick start

```sh
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # serve the built dist/ locally
npm run lint
```

No environment variables or secrets are needed to build or run the project.

## Repos

- **`vocab-games`** (this repo) — production/main
- **`vocab-games-dev`** — dev/testing; `main` branch holds source, `gh-pages`
  branch holds the built `dist/` for the live dev deploy

Both repos are pushed manually (source + `gh-pages` deploy together, never
one without the other) — see `TODO.md` and chat history for the exact
workflow.

## Project structure

- `src/games/` — one file per game mode: Flashcard, Race Car, Pair Match,
  Typing, Stroke Order, Gap Fill, Grammar Trainer, Matching Drills, Graded
  Reader, Dialogue, Adventure, Grammar Dictionary, Vocab Browser, Stats,
  Settings.
- `src/components/` — shared UI: Setup (home screen), Tutorial, the chip
  filter system (`ChipRow`/`ChoiceChips`/`LevelChooser`/`CategoryChooser`),
  Leitner box bar, help overlays, etc.
- `src/engine/` — core logic, decoupled from UI:
  - `vocab.js` — loads/normalizes `public/vocab/*.json` into entry objects
  - `leitner.js` — the spaced-repetition box engine (see file header comment
    for the full box-selection design)
  - `categories.js` — topic category taxonomy (see below)
  - `settings.js` — persisted user settings, level/category filter helpers,
    dark mode
  - `examples.js`, `mnemonics.js`, `grammar.js`, `reader.js`,
    `dialogueTSV.js`, `campaignLoader.js`, `facets.js`, `srs.js` — supporting
    data loaders and logic for specific games
- `src/context/AppContext.jsx` — global app state: active language/entries,
  settings, filtered entry views used across games
- `public/vocab/*.json` — the vocab lists themselves (source of truth, hand
  maintained/curated — see Data pipeline below)
- `public/examples/`, `public/sentences/`, `public/dialogues/`,
  `public/mnemonics/`, `public/grammar/`, `public/reader/` — supporting
  per-language content, lazy-loaded by the relevant games
- `vendor/language-decks/` — gitignored raw source data used only to
  backfill example sentences; see its own `README.md` to re-fetch it. Not
  needed to build or run the app — only to regenerate example sentences.
- `tools/extract-examples.js` — pulls example sentences from `vendor/` into
  `public/examples/*.json`

## Vocab data format

Each `public/vocab/<lang>-en.json` file is:

```json
{
  "id": "de-en", "language": "de", "native": "en",
  "keys": ["entry", "reading", "translation", "pos", "categories", "level", "gender", "measureWord"],
  "entries": [
    ["Hund", "", ["dog"], "noun", ["animals"], "A1", null, null]
  ]
}
```

Entries are arrays (not objects) keyed positionally by the `keys` array —
`src/engine/vocab.js` does the array→object normalization on load. This
keeps the JSON files compact; anything reading raw vocab JSON directly
(scripts, tools) needs to resolve fields via `keys.indexOf(...)`, not assume
a fixed order.

**Curated vocab lists are the source of truth.** Vendor/third-party data is
only ever used to backfill supplementary content (example sentences) — never
to add or override headwords, translations, or levels.

## Category system

Topic tagging (Nature, People, Life, Time, Places, Society, Science,
Abstract, each with several leaf topics like Animals/Food/Work/etc.) lets
someone filter the vocab list or generate a flashcard set by topic instead
of just by level.

- `src/engine/categories.js` holds the **only** copy of the parent→leaf tree
  and per-language display labels. A word's `categories` array (in the vocab
  JSON) stores **leaf IDs only** (e.g. `"animals"`), never the parent — so
  the tree can be reorganized (add/rename/move leaves) without ever touching
  vocab data files.
- The same array field also carries the pre-existing `"vulgar"` tag (mature
  content, filtered by default) — it's a general-purpose tag field, not
  exclusively for topics.
- `src/components/CategoryChooser.jsx` is the two-level picker UI (parent
  row, then an on-demand leaf drill-down for whichever single parent is
  active) — see its file header for the exact interaction rules.
  `CategoryChips.jsx` wraps it for the global/Setup-screen filter;
  `VocabBrowser.jsx` uses `CategoryChooser` directly with its own local
  filter state.
- `filterByCategory()` in `src/engine/settings.js` applies the filter;
  `AppContext.jsx` wires it in alongside the existing level/vulgar filters.

**Tagging coverage** (as of this writing — check `TODO.md` for current
status): German A1/A2, Japanese N5/N4, Chinese HSK1-3 are tagged. Everything
above that (German B1-C2, Chinese HSK4-7, Spanish, French, English) is
untagged — untagged words are simply unaffected by category filters, so this
is safe to leave partial and expand over time.

If you're tagging a new level/language: write a one-off Python script
against the target `public/vocab/<lang>-en.json`, classify by keyword rules
against the English translation (language-agnostic, so rules are reusable
across source languages), then hand-review a random sample before trusting
the result — a purely keyword-driven pass tends to dump too much into a
generic fallback bucket if the ruleset isn't specific enough (this happened
once with German A2 and had to be redone — see chat history).

## Dark mode

`applyDarkMode()` in `settings.js` always sets an explicit
`data-theme="light"|"dark"` attribute (resolving `'auto'` itself). **CSS
must use `[data-theme="dark"]` selectors only** — never
`@media (prefers-color-scheme: dark)` — see the comment on that function for
why (a real bug from mixing the two got fixed once already).

## Chip filter sizing

The level/category/POS chip rows (`ChipRow.jsx`) auto-shrink font-size and
gaps (via a `--chip-row-scale` CSS variable) so a full row of chips always
fits on one line on narrow phones without wrapping. If a chip row doesn't
fit, check that its container isn't also adding fixed (non-scaled)
padding/gap/border that `ChipRow`'s width measurement doesn't account for.

## Testing

No automated test suite — verification is done with ad-hoc Playwright/
Chromium smoke tests (inline Python scripts, `vite preview` + headless
browser) for anything UI-related, since real browser rendering has caught
bugs that code review alone missed. Not committed to the repo; written fresh
per change as needed.
