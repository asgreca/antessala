"""Extração forense de entidades dos atos do DOU.

Transforma o texto integral de um ato em fatos auditáveis: quem foi contratado,
com qual CNPJ, por quanto, sob qual fundamento legal e por qual órgão. Tudo o
que este módulo devolve é rastreável até um trecho literal do ato publicado —
nada é inferido ou completado.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .normalize import clean_cnpj, extract_cnpjs, normalize_name

# "R$ 1.234.567,89" e variações com espaço não separável.
_MONEY_RE = re.compile(r"R\$\s*([\d][\d.\s]*,\d{2}|[\d][\d.\s]*\d)", re.I)

# Rótulos de valor, em ordem de prioridade: o global vence o mensal/unitário.
_VALUE_LABELS = (
    (r"valor\s+global", 100),
    (r"valor\s+total\s+do\s+contrato", 95),
    (r"valor\s+total\s+estimado", 90),
    (r"valor\s+total", 85),
    (r"valor\s+do\s+contrato", 80),
    (r"valor\s+anual", 70),
    (r"valor\s+adit(?:ado|ivo)", 65),
    (r"valor\s+estimado", 60),
    (r"valor\s+mensal", 30),
    (r"valor\s+unit[áa]rio", 10),
)

# A captura vai até ";" e é recortada depois pelos rótulos de campo. Cortar no
# primeiro "." truncava razão social legítima: "EMBRAER S.A." virava "EMBRAER S".
_CONTRACTED_PATTERNS = (
    r"contratad[ao]s?\s*:\s*([^;]{4,200})",
    r"(?:a|à)\s+empresa\s+([^;]{4,200}?),?\s+inscrita\s+no\s+cnpj",
    r"empresa\s*:\s*([^;]{4,200})",
    r"fornecedor\s*:\s*([^;]{4,200})",
    r"credenciad[ao]\s*:\s*([^;]{4,200})",
    r"benefici[áa]ri[ao]\s*:\s*([^;]{4,200})",
    r"celebrada\s+com\s+a\s+empresa\s+([^;]{4,200})",
)

# Rótulos que marcam o fim do nome e o início do próximo campo do extrato.
_FIELD_BOUNDARY_RE = re.compile(
    r"\s*[.,]?\s*\b(?:objeto|valor|vig[êe]ncia|fundamento|justificativa|"
    r"processo|n[ºo°]\s*processo|signat[áa]rios?|data\s+de\s+assinatura|"
    r"assinatura|cnpj|cpf|inscrit[ao]|com\s+sede|situad[ao]|estabelecid[ao]|"
    r"endere[çc]o|total\s+de\s+itens|crédito|programa\s+de\s+trabalho|"
    r"nota\s+de\s+empenho|contratante|este\s+conte[úu]do)\b",
    re.I,
)

# Extratos terminam com "Cidade, DD de mês de AAAA" logo após o nome da
# contratada; sem cortar aqui, a razão social carrega local e data.
_DATE_BOUNDARY_RE = re.compile(
    r"[.,]?\s*\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|"
    r"julho|agosto|setembro|outubro|novembro|dezembro)\b",
    re.I,
)

# Quem PAGA / concede. Se a entidade auditada aparece aqui, o ato é dela para
# terceiros — não é benefício recebido, e a hipótese de influência se inverte.
_CONTRACTING_PATTERNS = (
    r"contratante\s*:\s*([^;.]{4,160})",
    r"concedente\s*:\s*([^;.]{4,160})",
    r"contratant[ea]s?\s*:\s*([^;.]{4,160})",
    r"[óo]rg[ãa]o\s+contratante\s*:\s*([^;.]{4,160})",
    r"partícipes?\s*:\s*([^;.]{4,160})",
)

_PROCESS_RE = re.compile(r"n?[ºo°]?\s*processo\s*:?\s*([\d.\-/]{8,30})", re.I)
_UASG_RE = re.compile(r"uasg\s*:?\s*(\d{4,8})", re.I)
_ACT_NUMBER_RE = re.compile(r"n[ºo°]\s*([\d]{1,6}[./][\d]{2,4}(?:[./]\d+)?)", re.I)
_LEGAL_BASIS_RE = re.compile(
    r"(?:fundamento\s+legal|art(?:igo)?\.?)\s*:?\s*([^.;]{4,120})", re.I
)

# Órgãos federais da Esplanada. O e-Agendas cobre o Executivo federal, então
# atos de prefeituras e governos estaduais não são correlacionáveis.
FEDERAL_ROOTS = (
    "ministério", "ministerio", "presidência", "presidencia", "casa civil",
    "agência nacional", "agencia nacional", "advocacia-geral", "banco central",
    "controladoria", "instituto nacional", "fundação", "fundacao",
    "superintendência", "superintendencia", "comissão de valores",
    "comissao de valores", "conselho", "secretaria de governo",
    "gabinete de segurança", "gabinete de seguranca", "entidades de fiscalização",
)

NON_FEDERAL_ROOTS = ("prefeitura", "governo do estado", "poder judiciário",
                     "poder legislativo", "tribunal", "câmara municipal",
                     "camara municipal", "ministério público", "ministerio publico")


@dataclass
class ParsedAct:
    contracted_name: str = ""
    contracted_norm: str = ""
    contracting_name: str = ""
    contracting_norm: str = ""
    cnpjs: list[str] = field(default_factory=list)
    primary_cnpj: str | None = None
    value: float | None = None
    value_label: str = ""
    process_number: str = ""
    uasg: str = ""
    act_number: str = ""
    legal_basis: str = ""
    is_no_bid: bool = False
    is_federal: bool = False


def parse_money(raw: str) -> float | None:
    """Converte '1.234.567,89' (padrão brasileiro) em float."""
    if not raw:
        return None
    cleaned = re.sub(r"[\s\u00a0]", "", raw)
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return value if value > 0 else None


def extract_value(text: str) -> tuple[float | None, str]:
    """Maior valor contratual do ato, priorizando o rótulo mais abrangente.

    Um extrato costuma trazer valor unitário, mensal e global no mesmo texto.
    Somar ou pegar o primeiro produziria número errado; aqui vence o rótulo de
    maior escopo e, dentro dele, o maior montante.
    """
    if not text:
        return None, ""

    best: tuple[int, float, str] | None = None
    for match in _MONEY_RE.finditer(text):
        value = parse_money(match.group(1))
        if value is None:
            continue
        window = text[max(0, match.start() - 70): match.start()].lower()
        priority, label = 0, ""
        for pattern, weight in _VALUE_LABELS:
            if re.search(pattern, window):
                if weight > priority:
                    priority, label = weight, re.sub(r"\\s\+", " ", pattern)
        candidate = (priority, value, label)
        if best is None or (candidate[0], candidate[1]) > (best[0], best[1]):
            best = candidate

    if best is None:
        return None, ""
    return best[1], best[2]


def extract_contracted(text: str) -> str:
    """Nome da contratada, do padrão mais explícito ao mais frouxo."""
    if not text:
        return ""
    for pattern in _CONTRACTED_PATTERNS:
        match = re.search(pattern, text, re.I)
        if not match:
            continue
        name = re.sub(r"\s+", " ", match.group(1))
        name = re.sub(r"\(cnpj[^)]*\)", "", name, flags=re.I)
        # Recorta no primeiro rótulo de campo do extrato.
        for pattern in (_FIELD_BOUNDARY_RE, _DATE_BOUNDARY_RE):
            boundary = pattern.search(name)
            if boundary:
                name = name[: boundary.start()]
        # Sobra o "Cidade" que precedia a data, separado por ponto final.
        name = re.split(r"\.\s+(?=[A-ZÀ-Ú][a-zà-ú])", name)[0]
        name = name.strip(" -–,:;\t\n")
        # Ponto final só é removido quando não faz parte de "S.A."/"LTDA.".
        if name.endswith(".") and not re.search(r"\b(?:s|ltda|cia|epp|me)\.$", name, re.I):
            name = name[:-1].strip()
        if 3 < len(name) < 160:
            return name
    return ""


def extract_contracting(text: str) -> str:
    """Nome de quem contrata ou concede, quando o ato o declara."""
    if not text:
        return ""
    for pattern in _CONTRACTING_PATTERNS:
        match = re.search(pattern, text, re.I)
        if not match:
            continue
        name = re.sub(r"\s+", " ", match.group(1))
        name = re.sub(r"\(cnpj[^)]*\)", "", name, flags=re.I)
        for boundary in (_FIELD_BOUNDARY_RE, _DATE_BOUNDARY_RE):
            hit = boundary.search(name)
            if hit:
                name = name[: hit.start()]
        name = name.strip(" -–,:;\t\n")
        if 3 < len(name) < 160:
            return name
    return ""


def is_federal_organ(organ_root: str, hierarchy: str = "") -> bool:
    haystack = f"{organ_root} {hierarchy}".lower()
    if any(term in haystack for term in NON_FEDERAL_ROOTS):
        return False
    return any(term in haystack for term in FEDERAL_ROOTS)


def parse_act(record) -> ParsedAct:
    """Analisa um DouRecord (título + ementa + texto integral)."""
    text = " ".join(
        part for part in (record.title, record.summary, record.full_text) if part
    )
    result = ParsedAct()

    result.contracted_name = extract_contracted(text)
    result.contracted_norm = normalize_name(result.contracted_name)
    result.contracting_name = extract_contracting(text)
    result.contracting_norm = normalize_name(result.contracting_name)
    result.cnpjs = extract_cnpjs(text)
    result.primary_cnpj = _pick_primary_cnpj(text, result.contracted_name, result.cnpjs)

    result.value, result.value_label = extract_value(text)

    if (m := _PROCESS_RE.search(text)):
        result.process_number = m.group(1).strip(" .")
    if (m := _UASG_RE.search(text)):
        result.uasg = m.group(1)
    if (m := _ACT_NUMBER_RE.search(record.title or text)):
        result.act_number = m.group(1)
    if (m := _LEGAL_BASIS_RE.search(text)):
        result.legal_basis = re.sub(r"\s+", " ", m.group(1)).strip()[:120]

    haystack = f"{record.act_type} {record.title} {result.legal_basis}".lower()
    result.is_no_bid = any(
        term in haystack for term in ("inexigibilidade", "dispensa", "ratifica")
    ) or bool(re.search(r"art\.?\s*7[45]\b", text, re.I))

    result.is_federal = is_federal_organ(record.organ_root, record.organ_hierarchy)
    return result


def _pick_primary_cnpj(text: str, contracted: str, cnpjs: list[str]) -> str | None:
    """O CNPJ mais próximo da menção à contratada.

    Atos costumam citar o CNPJ do órgão contratante e o da empresa; escolher o
    primeiro do texto erraria com frequência.
    """
    if not cnpjs:
        return None
    if not contracted:
        return cnpjs[0]

    anchor = text.lower().find(contracted.lower()[:40])
    if anchor < 0:
        return cnpjs[0]

    best, best_distance = cnpjs[0], 10**9
    for cnpj in cnpjs:
        formatted = re.escape(cnpj)
        loose = r"\D?".join(cnpj)
        for match in re.finditer(f"(?:{formatted}|{loose})", text):
            distance = abs(match.start() - anchor)
            if distance < best_distance:
                best, best_distance = cnpj, distance
    return best
