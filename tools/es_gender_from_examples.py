"""
Extract Spanish noun gender by detecting the article immediately
preceding the noun in its example sentence. Contextual evidence from
real usage, complements the suffix-rule classifier. Data used
(public/examples/es-en.json) comes from the same MIT-licensed
vbvss199/Language-Learning-decks source as the core word list.
"""

import re

MASCULINE_ARTICLES = {'el', 'un', 'los', 'unos', 'del', 'al', 'este', 'ese', 'aquel'}
FEMININE_ARTICLES = {'la', 'una', 'las', 'unas', 'esta', 'esa', 'aquella'}

# Small, closed list of feminine nouns that take "el"/"un" for euphony
# because they start with a stressed "a-" sound (el agua, el águila) --
# would otherwise be misread as masculine by simple article detection.
STRESSED_A_FEMININE_TAKES_EL = {
    'agua', 'águila', 'ave', 'hacha', 'arma', 'ala', 'área', 'alma',
    'ancla', 'aula', 'asta', 'hambre',
}


def extract_gender_from_sentence(word: str, sentence: str):
    if not sentence:
        return None
    if word.lower() in STRESSED_A_FEMININE_TAKES_EL:
        return None
    pattern = re.compile(r'(\b\w+\b)\s+' + re.escape(word) + r'\b', re.IGNORECASE)
    m = pattern.search(sentence)
    if not m:
        return None
    preceding = m.group(1).lower()
    if preceding in MASCULINE_ARTICLES:
        return 'm'
    if preceding in FEMININE_ARTICLES:
        return 'f'
    return None
