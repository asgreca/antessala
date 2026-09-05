"""Módulo de Inteligência Temática, Leitura nas Entrelinhas e Tradução Cívica.

Analisa e decodifica as pautas declaradas no e-Agendas, cruzando palavras-chave
técnicas com a competência oficial da autoridade pública demandada, desvendando
o conteúdo real subjacente e traduzindo seu impacto direto para o cidadão comum.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from .metrics import is_opaque_topic


def extract_topic_intelligence(meetings: list[dict[str, Any]]) -> dict[str, Any]:
    """Extrai inteligência forense e cívica aprofundada a partir da lista de audiências."""
    if not meetings:
        return {
            "thematicClusters": [],
            "betweenTheLines": [],
            "citizenImpacts": [],
            "opaqueAnalysis": {"total": 0, "opaque": 0, "pct": 0.0, "maskedByRole": []},
            "highlightedEntitiesAndAssets": [],
        }

    total_meetings = len(meetings)
    opaque_count = 0
    assets_found = Counter()
    partners_found = Counter()
    critical_events = []
    audit_events = []
    condition_events = []
    legal_events = []
    masked_by_role = []

    # Regex para ativos offshore/infraestrutura (P-53, FPSO, plataformas, etc.)
    asset_pattern = re.compile(
        r"\b(P-\d+|FPSO\s+[A-Za-z0-9\s_-]+|PETROBRAS\s+\d+|SPM-\d+|SEPETIBA|MARIA\s+QUIT[EÉ]RIA|ALEXANDRE\s+DE\s+GUSM[AÃ]O|ALM(?:IRANTE)?\s+TAMANDAR[EÉ]|NITEROI|CIDADE\s+DE\s+[A-Za-z]+)\b",
        re.IGNORECASE,
    )
    # Multinacionais afretadoras e parceiras
    partner_pattern = re.compile(r"\b(YINSON|MODEC|MISC|VALARIS|SBM|TRANSOCEAN|SUBSEA\s+7|TECHNIP)\b", re.IGNORECASE)

    for m in meetings:
        topic = (m.get("declaredTopic") or m.get("declared_topic") or "").strip()
        role = (m.get("authorityRole") or m.get("authority_role") or "").strip().upper()
        auth = m.get("authorityName") or m.get("authority_name") or ""
        body = m.get("publicBodyName") or m.get("public_body") or ""
        dt = (m.get("dateTime") or str(m.get("meeting_date") or ""))[:10]

        is_op = is_opaque_topic(topic)
        if is_op:
            opaque_count += 1
            # Se a pauta é genérica, o cargo da autoridade revela o tema real
            if any(term in role for term in ["INCIDENTE", "FISCALIZA", "SEGURANÇA", "PROCURADOR", "AUDITOR"]):
                masked_by_role.append({
                    "date": dt,
                    "authority": auth,
                    "role": role,
                    "genericTopic": topic,
                    "inferredTopic": f"Atuação de fiscalização/segurança ({role}) ocultada sob pauta genérica"
                })

        # Identifica ativos mencionados
        for match in asset_pattern.finditer(topic):
            assets_found[match.group(0).upper().strip()] += 1

        # Identifica parceiros multinacionais
        for match in partner_pattern.finditer(topic):
            partners_found[match.group(0).upper().strip()] += 1

        # Agrupa eventos críticos
        lower_topic = topic.lower()
        if any(w in lower_topic for w in ["shutdown", "parada emergencial", "esd", "incidente", "acidente", "vazamento"]):
            critical_events.append({"date": dt, "topic": topic, "authority": auth, "role": role})
        elif any(w in lower_topic for w in ["não conformidade", "nao conformidade", "auditoria", "fiscalização", "fiscalizacao", "sgso"]):
            audit_events.append({"date": dt, "topic": topic, "authority": auth, "role": role})
        elif any(w in lower_topic for w in ["condicionante", "plano de ação", "licenciamento", "autorização para operar"]):
            condition_events.append({"date": dt, "topic": topic, "authority": auth, "role": role})
        elif any(w in lower_topic for w in ["gt ", "procurador", "judicial", "termo", "acordo", "bahia terra"]):
            legal_events.append({"date": dt, "topic": topic, "authority": auth, "role": role})

    # Constrói os Núcleos Temáticos Substantivos
    clusters = []
    if critical_events:
        clusters.append({
            "category": "Incidentes Operacionais Críticos & Paradas de Emergência (Emergency Shutdown - ESD)",
            "count": len(critical_events),
            "description": (
                f"Identificadas {len(critical_events)} audiências tratando diretamente de desligamentos repentinos de "
                "plantas de processo (Emergency Shutdown - ESD), eventos associados a falhas operacionais que forçam a interrupção da produção."
            ),
            "samples": [f"[{e['date']}] {e['topic']} (com {e['role']})" for e in critical_events[:4]],
        })

    if audit_events:
        clusters.append({
            "category": "Fiscalização Regulatória & Não Conformidades Técnicas Contestadas",
            "count": len(audit_events),
            "description": (
                f"Registradas {len(audit_events)} audiências envolvendo auditorias de conformidade do Sistema de Gerenciamento de "
                "Segurança Operacional (SGSO), diagnósticos de fiscalização e tratamento de Não Conformidades não consensuadas."
            ),
            "samples": [f"[{e['date']}] {e['topic']} (com {e['role']})" for e in audit_events[:4]],
        })

    if condition_events:
        clusters.append({
            "category": "Cumprimento e Negociação de Condicionantes para Liberação de Plataformas (FPSOs)",
            "count": len(condition_events),
            "description": (
                f"Identificadas {len(condition_events)} audiências direcionadas ao cumprimento e revisão de condicionantes regulatórias e técnicas "
                "impostas para permitir o início ou a continuidade da operação de grandes navios-plataforma (FPSOs)."
            ),
            "samples": [f"[{e['date']}] {e['topic']} (com {e['role']})" for e in condition_events[:4]],
        })

    if partners_found:
        partners_list = ", ".join(f"{k} ({v}x)" for k, v in partners_found.most_common(5))
        clusters.append({
            "category": "Articulação Conjunta com Operadoras e Afretadoras Multinacionais",
            "count": sum(partners_found.values()),
            "description": (
                "Audiências realizadas com a presença conjunta de grandes multinacionais proprietárias e afretadoras de sondas e FPSOs "
                f"({partners_list}), alinhando obrigações contratuais e exigências de conformidade perante a agência reguladora."
            ),
            "samples": [f"Multinacionais identificadas: {partners_list}"],
        })

    if legal_events:
        clusters.append({
            "category": "Mediação Jurídica, Desinvestimentos e Termos Regulatórios de Ajustamento",
            "count": len(legal_events),
            "description": (
                f"Registradas {len(legal_events)} reuniões com instâncias jurídicas (Procuradoria-Geral da agência), envolvendo ativos estratégicos, "
                "revisão de planos de desinvestimento e termos regulatórios de conduta."
            ),
            "samples": [f"[{e['date']}] {e['topic']} (com {e['role']})" for e in legal_events[:3]],
        })

    # Leitura nas Entrelinhas (Forense e Regulatória)
    between_the_lines = []
    if critical_events or audit_events:
        between_the_lines.append(
            "**Controle de Incidentes e Mitigação de Sanções:** A alta frequência de despachos com coordenadores de incidentes "
            "e segurança operacional indica que o canal institucional é acionado para gerenciar crises técnicas pós-paradas de emergência, "
            "buscar desinterdição de sistemas produtivos e negociar termos de ajuste de conduta para evitar autos de infração ou paralisações "
            "definitivas de unidades offshore."
        )

    if condition_events:
        between_the_lines.append(
            "**Cronograma de Entrada em Produção de Novos Ativos:** As tratativas de condicionantes (como C3, C4, C9, C10 em FPSOs) revelam "
            "uma corrida contra o tempo para satisfazer as exigências de segurança antes das datas contratuais de primeiro óleo (first oil), "
            "onde cada semana de atraso representa milhões de dólares em custos ociosos de afretamento."
        )

    if masked_by_role:
        between_the_lines.append(
            f"**Camuflagem de Pautas Críticas pelo Rótulo Institucional:** Em {len(masked_by_role)} ocasiões, o registro oficial no e-Agendas utilizou "
            "a descrição padronizada 'Reunião com Representantes', mas a autoridade demandada era o Coordenador-Geral de Fiscalização ou de Incidentes. "
            "Isso mascara perante a sociedade civil o verdadeiro objeto fiscalizatório da audiência, contornando a transparência ativa exigida pelo Art. 11 do Decreto nº 10.889/2021."
        )

    # Tradução Cívica: O Que Está em Jogo para o Cidadão
    citizen_impacts = []
    if critical_events or audit_events:
        citizen_impacts.append(
            "🌊 **Prevenção de Desastres Ambientais e Proteção da Vida:** Plataformas offshore operam sob pressões extremas. Paradas de emergência e "
            "não conformidades não corrigidas podem resultar em vazamentos de óleo na costa brasileira, contaminando praias e áreas de preservação, "
            "destruindo o sustento de comunidades pesqueiras tradicionais e colocando em risco a vida de centenas de trabalhadores embarcados."
        )

    if condition_events or assets_found:
        top_assets = ", ".join(k for k, _ in assets_found.most_common(4)) or "unidades de grande porte"
        citizen_impacts.append(
            f"💰 **Arrecadação de Royalties e Recursos para Saúde e Educação:** O ritmo de liberação de FPSOs ({top_assets}) afeta diretamente a "
            "produção nacional de óleo e gás e, consequentemente, a arrecadação de bilhões de reais em Participações Especiais e Royalties. Esses recursos "
            "compõem o orçamento de dezenas de municípios costeiros e alimentam o Fundo Social da União, financiando hospitais e escolas públicas."
        )

    citizen_impacts.append(
        "⚖️ **Defesa da Legalidade e Direito à Informação Pública:** O cidadão e a imprensa têm o direito constitucional de saber com precisão o que é "
        "tratado a portas fechadas com os superintendentes do Estado. Pautas que ocultam auditorias e incidentes sob rótulos vagos fragilizam o controle social "
        "e impedem a fiscalização da estrita aplicação das leis ambientais e trabalhistas do país."
    )

    return {
        "thematicClusters": clusters,
        "betweenTheLines": between_the_lines,
        "citizenImpacts": citizen_impacts,
        "opaqueAnalysis": {
            "total": total_meetings,
            "opaque": opaque_count,
            "pct": round(opaque_count / total_meetings * 100, 1) if total_meetings else 0.0,
            "maskedByRoleCount": len(masked_by_role),
            "maskedByRole": masked_by_role[:5],
        },
        "highlightedAssets": [k for k, _ in assets_found.most_common(8)],
        "highlightedPartners": [k for k, _ in partners_found.most_common(5)],
    }
