"""Testes da lógica forense do SARIL.

Cobrem os pontos onde a versão anterior errava: parse de data, direção
temporal do Δt, discriminação de razão social e agregação de valores.
Rodar: ./venv/bin/python test_saril.py
"""
import sys
from datetime import date

from saril import config
from saril.correlation import (build_correlations, classify_severity,
                               is_benefit_act, organs_match, proximity_lift)
from saril.dou_parser import extract_contracted, extract_value, is_federal_organ, parse_money
from saril.eagendas import parse_participants
from saril.metrics import is_opaque_topic, shannon_entropy
from saril.normalize import (clean_cnpj, extract_cnpjs, is_generic, name_matches,
                             normalize_name, search_terms)

FAILURES = []


def check(label, got, expected):
    if got != expected:
        FAILURES.append(f"{label}: esperado {expected!r}, obtido {got!r}")


def approx(label, got, expected, tol=0.01):
    if got is None or abs(got - expected) > tol:
        FAILURES.append(f"{label}: esperado ~{expected}, obtido {got!r}")


# ------------------------------------------------ normalização de nomes
check("normaliza sufixo societário", normalize_name("VALE S.A."), "vale")
check("normaliza acento", normalize_name("Telefônica"), "telefonica")
check("remove prefixo Grupo", normalize_name("Grupo CCR"), "ccr")

# O erro clássico do match por prefixo: Vale x Valec.
check("Vale != Valec", name_matches("Vale S.A", "VALEC ENGENHARIA S.A."), 0.0)
check("Vale == Vale", name_matches("Vale S.A", "VALE S.A."), 1.0)
# "Oi" e "OI S.A." são o mesmo nome depois de normalizar, então casam. A
# proteção contra nomes curtos age antes: eles não geram termo de busca no
# DOU, onde "oi" recuperaria ruído puro.
check("nome idêntico casa", name_matches("Oi", "OI S.A."), 1.0)
check("nome curto não vira busca no DOU", search_terms("Oi"), [])
check("sigla curta não vira busca no DOU", search_terms("ONS"), [])
check("nome curto usa forma literal", search_terms("Vale S.A"), ["vale s.a"])
# Contenção parcial com núcleo curto continua barrada.
check("contenção com núcleo curto é barrada",
      name_matches("Oi", "OI TELECOMUNICACOES PARTICIPACOES"), 0.0)
if name_matches("Telefônica", "TELEFONICA BRASIL S.A.") < 0.7:
    FAILURES.append("Telefônica deveria casar com TELEFONICA BRASIL")

check("genérico: traço", is_generic("-"), True)
check("genérico: sigilo", is_generic("Razão social restrita pelo sigilo empresarial"), True)
check("não genérico", is_generic("Petrobras"), False)

# ----------------------------------------------------------------- CNPJ
check("CNPJ válido", clean_cnpj("33.000.167/0001-01"), "33000167000101")
check("CNPJ dígito errado", clean_cnpj("33.000.167/0001-99"), None)
check("CNPJ repetido", clean_cnpj("00.000.000/0000-00"), None)
check("extrai dois CNPJs",
      extract_cnpjs("CNPJ 02.558.157/0001-62 e 33.000.167/0001-01"),
      ["02558157000162", "33000167000101"])

# -------------------------------------------------- parse do e-Agendas
raw = ("Agentes públicos participantes: FULANO DE TAL (CPF: ***.109.883-**) / "
       "DIRETOR / Agência Nacional de Vigilância Sanitária || "
       "Agentes privados participantes: Ana Souza - Diretora representando "
       "TRANSNORDESTINA LOGISTICA S.A (CNPJ: 02.281.836/0001-37) | "
       "Bruno Lima representando Interesse Próprio")
parsed = parse_participants(raw)
check("um agente público", len(parsed.public_agents), 1)
check("cargo do agente público", parsed.public_agents[0].role, "DIRETOR")
check("dois agentes privados", len(parsed.private_agents), 2)
check("entidade representada", parsed.private_agents[0].represented_entity,
      "TRANSNORDESTINA LOGISTICA S.A")
check("CNPJ da entidade", parsed.private_agents[0].represented_cnpj, "02281836000137")
check("interesse próprio sem entidade", parsed.private_agents[1].represented_entity, "")

# ------------------------------------------------------ parse do DOU
approx("valor brasileiro", parse_money("150.000.000,00"), 150_000_000.0)
approx("valor sem centavos", parse_money("4.500"), 4500.0)

texto = ("EXTRATO DE CONTRATO. Valor Unitário: R$ 1.200,00. Valor Mensal: "
         "R$ 4.000,00. Valor Global: R$ 48.000,00. CONTRATADA: ACME "
         "TECNOLOGIA LTDA, CNPJ 02.558.157/0001-62.")
valor, rotulo = extract_value(texto)
approx("prioriza valor global sobre mensal/unitário", valor, 48000.0)
check("contratada extraída", extract_contracted(texto), "ACME TECNOLOGIA LTDA")

check("órgão federal", is_federal_organ("Ministério da Saúde"), True)
check("prefeitura não é federal", is_federal_organ("Prefeituras"), False)
check("estado não é federal", is_federal_organ("Governo do Estado"), False)
check("agência é federal", is_federal_organ("Agência Nacional de Vigilância Sanitária"), True)

