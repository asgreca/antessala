"""Cálculo de Métricas Estatísticas e Risco Institucional (`metrics.py`).

FUNÇÃO NO PROJETO:
- Implementa as fórmulas estatísticas e forenses que sustentam as análises quantitativas do Antessala.
- Calcula a **Entropia de Trânsito (ETT)** de Shannon, o **Índice de Acesso Ilegítimo (IAI)** e os índices de opacidade de pauta.

COMO FUNCIONA:
1. `shannon_entropy`: calcula a dispersão de um ator privado por múltiplos órgãos da administração pública.
2. `iai_score`: combina volume de acessos, entropia, nível hierárquico da autoridade e existência de atos no DOU.
3. `is_opaque_topic`: verifica se a pauta declarada no e-Agendas é vaga ("Visita de cortesia", "Assuntos gerais", "Alinhamento") violando a transparência pública.
"""
from __future__ import annotations

import math

from .normalize import strip_accents

# Pautas que não informam nada ao cidadão sobre o que foi tratado.
OPAQUE_TOPIC_PATTERNS = (
    "visita de cortesia", "cortesia", "reuniao", "reunião", "apresentacao",
    "apresentação", "assuntos de interesse", "assuntos gerais", "audiencia",
    "audiência", "tratativas", "alinhamento", "agenda", "despacho",
    "assunto interno", "nao informado", "não informado", "a definir", "diversos",
    "assuntos institucionais", "audiência a particular", "audiencia a particular",
    "audiência particular", "audiencia particular", "reunião interna", "reuniao interna",
    "alinhamento interno", "despacho interno", "apresentação institucional", "visita institucional",
)

# Padrões onde a pauta apenas nomeia o interlocutor ou veículo de imprensa sem matéria substantiva.
INTERLOCUTOR_PREFIXES = (
    "com a ", "com o ", "com os ", "com as ", "reunião com ", "reuniao com ",
    "audiência com ", "audiencia com ", "encontro com ", "visita do ", "visita da ",
    "visita dos ", "visita das ", "entrevista jornal ", "entrevista tv ", "conversa com ",
    "senador ", "senadora ", "deputado ", "deputada ", "vice-presidente ", "presidente da ",
    "presidente do ", "diretor da ", "diretor do ", "diretora da ", "diretora do ",
    "ministro ", "ministra ", "prefeito ", "prefeita ", "governador ", "governadora ",
    "secretário ", "secretária ", "secretario ", "secretaria ", "representante ",
    "representantes ", "gerente ", "fundador ", "co-fundador ", "dirigente ",
)

# Conectivos que introduzem matéria substantiva numa pauta que começou nomeando alguém.
SUBSTANTIVE_CONNECTORS = (
    " sobre ", " acerca de ", " referente a ", " referente ao ", " referente à ",
    " relativa a ", " relativo a ", " para tratar de ", " para tratar da ", " para tratar do ",
    " com o objetivo de ", " com foco em ", " pauta: ", " temas: ", " em debate: ",
    " debater ", " discutir ",
)

MIN_TOPIC_LENGTH = 25


def is_opaque_topic(topic: str | None) -> bool:
    """Pauta opaca: ausente, curta demais, genérica ou que apenas nomeia o interlocutor.
    
    Nos termos do Decreto nº 10.889/2021 (Art. 11, § 2º), a pauta deve declarar a
    matéria substantiva tratada. Se a pauta apenas repetir o nome/cargo do visitante
    sem especificar o assunto de interesse público, trata-se de pauta opaca.
    """
    if not topic:
        return True
    text = str(topic).strip().lower()
    if len(text) < MIN_TOPIC_LENGTH:
        return True

    # Genérica só conta como opaca se a pauta for pouco mais que o termo genérico
    if any(text.startswith(p) and len(text) < MIN_TOPIC_LENGTH + 20 for p in OPAQUE_TOPIC_PATTERNS):
        return True

    # Se apenas identifica interlocutor sem indicar matéria substantiva conectada
    for prefix in INTERLOCUTOR_PREFIXES:
        if text.startswith(prefix):
            if not any(conn in text for conn in SUBSTANTIVE_CONNECTORS):
                return True

    return False


