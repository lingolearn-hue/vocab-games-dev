"""
Extract French noun gender by detecting the article immediately
preceding the noun in its example sentence. Falls back to checking
two tokens back (skipping one intervening word, typically an
adjective, e.g. "une bonne chose") if the immediate predecessor isn't
an article -- a common French sentence pattern.
"""

import re

MASCULINE_ARTICLES = {'le', 'un', 'du', 'au', 'ce', 'cet'}
FEMININE_ARTICLES = {'la', 'une', 'cette'}


def extract_gender_from_sentence(word: str, sentence: str):
    if not sentence:
        return None
    pattern_immediate = re.compile(r'(\b\w+\b)\s+' + re.escape(word) + r'\b',
                                    re.IGNORECASE)
    pattern_2back = re.compile(r'(\b\w+\b)\s+(\b\w+\b)\s+' + re.escape(word) + r'\b',
                                re.IGNORECASE)
    m = pattern_immediate.search(sentence)
    if m:
        preceding = m.group(1).lower()
        if preceding in MASCULINE_ARTICLES:
            return 'm'
        if preceding in FEMININE_ARTICLES:
            return 'f'
    m2 = pattern_2back.search(sentence)
    if m2:
        two_back = m2.group(1).lower()
        if two_back in MASCULINE_ARTICLES:
            return 'm'
        if two_back in FEMININE_ARTICLES:
            return 'f'
    return None
