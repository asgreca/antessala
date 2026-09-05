"""Normalização de nomes de empresas e CNPJs.

Este módulo é o ponto onde o cruzamento e-Agendas x DOU acerta ou erra. O
e-Agendas registra "Telefônica", "Telefonica", "TELEFONICA BRASIL S.A."; o DOU
registra "TELEFONICA BRASIL S.A." ou só o CNPJ. Sem canonicalização o
cruzamento gera falso negativo em massa (e, com match por prefixo ingênuo,
falso positivo: "Vale" casaria com "Vale do Rio Doce", "Valec" e "Valença").
"""
from __future__ import annotations

import re
import unicodedata

# Sufixos societários e ruído que não distinguem uma empresa de outra.
_LEGAL_SUFFIXES = {
    "sa", "s a", "ltda", "me", "epp", "eireli", "s/a", "sas", "cia", "companhia",
    "industria", "comercio", "participacoes", "holding", "do brasil", "brasil",
    "brasileira", "brasileiro", "servicos", "servico", "empreendimentos",
    "sociedade", "anonima", "limitada", "grupo", "group", "inc", "llc", "corp",
    "inst", "instituicao",
}

# Entidades genéricas que nunca devem virar alvo de busca no DOU.
GENERIC_ENTITIES = {
    "", "-", "--", "n/a", "na", "nao informado", "nao informada", "sem informacao",
    "interesse proprio", "interesse próprio", "outros", "diversos", "particular",
    "razao social restrita pelo sigilo empresarial",
    "pessoa fisica", "pessoa física", "cidadao", "sociedade civil",
}

# Prefixos que não distinguem uma organização ("Grupo CCR" == "CCR S.A.").
_LEADING_NOISE = {"grupo", "group", "cia", "companhia", "holding"}

# Cargos preenchidos por engano no campo de entidade representada. "Presidente"
# chegou a virar uma "empresa" com 48 reuniões e correlações no DOU.
ROLE_WORDS = {
    "presidente", "vice presidente", "diretor", "diretora", "diretor presidente",
    "socio", "socia", "advogado", "advogada", "assessor", "assessora",
    "consultor", "consultora", "gerente", "coordenador", "coordenadora",
    "secretario", "secretaria", "superintendente", "conselheiro", "conselheira",
    "representante", "procurador", "procuradora", "analista", "engenheiro",
    "economista", "jornalista", "empresario", "empresaria", "servidor",
    "ceo", "cfo", "coo", "cto", "presidencia", "diretoria", "titular",
}

# Entes públicos: aparecem nas agendas, mas não são atores privados de lobby.
PUBLIC_ENTITY_PREFIXES = (
    "estado de", "estado do", "municipio de", "municipio do", "prefeitura",
    "governo de", "governo do", "governo da", "ministerio", "secretaria de estado",
    "tribunal", "camara municipal", "assembleia legislativa", "camara dos deputados",
    "senado federal", "poder judiciario", "defensoria publica", "procuradoria",
    "conselho nacional de justica", "banco central", "controladoria geral",
    "advocacia geral da uniao", "universidade federal", "instituto federal",
    "consorcio interestadual", "consorcio de municipios",
    "agencia nacional", "agencia reguladora", "superintendencia nacional",
    "instituto nacional", "fundacao nacional", "conselho administrativo de defesa",
    "comissao de valores mobiliarios", "casa civil", "presidencia da republica",
)

