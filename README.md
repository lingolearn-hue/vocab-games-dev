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
  Reader, Dialogue, Adventure, Grammar Dictionary, Vocab Browser, Listening,
  Stats, Settings.
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
- `tools/tag_categories.py` — reusable keyword-based category tagger (see
  Category system below); run against a vocab JSON + level to tag topics

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

Topic tagging (Nature, People, Life, Places, Society, Culture, Science,
Abstract — 8 parents, 35 leaves) lets someone filter the vocab list or
generate a flashcard set by topic instead of just by level.

- `src/engine/categories.js` holds the **only** copy of the parent→leaf tree
  and per-language display labels. A word's `categories` array (in the vocab
  JSON) stores **leaf IDs only** (e.g. `"animals"`), never the parent — so
  the tree can be reorganized (add/rename/move/merge leaves) without ever
  touching vocab data files. Note: merging or renaming a leaf ID *does*
  require migrating existing tagged data (see chat history for the
  `numbers`+`quantifiers`→`quantity`, `questions`+`connectors`→
  `function_words`, and `calendar`→`time` migrations, plus the
  `health`→Life, `media`→Culture, `technology`→Science re-parenting) — only
  *moving* a leaf to a different parent is free (the leaf ID itself doesn't
  change).
- The same array field also carries the `"vulgar"` tag (profanity/explicit
  biological terms) — it's a general-purpose tag field, not exclusively for
  topics. Vulgar-tagged words are **always** filtered out everywhere
  (`AppContext.jsx`'s `vulgarFilteredEntries`/`getEntriesForGame`) — this was
  a user-facing Settings toggle at one point, removed since the product
  decision is just to hide this content rather than make it optional.
- `src/components/CategoryChooser.jsx` is the two-level picker UI. The parent
  row is **single-select**: tapping a parent shows all its words, tapping the
  active parent again clears the filter — no separate "clear" button needed
  at that level. The leaf row (once a parent is active) stays **multi-select**
  and has its own "✕" clear chip. See the file's header comment for the exact
  interaction rules. `CategoryChips.jsx` wraps it for the Setup-screen
  filter, keyed **per language** (`settings.categories[activeLanguage]`,
  not a single shared slot) — switching languages shows that language's
  own filter (starting unfiltered the first time), and switching back
  restores whatever was set before, rather than one language's topic
  filter leaking onto another.
- **Vocab Browser is intentionally independent of the global filter** — it
  consumes `vulgarFilteredEntries` (respects the vulgar-content filter, not
  the topic filter) and implements its own two `<select>` dropdowns (parent,
  then leaf) rather than `CategoryChooser`, matching its existing
  status/level/POS dropdown style. A browsing/reference tool shouldn't
  silently narrow to whatever topic was last picked on the home screen.
- `filterByCategory()` in `src/engine/settings.js` applies the filter;
  `AppContext.jsx` wires it in alongside the existing level/vulgar filters.

**Tagging coverage** (as of this writing — check `TODO.md` for current
status): German A1/A2/B1, Japanese N5/N4, Chinese HSK1-3 are tagged, and
have been through a manual accuracy audit on top of the automated pass (see
"Tagging quality" below). Everything above that (German B2-C2, Chinese
HSK4-7, Spanish, French, English) is untagged — untagged words are simply
unaffected by category filters, so this is safe to leave partial and expand
over time.

If you're tagging a new level/language: start from `tools/tag_categories.py`
(a reusable keyword-based tagger against the English translation — language-
agnostic, so the same ruleset works across source languages) rather than
writing one from scratch. Expect a fresh round of spot-check-driven fixes
per language/level regardless — a purely keyword-driven pass tends to (a)
dump too much into the generic `concepts` fallback bucket if the ruleset
isn't specific enough, and (b) hit single-word polysemy false positives
(e.g. "bank" the money kind vs. river kind) that only surface by sampling
real output and reading it. Both happened repeatedly during German B1
tagging — see `IDIOM_SCRUBS` in the tagger script and chat history for the
pattern of fixes. Always spot-check a random sample before trusting a pass,
especially at >1000 words.

### Tagging quality: English-gloss tagging can miss the source word's actual meaning

A keyword tagger classifying by the English translation will happily tag a
word correctly *for that English gloss* while being wrong for what the
source-language word actually means — because a translation array can list
several senses, and the tagger has no way to know which one the source word
"really" is. Real examples found in a manual German/Japanese/Chinese audit
(see chat history for the full list, ~35 fixes across the three languages):
German `Werk` ("work, factory, plant") got tagged `plants` off the botanical
sense of "plant" even though the word means factory/workplace; Chinese `和`
("and") got tagged `clothing` because one of its many CC-CEDICT senses is
"to suit". This class of bug is *not* caught by the keyword-precision work
in `tag_categories.py` — that fixes English-side polysemy (ambiguous English
words), not source-word-vs-gloss mismatches, which need a human who can read
the source language (or at least cross-check against the word's other
listed senses/reading) to catch. Worth another audit pass whenever a
language's tagging is revisited.

## Data backup / storage discipline

Settings → Data has Export/Import backup and Reset all scores, covering
`localStorage` keys for scores, settings, mnemonics, adventure progress,
Graded Reader's pasted/custom text (`vocabCustomPassage` — this used to be
pure in-memory React state with no persistence at all, lost on refresh; now
saved on every edit), and Leitner spaced-repetition state. **The Leitner
keys must never be hardcoded** — `leitnerScores_<game>`/`leitnerSession_<game>`
exist per game in `LEITNER_GAMES` (`src/engine/leitner.js`), and a new game
added to that array needs its keys picked up automatically. Use the exported
`leitnerStorageKeys()` helper (not a manual list) anywhere backup/export/
import/reset logic touches Leitner data — a hardcoded list silently missed
these keys once already (found and fixed in chat; see `Settings.jsx`).

