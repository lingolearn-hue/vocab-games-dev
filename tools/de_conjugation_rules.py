"""
Rule-based German verb conjugation generator. Generates the 4 fields
used by public/conjugations/de.json: presentTense (3sg), pastTense
(3sg), pastParticiple, auxiliary. Built from standard German verb
morphology (weak-verb rules + a compiled table of the closed set of
strong/irregular root verbs) -- built to replace the CC-BY-SA
german-verbs-database source.
"""

INSEPARABLE_PREFIXES = ['be', 'er', 'ent', 'emp', 'ver', 'zer', 'miss',
                         'über', 'unter', 'wider', 'um']
# NOTE: 'ge' deliberately excluded -- too many ordinary verbs simply
# start with the letters "ge" (gelten, geben) without a genuine
# separable prefix; true ge-prefix verbs are direct table entries.

SEPARABLE_PREFIXES = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'nach',
                       'vor', 'zu', 'weg', 'zurück', 'her', 'hin', 'los',
                       'fest', 'offen', 'wahr', 'fern', 'weiter', 'zusammen',
                       'empor', 'entgegen', 'gegenüber', 'heim', 'nieder',
                       'statt', 'teil', 'dar', 'davon', 'dabei', 'durch',
                       'heraus', 'herunter', 'hervor', 'hinzu', 'herum',
                       'herab', 'heran', 'herbei', 'herüber', 'vorbei',
                       'zurecht', 'rüber', 'runter', 'rauf', 'rein', 'raus',
                       'hoch', 'klar', 'frei', 'da', 'wieder', 'fort',
                       'bekannt', 'sicher', 'fertig', 'bereit', 'voran',
                       'inne', 'lahm', 'nahe', 'krank', 'still', 'schief',
                       'fremd', 'groß', 'gross', 'wohl', 'preis']

NEVER_STRIP_PREFIX = {'herrschen', 'erben', 'beten', 'hinken', 'zerren',
                       'beben', 'zucken', 'angeln', 'einigen', 'festigen',
                       'hindern', 'dauern', 'danken', 'dampfen', 'datieren',
                       'reinigen', 'rauschen'}

AMBIGUOUS_PREFIX_OVERRIDES = {
    'wiederholen': ('inseparable', 'wiederholt', 'wiederholte', 'wiederholt', 'haben'),
    'untergehen': ('separable', 'geht unter', 'ging unter', 'untergegangen', 'sein'),
    'unterbringen': ('separable', 'bringt unter', 'brachte unter', 'untergebracht', 'haben'),
    'unterkommen': ('separable', 'kommt unter', 'kam unter', 'untergekommen', 'sein'),
    'umziehen': ('separable', 'zieht um', 'zog um', 'umgezogen', 'sein'),
    'umsteigen': ('separable', 'steigt um', 'stieg um', 'umgestiegen', 'sein'),
    'umfallen': ('separable', 'fällt um', 'fiel um', 'umgefallen', 'sein'),
    'umkommen': ('separable', 'kommt um', 'kam um', 'umgekommen', 'sein'),
    'umsehen': ('separable', 'sieht um', 'sah um', 'umgesehen', 'haben'),
    'übergehen': ('separable', 'geht über', 'ging über', 'übergegangen', 'sein'),
    'überziehen': ('separable', 'zieht über', 'zog über', 'übergezogen', 'haben'),
    'überlaufen': ('separable', 'läuft über', 'lief über', 'übergelaufen', 'sein'),
    'vergessen': ('none', 'vergisst', 'vergaß', 'vergessen', 'haben'),
    'bekommen': ('none', 'bekommt', 'bekam', 'bekommen', 'haben'),
    'gelangen': ('none', 'gelangt', 'gelangte', 'gelangt', 'sein'),
    'gelten': ('none', 'gilt', 'galt', 'gegolten', 'haben'),
    'gehören': ('none', 'gehört', 'gehörte', 'gehört', 'haben'),
    'gestehen': ('none', 'gesteht', 'gestand', 'gestanden', 'haben'),
    'geraten': ('none', 'gerät', 'geriet', 'geraten', 'sein'),
    'genesen': ('none', 'genest', 'genas', 'genesen', 'sein'),
    'gedeihen': ('none', 'gedeiht', 'gedieh', 'gediehen', 'sein'),
    'gebären': ('none', 'gebiert', 'gebar', 'geboren', 'haben'),
    'begegnen': ('none', 'begegnet', 'begegnete', 'begegnet', 'sein'),
    'erlöschen': ('none', 'erlischt', 'erlosch', 'erloschen', 'sein'),
    'tun': ('none', 'tut', 'tat', 'getan', 'haben'),
}