# Entidades que exercem função estatal por delegação ou são da administração
# indireta, e por isso não são agentes externos ao governo. Cada uma listada
# nominalmente, e não por padrão de nome: uma regra ampla removeria FIESP,
# FIRJAN, CBIC, ALANAC e até o iFood (cuja razão social contém "agência de
# restaurantes") — que são representação de interesse privado e o próprio
# objeto da auditoria.
STATE_FUNCTION_ENTITIES = {
    # Operadores e câmaras setoriais criados por lei, sob delegação regulatória
    "operador nacional do sistema eletrico",
    "operador nacional do sistema eletrico ons",
    "ons operador nacional do sistema eletrico",
    "camara de comercializacao de energia eletrica",
    "camara de comercializacao de energia eletrica ccee",
    "ccee", "ons",
    # Empresas públicas e sociedades de economia mista de apoio ao Estado
    "epe", "empresa de pesquisa energetica",
    # Serviços sociais autônomos e agências de fomento estatais
    "abdi", "agencia brasileira de desenvolvimento industrial",
    "agencia brasileira de desenvolvimento industrial abdi",
    "apex", "apex brasil", "agencia de promocao de exportacoes do brasil",
    "agencia de promocao de exportacoes do brasil apex brasil",
    "agencia brasileira de promocao de exportacoes e investimentos",
    "agsus", "agencia brasileira de apoio a gestao do sus",
    "agencia brasileira de apoio a gestao do sistema unico de saude",
    "conif", "conselho nacional das instituicoes da rede federal de educacao",
    "conif conselho nacional das instituicoes",
    "conselho nacional das instituicoes",
}

# Conselhos profissionais são autarquias federais por lei (CFM, CREA, COFFITO…).
PROFESSIONAL_COUNCIL_PREFIXES = (
    "conselho federal de", "conselho regional de", "conselho federal dos",
    "conselho regional dos", "ordem dos advogados do brasil",
)

# Organismos internacionais: não são atores privados nacionais e já têm bloco
# próprio no e-Agendas.
INTERNATIONAL_BODIES = {
    "banco mundial", "banco internacional para reconstrucao e desenvolvimento",
    "banco interamericano de desenvolvimento", "bid", "birds", "bird",
    "organizacao das nacoes unidas", "onu", "ocde", "oecd", "fmi",
    "fundo monetario internacional", "organizacao mundial da saude", "oms",
    "organizacao internacional do trabalho", "oit", "unesco", "unicef", "pnud",
    "organizacao mundial do comercio", "omc",
}

# Siglas de órgãos e agências reguladoras federais. Aparecem no campo de
# entidade representada quando o próprio órgão participa da reunião.
PUBLIC_ENTITY_ACRONYMS = {
    "anatel", "anvisa", "aneel", "anp", "antt", "anac", "ans", "ana", "anm",
    "antaq", "ancine", "inss", "inmetro", "ibama", "incra", "funai", "cade",
    "cvm", "susep", "previc", "bacen", "cgu", "agu", "tcu", "tse", "stf", "stj",
    "ibge", "inep", "capes", "cnpq", "fiocruz", "embrapa", "dnit", "infraero",
    "serpro", "dataprev", "conab", "sudene", "sudam", "iphan", "icmbio",
}

_CNPJ_RE = re.compile(r"\b(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})\b")


def strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )


