"""
Rule-based Spanish noun-gender classifier.

Based on standard, widely-documented Spanish orthographic gender
patterns. Original rule logic written from general linguistic
knowledge, not derived from or copied out of any specific existing
dataset -- built specifically to replace a CC-BY-SA-encumbered gender
field (doozan/spanish_data, itself Wiktionary-derived).

Returns one of: 'm', 'f', 'epicene', or None (no confident rule match
-- flagged for manual review rather than guessed).
"""

import unicodedata


def _strip_accents(s: str) -> str:
    """Normalize á/é/í/ó/ú/ü to plain vowels for matching purposes only
    -- needed because this vocab file has widespread inconsistent
    accent-mark stripping (e.g. 'atencion' alongside 'atención')."""
    nfkd = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


MASCULINE_A_EXCEPTIONS = {
    'día', 'dia', 'mapa', 'planeta', 'problema', 'sistema', 'tema', 'clima',
    'idioma', 'programa', 'drama', 'poema', 'cometa', 'esquema', 'lema',
    'dilema', 'enigma', 'fantasma', 'panorama', 'síntoma', 'teorema',
    'aroma', 'diploma', 'idiota', 'karma', 'magma', 'plasma', 'trauma',
    'axioma', 'diagrama', 'telegrama', 'ultimátum', 'mediodía', 'mediodia',
    'ecosistema', 'paradigma', 'carisma', 'emblema', 'estigma', 'dogma',
    'cronograma', 'prisma', 'cromosoma', 'mantra', 'diafragma', 'genoma',
    'edema', 'melodrama', 'cisma', 'anagrama', 'esperma',
    'sida', 'iva',
    'profeta', 'patriarca', 'escriba', 'califa',
    'delta',
    'yoga', 'tequila', 'spa', 'pijama', 'champaña',
    'panda', 'gorila', 'puma',
    'pesticida', 'insecticida',
}

FEMININE_O_EXCEPTIONS = {
    'mano', 'foto', 'moto', 'radio', 'libido', 'nao',
    'info', 'expo', 'promo', 'seño',
}

MASCULINE_IE_EXCEPTIONS = {'pie', 'zombie', 'indie'}
FEMININE_AMBRE_EXCEPTIONS = {'costumbre', 'hambre', 'lumbre'}
FEMININE_OR_EXCEPTIONS = {'flor', 'labor', 'coliflor', 'sor'}

MASCULINE_ON_WORDS = {'jamón', 'camión', 'melón', 'salón', 'balón', 'limón',
                       'corazón', 'avión', 'ratón', 'botón', 'algodón'}
FEMININE_ON_WORDS = {'sartén', 'razón', 'imagen', 'sazón', 'hinchazón',
                      'desazón', 'comezón'}

MASCULINE_ION_EXCEPTIONS = {'guión', 'anfitrión', 'embrión', 'gorrión',
                             'bastión', 'escorpión', 'centurión', 'aluvión',
                             'sarampión', 'ion'}

MASCULINE_SIS_EXCEPTIONS = {'énfasis', 'análisis', 'paréntesis', 'oasis',
                             'éxtasis', 'psicoanálisis', 'génesis', 'chasis'}

MASCULINE_STRESSED_A_EXCEPTIONS = {'sofá', 'maná', 'faisán'}
FEMININE_ER_EXCEPTIONS = {'mujer'}
FEMININE_EN_EXCEPTIONS = {'sien', 'imagen', 'joven'}

FEMININE_EL_EXCEPTIONS = {'piel', 'miel', 'hiel', 'cárcel'}
FEMININE_RE_EXCEPTIONS = {'madre', 'torre', 'sangre', 'suerte', 'liebre',
                           'fiebre', 'masacre', 'premiere'}
FEMININE_UE_EXCEPTIONS = {'morgue', 'psique'}
FEMININE_CE_EXCEPTIONS = {'hélice'}
FEMININE_AL_EXCEPTIONS = {'sal', 'cal', 'col', 'catedral', 'espiral',
                           'señal', 'sucursal', 'central', 'moral',
                           'capital', 'postal', 'vocal', 'semifinal',
                           'multinacional', 'credencial', 'bienal'}
FEMININE_EZ_EXCEPTIONS_ARE_MASCULINE = {'pez', 'juez', 'ajedrez', 'diez', 'jerez'}

EPICENE_PERSON_NOUNS = {
    'estudiante', 'artista', 'turista', 'cantante', 'periodista',
    'dentista', 'taxista', 'pianista', 'guitarrista', 'futbolista',
    'ciclista', 'novelista', 'violinista', 'electricista', 'analista',
    'especialista', 'socialista', 'comunista', 'capitalista', 'racista',
    'pesimista', 'optimista', 'atleta', 'colega', 'pariente', 'paciente',
    'adolescente', 'representante', 'ayudante', 'asistente', 'testigo',
    'guía', 'modelo', 'joven', 'amante', 'vidente', 'agente', 'gerente',
    'golpista',
}

FEMININE_SUFFIXES = ['ión', 'dad', 'tad', 'tud', 'itis', 'eza', 'encia',
                      'ancia', 'ncia', 'ie', 'umbre']
MASCULINE_SUFFIXES = ['aje', 'ismo', 'miento', 'or']


def classify(word: str):
    w = word.lower().strip()
    if not w:
        return (None, None)

    if w == 'papá':
        return ('m', 'high')

    wn = _strip_accents(w)

    def _in(word_norm, word_set):
        return word_norm in {_strip_accents(x) for x in word_set}

    if _in(wn, EPICENE_PERSON_NOUNS):
        return ('epicene', 'high')

    if _in(wn, MASCULINE_A_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_O_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, MASCULINE_IE_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_AMBRE_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_OR_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, MASCULINE_ON_WORDS):
        return ('m', 'high')
    if _in(wn, FEMININE_ON_WORDS):
        return ('f', 'high')
    if _in(wn, MASCULINE_ION_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, MASCULINE_SIS_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_EL_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_RE_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_UE_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_CE_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_AL_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_EZ_EXCEPTIONS_ARE_MASCULINE):
        return ('m', 'high')
    if _in(wn, MASCULINE_STRESSED_A_EXCEPTIONS):
        return ('m', 'high')
    if _in(wn, FEMININE_ER_EXCEPTIONS):
        return ('f', 'high')
    if _in(wn, FEMININE_EN_EXCEPTIONS):
        return ('f', 'high')

    for suf in FEMININE_SUFFIXES:
        if wn.endswith(_strip_accents(suf)):
            return ('f', 'high')
    if wn.endswith('sis'):
        return ('f', 'high')
    if wn.endswith('ez'):
        return ('f', 'high')

    for suf in MASCULINE_SUFFIXES:
        if wn.endswith(suf):
            return ('m', 'high')
    for suf, conf in [('on', 'high'), ('ar', 'high'), ('in', 'high'),
                       ('il', 'high'), ('an', 'high'), ('er', 'high'),
                       ('en', 'high'), ('ol', 'high'), ('ce', 'medium'),
                       ('ue', 'medium'), ('el', 'medium'), ('re', 'medium'),
                       ('al', 'medium')]:
        if wn.endswith(suf):
            return ('m', conf)

    if wn.endswith('o'):
        return ('m', 'high')
    if wn.endswith('a'):
        return ('f', 'high')

    return (None, None)