## Audio / text-to-speech

Uses the Web Speech API (`src/engine/speech.js`) — no backend, no
pre-generated audio files, so quality/availability depends entirely on
whatever's installed on the visitor's device/browser.

- `isSupported()` gates whether `SpeakButton.jsx` can actually speak, but the
  button still **always renders** rather than disappearing when unsupported
  — it shows greyed out, and tapping it reveals a small explanation (no
  TTS support / in-app browser like WeChat / no voices installed for the
  language) instead of silently doing nothing. A vanished button reads as a
  bug report; a visibly-disabled one reads as an understood platform limit.
- Deliberately **never sets `utterance.voice`** — always leaves voice choice
  to the browser/OS default for the given language. A per-language voice
  picker (Settings → Voice, `settings.voicePreferences`) was built and then
  removed: there's no reliable way for a webpage to query "the OS's
  configured system TTS voice" as a distinct concept, only a `.default`
  flag per voice (a browser-engine guess, not necessarily what the user
  actually configured at the OS level — notably unreliable on
  Android/Chrome), so the picker added real complexity without a
  dependable payoff. If this gets revisited, start from git history around
  the removal rather than rebuilding from scratch — the async-voice-loading
  and iOS-Safari-synchronous-call-stack issues it had to handle are still
  real and will resurface.
- **Listening** (`src/games/Listening.jsx`) is a hands-free audio-review
  game: cycles through every unmastered word (box 0-4, box 5 excluded) in
  the current filter, box-ordered top-down or looped on a single box.
  Deliberately **not** part of `LEITNER_GAMES` — it's passive listening
  reinforcement, not a scored recall test. Has Media Session integration
  (lock-screen play/pause/skip + metadata) for a nicer foreground
  experience, but that does **not** reliably keep speech playing once the
  screen locks or the tab backgrounds — Media Session's background-audio
  exemption is granted based on real `<audio>`/`<video>` element output,
  not raw `SpeechSynthesisUtterance` calls. True background playback would
  need pre-generated audio files behind a real `<audio>` element, which is
  a much bigger undertaking than this static-hosting architecture supports
  today. Also has Screen Wake Lock support (keeps the display on while
  actively playing, degrades gracefully where unsupported).
  - **Playback order is user-customizable**, directly in the game screen:
    a sequence of `word`/`translation`/`sentence` steps
    (`settings.listeningSequence`, default one of each in that order),
    edited via tap-to-add / tap-to-remove chips — repeats and omissions are
    both allowed (e.g. word/word/translation to hear the word twice before
    the translation, or word/translation with no sentence at all). Editing
    the sequence stops any active playback; an empty sequence disables Play
    rather than silently doing nothing.
- **Example sentence lookup gotcha**: `getExampleSentence()` keys sentences
  by `<lemma>::<pos>`, and tries a `::unknown` fallback if the real-pos key
  doesn't match. This fallback is load-bearing, not decorative — Japanese's
  example sentences were extracted *before* Japanese vocab had real POS
  tags, so every stored key there is `::unknown`. When the POS tagging pass
  happened later, every Japanese sentence lookup silently started returning
  `null` (no error, just missing content) until this fallback was added.
  Keep this in mind if POS tags are ever bulk-edited for a language that
  already has example sentences: the two data files can drift out of sync
  with no visible symptom other than sentences quietly disappearing.

## Known device/browser quirks

Two unrelated bugs, both root-caused to the same *shape* of problem — a
piece of code observes a dimension/state, reacts by changing something that
itself alters that same dimension/state, and on some browsers (notably
WeChat's in-app WebView, which has looser layout/timing precision than
desktop Chrome) that feedback loop doesn't reliably settle, showing up as
visible jitter:

- **`ChipRow.jsx`** measures its own width via `ResizeObserver` and sets a
  `--chip-row-scale` CSS variable to fit chips on one row — but changing
  that variable changes the rendered width, which re-triggers the observer.
  Fixed by coalescing bursts of callbacks into one measurement per animation
  frame (`requestAnimationFrame`) plus a wider settle threshold.
- **`zoomGuard.js`** watches `visualViewport` for accidental pinch-zoom and
  resets the viewport meta tag to un-zoom — but the reset itself is a
  viewport change that can re-trigger the same listener. Fixed with a
  two-reading confirmation (don't act on a single possibly-noisy sample)
  plus a cooldown after each reset.

If a future bug reads as "something visibly vibrates/jumps, especially on
WeChat," check for this same observe-then-mutate-the-observed-thing pattern
before assuming it's something else.

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

## Data quality audit

`tools/audit_vocab.py` screens every language/level's vocab for structural
completeness (does `pos`/`categories`/`translation`/`reading`/example
sentence/mnemonic exist — not whether it's *correct*, a different and
harder problem, see "Tagging quality" above) and writes a sortable/
filterable self-contained HTML report:

```
python3 tools/audit_vocab.py
# writes tools/audit_report.json and tools/audit_report.html (gitignored — regenerate as needed)
```

`Concepts %` is tracked as its own column, separate from the broader
`Categories %`, specifically so a level where most words fell into the
generic fallback bucket (the German B1 problem — see "Category system"
above) is visible at a glance rather than needing an ad-hoc check.

## Testing

No automated test suite — verification is done with ad-hoc Playwright/
Chromium smoke tests (inline Python scripts, `vite preview` + headless
browser) for anything UI-related, since real browser rendering has caught
bugs that code review alone missed. Not committed to the repo; written fresh
per change as needed.