# ----------------------------------------------------------- Δt e risco
act = {
    "dou_id": "A1", "pub_date": date(2024, 3, 25), "organ_root": "Ministério da Saúde",
    "organ_hierarchy": "Ministério da Saúde", "act_type": "Extrato de Inexigibilidade",
    "link_url": "http://exemplo", "value": 150_000_000.0, "is_no_bid": True,
    "contracted_name": "ACME", "primary_cnpj": None,
}
entity = {"entity_norm": "acme", "display_name": "ACME", "cnpj": None}
meetings = [
    {"event_id": 1, "meeting_date": date(2024, 3, 20), "public_body": "Ministério da Saúde",
     "declared_topic": "x", "authority_name": "A", "lobbyist_name": "L"},   # 5 dias antes
    {"event_id": 2, "meeting_date": date(2024, 4, 10), "public_body": "Ministério da Saúde",
     "declared_topic": "x", "authority_name": "A", "lobbyist_name": "L"},   # DEPOIS do ato
    {"event_id": 3, "meeting_date": date(2023, 1, 1),  "public_body": "Ministério da Saúde",
     "declared_topic": "x", "authority_name": "A", "lobbyist_name": "L"},   # fora da janela de 60d
]
corrs = build_correlations(act, entity, meetings, "RAZAO_SOCIAL", 1.0)
check("um alerta por ato, não por reunião", len(corrs), 1)
check("ancorado na reunião mais próxima", corrs[0].event_id, 1)
check("Δt correto", corrs[0].delta_days, 5)
check("reunião posterior e fora da janela não contam", corrs[0].prior_meetings_count, 1)
check("mesmo órgão detectado", corrs[0].same_organ, True)

# Reunião em órgão diferente do que publicou o ato não correlaciona: aquele
# encontro não teria como influenciar um ato de outra casa.
outro_orgao = [{"event_id": 7, "meeting_date": date(2024, 3, 20),
                "public_body": "Ministério da Educação", "declared_topic": "x",
                "authority_name": "B", "lobbyist_name": "L"}]
check("órgão diferente não correlaciona",
      build_correlations(act, entity, outro_orgao, "CNPJ", 1.0), [])
check("severidade crítica", corrs[0].severity, "CRITICA")

# Ato que apenas menciona a empresa não gera alerta.
acordao = dict(act, dou_id="A2", act_type="Acórdão", title="Acórdãos de 8 de dezembro")
check("acórdão não gera alerta",
      build_correlations(acordao, entity, meetings, "RAZAO_SOCIAL", 1.0), [])
check("inexigibilidade é ato de benefício",
      is_benefit_act("Extrato de Inexigibilidade de Licitação"), True)
check("licitação não é confundida com citação",
      is_benefit_act("Extrato de Dispensa de Licitação"), True)
check("aviso de licitação não é benefício", is_benefit_act("Aviso de Licitação"), False)

# Contexto agregado: várias reuniões anteriores viram contagem, não alertas.
muitas = [
    {"event_id": i, "meeting_date": date(2024, 3, d), "public_body": "Ministério da Saúde",
     "declared_topic": "x", "authority_name": f"A{i}", "lobbyist_name": f"L{i}"}
    for i, d in enumerate([1, 5, 10, 15, 20], start=10)
]  # todas dentro da janela de 60 dias
agg = build_correlations(act, entity, muitas, "CNPJ", 1.0)
check("cinco reuniões anteriores geram um alerta", len(agg), 1)
check("contagem de reuniões anteriores", agg[0].prior_meetings_count, 5)
check("autoridades distintas contadas", agg[0].distinct_authorities, 5)
check("Δt usa a reunião mais próxima", agg[0].delta_days, 5)

sev_longe, score_longe = classify_severity(55, 1000.0, False, False)
check("Δt de 55 dias é baixa severidade", sev_longe, "BAIXA")
if score_longe >= corrs[0].risk_score:
    FAILURES.append("correlação distante não pode pontuar mais que a próxima")

check("órgãos batem", organs_match("Ministério da Saúde", "Ministério da Saúde", ""), True)
check("órgãos não batem", organs_match("Ministério da Saúde", "Ministério da Defesa", ""), False)

# ---------------------------------------------------------- métricas
check("entropia de órgão único", shannon_entropy([10]), 0.0)
approx("entropia de 4 órgãos uniformes", shannon_entropy([5, 5, 5, 5]), 2.0)
check("pauta vazia é opaca", is_opaque_topic(""), True)
check("pauta curta é opaca", is_opaque_topic("Reunião"), True)
check("pauta detalhada não é opaca",
      is_opaque_topic("Discussão sobre a RDC 786/2023 de rotulagem de medicamentos"), False)

# A janela de correlação é decisão de escopo e precisa continuar explícita.
check("janela de correlação", config.CORRELATION_WINDOW_DAYS, 60)
check("faixa crítica cobre até 7 dias", classify_severity(7, None, False, False, 5.0)[0], "CRITICA")
check("8 dias já não é crítico", classify_severity(8, None, False, False, 5.0)[0], "ALTA")
check("61 dias está fora da janela",
      build_correlations(dict(act, dou_id="A3"), entity,
                         [{"event_id": 9, "meeting_date": date(2024, 1, 1),
                           "public_body": "Ministério da Saúde", "declared_topic": "x",
                           "authority_name": "A", "lobbyist_name": "L"}],
                         "CNPJ", 1.0), [])

# ------------------------------------------------------------- veredito
if FAILURES:
    print(f"\n{len(FAILURES)} FALHA(S):")
    for f in FAILURES:
        print(f"  x {f}")
    sys.exit(1)
print("Todos os testes passaram.")