SEIN_WEAK_VERBS = {'reisen', 'folgen', 'begegnen', 'landen', 'stürzen',
                    'wandern', 'scheitern', 'kreisen', 'zurückkehren',
                    'tauchen', 'auftauchen', 'spazieren', 'aufwachen',
                    'klettern', 'flüchten', 'umziehen', 'explodieren',
                    'platzen', 'erwachen', 'erkranken', 'marschieren',
                    'schweben', 'ertrinken', 'erfolgen'}

ROOT_VERBS = {
    'sein': ('ist', 'war', 'gewesen', 'sein'),
    'haben': ('hat', 'hatte', 'gehabt', 'haben'),
    'werden': ('wird', 'wurde', 'geworden', 'sein'),
    'gehen': ('geht', 'ging', 'gegangen', 'sein'),
    'kommen': ('kommt', 'kam', 'gekommen', 'sein'),
    'stehen': ('steht', 'stand', 'gestanden', 'haben'),
    'sitzen': ('sitzt', 'saß', 'gesessen', 'haben'),
    'liegen': ('liegt', 'lag', 'gelegen', 'haben'),
    'bringen': (None, 'brachte', 'gebracht', 'haben'),
    'denken': (None, 'dachte', 'gedacht', 'haben'),
    'kennen': (None, 'kannte', 'gekannt', 'haben'),
    'nennen': (None, 'nannte', 'genannt', 'haben'),
    'rennen': (None, 'rannte', 'gerannt', 'sein'),
    'brennen': (None, 'brannte', 'gebrannt', 'haben'),
    'senden': (None, 'sandte', 'gesandt', 'haben'),
    'wenden': (None, 'wandte', 'gewandt', 'haben'),
    'wissen': ('weiß', 'wusste', 'gewusst', 'haben'),
    'können': ('kann', 'konnte', 'gekonnt', 'haben'),
    'müssen': ('muss', 'musste', 'gemusst', 'haben'),
    'dürfen': ('darf', 'durfte', 'gedurft', 'haben'),
    'sollen': ('soll', 'sollte', 'gesollt', 'haben'),
    'wollen': ('will', 'wollte', 'gewollt', 'haben'),
    'mögen': ('mag', 'mochte', 'gemocht', 'haben'),
    'lassen': ('lässt', 'ließ', 'gelassen', 'haben'),
    'sehen': ('sieht', 'sah', 'gesehen', 'haben'),
    'geben': ('gibt', 'gab', 'gegeben', 'haben'),
    'nehmen': ('nimmt', 'nahm', 'genommen', 'haben'),
    'lesen': ('liest', 'las', 'gelesen', 'haben'),
    'essen': ('isst', 'aß', 'gegessen', 'haben'),
    'fressen': ('frisst', 'fraß', 'gefressen', 'haben'),
    'treffen': ('trifft', 'traf', 'getroffen', 'haben'),
    'sprechen': ('spricht', 'sprach', 'gesprochen', 'haben'),
    'brechen': ('bricht', 'brach', 'gebrochen', 'haben'),
    'helfen': ('hilft', 'half', 'geholfen', 'haben'),
    'sterben': ('stirbt', 'starb', 'gestorben', 'sein'),
    'werfen': ('wirft', 'warf', 'geworfen', 'haben'),
    'treten': ('tritt', 'trat', 'getreten', 'sein'),
    'messen': ('misst', 'maß', 'gemessen', 'haben'),
    'schlagen': ('schlägt', 'schlug', 'geschlagen', 'haben'),
    'tragen': ('trägt', 'trug', 'getragen', 'haben'),
    'fahren': ('fährt', 'fuhr', 'gefahren', 'sein'),
    'laufen': ('läuft', 'lief', 'gelaufen', 'sein'),
    'fallen': ('fällt', 'fiel', 'gefallen', 'sein'),
    'halten': ('hält', 'hielt', 'gehalten', 'haben'),
    'schlafen': ('schläft', 'schlief', 'geschlafen', 'haben'),
    'raten': ('rät', 'riet', 'geraten', 'haben'),
    'braten': ('brät', 'briet', 'gebraten', 'haben'),
    'wachsen': ('wächst', 'wuchs', 'gewachsen', 'sein'),
    'waschen': ('wäscht', 'wusch', 'gewaschen', 'haben'),
    'backen': ('bäckt', 'backte', 'gebacken', 'haben'),
    'fangen': ('fängt', 'fing', 'gefangen', 'haben'),
    'hängen': ('hängt', 'hing', 'gehangen', 'haben'),
    'singen': ('singt', 'sang', 'gesungen', 'haben'),
    'springen': ('springt', 'sprang', 'gesprungen', 'sein'),
    'trinken': ('trinkt', 'trank', 'getrunken', 'haben'),
    'sinken': ('sinkt', 'sank', 'gesunken', 'sein'),
    'klingen': ('klingt', 'klang', 'geklungen', 'haben'),
    'gelingen': ('gelingt', 'gelang', 'gelungen', 'sein'),
    'beginnen': ('beginnt', 'begann', 'begonnen', 'haben'),
    'schwimmen': ('schwimmt', 'schwamm', 'geschwommen', 'sein'),
    'gewinnen': ('gewinnt', 'gewann', 'gewonnen', 'haben'),
    'finden': ('findet', 'fand', 'gefunden', 'haben'),
    'binden': ('bindet', 'band', 'gebunden', 'haben'),
    'bieten': ('bietet', 'bot', 'geboten', 'haben'),
    'bitten': ('bittet', 'bat', 'gebeten', 'haben'),
    'schneiden': ('schneidet', 'schnitt', 'geschnitten', 'haben'),
    'leiden': ('leidet', 'litt', 'gelitten', 'haben'),
    'reiten': ('reitet', 'ritt', 'geritten', 'sein'),
    'schreiten': ('schreitet', 'schritt', 'geschritten', 'sein'),
    'streiten': ('streitet', 'stritt', 'gestritten', 'haben'),
    'beißen': ('beißt', 'biss', 'gebissen', 'haben'),
    'reißen': ('reißt', 'riss', 'gerissen', 'haben'),
    'schießen': ('schießt', 'schoss', 'geschossen', 'haben'),
    'fließen': ('fließt', 'floss', 'geflossen', 'sein'),
    'schließen': ('schließt', 'schloss', 'geschlossen', 'haben'),
    'genießen': ('genießt', 'genoss', 'genossen', 'haben'),
    'gießen': ('gießt', 'goss', 'gegossen', 'haben'),
    'riechen': ('riecht', 'roch', 'gerochen', 'haben'),
    'kriechen': ('kriecht', 'kroch', 'gekrochen', 'sein'),
    'fliegen': ('fliegt', 'flog', 'geflogen', 'sein'),
    'fliehen': ('flieht', 'floh', 'geflohen', 'sein'),
    'ziehen': ('zieht', 'zog', 'gezogen', 'haben'),
    'wiegen': ('wiegt', 'wog', 'gewogen', 'haben'),
    'lügen': ('lügt', 'log', 'gelogen', 'haben'),
    'betrügen': ('betrügt', 'betrog', 'betrogen', 'haben'),
    'schreiben': ('schreibt', 'schrieb', 'geschrieben', 'haben'),
    'bleiben': ('bleibt', 'blieb', 'geblieben', 'sein'),
    'treiben': ('treibt', 'trieb', 'getrieben', 'haben'),
    'reiben': ('reibt', 'rieb', 'gerieben', 'haben'),
    'steigen': ('steigt', 'stieg', 'gestiegen', 'sein'),
    'schweigen': ('schweigt', 'schwieg', 'geschwiegen', 'haben'),
    'leihen': ('leiht', 'lieh', 'geliehen', 'haben'),
    'verzeihen': ('verzeiht', 'verzieh', 'verziehen', 'haben'),
    'scheiden': ('scheidet', 'schied', 'geschieden', 'haben'),
    'greifen': ('greift', 'griff', 'gegriffen', 'haben'),
    'pfeifen': ('pfeift', 'pfiff', 'gepfiffen', 'haben'),
    'streichen': ('streicht', 'strich', 'gestrichen', 'haben'),
    'gleichen': ('gleicht', 'glich', 'geglichen', 'haben'),
    'weichen': ('weicht', 'wich', 'gewichen', 'sein'),
    'schmeißen': ('schmeißt', 'schmiss', 'geschmissen', 'haben'),
    'heißen': ('heißt', 'hieß', 'geheißen', 'haben'),
    'geschehen': ('geschieht', 'geschah', 'geschehen', 'sein'),
    'empfehlen': ('empfiehlt', 'empfahl', 'empfohlen', 'haben'),
    'stehlen': ('stiehlt', 'stahl', 'gestohlen', 'haben'),
    'befehlen': ('befiehlt', 'befahl', 'befohlen', 'haben'),
    'rufen': ('ruft', 'rief', 'gerufen', 'haben'),
    'saufen': ('säuft', 'soff', 'gesoffen', 'haben'),
    'schaffen': ('schafft', 'schuf', 'geschaffen', 'haben'),
    'graben': ('gräbt', 'grub', 'gegraben', 'haben'),
    'laden': ('lädt', 'lud', 'geladen', 'haben'),
    'gebären': ('gebiert', 'gebar', 'geboren', 'haben'),
    'verlieren': ('verliert', 'verlor', 'verloren', 'haben'),
    'frieren': ('friert', 'fror', 'gefroren', 'haben'),
    'genesen': ('genest', 'genas', 'genesen', 'sein'),
    'heben': ('hebt', 'hob', 'gehoben', 'haben'),
    'bewegen': ('bewegt', 'bewog', 'bewogen', 'haben'),
    'erschrecken': ('erschrickt', 'erschrak', 'erschrocken', 'sein'),
    'gedeihen': ('gedeiht', 'gedieh', 'gediehen', 'sein'),
    'meiden': ('meidet', 'mied', 'gemieden', 'haben'),
    'scheinen': ('scheint', 'schien', 'geschienen', 'haben'),
    'verschwinden': ('verschwindet', 'verschwand', 'verschwunden', 'sein'),
    'schwinden': ('schwindet', 'schwand', 'geschwunden', 'sein'),
    'winden': ('windet', 'wand', 'gewunden', 'haben'),
    'zwingen': ('zwingt', 'zwang', 'gezwungen', 'haben'),
    'dringen': ('dringt', 'drang', 'gedrungen', 'sein'),
    'misslingen': ('misslingt', 'misslang', 'misslungen', 'sein'),
    'schlingen': ('schlingt', 'schlang', 'geschlungen', 'haben'),
    'schwingen': ('schwingt', 'schwang', 'geschwungen', 'haben'),
    'ringen': ('ringt', 'rang', 'gerungen', 'haben'),
    'schwören': ('schwört', 'schwor', 'geschworen', 'haben'),
    'biegen': ('biegt', 'bog', 'gebogen', 'haben'),
    'schieben': ('schiebt', 'schob', 'geschoben', 'haben'),
    'gefallen': ('gefällt', 'gefiel', 'gefallen', 'haben'),
    'weisen': ('weist', 'wies', 'gewiesen', 'haben'),
    'bergen': ('birgt', 'barg', 'geborgen', 'haben'),
    'werben': ('wirbt', 'warb', 'geworben', 'haben'),
    'stoßen': ('stößt', 'stieß', 'gestoßen', 'haben'),
    'blasen': ('bläst', 'blies', 'geblasen', 'haben'),
    'stechen': ('sticht', 'stach', 'gestochen', 'haben'),
    'verderben': ('verdirbt', 'verdarb', 'verdorben', 'haben'),
    'flechten': ('flicht', 'flocht', 'geflochten', 'haben'),
    'fechten': ('ficht', 'focht', 'gefochten', 'haben'),
    'schwellen': ('schwillt', 'schwoll', 'geschwollen', 'sein'),
    'schmelzen': ('schmilzt', 'schmolz', 'geschmolzen', 'sein'),
    'spinnen': ('spinnt', 'spann', 'gesponnen', 'haben'),
    'schleichen': ('schleicht', 'schlich', 'geschlichen', 'sein'),
    'trügen': ('trügt', 'trog', 'getrogen', 'haben'),
    'gebieten': ('gebietet', 'gebot', 'geboten', 'haben'),
    'wägen': ('wägt', 'wog', 'gewogen', 'haben'),
    'scheren': ('schert', 'schor', 'geschoren', 'haben'),
    'melken': ('melkt', 'molk', 'gemolken', 'haben'),
    'mahlen': ('mahlt', 'mahlte', 'gemahlen', 'haben'),
    'salzen': ('salzt', 'salzte', 'gesalzen', 'haben'),
    'gefrieren': ('gefriert', 'gefror', 'gefroren', 'sein'),
    'hauen': ('haut', 'haute', 'gehauen', 'haben'),
    'stinken': ('stinkt', 'stank', 'gestunken', 'haben'),
    'gleiten': ('gleitet', 'glitt', 'geglitten', 'sein'),
    'kneifen': ('kneift', 'kniff', 'gekniffen', 'haben'),
    'klimmen': ('klimmt', 'klomm', 'geklommen', 'sein'),
}

