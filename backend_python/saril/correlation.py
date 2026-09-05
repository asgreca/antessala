"""Motor Forense de Correlação Temporal (e-Agendas x Diário Oficial da União).

FUNÇÃO NO PROJETO:
- Implementa o núcleo pericial da plataforma: cruza os encontros de representação privada registrados no e-Agendas com as publicações posteriores do Diário Oficial da União (DOU).
- Identifica indícios de favorecimento ou proximidade temporal entre reuniões com autoridades e atos de benefício (contratos, aditivos, dispensas, inexigibilidades, portarias normativas).

COMO FUNCIONA:
1. Filtra rigorosamente atos de benefício (ignorando penalidades ou avisos neutros).
2. Valida o vínculo entidade-ato por correspondência de CNPJ (matriz/filiais) ou razão social normalizada.
3. Garante a causalidade temporal (reunião DEVE anteceder a publicação do ato em até 365 dias).
4. Calcula a métrica de `Lift` de proximidade (ajustando pela cadência habitual da empresa para evitar falsos positivos em empresas de alto volume).
5. Atribui a classificação de severidade (CRÍTICA, ALTA, MÉDIA, BAIXA) e razões do alerta.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass

from . import config
from .normalize import is_public_entity, name_matches, normalize_name


# Só atos que conferem benefício econômico, regulatório ou institucional à entidade representada
# (empresa, associação setorial, federação, ONG, sindicato, fundação ou pessoa jurídica) entram no
# alerta. Um acórdão, um resultado de julgamento ou um aviso de licitação
# mencionam a entidade sem lhe outorgar nada — correlacioná-los com reuniões
# rotineiras produz volume, não evidência.
BENEFIT_ACT_PATTERNS = (
    "extrato de contrato", "extrato de termo aditivo", "extrato de inexigibilidade",
    "extrato de dispensa", "extrato de adesao", "extrato de adesão",
    "extrato de registro de precos", "extrato de registro de preços",
    "extrato da ata", "extrato de credenciamento", "termo de autorizacao",
    "termo de autorização", "inexigibilidade de licitacao", "inexigibilidade de licitação",
    "dispensa de licitacao", "dispensa de licitação", "ratificacao", "ratificação",
    "portaria normativa", "resolucao", "resolução", "outorga", "concessao", "concessão",
    "autorizacao", "autorização", "permissao", "permissão", "homologacao",
    "homologação", "despacho decisorio", "despacho decisório", "licenca", "licença",
    "registro de produto", "renovacao", "renovação", "prorrogacao", "prorrogação",
    "extrato de convenio", "extrato de convênio", "convenio", "convênio",
    "extrato de acordo de cooperacao", "extrato de acordo de cooperação",
    "acordo de cooperacao", "acordo de cooperação",
    "cooperacao tecnica", "cooperação técnica",
    "extrato de parceria", "termo de parceria", "extrato de termo de parceria",
    "termo de fomento", "extrato de termo de fomento",
    "termo de colaboracao", "termo de colaboração", "extrato de termo de colaboracao", "extrato de termo de colaboração",
    "termo de compromisso", "extrato de compromisso",
    "protocolo de intencao", "protocolo de intenção",
    "autorizacao de uso", "autorização de uso",
    "termo de execucao descentralizada", "termo de execução descentralizada",
)

# Atos que citam a empresa sem lhe conferir benefício, ou que a penalizam.
EXCLUDED_ACT_PATTERNS = (
    "acordao", "acórdão", "resultado de julgamento", "aviso de licitacao",
    "aviso de licitação", "pregao", "pregão", "penalidade", "multa",
    "impedimento", "declaracao de inidoneidade", "declaração de inidoneidade",
    "intimacao", "intimação", "citacao", "citação", "edital", "errata",
    "retificacao", "retificação", "aviso de suspensao", "aviso de suspensão",
)


def _contains_phrase(haystack: str, phrase: str) -> bool:
    """Casamento por palavra inteira.

    Substring solta erra de forma grave aqui: "citacao" (ato excluído) aparece
    dentro de "licitacao", o que descartaria justamente as inexigibilidades —
    o tipo de ato mais relevante para a auditoria.
    """
    if not phrase:
        return False
    return re.search(rf"\b{re.escape(phrase)}\b", haystack) is not None


def is_benefit_act(act_type: str, title: str = "") -> bool:
    """O ato confere benefício à empresa, ou apenas a menciona?"""
    haystack = normalize_name(f"{act_type} {title}")
    if any(_contains_phrase(haystack, normalize_name(p)) for p in EXCLUDED_ACT_PATTERNS):
        return False
    return any(_contains_phrase(haystack, normalize_name(p)) for p in BENEFIT_ACT_PATTERNS)


@dataclass
class Correlation:
    correlation_id: str
    dou_id: str
    entity_norm: str
    entity_name: str
    event_id: int
    meeting_date: object
    pub_date: object
    delta_days: int
    match_basis: str
    match_confidence: float
    same_organ: bool
    severity: str
    risk_score: float
    value: float | None
    authority_name: str
    lobbyist_name: str
    public_body: str
    organ_root: str
    declared_topic: str
    act_type: str
    link_url: str
    proximity_lift: float
    prior_meetings_count: int
    distinct_authorities: int
    distinct_lobbyists: int
    earliest_meeting_date: object


def proximity_lift(delta_days: int, prior_meetings: int,
                   window_days: int = config.CORRELATION_WINDOW_DAYS) -> float:
    """Quão excepcional é essa proximidade, dada a cadência da própria entidade.

    Sem essa normalização o índice premia quem se reúne mais. Uma empresa com
    2.400 reuniões na janela tem, em média, uma reunião a cada 0,15 dia: achar
    uma no mesmo dia de um ato é certeza estatística, não indício. Já uma
    entidade com 3 reuniões no ano tem intervalo esperado de ~120 dias, e uma
    reunião 54 dias antes do ato é genuinamente próxima.

    Retorna intervalo_esperado / (Δt + 1). Acima de 1, a reunião está mais
    perto do ato do que a rotina da entidade explicaria.
    """
    if prior_meetings <= 0:
        return 0.0
    expected_interval = window_days / prior_meetings
    return round(expected_interval / (delta_days + 1), 3)


def classify_severity(delta_days: int, value: float | None, is_no_bid: bool,
                      same_organ: bool, lift: float = 1.0) -> tuple[str, float]:
    """Severidade e score de risco (0..100) de uma correlação.

    O Δt define a faixa base; valor, contratação sem licitação e coincidência
    de órgão agravam. Uma reunião a 400 dias do ato não é sinal de nada, então
    fica fora da janela e não gera alerta.
    """
    base_severity, base_weight = "BAIXA", 0.10
    for limit, severity, weight in config.SEVERITY_BANDS:
        if delta_days <= limit:
            base_severity, base_weight = severity, weight
            break

    # Proximidade que a cadência da entidade já explicaria não sustenta a
    # severidade da faixa. O rebaixamento é PROPORCIONAL: um único degrau
    # igualava casos incomparáveis — uma entidade com 500 reuniões por ano
    # (lift 0,37) recebia a mesma severidade de outra com 5.163 (lift 0,035),
    # embora nesta última encontrar uma reunião na véspera de qualquer ato seja
    # praticamente certeza estatística.
    steps = _downgrade_steps(lift)
    for _ in range(steps):
        base_severity, base_weight = _downgrade(base_severity, base_weight)

    score = base_weight * 45.0

    if value:
        if value >= config.CRITICAL_VALUE_THRESHOLD:
            score += 25.0
        elif value >= config.HIGH_VALUE_THRESHOLD:
            score += 15.0
        else:
            score += 5.0

    if is_no_bid:
        score += 20.0
    if same_organ:
        score += 10.0

    # Proximidade excepcional agrava; o ganho é logarítmico para que uma
    # entidade com pouquíssimas reuniões não estoure a escala.
    if lift > 1.0:
        score += min(math.log2(lift) * 6.0, 15.0)

    score = round(min(score, 100.0), 1)

    # Um score alto promove a severidade, mas a proximidade continua sendo o
    # teto: sem proximidade excepcional não há hipótese de influência.
    if base_severity == "ALTA" and score >= 85 and is_no_bid and lift >= 1.0:
        base_severity = "CRITICA"
    return base_severity, score


def severity_reasons(delta_days: int, value: float | None, is_no_bid: bool,
                     same_organ: bool, lift: float, match_basis: str,
                     prior_meetings: int) -> list[dict]:
    """Fatores que produziram a gravidade, cada um com o seu efeito.

    A interface precisa poder mostrar *por que* um alerta é crítico. Gravidade
    afirmada sem os fatores que a geraram não é auditável — e é exatamente o
    tipo de número que ninguém consegue contestar nem confirmar.
    """
    reasons: list[dict] = []

    band = next((s for limit, s, _ in config.SEVERITY_BANDS if delta_days <= limit),
                "BAIXA")
    reasons.append({
        "factor": "Intervalo até a publicação",
        "value": f"{delta_days} dias",
        "effect": "define a faixa base",
        "detail": f"Δt de {delta_days} dias situa o caso na faixa {band}.",
        "raises": delta_days <= 90,
    })

    if lift >= 2.0:
        reasons.append({
            "factor": "Proximidade acima da rotina",
            "value": f"{lift:.1f}x",
            "effect": "agrava",
            "detail": (f"A entidade teve {prior_meetings} reuniões na janela; o "
                       f"intervalo observado é {lift:.1f}x menor que o esperado "
                       "pela própria cadência dela."),
            "raises": True,
        })
    elif lift < 1.0:
        reasons.append({
            "factor": "Proximidade explicada pela cadência",
            "value": f"{lift:.2f}x",
            "effect": "rebaixa um grau",
            "detail": (f"Com {prior_meetings} reuniões na janela, encontrar uma "
                       "próxima ao ato é esperado — a proximidade não é indício."),
            "raises": False,
        })

    if is_no_bid:
        reasons.append({
            "factor": "Contratação sem concorrência plena",
            "value": "inexigibilidade, dispensa ou ratificação",
            "effect": "agrava",
            "detail": "O ato dispensa disputa, o que amplia a margem de escolha do gestor.",
            "raises": True,
        })

    if same_organ:
        reasons.append({
            "factor": "Mesmo órgão",
            "value": "reunião e ato no mesmo órgão",
            "effect": "agrava",
            "detail": "A autoridade que recebeu a reunião pertence ao órgão que publicou o ato.",
            "raises": True,
        })

    if value:
        faixa = ("acima de R$ 50 mi" if value >= config.CRITICAL_VALUE_THRESHOLD
                 else "acima de R$ 1 mi" if value >= config.HIGH_VALUE_THRESHOLD
                 else "abaixo de R$ 1 mi")
        reasons.append({
            "factor": "Valor do ato",
            "value": f"R$ {value:,.2f}".replace(",", "@").replace(".", ",").replace("@", "."),
            "effect": "agrava" if value >= config.HIGH_VALUE_THRESHOLD else "pesa pouco",
            "detail": f"Valor {faixa}.",
            "raises": value >= config.HIGH_VALUE_THRESHOLD,
        })

    reasons.append({
        "factor": "Base do vínculo entidade–ato",
        "value": "CNPJ" if match_basis.startswith("CNPJ") else "razão social / denominação",
        "effect": "modula o score",
        "detail": ("CNPJ é prova documental: o ato cita o cadastro oficial da entidade (empresa, associação, ONG, sindicato ou pessoa jurídica)."
                   if match_basis.startswith("CNPJ")
                   else "Semelhança de razão social ou denominação da entidade é indício e exige conferência "
                        "do ato antes de qualquer conclusão."),
        "raises": match_basis.startswith("CNPJ"),
    })
    return reasons


def _downgrade_steps(lift: float) -> int:
    """Quantos degraus rebaixar, dada a proximidade relativa à rotina.

    Faixas em potências de dez do lift: quanto mais a cadência da própria
    entidade já explica o encontro, menos informação ele carrega.
    """
    if lift >= config.MIN_PROXIMITY_LIFT:
        return 0
    if lift >= 0.5:
        return 1
    if lift >= 0.1:
        return 2
    return 3


def _downgrade(severity: str, weight: float) -> tuple[str, float]:
    order = [("CRITICA", 1.00), ("ALTA", 0.75), ("MEDIA", 0.45), ("BAIXA", 0.20)]
    for index, (name, _) in enumerate(order):
        if name == severity:
            return order[min(index + 1, len(order) - 1)]
    return severity, weight


def organs_match(public_body: str, organ_root: str, organ_hierarchy: str) -> bool:
    """A autoridade que recebeu a reunião pertence ao órgão que publicou o ato?"""
    body = normalize_name(public_body)
    if not body:
        return False
    hay = f"{normalize_name(organ_root)} {normalize_name(organ_hierarchy)}"
    if not hay.strip():
        return False
    return body in hay or hay.startswith(body) or name_matches(public_body, organ_root) >= 0.7


def match_act_to_entity(act: dict, entity: dict) -> tuple[str, float]:
    """Como (e com que confiança) um ato se liga a uma entidade do e-Agendas.

    A entidade precisa ser a **beneficiária** do ato. Sem essa exigência, o
    cruzamento aceitava qualquer aparição do CNPJ no texto — inclusive quando a
    empresa era a CONTRATANTE. Um ato que diz "Contratante: VALE S.A." é a Vale
    pagando a uma universidade, não recebendo benefício do órgão visitado: a
    hipótese de influência se inverte. Também aceitava menção incidental, o que
    ligou a Telefônica a um contrato cuja contratada era a Claro.

    CNPJ da contratada é prova documental; razão social é indício.
    """
    entity_cnpjs = {c for c in (entity.get("cnpjs") or "").split(",") if c}
    if entity.get("cnpj"):
        entity_cnpjs.add(entity["cnpj"])

    entity_name = entity.get("display_name", "")

    # 1. Descarta quando a entidade é quem contrata ou concede.
    contracting = act.get("contracting_name") or ""
    if contracting and name_matches(entity_name, contracting) >= 0.7:
        return "", 0.0

    contracted = act.get("contracted_name") or ""
    primary = act.get("primary_cnpj")

    # 2. Contratada declarada: a entidade tem de ser ela.
    if contracted:
        if primary and primary in entity_cnpjs:
            return "CNPJ", 1.0
        confidence = name_matches(entity_name, contracted)
        if confidence >= 0.7:
            return "RAZAO_SOCIAL", confidence
        # CNPJ da contratada extraído e diferente do da entidade: não é ela.
        if primary:
            return "", 0.0
        return "", 0.0

    # 3. Sem contratada declarada (resoluções, autorizações, registros): o
    #    beneficiário é a empresa nomeada no ato. Aceita-se pelo CNPJ, com
    #    confiança menor, porque o papel não está explícito no texto.
    act_cnpjs = {c for c in act.get("cnpjs") or [] if c}
    if primary:
        act_cnpjs.add(primary)

    if entity_cnpjs & act_cnpjs:
        return "CNPJ_NO_ATO", 0.85

    entity_roots = {c[:8] for c in entity_cnpjs}
    if entity_roots & {c[:8] for c in act_cnpjs}:
        return "CNPJ_RAIZ", 0.75

    return "", 0.0


def build_correlations(act: dict, entity: dict, meetings: list[dict],
                       basis: str, confidence: float) -> list[Correlation]:
    """UMA correlação por (ato, entidade), ancorada na reunião mais próxima.

    A versão que emitia uma correlação por reunião gerava dezenas de milhares
    de alertas: uma empresa com 8.000 reuniões multiplicava cada ato por todas
    as reuniões da janela. O objeto de auditoria é o ato; as reuniões
    anteriores são o contexto que o qualifica, e entram como contagem.
    """
    pub_date = act["pub_date"]
    if pub_date is None:
        return []
    if not is_benefit_act(act.get("act_type", ""), act.get("title", "")):
        return []
    # Repasse entre entes públicos não é lobby privado; o escopo do SARIL é a
    # influência de atores privados sobre a decisão pública.
    if is_public_entity(entity.get("display_name", "")):
        return []

    # A reunião só pode ter influenciado um ato do órgão em que ela ocorreu.
    # Sem essa exigência, uma reunião na ANATEL era correlacionada a contratos
    # de telefonia publicados por batalhões, institutos federais e hospitais
    # universitários — negócio rotineiro da empresa com a administração, não
    # consequência daquele encontro. Eram 79% das correlações.
    prior = []
    for meeting in meetings:
        meeting_date = meeting["meeting_date"]
        if meeting_date is None or meeting_date > pub_date:
            continue  # reunião posterior ao ato não pode tê-lo influenciado
        delta_days = (pub_date - meeting_date).days
        if not (0 <= delta_days <= config.CORRELATION_WINDOW_DAYS):
            continue
        if not organs_match(meeting.get("public_body", ""),
                            act.get("organ_root", ""),
                            act.get("organ_hierarchy", "")):
            continue
        prior.append((delta_days, meeting))

    if not prior:
        return []

    prior.sort(key=lambda item: item[0])
    delta_days, anchor = prior[0]   # a reunião mais próxima, no órgão do ato
    same_organ = True
    lift = proximity_lift(delta_days, len(prior))
    severity, score = classify_severity(
        delta_days, act.get("value"), bool(act.get("is_no_bid")), same_organ, lift
    )
    # A confiança do vínculo modula o score: indício por nome vale menos que
    # prova por CNPJ.
    score = round(score * confidence, 1)

    raw_id = f"{act['dou_id']}|{entity['entity_norm']}"
    return [Correlation(
        correlation_id=hashlib.sha1(raw_id.encode()).hexdigest()[:24],
        dou_id=act["dou_id"],
        entity_norm=entity["entity_norm"],
        entity_name=entity.get("display_name", ""),
        event_id=anchor["event_id"],
        meeting_date=anchor["meeting_date"],
        pub_date=pub_date,
        delta_days=delta_days,
        match_basis=basis,
        match_confidence=round(confidence, 3),
        same_organ=same_organ,
        severity=severity,
        risk_score=score,
        value=act.get("value"),
        authority_name=anchor.get("authority_name", ""),
        lobbyist_name=anchor.get("lobbyist_name", ""),
        public_body=anchor.get("public_body", ""),
        organ_root=act.get("organ_root", ""),
        declared_topic=anchor.get("declared_topic", ""),
        act_type=act.get("act_type", ""),
        link_url=act.get("link_url", ""),
        proximity_lift=lift,
        prior_meetings_count=len(prior),
        distinct_authorities=len({m.get("authority_name") for _, m in prior}),
        distinct_lobbyists=len({m.get("lobbyist_name") for _, m in prior}),
        earliest_meeting_date=prior[-1][1]["meeting_date"],
    )]


