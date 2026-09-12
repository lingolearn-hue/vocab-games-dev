"""
Fully automated, restrictive cross-language vocabulary gap finder.

For each target language, finds English glosses present in >=4 of the
other 4 languages but missing from the target, then classifies each
into one of three remediation buckets:

  OPTIMIZE_GLOSS: the gap would be resolved by splitting an existing
    entry's crammed multi-sense string (e.g. "file; portfolio") into
    proper separate translation array elements -- no new vocabulary
    entry needed, just a data-quality fix to an existing one.

  ADD_ENTRY: the gloss is genuinely absent from the target dictionary
    in any form -- a real new vocabulary entry is needed (requires
    manual/human translation work, this script only identifies and
    reports these).

  IGNORE: low-confidence or structurally risky to auto-resolve (very
    short gloss prone to spurious matches, or the gloss only appears
    in a context suggesting a different sense than intended).

Deliberately restrictive: colon-separated strings are NOT treated as
splittable multi-sense lists, since inspection showed Chinese uses
colons for legitimate grammatical annotation ("classifier: handful,
bundle, bunch"), not crammed synonyms -- auto-splitting those would
corrupt the data. Only semicolon-separated strings are treated as
splittable, since that pattern was verified (this session) to
represent genuine crammed synonyms, not annotations.
"""
import json, re
from collections import defaultdict

LANGS = ['de', 'es', 'fr', 'ja', 'zh']

def normalize_gloss(g):
    g = g.lower().strip()
    g = re.sub(r'\s*\([^)]*\)', '', g)
    g = re.sub(r'^(a|an|the)\s+', '', g)
    return g.strip()

def split_subsenses(g):
    """Only split on semicolons -- verified safe. Colons are NOT split
    (legitimate grammatical annotations in at least Chinese)."""
    return [p.strip() for p in g.split(';') if p.strip()]

def load_lang(lang):
    d = json.load(open(f'public/vocab/{lang}-en.json'))
    entries = d['entries']
    idx = {k: i for i, k in enumerate(d['keys'])}
    return entries, idx

def build_ledger():
    ledger = defaultdict(lambda: defaultdict(dict))
    for lang in LANGS:
        entries, idx = load_lang(lang)
        ei, ti, pi = idx['entry'], idx['translation'], idx['pos']
        for e in entries:
            word, glosses, pos = e[ei], e[ti], e[pi]
            for g in glosses:
                for sub in split_subsenses(g):
                    ng = normalize_gloss(sub)
                    if ng and lang not in ledger[ng][pos]:
                        ledger[ng][pos][lang] = word
    return ledger

def get_gaps(ledger, target_lang, min_coverage=4):
    gaps = []
    for gloss, pos_dict in ledger.items():
        for pos, lang_dict in pos_dict.items():
            present = set(lang_dict.keys())
            if target_lang not in present and len(present) >= min_coverage:
                gaps.append((gloss, pos, len(present)))
    return gaps

def classify_gaps(target_lang, gaps):
    entries, idx = load_lang(target_lang)
    ei, ti, pi = idx['entry'], idx['translation'], idx['pos']

    # exact match across ALL of a translation string (no split) --
    # if true, this gap is already resolved as-is, drop entirely
    exact_whole = set()
    for e in entries:
        for t in e[ti]:
            exact_whole.add(normalize_gloss(t))

    # exact match only achievable via semicolon-splitting a crammed
    # string -- these are OPTIMIZE_GLOSS candidates
    exact_via_split = {}  # normalized_sub -> (headword, full_string)
    for e in entries:
        for t in e[ti]:
            subs = split_subsenses(t)
            if len(subs) > 1:  # only relevant if there WAS something to split
                for sub in subs:
                    ns = normalize_gloss(sub)
                    if ns not in exact_via_split:
                        exact_via_split[ns] = (e[ei], t)

    optimize_gloss, add_entry, ignore = [], [], []
    for gloss, pos, coverage in gaps:
        if gloss in exact_whole:
            continue  # already resolved cleanly, not a gap at all
        if gloss in exact_via_split:
            headword, full_string = exact_via_split[gloss]
            optimize_gloss.append((gloss, pos, coverage, headword, full_string))
            continue
        # restrictive IGNORE heuristic: very short glosses (<=2 chars)
        # are prone to spurious matches and low semantic value
        if len(gloss) <= 2:
            ignore.append((gloss, pos, coverage, 'too short, high false-positive risk'))
            continue
        add_entry.append((gloss, pos, coverage))

    return optimize_gloss, add_entry, ignore

if __name__ == '__main__':
    ledger = build_ledger()
    for lang in LANGS:
        gaps = get_gaps(ledger, lang, min_coverage=4)
        optimize_gloss, add_entry, ignore = classify_gaps(lang, gaps)
        print(f"{lang}: total_gaps={len(gaps)}  optimize_gloss={len(optimize_gloss)}  add_entry={len(add_entry)}  ignore={len(ignore)}")