VOWEL_ENDING_STEM_CONSONANTS = ('d', 't')


def _needs_e_insertion(stem: str) -> bool:
    if stem.endswith(VOWEL_ENDING_STEM_CONSONANTS):
        return True
    for cluster in ('ffn', 'chn', 'gn', 'dn', 'tn', 'dm', 'tm', 'ckn', 'bn', 'pn'):
        if stem.endswith(cluster):
            return True
    return False


def _weak_forms(infinitive: str):
    if infinitive.endswith('ieren'):
        stem = infinitive[:-2]
        return stem + 't', stem + 'te', stem + 't'
    if not infinitive.endswith('en') and not infinitive.endswith('n'):
        return None
    stem = infinitive[:-2] if infinitive.endswith('en') else infinitive[:-1]
    skip_ge = stem.startswith('ge') or any(stem.startswith(p) for p in INSEPARABLE_PREFIXES)
    if _needs_e_insertion(stem):
        present = stem + 'et'
        past = stem + 'ete'
        participle = (stem + 'et') if skip_ge else ('ge' + stem + 'et')
    else:
        present = stem + 't'
        past = stem + 'te'
        participle = (stem + 't') if skip_ge else ('ge' + stem + 't')
    return present, past, participle


def _strip_prefix(verb: str):
    if verb in NEVER_STRIP_PREFIX:
        return (None, verb, None)
    for p in sorted(INSEPARABLE_PREFIXES, key=len, reverse=True):
        if verb.startswith(p) and len(verb) > len(p) + 2:
            return (p, verb[len(p):], False)
    for p in sorted(SEPARABLE_PREFIXES, key=len, reverse=True):
        if verb.startswith(p) and len(verb) > len(p) + 2:
            return (p, verb[len(p):], True)
    return (None, verb, None)


