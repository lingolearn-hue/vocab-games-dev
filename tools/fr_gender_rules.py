"""
Rule-based French noun-gender classifier. Same approach as
es_gender_rules.py: original rule logic built from standard,
widely-documented French orthographic gender patterns -- built to
replace the Lexique383-sourced gender field.
"""

import unicodedata


def _strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


MASCULINE_SUFFIXES = ['age', 'isme', 'ment', 'oir', 'phone', 'scope', 'in',
                       'al', 'at', 'ail', 'ing', 'ier', 'eau', 'son']

MASCULINE_EE_EXCEPTIONS = {'musée', 'lycée', 'trophée', 'scarabée',
                            'mausolée', 'apogée', 'périnée', 'coryphée',
                            'colisée', 'athénée', 'pygmée'}

FEMININE_AGE_EXCEPTIONS = {'page', 'image', 'plage', 'cage', 'nage', 'rage'}
FEMININE_EAU_EXCEPTIONS = {'peau', 'eau'}
FEMININE_IN_EXCEPTIONS = {'fin', 'main'}
MASCULINE_ANCE_ENCE_EXCEPTIONS = {'silence', 'commerce'}

MASCULINE_ION_EXCEPTIONS = {'guion', 'anfitrion', 'bastion', 'avion', 'camion',
                             'pion', 'lion', 'scion', 'espion', 'morpion',
                             'million', 'ion', 'scorpion', 'dominion',
                             'ganglion', 'centurion', 'fanion', 'talion',
                             'champion'}

MASCULINE_TE_EXCEPTIONS = {'côté', 'arrêté', 'comité', 'député', 'traité',
                            'comté', 'invité', 'retraité', 'initié',
                            'décolleté', 'pâté', 'karaté', 'té', 'maté',
                            'aparté', 'doigté', 'intercité', 'été'}

MASCULINE_URE_EXCEPTIONS = {'chlorure', 'sulfure', 'cyanure', 'carbure',
                             'fluorure', 'hydrocarbure', 'mercure',
                             'murmure', 'parjure'}

FEMININE_SUFFIX_EXCEPTIONS = {'malaise', 'grade', 'stade', 'squelette'}
FEMININE_MENT_EXCEPTIONS = {'jument'}

FEMININE_OIRE_EXCEPTIONS = {'histoire', 'mémoire', 'victoire', 'trajectoire',
                             'patinoire', 'préhistoire', 'passoire',
                             'balançoire', 'bouilloire', 'nageoire',
                             'échappatoire', 'gloire', 'foire', 'armoire',
                             'mâchoire', 'baignoire', 'poire'}

FEMININE_SON_EXCEPTIONS = {'maison', 'saison', 'raison', 'boisson',
                            'chanson', 'moisson', 'prison', 'cuisson',
                            'guérison', 'trahison', 'garnison', 'cloison',
                            'toison', 'mousson', 'foison'}

FEMININE_CON_EXCEPTIONS = {'façon', 'rançon', 'contrefaçon', 'leçon'}
MASCULINE_STRESSED_A_EXCEPTIONS = {'sofa', 'mana', 'faisan'}
FEMININE_ER_EXCEPTIONS = {'mujer'}  # not used for French; harmless leftover

FEMININE_EN_EXCEPTIONS = {'sien', 'imagen', 'joven'}
FEMININE_ON_WORDS_2 = {'sazon', 'hinchazon', 'desazon', 'comezon'}

FEMININE_EUR_WORDS = {
    'couleur', 'fleur', 'peur', 'chaleur', 'douleur', 'largeur', 'hauteur',
    'longueur', 'profondeur', 'valeur', 'vapeur', 'rumeur', 'lueur',
    'odeur', 'saveur', 'humeur', 'demeure', 'horreur', 'terreur',
    'erreur', 'fureur', 'ardeur', 'pudeur', 'lenteur', 'laideur',
    'blancheur', 'noirceur', 'grandeur', 'liqueur', 'vigueur',
    'faveur', 'defaveur', 'douceur', 'ampleur', 'rigueur', 'epaisseur',
    'teneur', 'tumeur', 'sueur', 'fraicheur', 'splendeur', 'ferveur',
    'lourdeur', 'frayeur', 'minceur', 'stupeur', 'grosseur', 'froideur',
    'pesanteur', 'rousseur', 'primeur', 'torpeur', 'candeur',
    'apesanteur', 'raideur', 'rondeur', 'rancoeur', 'senteur',
    'aigreur', 'clameur', 'puanteur', 'rougeur', 'moiteur',
    'maigreur', 'paleur', 'sécheur', 'soeur',
}

FEMININE_RE_EXCEPTIONS = {'madre', 'torre', 'sangre'}  # unused leftover, harmless

FEMININE_AL_EXCEPTIONS = {'sal', 'cal', 'col', 'catedral', 'espiral',
                           'señal', 'sucursal', 'central', 'moral',
                           'capital', 'postal', 'vocal', 'semifinal',
                           'multinacional', 'credencial', 'bienal'}  # unused leftover

MASCULINE_SIS_EXCEPTIONS = {'enfasis', 'analisis', 'parenthesis'}  # unused leftover

EPICENE_PERSON_NOUNS = {
    'élève', 'artiste', 'touriste', 'journaliste', 'dentiste', 'pianiste',
    'collègue', 'adulte', 'enfant', 'adolescent', 'concierge', 'guide',
    'stagiaire', 'interprète', 'photographe', 'architecte', 'comptable',
    'secrétaire', 'ministre', 'camarade', 'partenaire', 'membre',
    'propriétaire', 'locataire', 'ecologiste', 'activiste', 'violoniste',
    'nouvelliste', 'politologue', 'receptionniste', 'gymnaste', 'mezzo',
}


def classify(word: str):
    w = word.lower().strip()
    if not w:
        return (None, None)

    if w in MASCULINE_TE_EXCEPTIONS:
        return ('m', 'high')
    if w.endswith('té') or w.endswith('tié'):
        return ('f', 'high')

    wn = _strip_accents(w)

    def _in(word_norm, word_set):
        return word_norm in {_strip_accents(x) for x in word_set}

    if _in(wn, EPICENE_PERSON_NOUNS):
        return ('epicene', 'high')

    if _in(wn, MASCULINE_EE_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_AGE_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_EAU_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_IN_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, MASCULINE_ANCE_ENCE_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_EUR_WORDS):
        return ('f', 'high')
    if _in(wn, MASCULINE_ION_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, MASCULINE_URE_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_SUFFIX_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_MENT_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_OIRE_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_SON_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_CON_EXCEPTIONS):
        return ('f', 'high')

    if wn.endswith('eur'):
        return ('m', 'medium')
    if w.endswith('ée'):
        return ('f', 'high')
    if wn.endswith('ion'):
        return ('f', 'high')

    for suf in ['ette', 'esse', 'ance', 'ence', 'aison', 'ise', 'ure', 'ade']:
        if w.endswith(suf):
            return ('f', 'high')

    for suf in MASCULINE_SUFFIXES:
        if w.endswith(suf):
            return ('m', 'high')

    if w.endswith('on'):
        return ('m', 'high')

    return (None, None)