def shannon_entropy(counts: list[int]) -> float:
    """Entropia de Trânsito (ETT): dispersão de um ator entre órgãos.

    Um lobista que concentra 100% das reuniões num órgão tem entropia 0. Um que
    circula uniformemente por 8 órgãos tem entropia 3. Valor alto indica
    trânsito transversal na Esplanada — o "trânsito coringa".
    """
    total = sum(counts)
    if total <= 0:
        return 0.0
    entropy = 0.0
    for count in counts:
        if count <= 0:
            continue
        p = count / total
        entropy -= p * math.log2(p)
    return round(entropy, 3)


# Composição do IAI, declarada em tabela para que a interface possa exibir de
# onde veio cada ponto. Um índice de risco que não presta contas do próprio
# cálculo não sustenta contraditório.
IAI_COMPONENTS = (
    # (chave, rótulo, peso máximo, denominador de saturação, explicação)
    ("meetings", "Volume de acesso", 12.0, 50.0,
     "Número de reuniões registradas. Satura em 50: acesso frequente conta, "
     "mas frequência sozinha não caracteriza ilegitimidade."),
    ("bodies", "Alcance institucional", 10.0, 10.0,
     "Órgãos distintos visitados. Satura em 10."),
    ("authorities", "Autoridades distintas", 8.0, 15.0,
     "Quantas autoridades diferentes recebeu o ator. Satura em 15."),
    ("entropy", "Trânsito transversal (ETT)", 10.0, 4.0,
     "Entropia de Shannon da distribuição entre órgãos. Alta = circula por "
     "muitos órgãos sem concentrar — o padrão do 'trânsito coringa'."),
    ("correlations", "Evidência documental", 30.0, 8.0,
     "Atos do DOU publicados após reuniões da entidade representada. É o "
     "componente de maior peso: acesso sem consequência documental pontua pouco."),
    ("critical", "Correlações críticas", 20.0, 3.0,
     "Atos publicados em proximidade excepcional, já descontada a cadência "
     "própria da entidade."),
    ("value", "Valor correlacionado", 10.0, 9.0,
     "Escala logarítmica do valor dos atos correlacionados (log10 do total "
     "sobre 9). Contrato grande agrava, mas não domina o índice."),
)


def iai_breakdown(meetings: int, distinct_bodies: int, distinct_authorities: int,
                  entropy: float, correlations: int, correlated_value: float,
                  critical_correlations: int) -> dict:
    """Índice de Acesso Ilegítimo com a origem de cada ponto.

    Acesso amplo não é ilícito por si só; por isso o peso maior está nas
    correlações documentais com atos do DOU, e não no volume de reuniões.
    """
    raw = {
        "meetings": float(meetings),
        "bodies": float(distinct_bodies),
        "authorities": float(distinct_authorities),
        "entropy": float(entropy),
        "correlations": float(correlations),
        "critical": float(critical_correlations),
        "value": (math.log10(max(correlated_value, 1.0))
                  if correlated_value else 0.0),
    }

    parts = []
    total = 0.0
    for key, label, weight, denominator, explanation in IAI_COMPONENTS:
        ratio = min(raw[key] / denominator, 1.0) if denominator else 0.0
        points = round(weight * ratio, 1)
        total += points
        parts.append({
            "key": key,
            "label": label,
            "observed": round(raw[key], 3),
            "saturatesAt": denominator,
            "maxPoints": weight,
            "points": points,
            "explanation": explanation,
        })

    return {
        "score": round(min(total, 100.0), 1),
        "maxScore": 100.0,
        "components": parts,
        "method": ("Soma ponderada de sete componentes, cada um saturado no seu "
                   "denominador. Determinístico e reproduzível: a mesma entrada "
                   "sempre produz o mesmo índice."),
    }


def iai_score(meetings: int, distinct_bodies: int, distinct_authorities: int,
              entropy: float, correlations: int, correlated_value: float,
              critical_correlations: int) -> float:
    return iai_breakdown(meetings, distinct_bodies, distinct_authorities, entropy,
                         correlations, correlated_value, critical_correlations)["score"]