def generate(infinitive: str):
    v = infinitive.strip().lower()
    if not v:
        return None

    if v in AMBIGUOUS_PREFIX_OVERRIDES:
        _, pres, past, part, aux = AMBIGUOUS_PREFIX_OVERRIDES[v]
        return {'presentTense': pres, 'pastTense': past,
                'pastParticiple': part, 'auxiliary': aux}

    if v in ROOT_VERBS:
        pres, past, part, aux = ROOT_VERBS[v]
        weak = _weak_forms(v)
        if pres is None and weak:
            pres = weak[0]
        return {'presentTense': pres, 'pastTense': past,
                'pastParticiple': part, 'auxiliary': aux}

    prefix, root, separable = _strip_prefix(v)
    if prefix and root in ROOT_VERBS:
        pres, past, part, aux = ROOT_VERBS[root]
        weak = _weak_forms(root)
        if pres is None and weak:
            pres = weak[0]
        if separable:
            pres_out = f"{pres} {prefix}"
            past_out = f"{past} {prefix}"
            part_out = f"{prefix}ge{part[2:]}" if part.startswith('ge') else f"{prefix}{part}"
        else:
            pres_out = f"{prefix}{pres}"
            past_out = f"{prefix}{past}"
            part_stem = part[2:] if part.startswith('ge') else part
            part_out = f"{prefix}{part_stem}"
        return {'presentTense': pres_out, 'pastTense': past_out,
                'pastParticiple': part_out, 'auxiliary': None}

    base_for_weak = root if prefix else v
    weak = _weak_forms(base_for_weak)
    if weak is None:
        return None
    pres, past, part = weak
    if prefix:
        if separable:
            pres = f"{pres} {prefix}"
            past = f"{past} {prefix}"
            part = f"{prefix}{part}"
        else:
            pres = f"{prefix}{pres}"
            past = f"{prefix}{past}"
            part_stem = part[2:] if part.startswith('ge') else part
            part = f"{prefix}{part_stem}"
    aux = 'sein' if v in SEIN_WEAK_VERBS else 'haben'
    return {'presentTense': pres, 'pastTense': past,
            'pastParticiple': part, 'auxiliary': aux}
