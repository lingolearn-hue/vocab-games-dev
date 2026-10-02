# Python (py-en.json / py-grammar.json): a non-human "language" entry

Python was added as a vocabulary/grammar pair following the same file
format as the human languages, but adapted where the schema's
original meaning doesn't apply to a programming language:

- `reading`: the one-word human-readable expansion/spoken name of the
  entry — e.g. `int` → "integer", `def` → "define", `print()` →
  "print". Fills the same slot German/Spanish/French leave as `''`
  (no separate pronunciation needed), but here it's used productively
  since Python symbols often benefit from a spoken-name expansion.
- `translation`: kept to 5 words or fewer, often fewer — a short
  functional description, not a full explanation (e.g. `.append()` →
  "add to end").
- `pos`: Python-specific values — `keyword` (reserved words: `if`,
  `for`, `def`), `builtin` (built-in functions: `print`, `len`),
  `method` (object methods: `.split()`, `.append()`), `module`
  (stdlib modules: `re`, `datetime`), `operator` (`+`, `in`, `and`),
  `type` (`int`, `list`, `dict`).
- `level`: `PY1`-`PY4` (beginner/intermediate/advanced/expert),
  matching the short-alphanumeric-code style of CEFR/JLPT/TOPIK.
- `gender`, `measureWord`: always `null`, not applicable.
- `categories`: only the **leaf** goes in the data; the topic is
  derived automatically from the leaf, not stored per-entry. The
  topic/leaf hierarchy itself (5 topics, 24 leaves):

  | Topic | Leaves |
  |---|---|
  | `syntax` | `flow`, `funcs`, `types`, `ops`, `hints` |
  | `data` | `strings`, `lists`, `dicts`, `sets`, `collections` |
  | `io` | `files`, `console`, `modules`, `regex`, `time` |
  | `errors` | `try`, `raise`, `assert`, `context` |
  | `oop` | `class`, `decorate`, `iterate`, `dataclass`, `async` |

  The last leaf in each row (`hints`, `collections`, `regex/time`,
  `context`, `dataclass/async`) was added during the PY3/PY4
  expansion — PY1/PY2 only needed the first 17 leaves; PY3/PY4
  introduced stdlib modules, type hints, context managers, and
  async/await, which didn't fit any existing leaf. Kept within the
  same 5 topics (up to 5 leaves each) rather than adding new topics.

Content scale: 197 vocab entries (PY1 73, PY2 58, PY3 45, PY4 21) and
37 grammar patterns (PY1 8, PY2 14, PY3 11, PY4 4) across all four
levels.

The grammar file follows the same fill-in-the-blank quiz format
already used by the human-language grammar files (`template` +
`distractors` + `explanation`, read by both `GrammarDictionary.jsx`
and `GrammarTrainer.jsx`) — a blank for the correct keyword/operator
in a short code snippet, with plausible wrong-answer distractors
drawn from syntactically similar alternatives.

Scope note: this covers the data files only. Making Python selectable
in the app UI itself (language registry, menus, TTS, etc.) is a
separate, not-yet-done task — touches `App.jsx`, `AppContext.jsx`,
`reader.js`, and others, per a quick grep when this was scoped.
