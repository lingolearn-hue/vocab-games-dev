"""
Scans all vocab dictionaries for verb entries (pos='verb') whose
English glosses don't start with "to " -- the project convention is
that verb glosses should always be given as infinitives ("to run",
not "run"), for consistency and so gloss-matching/ledger tooling can
rely on it.

Deliberately excludes known genuine exceptions:
- English modal verbs (can, could, must, shall, should, will, would,
  may, might) grammatically never take "to" in their bare form -- "to
  can" or "to must" would be incorrect English, not a missing prefix.
- Gerund-form glosses (ending in "-ing") are sometimes intentionally
  used for verb entries representing an activity/process rather than
  a single action (e.g. "swimming", "cooking") -- these are flagged
  separately as lower-confidence, not auto-fixed, since converting
  "swimming" -> "to swimming" would be wrong; the fix (if any) is
  either "to swim" or leaving it as a legitimate noun-like gloss.
- Very short (<=3 char) glosses are flagged separately as low-
  confidence, since they're more likely to be OCR/data artifacts or
  genuinely non-infinitive particles than real missing-prefix cases.
"""
import json

LANGS = ['de', 'es', 'fr', 'ja', 'zh']

MODAL_EXCEPTIONS = {'can', 'could', 'must', 'shall', 'should', 'will',
                     'would', 'may', 'might'}


def scan_lang(lang):
    d = json.load(open(f'public/vocab/{lang}-en.json'))
    entries = d['entries']
    idx = {k: i for i, k in enumerate(d['keys'])}
    ei, ti, pi = idx['entry'], idx['translation'], idx['pos']

    missing_prefix = []  # confident: clearly needs "to " added
    gerund_flagged = []  # lower confidence: -ing form, needs manual judgment
    short_flagged = []   # lower confidence: very short gloss

    for e in entries:
        if e[pi] != 'verb':
            continue
        word, glosses = e[ei], e[ti]
        for i, g in enumerate(glosses):
            gl = g.lower().strip()
            if gl.startswith('to '):
                continue
            # strip a leading "(...)" annotation before checking, e.g.
            # "(formal) accept" -- still flag it, but note separately
            core = gl
            if core in MODAL_EXCEPTIONS:
                continue
            if core.endswith('ing') and ' ' not in core:
                gerund_flagged.append((word, i, g))
                continue
            if len(core) <= 3:
                short_flagged.append((word, i, g))
                continue
            missing_prefix.append((word, i, g))

    return missing_prefix, gerund_flagged, short_flagged


if __name__ == '__main__':
    for lang in LANGS:
        missing, gerund, short = scan_lang(lang)
        print(f"{lang}: confident_missing_to={len(missing)}  gerund_flagged={len(gerund)}  short_flagged={len(short)}")