SEVERITY_PT_TO_EN = {
    "CRITICA": "CRITICAL", "ALTA": "HIGH", "MEDIA": "MEDIUM", "BAIXA": "LOW",
}
SEVERITY_EN_TO_PT = {v: k for k, v in SEVERITY_PT_TO_EN.items()}


# Hierarquia do cargo que recebe o visitante. Ministro e secretário decidem;
# gerente e assessor instruem. Um lobista que alcança o topo tem acesso de
# natureza diferente de quem circula no nível técnico.
AUTHORITY_TIERS = (
    ("MINISTERIAL", 1, ("ministro", "ministra", "presidente da republica", "vice-presidente da republica")),
    ("ALTA_DIRECAO", 2, ("secretario", "secretaria", "presidente", "diretor-presidente",
                         "vice-presidente", "procurador-geral", "advogado-geral")),
    ("DIRECAO", 3, ("diretor", "diretora", "superintendente", "chefe de gabinete",
                    "reitor", "reitora", "conselheiro", "conselheira")),
    ("GERENCIAL", 4, ("gerente", "coordenador", "coordenadora", "chefe",
                      "supervisor", "assessor especial")),
    ("TECNICO", 5, ("assessor", "assessora", "analista", "tecnico", "especialista",
                    "auditor", "agente")),
)

TIER_LABELS = {
    "MINISTERIAL": "Ministro(a) de Estado / Presidência da República",
    "ALTA_DIRECAO": "Alta direção (secretário, presidente)",
    "DIRECAO": "Direção (diretor, superintendente)",
    "GERENCIAL": "Gerencial (gerente, coordenador)",
    "TECNICO": "Técnico (assessor, analista)",
    "NAO_CLASSIFICADO": "Cargo não classificado",
}


def is_minister_or_president(role: str | None) -> bool:
    """Verifica com precisão se o cargo é de Ministro(a) de Estado ou Presidente/Vice da República."""
    if not role:
        return False
    norm = strip_accents(str(role)).lower().strip()
    norm = norm.replace("ministr0", "ministro")
    return (
        norm.startswith("ministro") or
        norm.startswith("ministra") or
        norm.startswith("presidente da republica") or
        norm.startswith("vice-presidente da republica")
    )


def authority_tier_sql(column: str = "m.authority_role") -> str:
    """A mesma classificação de cargo, expressa em SQL.

    Precisa existir em SQL — e não só em Python — porque o filtro de cargo tem
    de ser aplicado ANTES do LIMIT da consulta. Classificando depois, o total
    passava a depender do que a varredura por acaso capturou: filtrar por
    "ministro" devolvia 216 relações, e "ministro + Ministério da Saúde"
    devolvia 1.445, como se estreitar o filtro aumentasse o resultado.

    Derivado de AUTHORITY_TIERS para não divergir da versão Python.
    """
    normalized = f"lower(strip_accents(coalesce({column}, '')))"
    branches = [
        f"WHEN ({normalized} LIKE 'ministr%' OR {normalized} LIKE 'presidente da republica%' OR {normalized} LIKE 'vice-presidente da republica%') THEN 'MINISTERIAL'"
    ]
    for tier, _rank, terms in AUTHORITY_TIERS[1:]:
        condition = " OR ".join(
            f"{normalized} LIKE '%{term}%'" for term in terms
        )
        branches.append(f"WHEN {condition} THEN '{tier}'")
    return "CASE " + " ".join(branches) + " ELSE 'NAO_CLASSIFICADO' END"


def authority_tier(role: str | None) -> tuple[str, int]:
    """Classifica o cargo da autoridade recebida em faixa hierárquica."""
    text = strip_accents(str(role or "")).lower()
    if not text.strip():
        return "NAO_CLASSIFICADO", 9
    if is_minister_or_president(role):
        return "MINISTERIAL", 1
    for tier, rank, terms in AUTHORITY_TIERS[1:]:
        if any(term in text for term in terms):
            return tier, rank
    return "NAO_CLASSIFICADO", 9