def normalize_name(name: str) -> str:
    """Forma canônica comparável: sem acento, sem pontuação, sem sufixo societário."""
    if not name:
        return ""
    txt = strip_accents(str(name)).lower()
    txt = re.sub(r"\(cnpj[^)]*\)", " ", txt)      # remove "(CNPJ: 00.000.000/0001-00)"
    # "&" colado entre caracteres faz parte do nome ("P&D", "M&A"): vira uma só
    # palavra. Isolado por espaços, é apenas conectivo e some.
    txt = re.sub(r"(?<=[a-z0-9])&(?=[a-z0-9])", "", txt)
    txt = re.sub(r"[^a-z0-9 ]+", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()

    tokens = [t for t in txt.split() if t]

    # Letra solta no fim vem sempre de "S.A." e nunca distingue empresa.
    while tokens and len(tokens[-1]) == 1:
        tokens.pop()

    # Palavra qualificadora ("brasil", "ltda", "servicos") só sai se ainda
    # restar núcleo. Sem essa condição, "P&D Brasil" viraria "pd" — curto e
    # ambíguo demais para identificar a associação.
    while len(tokens) > 1 and tokens[-1] in _LEGAL_SUFFIXES:
        candidate = tokens[:-1]
        if len(" ".join(candidate)) < 3:
            break
        tokens = candidate

    # "Grupo CCR" e "CCR S.A." são a mesma empresa: o prefixo não distingue.
    while len(tokens) > 1 and tokens[0] in _LEADING_NOISE:
        tokens.pop(0)

    return " ".join(tokens)


def is_generic(name: str) -> bool:
    """True para rótulos que não identificam uma organização real."""
    norm = normalize_name(name)
    if not norm or len(norm) < 3:
        return True
    if norm in GENERIC_ENTITIES:
        return True
    if norm in ROLE_WORDS:
        return True
    if strip_accents(str(name)).strip().lower() in GENERIC_ENTITIES:
        return True
    # Um nome só de números não identifica ninguém.
    if norm.replace(" ", "").isdigit():
        return True
    return False


# Frases que descrevem o CARGO de quem fala, não a organização representada.
# "Head de relacionamento com Poder Executivo da Meta" identifica uma função.
ROLE_PHRASES = (
    "relacionamento com", "relacoes institucionais", "relacoes governamentais",
    "assuntos institucionais", "assuntos corporativos", "assuntos governamentais",
    "head de", "head of", "diretor de", "diretora de", "gerente de",
    "coordenador de", "responsavel por", "representante de", "representante da",
    "representante do", "socio de", "socia de", "consultor de", "advogado de",
    "assessor de", "presidente de", "presidente da", "presidente do",
    "vice presidente de", "vice presidente da", "conselheiro de",
)


def is_role_description(name: str) -> bool:
    """O texto descreve uma função, e não a organização representada."""
    norm = normalize_name(name)
    return bool(norm) and any(phrase in norm for phrase in ROLE_PHRASES)


def starts_with_role(name: str) -> bool:
    """Grafia que começa por cargo ("Presidente da Medix Brasil").

    Não é genérica — o nome da empresa está lá —, mas é péssima como forma
    canônica: um achado que nomeia "Presidente da Medix Brasil" como a empresa
    sancionada fica indefensável.
    """
    norm = normalize_name(name)
    if not norm:
        return False
    tokens = norm.split()
    if not tokens:
        return False
    if tokens[0] in ROLE_WORDS:
        return True
    return len(tokens) > 1 and " ".join(tokens[:2]) in ROLE_WORDS


def is_public_entity(name: str) -> bool:
    """Ente da administração pública, e não ator privado sujeito à auditoria."""
    norm = normalize_name(name)
    if not norm:
        return False
    if norm in PUBLIC_ENTITY_ACRONYMS:
        return True
    known = STATE_FUNCTION_ENTITIES | INTERNATIONAL_BODIES
    if norm in known:
        return True
    # Sigla grudada ao nome ("ApexBrasil") não casa com a forma espaçada. A
    # comparação sem espaços só corre contra esta lista curada, então não há
    # risco de colidir com razão social privada.
    compact = norm.replace(" ", "")
    if compact and any(compact == k.replace(" ", "") for k in known):
        return True
    # Nome longo e distintivo pode aparecer com sufixo colado
    # ("...DO BRASIL - APEX-BRASIL"), que a normalização recorta de forma
    # imprevisível. Para esses, contenção de sequência de tokens. Siglas curtas
    # continuam exigindo casamento exato: "apex" ou "bird" soltos casariam com
    # nomes privados legítimos.
    tokens = norm.split()
    for name in known:
        if len(name) < 18:
            continue
        needle = name.split()
        if _is_token_subsequence(needle, tokens):
            return True
    if any(norm.startswith(prefix) for prefix in PROFESSIONAL_COUNCIL_PREFIXES):
        return True
    return any(norm == prefix or norm.startswith(prefix + " ")
               for prefix in PUBLIC_ENTITY_PREFIXES)


def clean_cnpj(raw: str | None) -> str | None:
    """Retorna 14 dígitos, ou None se não for um CNPJ estruturalmente válido."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) != 14:
        return None
    if len(set(digits)) == 1:      # 00000000000000 e afins
        return None
    return digits if _valid_cnpj_check_digits(digits) else None


def _valid_cnpj_check_digits(d: str) -> bool:
    """Validação dos dois dígitos verificadores (módulo 11)."""
    def calc(base: str, weights: list[int]) -> str:
        total = sum(int(c) * w for c, w in zip(base, weights))
        rest = total % 11
        return "0" if rest < 2 else str(11 - rest)

    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    w2 = [6] + w1
    return d[12] == calc(d[:12], w1) and d[13] == calc(d[:13], w2)


def extract_cnpjs(text: str) -> list[str]:
    """Todos os CNPJs válidos de um texto livre, sem repetição e em ordem."""
    if not text:
        return []
    found: list[str] = []
    for match in _CNPJ_RE.finditer(str(text)):
        cnpj = clean_cnpj("".join(match.groups()))
        if cnpj and cnpj not in found:
            found.append(cnpj)
    return found


def format_cnpj(cnpj: str) -> str:
    d = re.sub(r"\D", "", cnpj or "")
    if len(d) != 14:
        return cnpj or ""
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"


def search_terms(name: str) -> list[str]:
    """Termos de busca para o DOU, do mais específico ao mais amplo.

    Nomes curtos ("Vale", "CCR") são ambíguos no DOU — "vale" recupera
    vale-transporte, vale-alimentação e dezenas de topônimos. Para esses,
    usa-se a forma original com sufixo societário ("vale s.a", "grupo ccr"),
    que é bem mais discriminante como frase exata.
    """
    norm = normalize_name(name)
    if not norm:
        return []

    if len(norm) >= 5:
        terms = []
        # Nomes com "&" precisam da forma literal: o DOU publica "P&D Brasil",
        # e a busca por "pd brasil" não recupera nada.
        if "&" in str(name):
            literal = _literal_form(name)
            if len(literal) >= 4:
                terms.append(literal)
        terms.append(norm)
        tokens = norm.split()
        if len(tokens) > 2:
            terms.append(" ".join(tokens[:2]))
        return list(dict.fromkeys(terms))

    # Núcleo curto: cai para a forma literal, mais específica.
    literal = _literal_form(name)
    return [literal] if len(literal) >= 4 else []


def _literal_form(name: str) -> str:
    """Grafia original enxuta, preservando "&", "." e "/" da razão social."""
    literal = re.sub(r"\(cnpj[^)]*\)", " ", strip_accents(str(name)).lower())
    literal = re.sub(r"[^a-z0-9&./ ]+", " ", literal)
    return re.sub(r"\s+", " ", literal).strip(" .")


def name_matches(entity_name: str, dou_party_name: str) -> float:
    """Confiança (0..1) de que dois nomes se referem à mesma organização.

    Exige contenção de token completo em vez de substring solta, para não
    casar "Vale" com "Valec". Retorna 0.0 quando não há evidência suficiente.
    """
    a, b = normalize_name(entity_name), normalize_name(dou_party_name)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    ta, tb = a.split(), b.split()
    set_a, set_b = set(ta), set(tb)

    # Um nome contido inteiramente no outro, como sequência de tokens.
    if _is_token_subsequence(ta, tb) or _is_token_subsequence(tb, ta):
        if min(len(ta), len(tb)) == 1:
            # Siglas de uma palavra (CCR, ONS, EPE, BNDES) são o padrão do setor,
            # mas exigem corroboração: confiança menor e nunca com 2 caracteres,
            # que casariam "Oi" com qualquer coisa.
            core = min(a, b, key=len)
            return 0.0 if len(core) < 3 else 0.7
        return 0.9

    overlap = set_a & set_b
    if not overlap:
        return 0.0
    jaccard = len(overlap) / len(set_a | set_b)
    return jaccard if jaccard >= 0.6 else 0.0


def _is_token_subsequence(needle: list[str], haystack: list[str]) -> bool:
    n = len(needle)
    if n == 0 or n > len(haystack):
        return False
    return any(haystack[i:i + n] == needle for i in range(len(haystack) - n + 1))
