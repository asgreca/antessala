"""Servidor de API RESTful do Antessala (FastAPI).

FUNÇÃO NO PROJETO:
- Expõe todos os endpoints RESTful que alimentam o painel web (React / Vite).
- Disponibiliza dados de auditoria em tempo real, incluindo ranking de lobistas, fichas de ministérios, dossiês de autoridades, matrizes de correlação e gráficos de rede de influência.
- Garante integridade e auditoria fornecendo documentação Swagger/OpenAPI e monitoramento de saúde do pipeline (`/api/v1/sync/status`).

COMO FUNCIONA:
1. Conecta-se de forma otimizada ao snapshot atômico DuckDB (`data/saril_serving.duckdb`) em modo somente leitura.
2. Processa parâmetros de consulta (filtros por data, órgão, severidade, busca textual, paginação).
3. Calcula métricas em tempo real (Índice de Acesso Ilegítimo - IAI, Entropia de Trânsito - ETT, estatísticas de transparência de pauta).
4. Retorna respostas estruturadas em JSON estritamente baseadas em dados reais auditáveis.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime
from typing import Any, Optional

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config, store
from .metrics import (SEVERITY_PT_TO_EN, TIER_LABELS, authority_tier,
                      authority_tier_sql, iai_breakdown, iai_score, is_minister_or_president,
                      is_opaque_topic, shannon_entropy)
from .correlation import (build_correlations, classify_severity,
                          match_act_to_entity, proximity_lift,
                          severity_reasons)
from . import llm
from .normalize import (format_cnpj, is_role_description, normalize_name,
                        starts_with_role)
from .topics import classify as classify_topic
from .topic_intelligence import extract_topic_intelligence

app = FastAPI(
    title="Antessala — Plataforma de Inteligência Cívica e Auditoria de Relações Público-Privadas",
    description=(
        "Auditoria contínua do lobby federal por cruzamento e-Agendas x DOU. "
        "Todos os dados são reais: e-Agendas/CGU e Imprensa Nacional."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# Fontes ainda não ingeridas. Declaradas explicitamente para que a interface
# possa dizer "não disponível" em vez de exibir um vazio ambíguo.
UNAVAILABLE_SOURCES = {}


def db() -> duckdb.DuckDBPyConnection:
    try:
        return store.serving_connection()
    except store.SnapshotUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:                                   # noqa: BLE001
        raise HTTPException(503, f"Base indisponível: {exc}") from exc


def rows(conn, sql: str, params: list | None = None) -> list[dict]:
    cursor = conn.execute(sql, params or [])
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, r)) for r in cursor.fetchall()]


def one(conn, sql: str, params: list | None = None) -> dict | None:
    result = rows(conn, sql, params)
    return result[0] if result else None


def iso(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value or "")


def stable_int_id(text: str) -> int:
    return int(hashlib.sha1(str(text).encode()).hexdigest()[:12], 16)


def person_id(name: str) -> str:
    return hashlib.sha1(str(name).strip().lower().encode()).hexdigest()[:16]


# ------------------------------------------------------------------ meta
@app.get("/api/v1/health")
def health():
    try:
        conn = db()
    except HTTPException as exc:
        return {"status": "degraded", "database": exc.detail}
    try:
        counts = {
            table: conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in ("meetings", "entities", "dou_acts", "correlations")
        }
        last = one(conn, "SELECT stage, rows, started_at FROM ingest_log "
                         "ORDER BY started_at DESC LIMIT 1")
        return {
            "status": "ok",
            "counts": counts,
            "last_ingestion": last,
            "sources": {
                "e-Agendas/CGU": "ingerido (parquet consolidado 2023-2026)",
                "DOU/Imprensa Nacional": "ingestão dirigida por entidade",
                **{k: f"NÃO DISPONÍVEL — {v}" for k, v in UNAVAILABLE_SOURCES.items()},
            },
        }
    finally:
        conn.close()


# ------------------------------------------------------------- sync status
@app.get("/api/v1/sync/status")
def sync_status():
    """Status da última sincronização incremental do e-Agendas (sync-cgu).

    Retorna:
        lastSyncAt: ISO 8601 da última execução ou null.
        totalMeetings: Total de audiências no banco de dados.
        lastAddedRows: Quantidade de linhas inseridas na última execução de sync-cgu.
        status: 'ok' ou 'no_data'.
        nextScheduledHint: Periodicidade recomendada para re-execução.
        recentHistory: Últimas 10 execuções de sync-cgu (timestamp, rows).
    """
    import json as _json
    from pathlib import Path as _Path

    # Estado persistido em data/cgu_sync_state.json
    sync_state: dict = {}
    state_file: _Path = config.CGU_SYNC_STATE_FILE
    if state_file.exists():
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                sync_state = _json.load(f)
        except Exception:
            sync_state = {}

    last_sync_at = sync_state.get("last_sync")
    history_raw = sync_state.get("history", [])
    sync_events = [h for h in history_raw if h.get("stage") == "sync-cgu"]
    last_added_rows = sync_events[-1]["rows_added"] if sync_events else 0
    recent_history = [
        {
            "timestamp": h.get("timestamp"),
            "filesCount": h.get("files_count", 0),
            "rowsAdded": h.get("rows_added", 0),
            "files": h.get("files", []),
        }
        for h in sync_events[-10:]
    ]

    # Total de meetings no banco
    total_meetings = 0
    try:
        conn = db()
        try:
            total_meetings = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]
        finally:
            conn.close()
    except Exception:
        pass

    return {
        "status": "ok" if last_sync_at else "no_data",
        "lastSyncAt": last_sync_at,
        "totalMeetings": total_meetings,
        "lastAddedRows": last_added_rows,
        "nextScheduledHint": "Recomenda-se execução diária: 0 6 * * *",
        "recentHistory": recent_history,
    }


@app.get("/api/v1/sync/authorities/status")
def sync_authorities_status():
    """Retorna estatísticas e cobertura do catálogo de retratos de autoridades."""
    from saril.authority_sync import load_photo_catalog
    catalog = load_photo_catalog()
    total = len(catalog)
    with_photo = sum(1 for v in catalog.values() if v.get("photoUrl"))
    return {
        "status": "ok",
        "totalCatalogEntries": total,
        "totalWithPhoto": with_photo,
        "coveragePct": round((with_photo / total * 100), 1) if total > 0 else 0,
    }


@app.post("/api/v1/sync/authorities")
def trigger_sync_authorities(min_meetings: int = 5, max_downloads: int = 20):
    """Dispara a sincronização automática de retratos oficiais de autoridades."""
    from saril.authority_sync import sync_authority_photos
    res = sync_authority_photos(min_meetings=min_meetings, max_new_downloads=max_downloads)
    return res


# ------------------------------------------------------------- dashboard
def _llm_outputs(conn, task: str, ref_ids: list[str]) -> dict[str, dict]:
    """Saídas do LLM para um conjunto de referências, já decodificadas.

    Devolve dicionário vazio quando a leitura assistida ainda não rodou — a
    interface precisa funcionar sem ela.
    """
    ids = [r for r in dict.fromkeys(ref_ids) if r]
    if not ids:
        return {}
    result: dict[str, dict] = {}
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        placeholders = ",".join("?" * len(chunk))
        # Só a versão de prompt em vigor. Sem este filtro, a interface
        # continuaria exibindo julgamentos de um prompt já medido como ruim —
        # a v1 tinha precisão 0,0 na classe "mesma matéria".
        for row in rows(conn, f"""
            SELECT ref_id, output_json, model, prompt_version
            FROM llm_outputs
            WHERE task = ? AND ok AND prompt_version = ?
              AND ref_id IN ({placeholders})
        """, [task, llm.prompt_version(task)] + chunk):
            try:
                parsed = json.loads(row["output_json"])
            except (json.JSONDecodeError, TypeError):
                continue
            parsed["_model"] = row["model"]
            parsed["_promptVersion"] = row["prompt_version"]
            result[row["ref_id"]] = parsed
    return result


def _act_reading(summary: dict | None, relation: dict | None) -> dict | None:
    """Bloco de leitura assistida exibido junto ao ato, com procedência."""
    if not summary and not relation:
        return None
    source = summary or relation or {}
    block: dict = {
        "generatedBy": source.get("_model", ""),
        "promptVersion": source.get("_promptVersion", ""),
        "disclaimer": ("Leitura automatizada do texto do ato. Classifica e resume; "
                       "não avalia legalidade nem influência."),
    }
    if summary:
        block["granted"] = summary.get("concedido", "")
        block["beneficiary"] = summary.get("beneficiario", "")
        block["object"] = summary.get("objeto", "")
        block["declaredValue"] = summary.get("valor", "")
        block["legalBasis"] = summary.get("fundamento", "")
    if relation:
        block["relation"] = relation.get("relacao", "")
        block["relationConfidence"] = relation.get("confianca", 0.0)
        block["relationRationale"] = relation.get("justificativa", "")
        block["relationExcerpt"] = relation.get("trecho_do_ato", "")
        # Quando a trava determinística sobrescreveu o modelo, isso aparece.
        block["overridden"] = bool(relation.get("sobrescrito"))
        if relation.get("sobrescrito"):
            block["modelSaid"] = relation.get("resposta_do_modelo", "")
    return block


@app.get("/api/v1/dashboard/kpis")
def dashboard_kpis():
    conn = db()
    try:
        severity = {
            r["severity"]: r["n"] for r in
            rows(conn, "SELECT severity, count(*) AS n FROM correlations GROUP BY severity")
        }
        high_entropy = one(conn, """
            SELECT count(*) AS n FROM (
                SELECT lobbyist_name FROM meetings
                GROUP BY lobbyist_name
                HAVING count(DISTINCT public_body) >= 5 AND count(*) >= 10
            )
        """)
        opaque = one(conn, """
            SELECT count(*) AS n FROM meetings
            WHERE declared_topic IS NULL OR length(trim(declared_topic)) < 25
        """)
        correlated_acts = one(conn, "SELECT count(DISTINCT dou_id) AS n FROM correlations")
        return {
            "criticalAlertsCount": severity.get("CRITICA", 0),
            "highAlertsCount": severity.get("ALTA", 0),
            "mediumAlertsCount": severity.get("MEDIA", 0),
            "lowAlertsCount": severity.get("BAIXA", 0),
            "highEntropyLobbyistsCount": high_entropy["n"] if high_entropy else 0,
            "opaqueMeetingsCount": opaque["n"] if opaque else 0,
            "correlatedDouActsCount": correlated_acts["n"] if correlated_acts else 0,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------- alertas
class AlertStatusUpdate(BaseModel):
    status: str
    justification: Optional[str] = None


def _alert_from_correlation(row: dict) -> dict:
    severity_en = SEVERITY_PT_TO_EN.get(row["severity"], "LOW")
    flags = []
    if row.get("delta_days") is not None and row["delta_days"] <= 30:
        flags.append(f"Ato publicado {row['delta_days']} dias após a reunião")
    if row.get("same_organ"):
        flags.append("Ato publicado pelo mesmo órgão que recebeu a reunião")
    if row.get("value") and row["value"] >= config.HIGH_VALUE_THRESHOLD:
        flags.append(f"Alto valor: R$ {row['value']:,.2f}".replace(",", "."))
    if row.get("match_basis") == "CNPJ":
        flags.append("Vínculo confirmado por CNPJ")
    lift = row.get("proximity_lift") or 0.0
    if lift >= 2.0:
        flags.append(
            f"Proximidade {lift:.1f}x acima da cadência habitual de reuniões da entidade")
    elif lift < 1.0 and row.get("prior_meetings_count", 0) > 50:
        flags.append(
            f"Proximidade compatível com a rotina da entidade "
            f"({row.get('prior_meetings_count')} reuniões na janela) — sinal fraco")
    if is_opaque_topic(row.get("declared_topic")):
        flags.append("Pauta declarada opaca ou genérica")

    return {
        "id": stable_int_id(row["correlation_id"]),
        "title": f"{row.get('act_type') or 'Ato'} — {row.get('entity_name') or ''}".strip(" —"),
        "description": (
            f"{row.get('entity_name')} reuniu-se com {row.get('authority_name') or 'autoridade'} "
            f"em {iso(row.get('meeting_date'))} ({row.get('public_body')}). "
            f"O ato foi publicado em {iso(row.get('pub_date'))} por {row.get('organ_root')}, "
            f"Δt = {row.get('delta_days')} dias."
        ),
        "severity": severity_en,
        "status": "ACTIVE",
        "iaiScore": row.get("risk_score") or 0.0,
        "visitorName": row.get("lobbyist_name") or "",
        "authorityName": row.get("authority_name") or "",
        "visitorId": person_id(row.get("lobbyist_name") or ""),
        "organizationName": row.get("entity_name") or "",
        "publicBodyAcronym": (row.get("public_body") or "")[:60],
        "redFlags": flags,
        "justification": None,
        "createdAt": iso(row.get("pub_date")),
        "douUrl": row.get("link_url"),
        "correlationId": row["correlation_id"],
        "matchBasis": row.get("match_basis"),
        "proximityLift": row.get("proximity_lift"),
        "priorMeetingsCount": row.get("prior_meetings_count"),
        "distinctAuthorities": row.get("distinct_authorities"),
        "monetaryValue": row.get("value") or 0.0,
    }


@app.get("/api/v1/alerts")
def list_alerts(page: int = 0, size: int = 20, severity: Optional[str] = None):
    conn = db()
    try:
        where, params = "WHERE 1=1", []
        if severity and severity.upper() not in ("TODOS", "ALL"):
            pt = {v: k for k, v in SEVERITY_PT_TO_EN.items()}.get(severity.upper())
            if pt:
                where += " AND severity = ?"
                params.append(pt)

        total = one(conn, f"SELECT count(*) AS n FROM correlations {where}", params)["n"]
        data = rows(conn, f"""
            SELECT * FROM correlations {where}
            ORDER BY risk_score DESC, delta_days ASC
            LIMIT ? OFFSET ?
        """, params + [size, max(page, 0) * size])

        return {
            "content": [_alert_from_correlation(r) for r in data],
            "totalElements": total,
            "totalPages": (total + size - 1) // size if size else 0,
            "size": size,
            "number": page,
        }
    finally:
        conn.close()


@app.patch("/api/v1/alerts/{alert_id}/status")
def update_alert_status(alert_id: int, payload: AlertStatusUpdate):
    # A triagem do auditor é estado de trabalho, não dado de origem. Enquanto
    # não houver tabela de workflow persistida, a mudança não é aceita em
    # silêncio: seria perdida no próximo ciclo de ingestão.
    raise HTTPException(
        501,
        "Triagem de alertas ainda não persistida. O SARIL 2.0 serve apenas "
        "evidência derivada das fontes oficiais; o fluxo de tratamento do "
        "auditor será uma tabela própria.",
    )


# ------------------------------------------------- correlações temporais
@app.get("/api/v1/analytics/dou-temporal-correlation")
def dou_temporal_correlation(page: int = 1, size: int = 20, min_confidence: float = 0.0):
    conn = db()
    try:
        total = one(conn, "SELECT count(*) AS n FROM correlations WHERE match_confidence >= ?",
                    [min_confidence])["n"]
        data = rows(conn, """
            SELECT c.*, a.title AS dou_title
            FROM correlations c LEFT JOIN dou_acts a ON a.dou_id = c.dou_id
            WHERE c.match_confidence >= ?
            ORDER BY c.risk_score DESC, c.delta_days ASC
            LIMIT ? OFFSET ?
        """, [min_confidence, size, max(page - 1, 0) * size])

        records = [{
            "id": r["correlation_id"],
            "event_id": r["event_id"],
            "visit_date": iso(r["meeting_date"]),
            "dou_publication_date": iso(r["pub_date"]),
            "days_elapsed_lag": r["delta_days"],
            "visitor_name": r["lobbyist_name"],
            "authority_name": r["authority_name"],
            "public_body": r["public_body"],
            "declared_topic": r["declared_topic"],
            "dou_document_type": r["act_type"],
            "dou_title_act": r.get("dou_title") or "",
            "dou_monetary_value": r["value"] or 0.0,
            "correlation_confidence_score": r["match_confidence"],
            "causality_assessment": _causality_text(r),
            "dou_url": r["link_url"],
            "match_basis": r["match_basis"],
            "entity_name": r["entity_name"],
            "severity": SEVERITY_PT_TO_EN.get(r["severity"], "LOW"),
            "proximity_lift": r["proximity_lift"],
            "prior_meetings_count": r["prior_meetings_count"],
            "distinct_authorities": r["distinct_authorities"],
            "earliest_meeting_date": iso(r["earliest_meeting_date"]),
        } for r in data]

        return {
            "totalElements": total,
            "totalPages": (total + size - 1) // size if size else 0,
            "page": page,
            "records": records,
        }
    finally:
        conn.close()


def _causality_text(row: dict) -> str:
    """Leitura da correlação — sempre explicitando que não é prova de causa."""
    basis = ("vínculo confirmado por CNPJ" if row["match_basis"] == "CNPJ"
             else f"vínculo por razão social (confiança {row['match_confidence']:.0%})")
    organ = ("mesmo órgão da reunião" if row["same_organ"]
             else "órgão distinto do que recebeu a reunião")
    lift = row.get("proximity_lift") or 0.0
    if lift >= 2.0:
        cadence = (f"proximidade {lift:.1f}x maior que a cadência própria da entidade "
                   f"({row.get('prior_meetings_count')} reuniões na janela)")
    elif lift >= 1.0:
        cadence = "proximidade um pouco acima da cadência própria da entidade"
    else:
        cadence = (f"proximidade explicada pela cadência da entidade "
                   f"({row.get('prior_meetings_count')} reuniões na janela) — sinal fraco")
    return (
        f"Reunião {row['delta_days']} dias antes da publicação; {basis}; {organ}; "
        f"{cadence}. Correlação temporal não estabelece causalidade — requer apuração."
    )


@app.get("/api/v1/analytics/dou-lag-stats")
def dou_lag_stats():
    conn = db()
    try:
        summary = one(conn, """
            SELECT count(*) AS total, avg(delta_days) AS avg_lag
            FROM correlations
        """) or {}
        # Valor não pode ser somado por correlação: o mesmo ato aparece em
        # várias reuniões e inflaria o total. Soma-se por ato distinto.
        value = one(conn, """
            SELECT coalesce(sum(value), 0) AS total_value FROM (
                SELECT DISTINCT dou_id, value FROM correlations WHERE value IS NOT NULL
            )
        """) or {}
        bands = rows(conn, """
            SELECT CASE
                WHEN delta_days <= 7   THEN '0-7 dias (Imediato / Urgente)'
                WHEN delta_days <= 30  THEN '8-30 dias (Curto Prazo)'
                WHEN delta_days <= 90  THEN '31-90 dias (Médio Prazo)'
                WHEN delta_days <= 180 THEN '91-180 dias (Longo Prazo)'
                ELSE '181-365 dias (Distante)'
            END AS band, count(*) AS n
            FROM correlations GROUP BY band ORDER BY min(delta_days)
        """)
        return {
            "total_correlations_found": summary.get("total", 0) or 0,
            "avg_days_lag": round(summary.get("avg_lag") or 0.0, 1),
            "total_monetary_value_correlated": value.get("total_value", 0.0) or 0.0,
            "lag_distribution": {b["band"]: b["n"] for b in bands},
            "causality_insight": (
                "Distribuição real do intervalo entre a reunião registrada no "
                "e-Agendas e a publicação do ato no DOU. Valores somados por ato "
                "distinto, não por correlação."
            ),
        }
    finally:
        conn.close()


# --------------------------------------------------------- transparência
@app.get("/api/v1/analytics/transparency-index")
def transparency_index(limit: int = 50):
    conn = db()
    try:
        data = rows(conn, """
            SELECT public_body,
                   count(*) AS total_external_meetings,
                   sum(CASE WHEN declared_topic IS NULL
                             OR length(trim(declared_topic)) < 25 THEN 1 ELSE 0 END) AS opaque
            FROM meetings
            WHERE public_body IS NOT NULL AND length(public_body) > 2
            GROUP BY public_body
            HAVING count(*) >= 30
            ORDER BY total_external_meetings DESC
            LIMIT ?
        """, [limit])

        result = []
        for row in data:
            total = row["total_external_meetings"]
            opaque = row["opaque"] or 0
            clear = total - opaque
            pct = round(clear / total * 100, 1) if total else 0.0
            result.append({
                "public_body": row["public_body"],
                "total_external_meetings": total,
                "clear_meetings": clear,
                "opaque_meetings": opaque,
                "transparency_index_pct": pct,
                "citizen_clarity_rating": _clarity_rating(pct),
            })
        return result
    finally:
        conn.close()


def _clarity_rating(pct: float) -> str:
    if pct >= 85: return "EXCELENTE"
    if pct >= 70: return "BOM"
    if pct >= 50: return "REGULAR"
    if pct >= 30: return "RUIM"
    return "CRÍTICO"


@app.get("/api/v1/analytics/treemap-topics")
def treemap_topics(limit_bodies: int = 25):
    conn = db()
    try:
        bodies = rows(conn, """
            SELECT public_body, count(*) AS total,
                   sum(CASE WHEN declared_topic IS NULL
                             OR length(trim(declared_topic)) < 25 THEN 1 ELSE 0 END) AS opaque
            FROM meetings
            WHERE public_body IS NOT NULL AND length(public_body) > 2
            GROUP BY public_body ORDER BY total DESC LIMIT ?
        """, [limit_bodies])

        children = []
        for body in bodies:
            entities = rows(conn, """
                SELECT entity_name, count(*) AS n FROM meetings
                WHERE public_body = ? AND entity_name IS NOT NULL
                GROUP BY entity_name ORDER BY n DESC LIMIT 12
            """, [body["public_body"]])
            total = body["total"]
            pct = round((total - (body["opaque"] or 0)) / total * 100, 1) if total else 0.0
            children.append({
                "name": body["public_body"],
                "total_meetings": total,
                "transparency_index_pct": pct,
                "children": [{"name": e["entity_name"], "value": e["n"]} for e in entities],
            })
        return {"name": "Governo Federal", "children": children}
    finally:
        conn.close()


# -------------------------------------------------------------- ranking
def _lobbyist_rows(
    conn,
    limit: int = 50,
    min_entropy: float = 0.0,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    public_body: Optional[str] = None,
    entity_name: Optional[str] = None,
    lobbyist_name: Optional[str] = None,
    authority_name: Optional[str] = None,
) -> list[dict]:
    conditions = ["lobbyist_name IS NOT NULL", "length(trim(lobbyist_name)) > 4"]
    params = []

    has_filter = bool(
        start_date or end_date or 
        (public_body and public_body.strip() not in ('ALL', 'TODOS')) or 
        entity_name or lobbyist_name or authority_name
    )

    if start_date:
        conditions.append("meeting_date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("meeting_date <= ?")
        params.append(end_date)
    if public_body and public_body.strip() and public_body.strip() not in ('ALL', 'TODOS'):
        conditions.append("(public_body = ? OR lower(public_body) LIKE ?)")
        params.extend([public_body.strip(), f"%{public_body.strip().lower()}%"])
    if entity_name and entity_name.strip():
        tokens = _normalize_search_tokens(entity_name)
        if tokens:
            ent_filter = " AND ".join(["strip_accents(lower(entity_name)) LIKE ?"] * len(tokens))
            conditions.append(f"({ent_filter})")
            params.extend([f"%{t}%" for t in tokens])
    if lobbyist_name and lobbyist_name.strip():
        tokens = _normalize_search_tokens(lobbyist_name)
        if tokens:
            lobb_filter = " AND ".join(["strip_accents(lower(lobbyist_name)) LIKE ?"] * len(tokens))
            conditions.append(f"({lobb_filter})")
            params.extend([f"%{t}%" for t in tokens])
    if authority_name and authority_name.strip():
        tokens = _normalize_search_tokens(authority_name)
        if tokens:
            auth_filter = " AND ".join(["strip_accents(lower(authority_name)) LIKE ?"] * len(tokens))
            conditions.append(f"({auth_filter})")
            params.extend([f"%{t}%" for t in tokens])

    where_clause = " AND ".join(conditions)
    min_meetings = 1 if has_filter else 5

    base = rows(conn, f"""
        SELECT lobbyist_name,
               max(lobbyist_masked_cpf) AS masked_cpf,
               count(*) AS meetings_count,
               count(DISTINCT public_body) AS bodies_count,
               count(DISTINCT authority_name) AS authorities_count,
               count(DISTINCT entity_norm) AS entities_count
        FROM meetings
        WHERE {where_clause}
        GROUP BY lobbyist_name
        HAVING count(*) >= {min_meetings}
        ORDER BY meetings_count DESC
        LIMIT 400
    """, params)
    if not base:
        return []

    names = [r["lobbyist_name"] for r in base]
    placeholders = ",".join("?" * len(names))
    dist = rows(conn, f"""
        SELECT lobbyist_name, public_body, count(*) AS n FROM meetings
        WHERE lobbyist_name IN ({placeholders}) GROUP BY lobbyist_name, public_body
    """, names)
    by_name: dict[str, list[int]] = {}
    for row in dist:
        by_name.setdefault(row["lobbyist_name"], []).append(row["n"])

    corr = rows(conn, f"""
        SELECT lobbyist_name, count(*) AS n,
               sum(CASE WHEN severity = 'CRITICA' THEN 1 ELSE 0 END) AS critical,
               coalesce(sum(value), 0) AS total_value
        FROM correlations WHERE lobbyist_name IN ({placeholders})
        GROUP BY lobbyist_name
    """, names)
    corr_by_name = {c["lobbyist_name"]: c for c in corr}

    companies = rows(conn, f"""
        SELECT lobbyist_name, entity_name, count(*) AS n FROM meetings
        WHERE lobbyist_name IN ({placeholders}) AND entity_name IS NOT NULL
        GROUP BY lobbyist_name, entity_name
    """, names)
    comp_by_name: dict[str, list[tuple[str, int]]] = {}
    for row in companies:
        comp_by_name.setdefault(row["lobbyist_name"], []).append(
            (row["entity_name"], row["n"]))

    result = []
    for row in base:
        name = row["lobbyist_name"]
        masked = (row.get("masked_cpf") or "").strip()
        entropy = shannon_entropy(by_name.get(name, []))
        if entropy < min_entropy:
            continue
        c = corr_by_name.get(name, {})
        score = iai_score(
            meetings=row["meetings_count"], distinct_bodies=row["bodies_count"],
            distinct_authorities=row["authorities_count"], entropy=entropy,
            correlations=c.get("n", 0) or 0,
            correlated_value=c.get("total_value", 0.0) or 0.0,
            critical_correlations=c.get("critical", 0) or 0,
        )
        reps = sorted(comp_by_name.get(name, []), key=lambda x: -x[1])[:5]
        result.append({
            "id": person_id(name),
            "name": name,
            "maskedCpf": masked or "CPF não publicado nestes registros",
            "entropyScore": entropy,
            "iaiScore": score,
            "meetingsCount": row["meetings_count"],
            "distinctMinistriesCount": row["bodies_count"],
            "distinctOrgansCount": row["bodies_count"],
            "distinctEntitiesCount": row["entities_count"],
            "representedCompanies": [c[0] for c in reps],
            "correlationsCount": c.get("n", 0) or 0,
            "isExServant": False,
            "isTseDonor": False,
            "dataGaps": list(UNAVAILABLE_SOURCES.values()),
        })

    result.sort(key=lambda r: (-r["iaiScore"], -r["meetingsCount"]))
    return result[:limit]


@app.get("/api/v1/analytics/ranking")
def analytics_ranking(limit: int = 50):
    conn = db()
    try:
        return _lobbyist_rows(conn, limit)
    finally:
        conn.close()


@app.get("/api/v1/actors/ranking")
def actors_ranking(
    page: int = 0,
    size: int = 50,
    minEntropy: float = 0.0,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    public_body: Optional[str] = None,
    entity_name: Optional[str] = None,
    lobbyist_name: Optional[str] = None,
    authority_name: Optional[str] = None,
):
    conn = db()
    try:
        data = _lobbyist_rows(
            conn,
            limit=500,
            min_entropy=minEntropy,
            start_date=start_date,
            end_date=end_date,
            public_body=public_body,
            entity_name=entity_name,
            lobbyist_name=lobbyist_name,
            authority_name=authority_name,
        )
        start = page * size
        return {
            "content": data[start:start + size],
            "totalElements": len(data),
            "totalPages": (len(data) + size - 1) // size if size else 0,
            "size": size,
            "number": page,
        }
    finally:
        conn.close()


@app.get("/api/v1/ranking/filter-options")
def ranking_filter_options(public_body: Optional[str] = None):
    conn = db()
    try:
        min_max = conn.execute("SELECT min(meeting_date), max(meeting_date) FROM meetings").fetchone()
        
        ministries = [r[0] for r in conn.execute("""
            SELECT public_body FROM meetings 
            WHERE public_body IS NOT NULL 
            GROUP BY public_body 
            ORDER BY count(*) DESC 
            LIMIT 70
        """).fetchall() if r[0]]
        
        where_pb = "WHERE entity_name IS NOT NULL AND length(trim(entity_name)) > 2"
        params_c = []
        if public_body and public_body.strip() not in ('ALL', 'TODOS'):
            where_pb += " AND (public_body = ? OR lower(public_body) LIKE ?)"
            params_c.extend([public_body.strip(), f"%{public_body.strip().lower()}%"])
            
        top_companies = [r[0] for r in conn.execute(f"""
            SELECT entity_name FROM meetings 
            {where_pb}
            GROUP BY entity_name 
            ORDER BY count(*) DESC 
            LIMIT 60
        """, params_c).fetchall() if r[0]]

        where_auth = "WHERE authority_name IS NOT NULL AND length(trim(authority_name)) > 2"
        params_a = []
        if public_body and public_body.strip() not in ('ALL', 'TODOS'):
            where_auth += " AND (public_body = ? OR lower(public_body) LIKE ?)"
            params_a.extend([public_body.strip(), f"%{public_body.strip().lower()}%"])

        top_authorities = [r[0] for r in conn.execute(f"""
            SELECT authority_name FROM meetings 
            {where_auth}
            GROUP BY authority_name 
            ORDER BY count(*) DESC 
            LIMIT 60
        """, params_a).fetchall() if r[0]]

        where_lob = "WHERE lobbyist_name IS NOT NULL AND length(trim(lobbyist_name)) > 4"
        params_l = []
        if public_body and public_body.strip() not in ('ALL', 'TODOS'):
            where_lob += " AND (public_body = ? OR lower(public_body) LIKE ?)"
            params_l.extend([public_body.strip(), f"%{public_body.strip().lower()}%"])

        top_visitors = [r[0] for r in conn.execute(f"""
            SELECT lobbyist_name FROM meetings 
            {where_lob}
            GROUP BY lobbyist_name 
            ORDER BY count(*) DESC 
            LIMIT 60
        """, params_l).fetchall() if r[0]]

        return {
            "ministries": sorted(ministries),
            "topCompanies": sorted(top_companies),
            "topAuthorities": sorted(top_authorities),
            "topVisitors": sorted(top_visitors),
            "dateRange": {
                "minDate": str(min_max[0]) if min_max and min_max[0] else "2023-01-01",
                "maxDate": str(min_max[1]) if min_max and min_max[1] else "2026-07-31",
            }
        }
    finally:
        conn.close()


# --------------------------------------------------------------- dossiê
@app.get("/api/v1/dossier/person/{person_key}")
def person_dossier(
    person_key: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    public_body: Optional[str] = Query(None),
):
    conn = db()
    try:
        name = _resolve_person(conn, person_key)
        if not name:
            raise HTTPException(404, f"Ator privado não encontrado no e-Agendas: {person_key}")

        where_clauses = ["lobbyist_name = ?"]
        params: list[Any] = [name]

        if start_date:
            where_clauses.append("meeting_date >= ?")
            params.append(start_date)
        if end_date:
            where_clauses.append("meeting_date <= ?")
            params.append(end_date)
        if public_body and public_body != 'ALL':
            where_clauses.append("public_body = ?")
            params.append(public_body)

        where_sql = " AND ".join(where_clauses)
        meetings = rows(conn, f"""
            SELECT event_id, meeting_date, public_body, declared_topic,
                   authority_name, authority_role, entity_name, entity_norm,
                   entity_cnpj, lobbyist_masked_cpf
            FROM meetings WHERE {where_sql}
            ORDER BY meeting_date DESC
        """, params)

        # As correlações seguem a ENTIDADE que a pessoa representa, não a
        # reunião-âncora.
        correlations = rows(conn, """
            SELECT c.*, a.title AS dou_title, a.summary AS dou_summary,
                   a.contracted_name, a.primary_cnpj, a.is_no_bid
            FROM correlations c LEFT JOIN dou_acts a ON a.dou_id = c.dou_id
            WHERE c.entity_norm IN (
                SELECT DISTINCT entity_norm FROM meetings WHERE lobbyist_name = ?
            )
            ORDER BY c.risk_score DESC, c.delta_days ASC
        """, [name])
        for c in correlations:
            c["_person_name"] = name
        correlations = _attribute_to_person(correlations, meetings)
        act_summaries = _llm_outputs(conn, "summarize_act",
                                     [c["dou_id"] for c in correlations])
        relations = _llm_outputs(conn, "judge_relation",
                                 [c["correlation_id"] for c in correlations])

        body_counts: dict[str, int] = {}
        for m in meetings:
            body_counts[m["public_body"]] = body_counts.get(m["public_body"], 0) + 1
        entropy = shannon_entropy(list(body_counts.values()))

        own_acts = [c for c in correlations if c["attributed_to_person"]]
        critical = sum(1 for c in own_acts if c["own_severity"] == "CRITICA")
        total_value = sum(
            v for v in {c["dou_id"]: c["value"] for c in own_acts}.values() if v
        )
        breakdown = iai_breakdown(
            meetings=len(meetings), distinct_bodies=len(body_counts),
            distinct_authorities=len({m["authority_name"] for m in meetings}),
            entropy=entropy, correlations=len(own_acts),
            correlated_value=total_value, critical_correlations=critical,
        )
        score = breakdown["score"]

        # Estatísticas de Benchmark & Quartil do Setor/Geral
        row_tot = one(conn, "SELECT COUNT(DISTINCT lobbyist_name) AS cnt FROM meetings")
        total_lobbyists = list(row_tot.values())[0] if row_tot else 1
        row_high = one(conn, """
            SELECT COUNT(DISTINCT lobbyist_name) AS cnt FROM (
                SELECT lobbyist_name, COUNT(*) as cnt FROM meetings GROUP BY lobbyist_name HAVING cnt > ?
            )
        """, [len(meetings)])
        higher_score_count = list(row_high.values())[0] if row_high else 0

        percentile = max(1.0, round((higher_score_count / (total_lobbyists or 1)) * 100, 1))

        entities = sorted(
            {m["entity_name"] for m in meetings if m["entity_name"]}
        )

        return {
            "person": {
                "id": person_id(name),
                "name": name,
                "maskedCpf": next(
                    (m["lobbyist_masked_cpf"] for m in meetings
                     if m.get("lobbyist_masked_cpf")),
                    "CPF não publicado nestes registros"),
                "isAuthority": False,
                "isExServant": False,
                "isTseDonor": False,
                "iaiScore": score,
                "entropyScore": entropy,
                "benchmark": {
                    "totalLobbyists": total_lobbyists,
                    "percentileRank": f"Top {percentile}%",
                    "meetingCount": len(meetings),
                    "distinctOrgans": len(body_counts),
                    "quartile": "Q1 (Primeiro Quartil - Alta Frequência)" if percentile <= 25 else (
                        "Q2 (Segundo Quartil - Frequência Média-Alta)" if percentile <= 50 else (
                            "Q3 (Terceiro Quartil - Frequência Média)" if percentile <= 75 else "Q4 (Quarto Quartil - Frequência Esporádica)"
                        )
                    )
                }
            },
            "representedEntities": entities,
            "riskBreakdown": breakdown,
            "charts": _person_charts(meetings, correlations),
            "sanctions": _entity_sanctions(conn, meetings),
            # Fontes não ingeridas: devolvidas vazias e sinalizadas, nunca
            # preenchidas com dado plausível.
            "societaryLinks": [],
            "politicalLinks": [],
            "dataGaps": [
                {"source": key, "reason": reason}
                for key, reason in UNAVAILABLE_SOURCES.items()
            ],
            "audienceTimeline": [{
                "id": m["event_id"],
                "dateTime": iso(m["meeting_date"]),
                "declaredTopic": m["declared_topic"] or "",
                "disambiguatedTopic": "",
                "isOpaque": is_opaque_topic(m["declared_topic"]),
                "publicBodyName": m["public_body"] or "",
                "authorityName": m["authority_name"] or "",
                "authorityRole": m.get("authority_role") or "",
                "representedEntity": m["entity_name"] or "",
            } for m in meetings[:500]],
            "douCorrelations": [{
                "id": c["correlation_id"],
                "actId": c["dou_id"],
                "publicationDate": iso(c["pub_date"]),
                "issuingBody": c["organ_root"] or "",
                "actType": c["act_type"] or "",
                "summary": (c.get("dou_summary") or c.get("dou_title") or "")[:400],
                "monetaryValue": c["value"] or 0.0,
                # Δt das reuniões DESTE ator; nulo quando ele não tem reunião
                # anterior ao ato, caso em que o vínculo é só da entidade.
                "timeDeltaDays": c["own_delta_days"],
                "ownMeetingDate": iso(c["own_meeting_date"]),
                "ownPublicBody": c["own_public_body"],
                "ownAuthority": c["own_authority"],
                "ownPriorMeetings": c["own_prior_meetings"],
                "ownLift": c["own_lift"],
                "attributedToPerson": c["attributed_to_person"],
                "entityDeltaDays": c["delta_days"],
                "entityName": c["entity_name"] or "",
                # Ponteiro: quando outro representante da mesma empresa esteve
                # mais perto do ato, é a ficha DELE que interessa ao auditor.
                "closestRepresentative": (
                    None if c["lobbyist_name"] == c.get("_person_name")
                    or (c["own_delta_days"] is not None
                        and c["delta_days"] >= c["own_delta_days"])
                    else {
                        "name": c["lobbyist_name"],
                        "id": person_id(c["lobbyist_name"] or ""),
                        "deltaDays": c["delta_days"],
                        "meetingDate": iso(c["meeting_date"]),
                    }
                ),
                "semanticScore": c["match_confidence"],
                "douUrl": c["link_url"],
                "matchBasis": c["match_basis"],
                "proximityLift": c["proximity_lift"],
                "priorMeetingsCount": c["prior_meetings_count"],
                "contractedName": c.get("contracted_name") or "",
                "isNoBid": bool(c.get("is_no_bid")),
                # Gravidade da atuação DESTE ator; nula quando ele não teve
                # reunião anterior ao ato.
                "severity": (SEVERITY_PT_TO_EN.get(c["own_severity"])
                             if c["own_severity"] else None),
                "riskScore": c["own_score"],
                "entitySeverity": SEVERITY_PT_TO_EN.get(c["severity"], "LOW"),
                "reading": _act_reading(act_summaries.get(c["dou_id"]),
                                        relations.get(c["correlation_id"])),
            } for c in correlations[:200]],
            "aiSummary": _factual_summary(name, meetings, correlations, entropy,
                                          body_counts, score),
        }
    finally:
        conn.close()


def _attribute_to_person(correlations: list[dict], meetings: list[dict]) -> list[dict]:
    """Reatribui cada ato ao ator do dossiê, com gravidade calculada por ele.

    A correlação nasce ancorada na reunião mais próxima de QUALQUER
    representante da empresa. Isso é correto para o alerta, cujo objeto é o
    ato. Mas numa ficha individual essa gravidade seria emprestada: os 91
    representantes de uma empresa herdariam todos a proximidade de quem por
    acaso esteve mais perto, e a ficha atribuiria a cada um a atuação alheia.

    Aqui a gravidade vem do Δt DESTE ator e da cadência DELE. Quando outro
    representante esteve mais perto, isso vira um ponteiro — "veja a ficha
    dele" —, que é onde a proximidade de fato constitui indício.
    """
    by_entity: dict[str, list[dict]] = {}
    for meeting in meetings:
        by_entity.setdefault(meeting.get("entity_norm") or "", []).append(meeting)

    attributed = []
    for corr in correlations:
        pub_date = corr.get("pub_date")
        own = [
            m for m in by_entity.get(corr.get("entity_norm") or "", [])
            if m.get("meeting_date") and pub_date and m["meeting_date"] <= pub_date
        ]
        # Só as reuniões dentro da janela contam para a cadência do ator.
        in_window = [
            m for m in own
            if (pub_date - m["meeting_date"]).days <= config.CORRELATION_WINDOW_DAYS
        ]

        item = dict(corr)
        if in_window:
            closest = max(in_window, key=lambda m: m["meeting_date"])
            delta = (pub_date - closest["meeting_date"]).days
            lift = proximity_lift(delta, len(in_window))
            severity, score = classify_severity(
                delta, corr.get("value"), bool(corr.get("is_no_bid")),
                bool(corr.get("same_organ")), lift,
            )
            score = round(score * (corr.get("match_confidence") or 1.0), 1)
            item.update({
                "own_delta_days": delta,
                "own_meeting_date": closest["meeting_date"],
                "own_public_body": closest.get("public_body") or "",
                "own_authority": closest.get("authority_name") or "",
                "own_prior_meetings": len(in_window),
                "own_lift": lift,
                "own_severity": severity,
                "own_score": score,
                "attributed_to_person": True,
            })
        else:
            item.update({
                "own_delta_days": None, "own_meeting_date": None,
                "own_public_body": "", "own_authority": "",
                "own_prior_meetings": 0, "own_lift": 0.0,
                # Sem reunião prévia deste ator, não há atuação dele a graduar.
                "own_severity": None, "own_score": 0.0,
                "attributed_to_person": False,
            })
        attributed.append(item)

    attributed.sort(key=lambda c: (
        not c["attributed_to_person"],
        -(c["own_score"] or 0.0),
        c["own_delta_days"] if c["own_delta_days"] is not None else 10**6,
    ))
    return attributed


def _top_with_others(counter, limit: int = 6) -> list[dict]:
    """Os N mais relevantes e um agregado "Outros".

    Um treemap com 40 retângulos minúsculos não se lê. Agregar a cauda mantém
    o total honesto — a soma continua batendo com o número de reuniões.
    """
    ordered = counter.most_common()
    head = ordered[:limit]
    tail = ordered[limit:]
    items = [{"name": name, "value": count} for name, count in head]
    if tail:
        items.append({
            "name": f"Outros ({len(tail)})",
            "value": sum(count for _, count in tail),
            "isOthers": True,
        })
    return items


def _person_charts(meetings: list[dict], correlations: list[dict]) -> dict:
    """Agregações do perfil do lobista, prontas para gráfico."""
    from collections import Counter, defaultdict

    by_month: dict[str, dict] = defaultdict(lambda: {"total": 0, "opaque": 0})
    bodies, entities_count, roles = Counter(), Counter(), Counter()
    sectors, natures = Counter(), Counter()
    opaque_total = 0

    for meeting in meetings:
        when = meeting.get("meeting_date")
        if when:
            by_month[f"{when.year}-{when.month:02d}"]["total"] += 1
        opaque = is_opaque_topic(meeting.get("declared_topic"))
        if opaque:
            opaque_total += 1
            if when:
                by_month[f"{when.year}-{when.month:02d}"]["opaque"] += 1

        if meeting.get("public_body"):
            bodies[meeting["public_body"]] += 1

        # O campo "representando" é livre e recebe descrição de cargo
        # ("Relações Institucionais e Regulatórias"). Isso não é empresa e não
        # pode aparecer num gráfico rotulado "empresas que representa".
        entity = meeting.get("entity_name")
        if entity and not is_role_description(entity) and not starts_with_role(entity):
            entities_count[entity] += 1

        roles[authority_tier(meeting.get("authority_role"))[0]] += 1

        # Mesma taxonomia usada no grafo, para que os clusters de um
        # correspondam às fatias do outro.
        classified = classify_topic(meeting.get("declared_topic"),
                                    meeting.get("public_body"))
        sectors[classified["sectorLabel"]] += 1
        natures[classified["natureLabel"]] += 1

    total = len(meetings)
    return {
        "meetingsByMonth": [
            {"month": month, "total": data["total"], "opaque": data["opaque"]}
            for month, data in sorted(by_month.items())
        ],
        "byBody": _top_with_others(bodies),
        "byEntity": _top_with_others(entities_count),
        "bySector": _top_with_others(sectors),
        "byNature": _top_with_others(natures),
        "byAuthorityTier": [
            {"tier": t, "label": TIER_LABELS.get(t, t), "value": c}
            for t, c in sorted(roles.items(), key=lambda kv: -kv[1])
        ],
        "objectivity": {
            "clear": total - opaque_total,
            "opaque": opaque_total,
            "clearPct": round((total - opaque_total) / total * 100, 1) if total else 0.0,
        },
        "douActsByMonth": _acts_by_month(correlations),
        "totals": {"bodies": len(bodies), "entities": len(entities_count),
                   "sectors": len(sectors)},
    }


def _acts_by_month(correlations: list[dict]) -> list[dict]:
    from collections import Counter
    counter = Counter()
    for corr in correlations:
        when = corr.get("pub_date")
        if when:
            counter[f"{when.year}-{when.month:02d}"] += 1
    return [{"month": m, "value": v} for m, v in sorted(counter.items())]


def _entity_sanctions(conn, meetings: list[dict]) -> list[dict]:
    """Sanções das entidades que a pessoa representa, com o alcance apurado."""
    norms = sorted({m.get("entity_norm") for m in meetings if m.get("entity_norm")})
    if not norms:
        return []
    placeholders = ",".join("?" * len(norms))
    return [{
        "sanctionedName": r["sanctioned_name"],
        "cnpj": format_cnpj(r["cnpj"] or ""),
        "registry": r["registry"],
        "category": r["category"],
        "isBlocking": bool(r["is_blocking"]),
        "scope": r["scope"],
        "scopeReason": r["scope_reason"],
        "sanctioningBody": r["sanctioning_body"],
        "startDate": iso(r["start_date"]),
        "endDate": iso(r["end_date"]) or "sem prazo determinado",
        "meetingsInScope": r["meetings_in_scope"],
        "meetingsDuringSanction": r["meetings_during"],
        "severity": ("OUT_OF_SCOPE" if r["severity"] == "FORA_DE_ALCANCE"
                     else SEVERITY_PT_TO_EN.get(r["severity"], "LOW")),
    } for r in rows(conn, f"""
        SELECT * FROM sanction_hits WHERE entity_norm IN ({placeholders})
        ORDER BY risk_score DESC
    """, norms)]


def _authority_charts(meetings: list[dict], dou_items: list[dict]) -> dict:
    """Agregações estatísticas da autoridade pública prontas para gráficos ECharts."""
    from collections import Counter, defaultdict

    by_month: dict[str, dict] = defaultdict(lambda: {"total": 0, "opaque": 0})
    entities_count, lobbyists_count = Counter(), Counter()
    sectors, natures = Counter(), Counter()
    opaque_total = 0

    for m in meetings:
        when = m.get("meeting_date")
        if when:
            month_key = f"{when.year}-{when.month:02d}"
            by_month[month_key]["total"] += 1
        opaque = is_opaque_topic(m.get("declared_topic"))
        if opaque:
            opaque_total += 1
            if when:
                by_month[month_key]["opaque"] += 1

        ent = m.get("entity_name")
        if ent and not is_role_description(ent) and not starts_with_role(ent):
            entities_count[ent] += 1

        lob = m.get("lobbyist_name")
        if lob and lob.strip():
            lobbyists_count[lob.strip()] += 1

        classified = classify_topic(m.get("declared_topic"), m.get("public_body"))
        sectors[classified["sectorLabel"]] += 1
        natures[classified["natureLabel"]] += 1

    dou_by_month: dict[str, int] = defaultdict(int)
    for d in dou_items:
        pub = d.get("publicationDate")
        if pub and len(pub) >= 7:
            dou_by_month[pub[:7]] += 1

    total = len(meetings)
    return {
        "meetingsByMonth": [
            {"month": month, "total": data["total"], "opaque": data["opaque"]}
            for month, data in sorted(by_month.items())
        ],
        "byEntity": _top_with_others(entities_count, limit=10),
        "byLobbyist": _top_with_others(lobbyists_count, limit=10),
        "bySector": _top_with_others(sectors, limit=8),
        "byNature": _top_with_others(natures, limit=6),
        "objectivity": {
            "clear": total - opaque_total,
            "opaque": opaque_total,
            "clearPct": round((total - opaque_total) / total * 100, 1) if total else 0.0,
        },
        "douActsByMonth": [
            {"month": m, "value": v}
            for m, v in sorted(dou_by_month.items())
        ],
        "totals": {
            "entities": len(entities_count),
            "lobbyists": len(lobbyists_count),
            "sectors": len(sectors),
            "douActs": len(dou_items),
        }
    }


def _resolve_person(conn, key: str) -> str | None:
    """Aceita id derivado do nome, nome exato ou trecho do nome."""
    exact = one(conn, "SELECT lobbyist_name FROM meetings WHERE lobbyist_name = ? LIMIT 1", [key])
    if exact:
        return exact["lobbyist_name"]

    candidates = rows(conn, """
        SELECT lobbyist_name, count(*) AS n FROM meetings
        WHERE lobbyist_name IS NOT NULL GROUP BY lobbyist_name ORDER BY n DESC
    """)
    for row in candidates:
        if person_id(row["lobbyist_name"]) == key:
            return row["lobbyist_name"]

    lowered = key.strip().lower()
    for row in candidates:
        if lowered and lowered in row["lobbyist_name"].lower():
            return row["lobbyist_name"]
    return None


def _resolve_authority(conn, key: str) -> str | None:
    """Aceita id derivado do nome, nome exato, hash MD5 ou trecho do nome de autoridade pública."""
    exact = one(conn, "SELECT authority_name FROM meetings WHERE authority_name = ? LIMIT 1", [key])
    if exact:
        return exact["authority_name"]

    flex = one(conn, """
        SELECT authority_name FROM meetings
        WHERE authority_name IS NOT NULL
        GROUP BY authority_name
        HAVING md5(lower(authority_name)) = ? OR lower(authority_name) = lower(?)
        LIMIT 1
    """, [key, key])
    if flex:
        return flex["authority_name"]

    term = f"%{key.strip().lower()}%"
    flex_row = one(conn, """
        SELECT authority_name FROM meetings
        WHERE lower(authority_name) LIKE ?
        GROUP BY authority_name ORDER BY count(*) DESC LIMIT 1
    """, [term])
    if flex_row:
        return flex_row["authority_name"]
    return None


def _factual_summary(name, meetings, correlations, entropy, body_counts, score) -> dict:
    """Sumário derivado dos próprios registros — sem geração livre de texto.

    O campo continua se chamando aiSummary por compatibilidade com o frontend,
    mas nada aqui é gerado por modelo: cada frase é uma contagem verificável.
    Um sumário de LLM sobre suspeita de corrupção seria alegação sem lastro.
    """
    # Os atos em que ESTE ator teve reunião anterior. Os demais pertencem à
    # empresa e devem ser respondidos na ficha de quem esteve presente.
    own_acts = [c for c in correlations if c.get("attributed_to_person")]

    flags: list[str] = []
    if entropy >= 2.5:
        flags.append(
            f"Trânsito transversal: entropia {entropy} entre {len(body_counts)} órgãos distintos")
    opaque = sum(1 for m in meetings if is_opaque_topic(m["declared_topic"]))
    if meetings and opaque / len(meetings) >= 0.4:
        flags.append(f"{opaque} de {len(meetings)} reuniões com pauta opaca ou genérica")
    near = [c for c in correlations
            if c.get("attributed_to_person")
            and c["own_delta_days"] is not None and c["own_delta_days"] <= 30]
    if near:
        flags.append(f"{len(near)} atos publicados até 30 dias após reunião DESTE ator")
    no_bid = [c for c in correlations if c.get("is_no_bid") and c.get("attributed_to_person")]
    if no_bid:
        flags.append(f"{len(no_bid)} atos sem licitação plena após reunião deste ator")

    top_bodies = sorted(body_counts.items(), key=lambda x: -x[1])[:3]
    bodies_txt = ", ".join(f"{b} ({n})" for b, n in top_bodies) or "nenhum órgão registrado"

    intel = extract_topic_intelligence(meetings)

    return {
        "executiveSummary": (
            f"{name} registra {len(meetings)} participações em reuniões do e-Agendas "
            f"entre {iso(min((m.get('meeting_date') or m.get('dateTime') or '' for m in meetings), default=''))} e "
            f"{iso(max((m.get('meeting_date') or m.get('dateTime') or '' for m in meetings), default=''))}, "
            f"distribuídas por {len(body_counts)} órgãos (principais: {bodies_txt}). "
            f"O cruzamento com o DOU encontrou {len(own_acts)} atos publicados "
            f"após reuniões deste ator"
            + (f" (e mais {len(correlations) - len(own_acts)} ligados à(s) "
               "entidade(s) que ele representa, por reuniões de outros "
               "representantes)" if len(correlations) > len(own_acts) else "")
            + f". IAI {score}/100. "
            "Correlação temporal é indício para apuração, não prova de irregularidade."
        ),
        "identifiedRedFlags": flags,
        "confidenceScore": round(
            max((c["match_confidence"] for c in correlations), default=0.0), 3),
        "references": list({c["link_url"] for c in correlations if c["link_url"]})[:20],
        "generatedBy": "agregação determinística sobre e-Agendas e DOU (sem LLM)",
        "thematicClusters": intel.get("thematicClusters", []),
        "betweenTheLines": intel.get("betweenTheLines", []),
        "citizenImpacts": intel.get("citizenImpacts", []),
        "opaqueAnalysis": intel.get("opaqueAnalysis", {}),
        "highlightedAssets": intel.get("highlightedAssets", []),
        "highlightedPartners": intel.get("highlightedPartners", []),
    }


# ---------------------------------------------------------------- grafo
@app.get("/api/v1/graph/subgraph/{person_key}")
def graph_subgraph(person_key: str, depth: int = 2, public_body: Optional[str] = None):
    conn = db()
    try:
        name = _resolve_person(conn, person_key)
        if not name:
            auth_name = _resolve_authority(conn, person_key)
            if auth_name:
                return _authority_subgraph(conn, auth_name, depth, public_body)
            raise HTTPException(404, f"Ator ou autoridade não encontrado: {person_key}")

        if public_body and public_body != 'TODOS':
            meetings = rows(conn, """
                SELECT public_body, authority_name, authority_role, entity_name,
                       mode(declared_topic) AS main_topic, count(*) AS n
                FROM meetings WHERE lobbyist_name = ?
                  AND (public_body = ? OR lower(public_body) LIKE ?)
                GROUP BY public_body, authority_name, authority_role, entity_name
                ORDER BY n DESC LIMIT 120
            """, [name, public_body, f"%{public_body.lower()}%"])
            correlations = rows(conn, """
                SELECT DISTINCT c.dou_id, c.act_type, c.value, c.link_url,
                       c.organ_root, c.entity_name, c.severity, c.delta_days
                FROM correlations c
                WHERE c.entity_norm IN (
                    SELECT DISTINCT entity_norm FROM meetings WHERE lobbyist_name = ?
                )
                AND (c.organ_root = ? OR lower(c.organ_root) LIKE ?)
                ORDER BY c.value DESC NULLS LAST, c.delta_days ASC
                LIMIT 40
            """, [name, public_body, f"%{public_body.lower()}%"])
        else:
            meetings = rows(conn, """
                SELECT public_body, authority_name, authority_role, entity_name,
                       mode(declared_topic) AS main_topic, count(*) AS n
                FROM meetings WHERE lobbyist_name = ?
                GROUP BY public_body, authority_name, authority_role, entity_name
                ORDER BY n DESC LIMIT 120
            """, [name])
            correlations = rows(conn, """
                SELECT DISTINCT c.dou_id, c.act_type, c.value, c.link_url,
                       c.organ_root, c.entity_name, c.severity, c.delta_days
                FROM correlations c
                WHERE c.entity_norm IN (
                    SELECT DISTINCT entity_norm FROM meetings WHERE lobbyist_name = ?
                )
                ORDER BY c.value DESC NULLS LAST, c.delta_days ASC
                LIMIT 40
            """, [name])

        root = person_id(name)
        nodes = {root: {"data": {"id": root, "label": name, "type": "PERSON",
                                 "isLobbyist": True}}}
        edges: dict[str, dict] = {}
        node_sectors: dict[str, set[str]] = {}
        node_organs: dict[str, set[str]] = {}

        def add_node(node_id, label, node_type, **extra):
            if node_id not in nodes:
                nodes[node_id] = {"data": {"id": node_id, "label": label,
                                           "type": node_type, **extra}}
            else:
                for k, v in extra.items():
                    if v and k not in nodes[node_id]["data"]:
                        nodes[node_id]["data"][k] = v

        def add_edge(source, target, label, count):
            key = f"{source}->{target}:{label}"
            if key in edges:
                edges[key]["data"]["count"] += count
            else:
                edges[key] = {"data": {"id": key, "source": source, "target": target,
                                       "label": label, "count": count, "weight": count}}

        for m in meetings:
            classified = classify_topic(m.get("main_topic"), m.get("public_body"))
            sec_label = classified.get("sectorLabel") or ""
            sec_code = classified.get("sector") or ""
            body = m.get("public_body") or ""

            if m.get("entity_name"):
                eid = "org-" + person_id(m["entity_name"])
                add_node(eid, m["entity_name"], "ORGANIZATION",
                         sector=sec_code,
                         sectorLabel=sec_label,
                         organRoot=body)
                add_edge(root, eid, "representa", m["n"])
                if eid not in node_sectors:
                    node_sectors[eid] = set()
                    node_organs[eid] = set()
                if sec_label:
                    node_sectors[eid].add(sec_label)
                if body:
                    node_organs[eid].add(body)
                    bid = "body-" + person_id(body)
                    add_edge(eid, bid, "em audiência no órgão", m["n"])

            if body:
                bid = "body-" + person_id(body)
                add_node(bid, body, "PUBLIC_BODY",
                         sector=sec_code,
                         sectorLabel=sec_label)
                add_edge(root, bid, "reuniu-se em", m["n"])
                if bid not in node_sectors:
                    node_sectors[bid] = set()
                    node_organs[bid] = set()
                if sec_label:
                    node_sectors[bid].add(sec_label)
                node_organs[bid].add(body)

            if m.get("authority_name"):
                aid = "auth-" + person_id(m["authority_name"])
                tier, rank = authority_tier(m.get("authority_role"))
                is_minister = is_minister_or_president(m.get("authority_role")) or tier == "MINISTERIAL"
                # O cargo distingue acesso decisório de acesso técnico: um
                # ministro e um analista não representam o mesmo alcance.
                add_node(aid, m["authority_name"], "AUTHORITY",
                         role=m.get("authority_role") or "",
                         tier=tier, tierLabel=TIER_LABELS.get(tier, tier),
                         tierRank=rank,
                         isMinister=is_minister,
                         sector=sec_code,
                         sectorLabel=sec_label,
                         organRoot=body)
                add_edge(root, aid, "reuniu-se com", m["n"])
                if aid not in node_sectors:
                    node_sectors[aid] = set()
                    node_organs[aid] = set()
                if sec_label:
                    node_sectors[aid].add(sec_label)
                if body:
                    node_organs[aid].add(body)
                    add_edge(aid, "body-" + person_id(body), "lotado em", 1)

        # Enriquecer os nós com as listas completas de setores e órgãos
        for nid, sec_set in node_sectors.items():
            if nid in nodes:
                nodes[nid]["data"]["sectors"] = sorted(list(sec_set))
        for nid, org_set in node_organs.items():
            if nid in nodes:
                nodes[nid]["data"]["organs"] = sorted(list(org_set))

        if depth >= 2:
            act_summaries = _llm_outputs(conn, "summarize_act",
                                         [c["dou_id"] for c in correlations])
            for c in correlations:
                reading = act_summaries.get(c["dou_id"]) or {}
                did = "dou-" + str(c["dou_id"])
                add_node(did, (c["act_type"] or "Ato do DOU")[:60], "DOU_ACT",
                         monetaryValue=c["value"] or 0.0, url=c["link_url"],
                         severity=SEVERITY_PT_TO_EN.get(c.get("severity"), "LOW"),
                         deltaDays=c.get("delta_days"),
                         organRoot=c.get("organ_root") or "",
                         # Resumo do que o ato concedeu, para o auditor não
                         # precisar abrir o DOU só para saber do que se trata.
                         granted=reading.get("concedido", ""),
                         beneficiary=reading.get("beneficiario", ""))
                if c["entity_name"]:
                    add_edge("org-" + person_id(c["entity_name"]), did, "contratada em", 1)
                else:
                    add_edge(root, did, "correlacionado a", 1)
                if c["organ_root"]:
                    oid = "body-" + person_id(c["organ_root"])
                    add_node(oid, c["organ_root"], "PUBLIC_BODY")
                    add_edge(oid, did, "publicou", 1)

        return {"nodes": list(nodes.values()), "edges": list(edges.values())}
    finally:
        conn.close()


def _authority_subgraph(conn, auth_name: str, depth: int = 2, public_body: Optional[str] = None) -> dict:
    """Gera a rede de influência ao redor de uma autoridade pública."""
    where_extra = ""
    params: list = [auth_name]
    if public_body and public_body != 'TODOS':
        where_extra = " AND (public_body = ? OR lower(public_body) LIKE ?)"
        params.extend([public_body, f"%{public_body.lower()}%"])

    meetings = rows(conn, f"""
        SELECT public_body, authority_role, entity_name, entity_norm, lobbyist_name,
               mode(declared_topic) AS main_topic, count(*) AS n
        FROM meetings
        WHERE authority_name = ? {where_extra}
        GROUP BY public_body, authority_role, entity_name, entity_norm, lobbyist_name
        ORDER BY n DESC
        LIMIT 100
    """, params)

    if not meetings:
        return {"nodes": [], "edges": []}

    main_role = next((m["authority_role"] for m in meetings if m.get("authority_role")), "Autoridade Pública")
    main_body = next((m["public_body"] for m in meetings if m.get("public_body")), "Órgão Público")
    tier, rank = authority_tier(main_role)
    is_min = is_minister_or_president(main_role) or tier == "MINISTERIAL"

    root = person_id(auth_name)
    nodes = {
        root: {
            "data": {
                "id": root,
                "label": auth_name,
                "type": "AUTHORITY",
                "isAuthority": True,
                "role": main_role,
                "tier": tier,
                "tierLabel": TIER_LABELS.get(tier, tier),
                "tierRank": rank,
                "isMinister": is_min,
                "organRoot": main_body,
            }
        }
    }
    edges: dict[str, dict] = {}
    node_sectors: dict[str, set[str]] = {}
    node_organs: dict[str, set[str]] = {}

    def add_node(node_id, label, node_type, **extra):
        if node_id not in nodes:
            nodes[node_id] = {"data": {"id": node_id, "label": label,
                                       "type": node_type, **extra}}
        else:
            for k, v in extra.items():
                if v and k not in nodes[node_id]["data"]:
                    nodes[node_id]["data"][k] = v

    def add_edge(source, target, label, count):
        key = f"{source}->{target}:{label}"
        if key in edges:
            edges[key]["data"]["count"] += count
        else:
            edges[key] = {"data": {"id": key, "source": source, "target": target,
                                   "label": label, "count": count, "weight": count}}

    bid = "body-" + person_id(main_body)
    add_node(bid, main_body, "PUBLIC_BODY", organRoot=main_body)
    add_edge(root, bid, "lotada em", len(meetings))

    for m in meetings:
        classified = classify_topic(m.get("main_topic"), m.get("public_body"))
        sec_label = classified.get("sectorLabel") or ""
        sec_code = classified.get("sector") or ""
        body = m.get("public_body") or main_body
        count = m.get("n") or 1

        ent = m.get("entity_name")
        if ent and ent not in ("Não especificada", "Não informado", "") and not is_role_description(ent):
            eid = "org-" + person_id(ent)
            add_node(eid, ent, "ORGANIZATION",
                     sector=sec_code,
                     sectorLabel=sec_label,
                     organRoot=body)
            add_edge(eid, root, "recebida em audiência", count)
            if eid not in node_sectors:
                node_sectors[eid] = set()
                node_organs[eid] = set()
            if sec_label:
                node_sectors[eid].add(sec_label)
            if body:
                node_organs[eid].add(body)

        lob = m.get("lobbyist_name")
        if lob and lob.strip():
            lid = person_id(lob)
            add_node(lid, lob, "PERSON", isLobbyist=True)
            add_edge(lid, root, "despachou com", count)
            if ent and ent not in ("Não especificada", "Não informado", "") and not is_role_description(ent):
                eid = "org-" + person_id(ent)
                add_edge(lid, eid, "representa", count)

    for nid, sec_set in node_sectors.items():
        if nid in nodes:
            nodes[nid]["data"]["sectors"] = sorted(list(sec_set))
    for nid, org_set in node_organs.items():
        if nid in nodes:
            nodes[nid]["data"]["organs"] = sorted(list(org_set))

    if depth >= 2:
        correlations = rows(conn, """
            WITH auth_entities AS (
                SELECT entity_norm, count(*) AS auth_meetings
                FROM meetings
                WHERE authority_name = ? AND entity_norm IS NOT NULL AND entity_norm != ''
                GROUP BY entity_norm
            )
            SELECT DISTINCT 
                c.correlation_id, c.dou_id, c.entity_norm, c.entity_name, c.act_type,
                c.value, c.delta_days, c.risk_score, c.link_url,
                a.title AS dou_title, a.summary AS dou_summary, a.pub_date, a.organ_root
            FROM correlations c
            JOIN auth_entities ae ON c.entity_norm = ae.entity_norm
            LEFT JOIN dou_acts a ON a.dou_id = c.dou_id
            ORDER BY c.risk_score DESC, c.delta_days ASC
            LIMIT 25
        """, [auth_name])

        act_summaries = _llm_outputs(conn, "summarize_act", [c["dou_id"] for c in correlations])
        for c in correlations:
            reading = act_summaries.get(c["dou_id"]) or {}
            did = "dou-" + str(c["dou_id"])
            add_node(did, (c["act_type"] or "Ato do DOU")[:60], "DOU_ACT",
                     monetaryValue=c["value"] or 0.0, url=c["link_url"],
                     severity=SEVERITY_PT_TO_EN.get(c.get("severity"), "LOW"),
                     deltaDays=c.get("delta_days"),
                     organRoot=c.get("organ_root") or "",
                     granted=reading.get("concedido", ""),
                     beneficiary=reading.get("beneficiario", ""))
            if c["entity_name"]:
                eid = "org-" + person_id(c["entity_name"])
                add_edge(eid, did, "contratada em", 1)
            if c["organ_root"]:
                oid = "body-" + person_id(c["organ_root"])
                add_node(oid, c["organ_root"], "PUBLIC_BODY")
                add_edge(oid, did, "publicou", 1)

    return {"nodes": list(nodes.values()), "edges": list(edges.values())}


@app.get("/api/v1/graph/authority-subgraph/{authority_key}")
def authority_subgraph_endpoint(authority_key: str, depth: int = 2, public_body: Optional[str] = None):
    conn = db()
    try:
        auth_name = _resolve_authority(conn, authority_key)
        if not auth_name:
            raise HTTPException(404, f"Autoridade pública não encontrada: {authority_key}")
        return _authority_subgraph(conn, auth_name, depth, public_body)
    finally:
        conn.close()


@app.get("/api/v1/graph/filter-options")
def graph_filter_options(public_body: Optional[str] = None, actor_id: Optional[str] = None):
    """Retorna opções de filtros intercambiáveis para o explorador de grafos.
    
    Se public_body for fornecido (e != 'TODOS'), retorna exclusivamente as pessoas
    que tiveram reuniões com aquele Ministério/Órgão, ordenadas pelo número de encontros.
    Se actor_id for fornecido, retorna também a lista de ministérios visitados por esse ator.
    """
    conn = db()
    try:
        all_bodies = rows(conn, """
            SELECT public_body, count(*) as n
            FROM meetings
            WHERE public_body IS NOT NULL AND length(trim(public_body)) > 1
            GROUP BY public_body
            ORDER BY n DESC
            LIMIT 150
        """)
        ministries_list = [b["public_body"] for b in all_bodies]

        actor_ministries = []
        resolved_actor_name = None
        if actor_id:
            resolved_actor_name = _resolve_person(conn, actor_id)
            if resolved_actor_name:
                actor_bodies = rows(conn, """
                    SELECT public_body, count(*) as n
                    FROM meetings
                    WHERE lobbyist_name = ?
                      AND public_body IS NOT NULL AND length(trim(public_body)) > 1
                    GROUP BY public_body
                    ORDER BY n DESC
                """, [resolved_actor_name])
                actor_ministries = [b["public_body"] for b in actor_bodies]

        if public_body and public_body != 'TODOS':
            actors_rows = rows(conn, """
                SELECT name, SUM(meetings_count) AS meetings_count FROM (
                    SELECT authority_name AS name, count(*) AS meetings_count
                    FROM meetings
                    WHERE (public_body = ? OR lower(public_body) LIKE ?)
                      AND authority_name IS NOT NULL AND length(trim(authority_name)) > 3
                    GROUP BY authority_name
                    UNION ALL
                    SELECT lobbyist_name AS name, count(*) AS meetings_count
                    FROM meetings
                    WHERE (public_body = ? OR lower(public_body) LIKE ?)
                      AND lobbyist_name IS NOT NULL AND length(trim(lobbyist_name)) > 3
                    GROUP BY lobbyist_name
                ) GROUP BY name
                ORDER BY meetings_count DESC
                LIMIT 120
            """, [public_body, f"%{public_body.lower()}%", public_body, f"%{public_body.lower()}%"])
        else:
            actors_rows = rows(conn, """
                SELECT name, SUM(meetings_count) AS meetings_count FROM (
                    SELECT authority_name AS name, count(*) AS meetings_count
                    FROM meetings
                    WHERE authority_name IS NOT NULL AND length(trim(authority_name)) > 3
                    GROUP BY authority_name
                    UNION ALL
                    SELECT lobbyist_name AS name, count(*) AS meetings_count
                    FROM meetings
                    WHERE lobbyist_name IS NOT NULL AND length(trim(lobbyist_name)) > 3
                    GROUP BY lobbyist_name
                ) GROUP BY name
                ORDER BY meetings_count DESC
                LIMIT 120
            """)

        actors = [{
            "id": person_id(r["name"]),
            "name": r["name"],
            "meetingsCount": r["meetings_count"],
        } for r in actors_rows]

        return {
            "ministries": ministries_list,
            "actors": actors,
            "actorMinistries": actor_ministries,
            "actorName": resolved_actor_name,
            "selectedMinistry": public_body,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------- busca
@app.get("/api/v1/search")
def global_search(q: str = Query(..., min_length=2), limit: int = 10):
    """Busca unificada por ator privado, organização ou órgão.

    O campo "representando" do e-Agendas é livre, e às vezes recebe o nome de
    uma pessoa ou um e-mail. Sem tratamento, esses viram "organizações" na
    busca — foi o que produzia resultados como "Roberta Santos Silva do
    Nascimento — ORGANIZATION". Aqui, quando o mesmo nome existe como ator
    privado, a interpretação de pessoa prevalece, e endereços de e-mail não
    são oferecidos como organização.
    """
    conn = db()
    try:
        term = f"%{q.strip().lower()}%"
        results: list[dict] = []

        people = rows(conn, """
            SELECT lobbyist_name, count(*) AS n, count(DISTINCT public_body) AS bodies,
                   count(DISTINCT entity_norm) AS entities
            FROM meetings WHERE lower(lobbyist_name) LIKE ?
            GROUP BY lobbyist_name ORDER BY n DESC LIMIT ?
        """, [term, limit])

        # Dedupe contra TODA a base de atores, não só os N primeiros: uma pessoa
        # com poucas reuniões ficava de fora do topo e reaparecia logo abaixo
        # rotulada como "ORGANIZATION".
        people_norms = {normalize_name(p["lobbyist_name"]) for p in people}
        also_people = {
            normalize_name(r["lobbyist_name"])
            for r in rows(conn, """
                SELECT DISTINCT lobbyist_name FROM meetings
                WHERE lower(lobbyist_name) LIKE ?
            """, [term])
        }
        people_norms |= also_people
        for row in people:
            results.append({
                "id": person_id(row["lobbyist_name"]),
                "name": row["lobbyist_name"],
                "entityType": "PERSON",
                "document": "ator privado",
                "iaiScore": 0.0,
                "details": (f"{row['n']} reuniões · {row['bodies']} órgãos · "
                            f"{row['entities']} entidade(s) representada(s)"),
            })

        for row in rows(conn, """
            SELECT display_name, cnpj, meetings_count, bodies_count
            FROM entities WHERE lower(display_name) LIKE ?
            ORDER BY meetings_count DESC LIMIT ?
        """, [term, limit * 2]):
            name = row["display_name"] or ""
            # E-mail não é organização.
            if "@" in name:
                continue
            # Já listado como pessoa: não repetir como organização.
            if normalize_name(name) in people_norms:
                continue
            # Sem CNPJ e com pouquíssimas reuniões, não há evidência de que o
            # texto seja uma organização: o campo "representando" é livre e às
            # vezes recebe o nome de uma pessoa. Afirmar "ORGANIZATION" nesses
            # casos é uma alegação sem lastro, então o rótulo diz apenas o que
            # se sabe — que aquele texto foi declarado como entidade.
            confirmed = bool(row["cnpj"]) or row["meetings_count"] >= 5
            results.append({
                "id": "org-" + person_id(name),
                "name": name,
                "entityType": "ORGANIZATION" if confirmed else "ENTIDADE_DECLARADA",
                "document": (format_cnpj(row["cnpj"]) if row["cnpj"]
                             else "sem CNPJ declarado"),
                "iaiScore": 0.0,
                "details": (f"{row['meetings_count']} reuniões · {row['bodies_count']} órgãos"
                            + ("" if confirmed
                               else " · texto livre do campo \"representando\"")),
            })

        for row in rows(conn, """
            SELECT public_body, count(*) AS n, count(DISTINCT lobbyist_name) AS people
            FROM meetings WHERE lower(public_body) LIKE ? GROUP BY public_body
            ORDER BY n DESC LIMIT ?
        """, [term, limit]):
            results.append({
                "id": "body-" + person_id(row["public_body"]),
                "name": row["public_body"],
                "entityType": "PUBLIC_BODY",
                "document": "",
                "iaiScore": 0.0,
                "details": f"{row['n']} reuniões · {row['people']} visitantes externos",
            })

        for row in rows(conn, """
            SELECT authority_name, arg_max(authority_role, meeting_date) AS role,
                   arg_max(public_body, meeting_date) AS body,
                   count(*) AS n, count(DISTINCT lobbyist_name) AS people
            FROM meetings WHERE lower(authority_name) LIKE ?
            GROUP BY authority_name ORDER BY n DESC LIMIT ?
        """, [term, limit]):
            results.append({
                "id": "auth-" + person_id(row["authority_name"]),
                "name": row["authority_name"],
                "entityType": "AUTHORITY",
                "document": row["role"] or "Autoridade Pública",
                "iaiScore": 0.0,
                "details": f"{row['n']} reuniões recebidas · {row['people']} interlocutores · {row['body']}",
            })

        return results[: limit * 4]
    finally:
        conn.close()


# ------------------------------------------------------- ficha do órgão
_EMPTY_EVIDENCE = {"douActsCount": 0, "nearestAct": None}


def _pair_dou_evidence(conn, public_body: str, matrix: list[dict]) -> dict:
    """Para cada par (autoridade, lobista), o ato do DOU mais próximo.

    O Δt é medido a partir das reuniões DESSE par — não da reunião-âncora da
    correlação, que pode ser de outro representante da mesma empresa. Sem isso
    a matriz mostraria um intervalo que não corresponde ao encontro exibido.
    """
    if not matrix:
        return {}

    lobbyists = list({r["lobbyist_name"] for r in matrix})
    authorities = list({r["authority_name"] for r in matrix})
    lob_ph = ",".join("?" * len(lobbyists))
    auth_ph = ",".join("?" * len(authorities))

    meetings = rows(conn, f"""
        SELECT lobbyist_name, authority_name, entity_norm, meeting_date
        FROM meetings
        WHERE public_body = ? AND lobbyist_name IN ({lob_ph})
          AND authority_name IN ({auth_ph}) AND meeting_date IS NOT NULL
    """, [public_body] + lobbyists + authorities)
    if not meetings:
        return {}

    entity_norms = list({m["entity_norm"] for m in meetings if m["entity_norm"]})
    if not entity_norms:
        return {}
    ent_ph = ",".join("?" * len(entity_norms))

    acts = rows(conn, f"""
        SELECT c.entity_norm, c.dou_id, c.pub_date, c.act_type, c.value,
               c.link_url, c.severity, c.match_basis, c.entity_name,
               c.organ_root, a.is_no_bid, a.title AS dou_title
        FROM correlations c LEFT JOIN dou_acts a ON a.dou_id = c.dou_id
        WHERE c.entity_norm IN ({ent_ph})
    """, entity_norms)
    if not acts:
        return {}

    acts_by_entity: dict[str, list[dict]] = {}
    for act in acts:
        acts_by_entity.setdefault(act["entity_norm"], []).append(act)

    pair_meetings: dict[tuple, list[dict]] = {}
    for m in meetings:
        pair_meetings.setdefault((m["authority_name"], m["lobbyist_name"]), []).append(m)

    evidence: dict[tuple, dict] = {}
    for pair, pair_rows in pair_meetings.items():
        candidates = []
        seen_acts = set()
        for m in pair_rows:
            for act in acts_by_entity.get(m["entity_norm"] or "", []):
                if not act["pub_date"] or m["meeting_date"] > act["pub_date"]:
                    continue
                delta = (act["pub_date"] - m["meeting_date"]).days
                if delta > config.CORRELATION_WINDOW_DAYS:
                    continue
                seen_acts.add(act["dou_id"])
                candidates.append((delta, m["meeting_date"], act))

        if not candidates:
            continue
        candidates.sort(key=lambda c: c[0])
        delta, meeting_date, act = candidates[0]
        evidence[pair] = {
            "_dou_id": act["dou_id"],
            "douActsCount": len(seen_acts),
            "nearestAct": {
                "deltaDays": delta,
                "meetingDate": iso(meeting_date),
                "publicationDate": iso(act["pub_date"]),
                "actType": act["act_type"] or "",
                "actTitle": (act.get("dou_title") or "")[:140],
                "issuingBody": act["organ_root"] or "",
                "entityName": act["entity_name"] or "",
                "monetaryValue": act["value"] or 0.0,
                "severity": SEVERITY_PT_TO_EN.get(act["severity"], "LOW"),
                "matchBasis": act["match_basis"],
                "isNoBid": bool(act.get("is_no_bid")),
                "douUrl": act["link_url"] or "",
            },
        }

    # Leitura assistida dos atos que efetivamente aparecem na matriz.
    summaries = _llm_outputs(conn, "summarize_act",
                             [v["_dou_id"] for v in evidence.values()])
    for value in evidence.values():
        value["nearestAct"]["reading"] = _act_reading(
            summaries.get(value.pop("_dou_id")), None)
    return evidence


@app.get("/api/v1/analytics/ministry-ficha")
def ministry_ficha(public_body: str, top: int = 30):
    """Ficha de um órgão: quem o frequenta, com quem fala e o que saiu no DOU."""
    conn = db()
    try:
        summary = one(conn, """
            SELECT count(*) AS meetings, count(DISTINCT lobbyist_name) AS lobbyists,
                   count(DISTINCT entity_norm) AS entities,
                   count(DISTINCT authority_name) AS authorities,
                   min(meeting_date) AS first_meeting, max(meeting_date) AS last_meeting,
                   sum(CASE WHEN declared_topic IS NULL
                             OR length(trim(declared_topic)) < 25 THEN 1 ELSE 0 END) AS opaque
            FROM meetings WHERE public_body = ?
        """, [public_body])
        if not summary or not summary["meetings"]:
            raise HTTPException(404, f"Órgão sem reuniões registradas: {public_body}")

        total = summary["meetings"]
        opaque = summary["opaque"] or 0
        transparency = round((total - opaque) / total * 100, 1) if total else 0.0

        # Matriz de interação direta: par autoridade x lobista, que é a
        # unidade de análise do auditor.
        matrix = rows(conn, """
            SELECT m.authority_name, m.authority_role, m.lobbyist_name,
                   count(*) AS total_meetings,
                   mode(m.entity_name) AS company,
                   mode(m.declared_topic) AS predominant_topic
            FROM meetings m
            WHERE m.public_body = ? AND m.lobbyist_name IS NOT NULL
            GROUP BY m.authority_name, m.authority_role, m.lobbyist_name
            ORDER BY total_meetings DESC LIMIT ?
        """, [public_body, top])

        pair_evidence = _pair_dou_evidence(conn, public_body, matrix)

        critical_by_pair = {
            (r["authority_name"], r["lobbyist_name"]): r["n"]
            for r in rows(conn, """
                SELECT authority_name, lobbyist_name, count(*) AS n
                FROM correlations
                WHERE public_body = ? AND severity IN ('CRITICA', 'ALTA')
                GROUP BY authority_name, lobbyist_name
            """, [public_body])
        }

        critical_total = one(conn, """
            SELECT count(*) AS n FROM correlations
            WHERE public_body = ? AND severity = 'CRITICA'
        """, [public_body])
        correlated_value = one(conn, """
            SELECT coalesce(sum(value), 0) AS v FROM (
                SELECT DISTINCT dou_id, value FROM correlations
                WHERE public_body = ? AND value IS NOT NULL)
        """, [public_body])

        alerts = rows(conn, """
            SELECT c.*, a.title AS dou_title, a.is_no_bid FROM correlations c
            LEFT JOIN dou_acts a ON a.dou_id = c.dou_id
            WHERE c.public_body = ?
            ORDER BY c.risk_score DESC, c.delta_days ASC LIMIT 15
        """, [public_body])
        alert_no_bid = {a["dou_id"]: a.get("is_no_bid") for a in alerts}
        alert_summaries = _llm_outputs(conn, "summarize_act",
                                       [a["dou_id"] for a in alerts])
        alert_relations = _llm_outputs(conn, "judge_relation",
                                       [a["correlation_id"] for a in alerts])

        return {
            "public_body": public_body,
            "period": {"from": iso(summary["first_meeting"]),
                       "to": iso(summary["last_meeting"])},
            "totalMeetings": total,
            "transparencyIndex": transparency,
            "clarityRating": _clarity_rating(transparency),
            "opaqueMeetings": opaque,
            "distinctLobbyists": summary["lobbyists"],
            "distinctEntities": summary["entities"],
            "distinctAuthorities": summary["authorities"],
            "criticalAlertsCount": critical_total["n"] if critical_total else 0,
            "correlatedDouAmount": correlated_value["v"] if correlated_value else 0.0,
            "directInteractions": [{
                "authorityName": r["authority_name"] or "",
                "authorityRole": r["authority_role"] or "",
                "isMinister": "ministro" in (r["authority_role"] or "").lower(),
                "lobbyistId": person_id(r["lobbyist_name"]),
                "lobbyistName": r["lobbyist_name"],
                "company": r["company"] or "",
                "totalMeetings": r["total_meetings"],
                "criticalAlertsCount": critical_by_pair.get(
                    (r["authority_name"], r["lobbyist_name"]), 0),
                "predominantTopic": r["predominant_topic"] or "",
                # Evidência do DOU já na matriz: o auditor decide se abre a
                # ficha vendo o Δt, o ato e o link, sem precisar navegar.
                **pair_evidence.get((r["authority_name"], r["lobbyist_name"]),
                                    _EMPTY_EVIDENCE),
            } for r in matrix],
            "nonComplianceAlerts": [{
                "id": a["correlation_id"],
                "title": f"{a['act_type'] or 'Ato'} — {a['entity_name'] or ''}".strip(" —"),
                "entityName": a["entity_name"] or "",
                "actType": a["act_type"] or "",
                "actTitle": (a.get("dou_title") or "")[:140],
                "authority": a["authority_name"] or "",
                "lobbyist": a["lobbyist_name"] or "",
                "lobbyistId": person_id(a["lobbyist_name"] or ""),
                "meetingDate": iso(a["meeting_date"]),
                "date": iso(a["pub_date"]),
                "deltaDays": a["delta_days"],
                "issuingBody": a["organ_root"] or "",
                "severity": SEVERITY_PT_TO_EN.get(a["severity"], "LOW"),
                "riskScore": a["risk_score"],
                "douUrl": a["link_url"],
                "value": a["value"] or 0.0,
                "matchBasis": a["match_basis"],
                # Cada alerta carrega os fatores que produziram a gravidade.
                "severityReasons": severity_reasons(
                    a["delta_days"] or 0, a["value"], bool(alert_no_bid.get(a["dou_id"])),
                    bool(a["same_organ"]), a["proximity_lift"] or 0.0,
                    a["match_basis"] or "", a["prior_meetings_count"] or 0),
                "reading": _act_reading(alert_summaries.get(a["dou_id"]),
                                        alert_relations.get(a["correlation_id"])),
            } for a in alerts],
        }
    finally:
        conn.close()


# Teto de varredura por consulta. Acima disso a resposta é marcada como
# truncada, para a interface poder dizer que há mais do que o exibido.
SCAN_LIMIT = 6000


def _parse_br_date(raw: str | None) -> date | None:
    """Aceita dd/mm/aaaa (padrão brasileiro) e aaaa-mm-dd (ISO, do <input date>)."""
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise HTTPException(400, f"Data inválida: {raw!r}. Use dd/mm/aaaa.")


def _normalize_search_tokens(search_str: str) -> list[str]:
    import unicodedata
    s_norm = "".join(
        c for c in unicodedata.normalize("NFKD", search_str.lower())
        if not unicodedata.combining(c)
    ).strip()
    raw_tokens = [t for t in s_norm.split() if t]
    stop_words = {"de", "da", "do", "dos", "das", "e", "o", "a"}
    tokens = [t for t in raw_tokens if t not in stop_words or len(raw_tokens) == 1]
    return tokens if tokens else raw_tokens


def _interaction_filters(body: str | None, tier: str | None, search: str | None,
                         date_from: date | None, date_to: date | None,
                         skip: str | None = None) -> tuple[list[str], list]:
    """Cláusulas WHERE da consulta de relações.

    `skip` omite uma dimensão — é o que torna as facetas coerentes: a lista de
    órgãos disponíveis é calculada SEM o filtro de órgão, mas COM os demais.
    Sem isso, escolher um órgão zeraria a própria lista de órgãos.
    """
    clauses = ["length(m.authority_name) > 2"]
    params: list = []

    if body and skip != "body":
        clauses.append("m.public_body = ?")
        params.append(body)
    if tier and skip != "tier":
        clauses.append(f"{authority_tier_sql()} = ?")
        params.append(tier)
    if date_from:
        clauses.append("m.meeting_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("m.meeting_date <= ?")
        params.append(date_to)
    if search and skip != "search":
        import unicodedata
        s_norm = "".join(
            c for c in unicodedata.normalize("NFKD", search.lower())
            if not unicodedata.combining(c)
        ).strip()
        tokens = _normalize_search_tokens(search)

        auth_clause = " AND ".join(["strip_accents(lower(m.authority_name)) LIKE ?"] * len(tokens))
        lobb_clause = " AND ".join(["strip_accents(lower(m.lobbyist_name)) LIKE ?"] * len(tokens))
        ent_clause = " AND ".join(["strip_accents(lower(m.entity_name)) LIKE ?"] * len(tokens))
        body_clause = "strip_accents(lower(m.public_body)) LIKE ?"

        clauses.append(f"({auth_clause} OR {lobb_clause} OR {ent_clause} OR {body_clause})")
        params += [f"%{t}%" for t in tokens] * 3 + [f"%{s_norm}%"]
    return clauses, params


@app.get("/api/v1/analytics/interactions")
def interactions(
    search: Optional[str] = None,
    public_body: Optional[str] = None,
    tier: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    min_meetings: int = 1,
    only_with_dou: bool = False,
    page: int = 1,
    size: int = 50,
):
    """Relações entre visitantes externos ao governo e autoridades públicas.

    Devolve também as **facetas**: as opções ainda disponíveis em cada filtro,
    calculadas sob os demais filtros ativos. Escolher um período faz a lista de
    órgãos e de cargos encolher para o que existe naquele período.

    Datas aceitam dd/mm/aaaa.
    """
    conn = db()
    try:
        parsed_from = _parse_br_date(date_from)
        parsed_to = _parse_br_date(date_to)
        if parsed_from and parsed_to and parsed_from > parsed_to:
            raise HTTPException(400, "A data inicial é posterior à final.")

        clauses, params = _interaction_filters(
            public_body, tier, search, parsed_from, parsed_to)
        where = " AND ".join(clauses)

        # Ordenação com prioridade: se a busca bater no nome da autoridade pública (ex: "Marina Silva"),
        # coloca as audiências recebidas por ela no topo absoluto da listagem.
        order_clause = "meetings DESC"
        order_params = []
        if search:
            tokens = _normalize_search_tokens(search)
            if tokens:
                auth_order = " AND ".join(["strip_accents(lower(m.authority_name)) LIKE ?"] * len(tokens))
                order_clause = f"CASE WHEN {auth_order} THEN 0 ELSE 1 END, meetings DESC"
                order_params = [f"%{t}%" for t in tokens]

        # O cargo é classificado em Python (a hierarquia não é campo do banco),
        # então a consulta traz o cargo bruto e a faixa é aplicada depois.
        raw = rows(conn, f"""
            SELECT m.lobbyist_name, m.authority_name, m.authority_role, m.public_body,
                   count(*) AS meetings,
                   count(DISTINCT m.entity_norm) AS entities,
                   min(m.meeting_date) AS first_meeting,
                   max(m.meeting_date) AS last_meeting,
                   mode(m.entity_name) AS main_entity,
                   mode(m.declared_topic) AS main_topic,
                   sum(CASE WHEN m.declared_topic IS NULL
                             OR length(trim(m.declared_topic)) < 25 THEN 1 ELSE 0 END) AS opaque
            FROM meetings m WHERE {where}
            GROUP BY m.lobbyist_name, m.authority_name, m.authority_role, m.public_body
            HAVING count(*) >= ?
            ORDER BY {order_clause}
            LIMIT ?
        """, params + [min_meetings] + order_params + [SCAN_LIMIT])

        # O LIMIT existe por desempenho, mas não pode virar o total exibido.
        # Sem esta contagem, a tela dizia "4000 relações" em qualquer filtro.
        true_total = one(conn, f"""
            SELECT count(*) AS n FROM (
                SELECT 1 FROM meetings m WHERE {where}
                GROUP BY m.lobbyist_name, m.authority_name, m.authority_role,
                         m.public_body
                HAVING count(*) >= ?
            )
        """, params + [min_meetings])["n"]

        enriched = [{**row, "_tier": authority_tier(row["authority_role"])[0]}
                    for row in raw]

        dou = _dou_by_visitor(conn, [r["lobbyist_name"] for r in enriched])
        records = []
        for r in enriched:
            acts = (dou.get(r["lobbyist_name"], {}) or {}).get("acts", 0) or 0
            if only_with_dou and not acts:
                continue
            total_meetings = r["meetings"]
            records.append({
                "visitorId": person_id(r["lobbyist_name"]),
                "visitorName": r["lobbyist_name"],
                "authorityName": r["authority_name"],
                "authorityRole": r["authority_role"] or "",
                "authorityTier": r["_tier"],
                "authorityTierLabel": TIER_LABELS.get(r["_tier"], r["_tier"]),
                "isMinister": r["_tier"] == "MINISTERIAL",
                "publicBody": r["public_body"] or "",
                "meetings": total_meetings,
                "firstMeeting": iso(r["first_meeting"]),
                "lastMeeting": iso(r["last_meeting"]),
                "mainEntity": r["main_entity"] or "",
                "distinctEntities": r["entities"],
                "opaqueMeetings": r["opaque"] or 0,
                "opaquePct": round((r["opaque"] or 0) / total_meetings * 100, 1)
                             if total_meetings else 0.0,
                "mainTopic": r["main_topic"] or "",
                "douActsForEntity": acts,
            })

        matched = len(records)
        truncated = len(raw) >= SCAN_LIMIT
        # Com filtro de cargo ou de DOU, a seleção acontece em Python: o total
        # exato é o que sobrou; sem eles, vale a contagem completa do banco.
        # O cargo agora é filtrado em SQL, então só o filtro de DOU (aplicado
        # em Python) ainda reduz a contagem depois da consulta.
        total = matched if only_with_dou else true_total
        start_index = max(page - 1, 0) * size
        return {
            "totalElements": total,
            "truncated": truncated,
            "scanLimit": SCAN_LIMIT,
            "totalPages": (total + size - 1) // size if size else 0,
            "page": page,
            "size": size,
            "records": records[start_index:start_index + size],
            "facets": _interaction_facets(conn, public_body, tier, search,
                                          parsed_from, parsed_to),
            "appliedFilters": {
                "publicBody": public_body, "tier": tier, "search": search,
                "dateFrom": iso(parsed_from), "dateTo": iso(parsed_to),
            },
            "note": ("Relações entre pessoas externas ao governo e autoridades "
                     "públicas. Participantes que representam entes públicos não "
                     "entram na base."),
        }
    finally:
        conn.close()


def _dou_by_visitor(conn, names: list[str]) -> dict[str, dict]:
    unique = list({n for n in names if n})
    if not unique:
        return {}
    # Consulta em lotes: a cláusula IN do DuckDB degrada com milhares de itens.
    result: dict[str, dict] = {}
    for i in range(0, len(unique), 500):
        chunk = unique[i:i + 500]
        placeholders = ",".join("?" * len(chunk))
        for row in rows(conn, f"""
            SELECT m.lobbyist_name, count(DISTINCT c.dou_id) AS acts
            FROM meetings m JOIN correlations c ON c.entity_norm = m.entity_norm
            WHERE m.lobbyist_name IN ({placeholders})
            GROUP BY m.lobbyist_name
        """, chunk):
            result[row["lobbyist_name"]] = row
    return result


def _interaction_facets(conn, body, tier, search, date_from, date_to) -> dict:
    """Opções ainda disponíveis em cada filtro, sob os demais filtros ativos."""
    body_clauses, body_params = _interaction_filters(
        body, tier, search, date_from, date_to, skip="body")
    bodies = rows(conn, f"""
        SELECT m.public_body AS value, count(*) AS count
        FROM meetings m WHERE {" AND ".join(body_clauses)}
          AND m.public_body IS NOT NULL AND length(m.public_body) > 2
        GROUP BY 1 ORDER BY count DESC LIMIT 300
    """, body_params)

    tier_clauses, tier_params = _interaction_filters(
        body, tier, search, date_from, date_to, skip="tier")
    tier_counts = {
        row["tier"]: row["count"]
        for row in rows(conn, f"""
            SELECT {authority_tier_sql()} AS tier, count(*) AS count
            FROM meetings m WHERE {" AND ".join(tier_clauses)}
            GROUP BY 1
        """, tier_params)
    }

    span_clauses, span_params = _interaction_filters(body, tier, search, None, None)
    span = one(conn, f"""
        SELECT min(m.meeting_date) AS first, max(m.meeting_date) AS last
        FROM meetings m WHERE {" AND ".join(span_clauses)}
    """, span_params) or {}

    return {
        "bodies": [{"value": b["value"], "count": b["count"]} for b in bodies],
        "tiers": [
            {"value": key, "label": TIER_LABELS.get(key, key), "count": count}
            for key, count in sorted(tier_counts.items(), key=lambda kv: -kv[1])
        ],
        "dateRange": {"first": iso(span.get("first")), "last": iso(span.get("last"))},
    }


@app.get("/api/v1/analytics/sanctions")
def sanction_findings(include_out_of_scope: bool = False, page: int = 1, size: int = 50):
    """Empresas sancionadas que tiveram acesso a autoridades durante a vigência.

    O achado exige duas condições, não uma: a reunião ocorreu **na vigência** da
    sanção e **dentro do alcance** dela. Uma empresa suspensa por um município
    pode legalmente se reunir com um ministério federal — dois terços dos pares
    encontrados são exatamente isso, e por padrão não aparecem.
    """
    conn = db()
    try:
        where = "" if include_out_of_scope else "WHERE severity <> 'FORA_DE_ALCANCE'"
        total = one(conn, f"SELECT count(*) AS n FROM sanction_hits {where}")["n"]
        data = rows(conn, f"""
            SELECT * FROM sanction_hits {where}
            ORDER BY risk_score DESC, meetings_in_scope DESC
            LIMIT ? OFFSET ?
        """, [size, max(page - 1, 0) * size])

        return {
            "totalElements": total,
            "totalPages": (total + size - 1) // size if size else 0,
            "page": page,
            "records": [{
                "id": r["hit_id"],
                "sanctionedName": r["sanctioned_name"],
                "eagendasName": r["entity_name"],
                "cnpj": format_cnpj(r["cnpj"] or ""),
                "registry": r["registry"],
                "category": r["category"],
                "isBlocking": bool(r["is_blocking"]),
                "scope": r["scope"],
                "scopeReason": r["scope_reason"],
                "sanctioningBody": r["sanctioning_body"],
                "sphere": r["body_sphere"],
                "startDate": iso(r["start_date"]),
                "endDate": iso(r["end_date"]) or "sem prazo determinado",
                "meetingsDuringSanction": r["meetings_during"],
                "meetingsInScope": r["meetings_in_scope"],
                "bodiesInScope": r["bodies_in_scope"],
                "authorities": r["authorities_during"],
                "douActsDuring": r["dou_acts_during"],
                "douValueDuring": r["dou_value_during"] or 0.0,
                "severity": (SEVERITY_PT_TO_EN.get(r["severity"], "LOW")
                             if r["severity"] != "FORA_DE_ALCANCE" else "OUT_OF_SCOPE"),
                "riskScore": r["risk_score"],
            } for r in data],
            "note": ("Fonte: CEIS e CNEP (Portal da Transparência/CGU). O achado é o "
                     "acesso durante a vigência E dentro do alcance da sanção; a "
                     "existência da sanção, isolada, não é irregularidade de lobby."),
        }
    finally:
        conn.close()


@app.get("/api/v1/analytics/llm-reliability")
def llm_reliability():
    """Erro medido do julgamento de relação pauta↔ato.

    Publicado como endpoint porque a interface precisa declarar a
    confiabilidade junto do resultado. Um classificador que influencia a
    leitura de um achado sem erro conhecido é uma afirmação sem lastro.
    """
    path = config.DATA_DIR / "eval" / "relation_eval.json"
    if not path.exists():
        return {
            "measured": False,
            "warning": ("Julgamento de relação ainda não medido. Trate como "
                        "indicação, não como evidência."),
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    high_stakes = data.get("highStakesPrecision")
    return {
        "measured": True,
        "promptVersion": data.get("promptVersion"),
        "model": data.get("model"),
        "goldSize": data.get("goldSize"),
        "accuracy": data.get("accuracy"),
        "highStakesPrecision": high_stakes,
        "highStakesClaimed": data.get("highStakesClaimed"),
        "perLabel": data.get("perLabel"),
        "summary": _reliability_summary(data),
        "note": data.get("note"),
    }


def _reliability_summary(data: dict) -> str:
    claimed = data.get("highStakesClaimed") or 0
    accuracy = data.get("accuracy")
    size = data.get("goldSize")
    if claimed == 0:
        return (f"Em {size} pares rotulados, o modelo não afirmou 'mesma matéria' "
                f"nenhuma vez, e acertou {accuracy:.0%} das classificações. Os erros "
                "restantes ficam entre 'sem relação' e 'indeterminado' — ambos "
                "enfraquecem o indício, nenhum o reforça indevidamente.")
    precision = data.get("highStakesPrecision")
    return (f"Em {size} pares rotulados: acurácia {accuracy:.0%}; das {claimed} "
            f"afirmações de matéria relacionada, {precision:.0%} corretas.")


@app.get("/api/v1/analytics/bodies")
def list_bodies(limit: int = 200):
    conn = db()
    try:
        return rows(conn, """
            SELECT public_body, count(*) AS meetings FROM meetings
            WHERE public_body IS NOT NULL AND length(public_body) > 2
            GROUP BY public_body ORDER BY meetings DESC LIMIT ?
        """, [limit])
    finally:
        conn.close()


# --------------------------------------------------------- dataframe cru
@app.get("/api/v1/analytics/dataframe")
def dataframe_view(search: Optional[str] = None, page: int = 1, size: int = 50):
    conn = db()
    try:
        where, params = "WHERE 1=1", []
        if search:
            where += (" AND (lower(m.lobbyist_name) LIKE ? OR lower(m.entity_name) LIKE ?"
                      " OR lower(m.public_body) LIKE ? OR lower(m.declared_topic) LIKE ?)")
            term = f"%{search.strip().lower()}%"
            params += [term] * 4

        total = one(conn, f"SELECT count(*) AS n FROM meetings m {where}", params)["n"]

        # Uma reunião pode correlacionar com vários atos; sem agregar, o LEFT
        # JOIN multiplicaria linhas e a paginação não fecharia com o total.
        data = rows(conn, f"""
            WITH best AS (
                SELECT event_id, lobbyist_name,
                       arg_max(act_type, risk_score)  AS act_type,
                       arg_max(link_url, risk_score)  AS link_url,
                       arg_max(delta_days, risk_score) AS delta_days,
                       max(value)                     AS dou_value,
                       count(*)                       AS correlations
                FROM correlations GROUP BY event_id, lobbyist_name
            )
            SELECT m.*, b.delta_days, b.dou_value, b.act_type, b.link_url,
                   coalesce(b.correlations, 0) AS correlations
            FROM meetings m
            LEFT JOIN best b ON b.event_id = m.event_id
                            AND b.lobbyist_name = m.lobbyist_name
            {where}
            ORDER BY m.meeting_date DESC
            LIMIT ? OFFSET ?
        """, params + [size, max(page - 1, 0) * size])

        records = [{
            "event_id": r["event_id"],
            "date_time": iso(r["meeting_date"]),
            "visitor_name": r["lobbyist_name"] or "",
            "masked_cpf": "não disponível",
            "role": r["lobbyist_role"] or "",
            "company_name": r["entity_name"] or "",
            "cnpj": r["entity_cnpj"] or "",
            "public_body": r["public_body"] or "",
            "declared_topic": r["declared_topic"] or "",
            "authority_name": r["authority_name"] or "",
            "is_opaque_topic": is_opaque_topic(r["declared_topic"]),
            "dou_act_correlated": r.get("act_type") or "",
            "dou_url": r.get("link_url") or "",
            "dou_monetary_value": r.get("dou_value") or 0.0,
            "days_to_dou_act": r.get("delta_days"),
            "correlations_count": r.get("correlations") or 0,
        } for r in data]

        return {
            "shape": {"rows": total, "columns": len(records[0]) if records else 0},
            "columns": list(records[0].keys()) if records else [],
            "dtypes": {},
            "records": records,
            "page": page,
            "size": size,
        }
    finally:
        conn.close()


@app.get("/api/v1/analytics/stats")
def analytics_stats():
    conn = db()
    try:
        meetings = one(conn, """
            SELECT count(*) AS participations, count(DISTINCT event_id) AS events,
                   count(DISTINCT lobbyist_name) AS lobbyists,
                   count(DISTINCT entity_norm) AS entities,
                   count(DISTINCT public_body) AS bodies,
                   min(meeting_date) AS first_meeting, max(meeting_date) AS last_meeting
            FROM meetings
        """) or {}
        acts = one(conn, """
            SELECT count(*) AS total, sum(CASE WHEN is_federal THEN 1 ELSE 0 END) AS federal,
                   sum(CASE WHEN is_no_bid THEN 1 ELSE 0 END) AS no_bid
            FROM dou_acts
        """) or {}
        corr = one(conn, """
            SELECT count(*) AS total, avg(delta_days) AS avg_lag,
                   sum(CASE WHEN severity = 'CRITICA' THEN 1 ELSE 0 END) AS critical
            FROM correlations
        """) or {}
        value = one(conn, """
            SELECT coalesce(sum(value), 0) AS v FROM (
                SELECT DISTINCT dou_id, value FROM correlations WHERE value IS NOT NULL)
        """) or {}
        top = rows(conn, """
            SELECT lobbyist_name, count(*) AS n, count(DISTINCT public_body) AS bodies,
                   mode(entity_name) AS entity
            FROM meetings GROUP BY lobbyist_name ORDER BY n DESC LIMIT 10
        """)
        bodies = rows(conn, """
            SELECT public_body, count(*) AS n FROM meetings
            GROUP BY public_body ORDER BY n DESC LIMIT 15
        """)

        return {
            "summary_numeric": {
                "private_participations": meetings.get("participations", 0),
                "distinct_meetings": meetings.get("events", 0),
                "distinct_lobbyists": meetings.get("lobbyists", 0),
                "distinct_entities": meetings.get("entities", 0),
                "distinct_public_bodies": meetings.get("bodies", 0),
                "dou_acts_ingested": acts.get("total", 0),
                "dou_acts_federal": acts.get("federal", 0) or 0,
                "dou_acts_no_bid": acts.get("no_bid", 0) or 0,
                "correlations": corr.get("total", 0),
                "critical_correlations": corr.get("critical", 0) or 0,
                "avg_days_lag": round(corr.get("avg_lag") or 0.0, 1),
            },
            "period": {"from": iso(meetings.get("first_meeting")),
                       "to": iso(meetings.get("last_meeting"))},
            "body_counts": {b["public_body"]: b["n"] for b in bodies},
            "top_lobbyists": [{
                "visitor_name": t["lobbyist_name"],
                "meetings": t["n"],
                "distinct_bodies": t["bodies"],
                "company_name": t["entity"] or "",
            } for t in top],
            "total_monetary_value_dou": value.get("v", 0.0) or 0.0,
            "processed_with": "DuckDB + Pandas sobre e-Agendas/CGU e DOU/Imprensa Nacional",
            "data_gaps": UNAVAILABLE_SOURCES,
        }
    finally:
        conn.close()

# ---------------------------------------------------------------- LLM Relatórios
def _generate_deterministic_dossier_report(dossier: dict) -> str:
    p = dossier["person"]
    meetings = dossier.get("audienceTimeline", [])
    corrs = dossier.get("douCorrelations", [])
    red_flags = dossier.get("aiSummary", {}).get("identifiedRedFlags", [])
    entities = dossier.get("representedEntities", [])
    
    organs = {}
    for m in meetings:
        b = m.get("publicBodyName") or "Órgão Não Informado"
        organs[b] = organs.get(b, 0) + 1
    sorted_organs = sorted(organs.items(), key=lambda x: -x[1])
    organs_summary = ", ".join(f"{b} ({n})" for b, n in sorted_organs[:5]) or "Nenhum órgão registrado"
    
    short_deltas = [c for c in corrs if c.get("timeDeltaDays") is not None and c.get("timeDeltaDays") <= 30]
    total_val = sum(c.get("monetaryValue") or 0.0 for c in corrs)
    score = p.get("iaiScore", 0)
    risk_level = "CRÍTICO" if score >= 70 else ("ALTO" if score >= 40 else ("MÉDIO" if score >= 20 else "BAIXO"))
    data_emissao_extenso = _format_pt_br_date()
    
    # Diagrama visual de rede de relações em Mermaid
    mermaid_entities = "\n".join([f'    Ent_{i}["{ent[:30]}"]' for i, ent in enumerate(entities[:4])]) or '    Ent_0["Atuação Individual"]'
    mermaid_links_ent = "\n".join([f'    Actor -->|representa| Ent_{i}' for i in range(min(len(entities), 4))]) or '    Actor -->|atuação| Ent_0'
    top_orgs = sorted_organs[:3]
    mermaid_orgs = "\n".join([f'    Org_{i}["{org[:28]} ({cnt} aud.)"]' for i, (org, cnt) in enumerate(top_orgs)]) or '    Org_0["Órgãos Públicos"]'
    mermaid_links_org = "\n".join([f'    Actor -->|audiência| Org_{i}' for i in range(min(len(top_orgs), 3))]) or '    Actor -->|visita| Org_0'
    
    dou_mermaid = ""
    if corrs:
        dou_mermaid = f'\n    subgraph Atos_DOU["Atos Oficiais (DOU)"]\n      DOU_1["{len(corrs)} atos identificados (R$ {total_val:,.2f})"]\n    end\n    Actor -.->|correlação| DOU_1'
    
    mermaid_diagram = f"""```mermaid
graph LR
  subgraph Interlocutor["Interlocutor Auditado"]
    Actor["👤 {p.get('name')}"]
  end
  subgraph Entidades["Entidades Representadas"]
{mermaid_entities}
  end
  subgraph Orgaos["Órgãos do Executivo Federal"]
{mermaid_orgs}
  end{dou_mermaid}
{mermaid_links_ent}
{mermaid_links_org}
```"""

    intel = extract_topic_intelligence(meetings)
    thematic_clusters = intel.get("thematicClusters", [])
    between_the_lines = intel.get("betweenTheLines", [])
    citizen_impacts = intel.get("citizenImpacts", [])
    assets = intel.get("highlightedAssets", [])
    partners = intel.get("highlightedPartners", [])
    opaque_info = intel.get("opaqueAnalysis", {})

    lines = [
        "### 📋 Parecer Pericial Cívico — Robô Antunes",
        f"**Interlocutor Auditado:** {p.get('name')}",
        f"**Registro de Identificação:** {p.get('maskedCpf')}",
        f"**Empresas/Entidades Vinculadas:** {', '.join(entities) if entities else 'Não informadas'}",
        f"**Classificação Geral de Risco:** `{risk_level}` (IAI: **{score}/100** | Entropia ETT: **{p.get('entropyScore', 0):.2f}**)",
        "",
        "---",
        "",
        "#### 1. Diagnóstico Executivo & Síntese Fática da Atuação",
        f"- O interlocutor possui **{len(meetings)} audiências registradas** no sistema e-Agendas do Executivo Federal, distribuídas por **{len(organs)} órgãos públicos federais** (concentração principal em: **{organs_summary}**).",
        f"- O cruzamento com o Diário Oficial da União (DOU) identifica um volume financeiro acumulado de **R$ {total_val:,.2f}** em atos oficiais correlacionados às empresas representadas.",
    ]
    if assets:
        lines.append(f"- **Ativos e Estruturas Monitoradas nas Pautas:** {', '.join(assets)}.")
    if partners:
        lines.append(f"- **Operadoras e Parceiras Estratégicas em Audiências Conjuntas:** {', '.join(partners)}.")

    lines.append("")
    lines.append("#### 2. Decodificação Pericial das Pautas: Leitura nas Entrelinhas")
    if between_the_lines:
        for btl in between_the_lines:
            lines.append(f"- {btl}")
    else:
        lines.append("- As pautas registradas possuem teor predominantemente administrativo ou institucional padronizado sem anomalias aparentes.")

    if opaque_info.get("opaque", 0) > 0:
        lines.append(f"- ⚠️ **Opacidade de Pauta (Art. 11, § 2º Dec. nº 10.889/2021):** Foram identificadas **{opaque_info['opaque']} audiências ({opaque_info['pct']}%)** com pautas vagas ou genéricas (ex: apenas o nome da entidade ou 'reunião institucional').")
        if opaque_info.get("maskedByRoleCount", 0) > 0:
            lines.append(f"  - **Camuflagem por Autoridade:** Em **{opaque_info['maskedByRoleCount']} reuniões**, embora a pauta estivesse registrada com títulos inócuos como 'Reunião com Representantes', a autoridade demandada pertencia a coordenadorias de fiscalização, incidentes graves ou segurança operacional, evidenciando que tratavam-se de apurações regulatórias omitidas no título da agenda.")

    lines.append("")
    lines.append("#### 3. O Que Está em Jogo para o Cidadão e para o Interesse Público")
    if citizen_impacts:
        for ci in citizen_impacts:
            lines.append(f"- {ci}")
    else:
        lines.append("- O escrutínio cívico assegura a publicidade republicana e a higidez das decisões tomadas pelo Estado perante o cidadão comum.")

    if thematic_clusters:
        lines.append("")
        lines.append("#### 4. Núcleos Temáticos Substantivos Identificados")
        for cl in thematic_clusters:
            lines.append(f"##### 📌 {cl['category']} ({cl['count']} audiências)")
            lines.append(f"{cl['description']}")
            if cl.get("samples"):
                lines.append("Exemplos de pautas registradas:")
                for s in cl["samples"]:
                    lines.append(f"- `{s}`")
            lines.append("")

    lines.append("#### 5. Análise de Padrão e Entropia Temática (ETT)")
    if p.get("entropyScore", 0) >= 2.5:
        lines.append(f"- **Alta Dispersão Multissetorial (ETT = {p.get('entropyScore', 0):.2f}):** O visitante atua de forma transversal em múltiplos ministérios de competências não correlatas, caracterizando perfil típico de articulação multissetorial de alto nível.")
    else:
        lines.append(f"- **Trânsito Setorial Focal (ETT = {p.get('entropyScore', 0):.2f}):** A atuação concentra-se em nichos regulatórios específicos e órgãos correlatos à sua área de representação.")

    lines.append("")
    lines.append("#### 6. Trânsito Institucional & Autoridades Acessadas (e-Agendas)")
    lines.append("| # | Órgão | Autoridade Demandada | Cargo da Autoridade | Data | Pauta Registrada |")
    lines.append("|---|---|---|---|---|---|")
    for idx, m in enumerate(meetings[:35], 1):
        dt = (m.get("dateTime") or "—")[:10]
        if len(dt) == 10 and dt[4] == '-' and dt[7] == '-':
            dt = f"{dt[8:10]}/{dt[5:7]}/{dt[0:4]}"
        org = m.get("publicBodyName") or "Órgão N/I"
        aut = m.get("authorityName") or "Autoridade N/I"
        cargo = m.get("authorityRole") or "Autoridade Pública"
        pauta = (m.get("declaredTopic") or "Pauta não declarada")[:90]
        lines.append(f"| {idx} | {org} | {aut} | {cargo} | {dt} | {pauta} |")
    lines.append("")
    lines.append("#### 7. Rede Visual de Relações Institucionais")
    lines.append(mermaid_diagram)
    lines.append("")
    lines.append("#### 8. Relação Cronológica com Atos do Diário Oficial (DOU)")
    if corrs:
        lines.append(f"- Foram identificadas **{len(corrs)} correlações temporais** entre reuniões e publicações oficiais no DOU.")
        if short_deltas:
            lines.append(f"- ⚠️ **Atenção Prioritária:** Foram detectados **{len(short_deltas)} atos publicados em até 30 dias** após reuniões com a autoridade competente:")
            for c in short_deltas[:5]:
                dt = c.get("timeDeltaDays")
                lines.append(f"  - **{c.get('actType')}** ({c.get('publicationDate')}) pelo órgão *{c.get('issuingBody')}* — **Δt: {dt} dias** após reunião (Valor: R$ {c.get('monetaryValue', 0):,.2f}).")
        else:
            lines.append("- Não foram detectadas publicações com proximidade temporal extrema (< 30 dias), sugerindo decurso de prazo regular.")
        
        indet_count = sum(1 for c in corrs if (c.get("reading") or {}).get("relation") == "indeterminado" or (c.get("reading") or {}).get("overridden"))
        if indet_count:
            lines.append(f"- ℹ️ **Critério Pericial de Pauta (Art. 11, § 2º Dec. nº 10.889/2021):** Em **{indet_count} ato(s)**, a relação temática foi classificada como **Impossível determinar (pauta genérica)**, haja vista que o registro no e-Agendas não discriminou o objeto material da audiência, impossibilitando tecnicamente atestar convergência com o ato publicado.")
    else:
        lines.append("- Não constam contratos, dispensas ou portarias correlacionadas no DOU atribuídas diretamente a este interlocutor no período auditado.")

    lines.append("")
    lines.append("#### 9. Apontamentos e Sinalizadores de Risco (Red Flags)")
    if red_flags:
        for rf in red_flags:
            lines.append(f"- 🚩 {rf}")
    else:
        lines.append("- Nenhum apontamento crítico de gravidade extrema assinalado no cruzamento automatizado.")

    lines.append("")
    lines.append("#### 10. Recomendações Cívicas e Controle Social")
    lines.append("1. **Inspeção de Conformidade (Decreto nº 10.889/2021):** Requisitar aos órgãos públicos via LAI o detalhamento dos assuntos tratados nas reuniões com pautas genéricas.")
    lines.append("2. **Acompanhamento Processual:** Nos casos com proximidade temporal (Δt ≤ 30 dias), verificar os processos administrativos no SEI do órgão para validar notas técnicas e cronogramas de instrução.")
    lines.append("3. **Salvaguarda Metodológica:** Correlações temporais e de CNPJ constituem sinalizadores analíticos de triagem e não configuram juízo prévio de irregularidade.")

    lines.append("")
    lines.append("#### 11. Declaração Formal de Salvaguarda Cívica (Controle Social)")
    lines.append("O presente relatório é um **serviço público prestado por iniciativa cidadã independente**, fundamentado no exercício constitucional do controle social da administração pública (Art. 5º, XXXIII da CF/88 e Lei nº 12.527/2011 — Lei de Acesso à Informação). **Não se trata de documento oficial, processo disciplinar ou expediente interno da Controladoria-Geral da União (CGU) nem de qualquer órgão governamental.** As análises e sinalizadores estatísticos têm propósito informativo de incentivo à integridade e à transparência pública, não constituindo imputação de ilícito, crime, ato de improbidade administrativa ou culpa contra quaisquer pessoas ou entidades citadas, as quais gozam da presunção de legalidade e integridade.")
    lines.append("")
    lines.append(f"{data_emissao_extenso}")
    lines.append("")
    lines.append("---")
    lines.append("**Robô Antunes**  ")
    lines.append("*Auditor Robô Aposentado — Conselheiro Cívico de Transparência e Integridade*")

    return "\n".join(lines)


def _get_api_keys():
    """Obtém chaves do os.environ ou carrega diretamente de /Users/macmini/apps/CGU/.env."""
    import os
    keys = {
        "deepseek": os.getenv("DEEPSEEK_KEY") or os.getenv("DEEPSEEK_API_KEY", ""),
        "google": os.getenv("GOOGLE_API_KEY", ""),
        "openai": os.getenv("OPENAI_API_KEY", "")
    }
    # Tenta ler do .env se faltar alguma chave
    env_paths = [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        "/Users/macmini/apps/CGU/.env",
        ".env"
    ]
    for ep in env_paths:
        if os.path.exists(ep):
            try:
                with open(ep, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"\'')
                            if (k == "DEEPSEEK_KEY" or k == "DEEPSEEK_API_KEY") and not keys["deepseek"]:
                                keys["deepseek"] = v
                            elif k == "GOOGLE_API_KEY" and not keys["google"]:
                                keys["google"] = v
                            elif k == "OPENAI_API_KEY" and not keys["openai"]:
                                keys["openai"] = v
            except Exception:
                pass
            break
    return keys

def _call_deepseek(prompt: str, api_key: str, model: str = "deepseek-chat") -> tuple[str, str]:
    """Invoca a API da DeepSeek com o melhor modelo custo-benefício (deepseek-chat V3 ou deepseek-reasoner R1).
    Retorna (content, provider_label).
    """
    import urllib.request, json
    
    # deepseek-chat é o modelo oficial V3: mais barato ($0.14 / 1M input cache hit), ultrarrápido e altamente inteligente
    models_to_try = [model, "deepseek-chat", "deepseek-reasoner"]
    for m in models_to_try:
        try:
            url = "https://api.deepseek.com/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
            payload = {
                "model": m,
                "messages": [
                    {
                        "role": "system",
                        "content": "Você é o Robô Antunes — Auditor Pericial de Inteligência e Integridade Pública da Controladoria-Geral da União (CGU)."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.2 if m == "deepseek-chat" else None, # deepseek-reasoner não aceita temperature != 1/default
                "max_tokens": 8192
            }
            # Remove temperature para deepseek-reasoner conforme documentação oficial
            if m == "deepseek-reasoner":
                payload.pop("temperature", None)

            req = urllib.request.Request(
                url,
                headers=headers,
                data=json.dumps(payload).encode("utf-8"),
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                choice = res["choices"][0]
                content = choice["message"].get("content", "")
                reasoning = choice["message"].get("reasoning_content", "")
                
                label = f"Robô Antunes — DeepSeek V3 (Oficial)" if m == "deepseek-chat" else f"Robô Antunes — DeepSeek R1 (Thinking Mode)"
                if reasoning and m == "deepseek-reasoner":
                    # Adiciona bloco de raciocínio se for R1
                    content = f"> 🧠 **Raciocínio Pericial (DeepSeek Thinking Mode):**\n> {reasoning.strip().replace(chr(10), chr(10) + '> ')}\n\n---\n\n{content}"
                
                if content:
                    return content, label
        except Exception:
            continue
    return "", ""

def _call_gemini(prompt: str, api_key: str, model: str = "gemini-flash-latest") -> str:
    """Invoca a API do Google Gemini com fallback suave de modelo."""
    import urllib.request, json
    for m in [model, "gemini-2.5-flash", "gemini-pro-latest"]:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 4096
                }
            }
            req = urllib.request.Request(
                url,
                headers={"Content-Type": "application/json"},
                data=json.dumps(payload).encode("utf-8"),
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=35) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                candidates = res.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"]
        except Exception:
            continue
    return ""

# Cache em memória para relatórios gerados por hash de dados
# { person_key: { "hash": str, "report": str, "provider": str, "generatedAt": str, "evidenceCounts": dict } }
_DOSSIER_REPORT_CACHE: dict[str, dict] = {}

def _format_pt_br_date(dt: datetime = None) -> str:
    """Retorna data formal por extenso no padrão de Brasília (ex: Brasília, 4 de setembro de 2026)."""
    if dt is None:
        dt = datetime.now()
    meses = {
        1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril',
        5: 'maio', 6: 'junho', 7: 'julho', 8: 'agosto',
        9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro'
    }
    return f"Brasília, {dt.day} de {meses[dt.month]} de {dt.year}."

@app.post("/api/v1/dossier/generate-report/{person_key}")
def generate_dossier_report(person_key: str):
    """Gera relatório investigativo forense completo via LLM para a Ficha do Ator, com cache inteligente por hash."""
    import urllib.request, json, hashlib
    
    dossier = person_dossier(person_key)
    name = dossier["person"]["name"]
    p = dossier["person"]
    meetings = dossier.get("audienceTimeline", [])
    corrs = dossier.get("douCorrelations", [])
    red_flags = dossier.get("aiSummary", {}).get("identifiedRedFlags", [])
    entities = dossier.get("representedEntities", [])
    
    # Busca atos do DOU adicionais da empresa no banco para oferecer contexto completo ao modelo
    conn = db()
    company_acts_all = []
    try:
        norm_names = set()
        for ent in entities:
            if ent:
                norm_names.add(ent.lower().strip())
        if norm_names:
            company_filters = " OR ".join(["d.contracted_norm ILIKE ? OR d.contracted_name ILIKE ?" for _ in norm_names])
            params = []
            for n in norm_names:
                params.extend([f"%{n}%", f"%{n}%"])
            raw_acts = rows(conn, f"""
                SELECT DISTINCT d.pub_date, d.organ_root, d.act_type, d.title, d.summary, d.contracted_name, d.value, d.primary_cnpj
                FROM dou_acts d
                WHERE {company_filters}
                ORDER BY d.pub_date DESC
                LIMIT 35
            """, params)
            company_acts_all = raw_acts
    except Exception:
        company_acts_all = []
    finally:
        conn.close()

    # Inteligência Temática, Leitura nas Entrelinhas e Tradução Cívica
    topic_intel = extract_topic_intelligence(meetings)
    thematic_clusters = topic_intel.get("thematicClusters", [])
    between_the_lines = topic_intel.get("betweenTheLines", [])
    citizen_impacts = topic_intel.get("citizenImpacts", [])
    assets_found = topic_intel.get("highlightedAssets", [])
    partners_found = topic_intel.get("highlightedPartners", [])
    opaque_analysis = topic_intel.get("opaqueAnalysis", {})

    assets_str = ", ".join(assets_found) if assets_found else "Nenhum ativo específico isolado"
    partners_str = ", ".join(partners_found) if partners_found else "Atuação individual ou consórcios fechados"

    thematic_clusters_formatted = []
    for idx, c in enumerate(thematic_clusters, 1):
        thematic_clusters_formatted.append(f"### {idx}. {c['category']} ({c['count']} audiências)\n- {c['description']}")
        if c.get("samples"):
            thematic_clusters_formatted.append("  Pautas exemplo: " + " | ".join(c["samples"][:3]))
    thematic_clusters_str = "\n".join(thematic_clusters_formatted) if thematic_clusters_formatted else "Nenhum agrupamento temático expressivo detectado além da rotina ordinária."

    between_the_lines_str = "\n".join([f"- {btl}" for btl in between_the_lines]) if between_the_lines else "- Pautas predominantemente administrativas padronizadas."
    citizen_impacts_str = "\n".join([f"- {ci}" for ci in citizen_impacts]) if citizen_impacts else "- Fortalecimento dos princípios republicanos de publicidade e probidade administrativa."

    # Cálculo do Hash de integridade dos dados auditados (reuniões + atos)
    hash_payload = {
        "person_name": name,
        "prompt_version": "v3_forensic_citizen",
        "meetings_count": len(meetings),
        "meetings_events": [f"{m.get('id')}:{m.get('dateTime')}" for m in meetings[:50]],
        "corrs_count": len(corrs),
        "corrs_ids": [f"{c.get('id')}:{c.get('publicationDate')}" for c in corrs[:50]],
        "company_acts_count": len(company_acts_all),
        "iai": p.get("iaiScore"),
        "ett": round(p.get("entropyScore", 0.0), 2)
    }
    current_data_hash = hashlib.sha256(json.dumps(hash_payload, sort_keys=True).encode("utf-8")).hexdigest()

    # Verifica se já existe relatório idêntico em cache para este hash de dados
    # (Descarta se tiver bug antigo de "Não publicado" no cargo ou se faltar a seção profunda do cidadão/entrelinhas)
    cached = _DOSSIER_REPORT_CACHE.get(name)
    has_broken_roles = cached and ("Não publicado" in cached.get("report", "") or "Cargo não publicado" in cached.get("report", ""))
    is_old_synthesis = cached and ("O Que Está em Jogo para o Cidadão" not in cached.get("report", "") or "Decodificação Pericial" not in cached.get("report", ""))
    if cached and cached.get("hash") == current_data_hash and cached.get("report") and not has_broken_roles and not is_old_synthesis:
        return {
            "personName": name,
            "report": cached["report"],
            "generatedAt": cached["generatedAt"],
            "provider": cached["provider"],
            "dataHash": current_data_hash,
            "isCached": True,
            "evidenceCounts": {
                "meetings": len(meetings),
                "correlations": len(corrs),
                "companyDouActs": len(company_acts_all)
            }
        }

    data_emissao_extenso = _format_pt_br_date()
    
    # Formata o histórico detalhado das reuniões com CARGO explícito oficial
    meetings_formatted = []
    for idx, m in enumerate(meetings, 1):
        dt = m.get("dateTime", "Data N/I")
        org = m.get("publicBodyName", "Órgão N/I")
        aut = m.get("authorityName", "Autoridade N/I")
        cargo = m.get("authorityRole", "").strip() or "Autoridade Pública"
        pauta = m.get("declaredTopic", "Pauta não declarada")
        meetings_formatted.append(f"{idx}. [{dt}] Órgão: {org} | Autoridade: {aut} | Cargo: {cargo} | Pauta: {pauta}")
    meetings_str = "\n".join(meetings_formatted) if meetings_formatted else "Nenhuma audiência registrada."

    # Formata todos os atos correlacionados e atos gerais do DOU da empresa
    acts_formatted = []
    for idx, c in enumerate(corrs, 1):
        act = c.get("actType", "Ato")
        dt_pub = c.get("publicationDate", "Data N/I")
        iss = c.get("issuingBody", "Órgão emissor N/I")
        val = c.get("monetaryValue", 0.0)
        val_str = f"R$ {val:,.2f}" if val else "Sem valor financeiro estipulado"
        dt_delta = c.get("timeDeltaDays")
        delta_str = f"Δt = {dt_delta} dias após reunião" if dt_delta is not None else "Δt N/I"
        summ = c.get("summary", "")
    acts_str = "\n".join(acts_formatted) if acts_formatted else "Nenhum ato com vínculo monetário direto localizado no DOU para as entidades cadastradas."

    # Sumário dos atos gerais do DOU das empresas vinculadas
    company_dou_formatted = []
    for idx, a in enumerate(company_acts_all[:20], 1):
        dt_pub = a.get("pub_date", "Data N/I")
        org = a.get("organ_root", "Órgão N/I")
        tp = a.get("act_type", "Ato")
        val = a.get("value")
        val_str = f"R$ {val:,.2f}" if val else "Sem valor estipulado"
        tit = a.get("title") or a.get("summary") or ""
        company_dou_formatted.append(f"- [{dt_pub}] {tp} ({org}) - Valor: {val_str} - Objeto: {tit[:140]}")
    company_dou_str = "\n".join(company_dou_formatted) if company_dou_formatted else "Nenhum ato adicional da empresa localizado no acervo DOU."

    prompt = f"""Você é o Robô Antunes — Auditor Robô Aposentado, prestando um serviço cívico voluntário de inteligência em dados abertos para a sociedade civil e cidadãos, exercendo o controle social constitucional da administração pública (Art. 5º, XXXIII da CF/88 e Lei nº 12.527/2011 — LAI).
Sua missão é emitir uma NOTA TÉCNICA PERICIAL CÍVICA, ESTRITAMENTE BASEADA EM FATOS REGISTRADOS, com rigor analítico, linguagem jurídica e forense contida, sóbria e isenta de juízos de valor acusatórios.

DIRETRIZES DE SEGURANÇA JURÍDICA E DEVER DE URBANIDADE:
- IMPORTANTE: Deixe explícito que este documento NÃO É um expediente interno de órgão público ou da Controladoria-Geral da União (CGU). Trata-se de um SERVIÇO CÍVICO INDEPENDENTE DE TRANSPARÊNCIA PÚBLICA produzido por iniciativa cidadã a partir de dados governamentais abertos oficiais.
- NÃO faça juízos morais subjetivos, acusações de conduta ilícita intencional ("tentativa de enquadramento", "sem justificativa", "má-fé").
- Descreva fatos observáveis em dados públicos oficiais (e-Agendas e DOU).
- Esclareça que "Red Flags" são SINALIZADORES ESTATÍSTICOS DE RISCO DE CONFORMIDADE para priorização de auditoria e escrutínio cívico, e NÃO julgamento de culpa ou ilegalidade.
- A obrigação de detalhamento de pauta recai sobre o AGENTE PÚBLICO que registra a agenda (conforme Decreto nº 10.889/2021), e não sobre o cidadão/representante que visita o órgão.
- CRITÉRIO PERICIAL 'TRATA DA MATÉRIA DA PAUTA?': Esclareça expressamente que, quando a pauta registrada no e-Agendas é genérica ou opaca (ex: apenas cita o nome da empresa ou reunião institucional sem descrever o objeto da reunião), é TECNICAMENTE IMPOSSÍVEL DETERMINAR a relação temática com o ato do DOU. Nessas ocorrências, o sistema classifica a correlação como 'Impossível determinar (pauta genérica)', pois a ausência de objeto delimitado pelo órgão inviabiliza atestar nexo material ou causal.

ESTRUTURA OBRIGATÓRIA DA NOTA TÉCNICA PERICIAL (SIGA CADA SEÇÃO COM MÁXIMO RIGOR SUBSTANTIVO):

1. **SUMÁRIO EXECUTIVO & METADADOS DA AUDITORIA CÍVICA**
   - Tabela concisa: Interlocutor, Vínculos Empresariais/Entidades Declaradas, IAI ({p['iaiScore']}/100), Entropia ETT ({p['entropyScore']:.2f}), Total de Audiências ({len(meetings)}) e Atos DOU ({len(corrs)}).
   - Síntese Fática e Contexto Setorial: descreva com precisão a magnitude do trânsito institucional. Contextualize os principais ativos regulados monitorados ({assets_str}) e as empresas parceiras ou afretadoras multinacionais ({partners_str}). NUNCA faça um resumo raso de 1 parágrafo: disseque a natureza das operações.

2. **DECODIFICAÇÃO PERICIAL DAS PAUTAS: LEITURA NAS ENTRELINHAS**
   - NÃO se limite a reproduzir a redação burocrática das pautas. Analise o que os registros e os cargos oficiais das autoridades revelam sobre as negociações reais em curso.
   - Dissecte os seguintes eixos forenses identificados na base:
{between_the_lines_str}
   - Camuflagem por Autoridade / Opacidade: Em {opaque_analysis.get('opaque', 0)} audiências ({opaque_analysis.get('pct', 0)}% do total), o registro oficial no e-Agendas utilizou termos genéricos (ex: 'Reunião com Representantes'). Em {opaque_analysis.get('maskedByRoleCount', 0)} dessas ocasiões, a autoridade demandada pertencia a coordenadorias de fiscalização de incidentes graves ou segurança operacional. Explique como essa prática contorna a publicidade ativa exigida pelo Art. 11, § 2º do Decreto nº 10.889/2021, dificultando o escrutínio do cidadão.

3. **O QUE ESTÁ EM JOGO PARA O CIDADÃO E PARA A SOCIEDADE BRASILEIRA**
   - Traduza de forma clara, didática, neutra e objetiva o que essas tratativas representam para a sociedade:
{citizen_impacts_str}
   - REGRA DE OURO DE ISENÇÃO: NUNCA assuma posição de defesa de pautas ou teses. PROIBIDO fazer advocacia, militância ou juízo de valor a favor ou contra posições governamentais ou empresariais. Mantenha linguagem 100% neutra, isenta, técnica e descritiva. Apresente os fatos e matérias regulatórias de forma factual e imparcial (ex: 'Debates sobre tributação e parâmetros regulatórios do setor', 'Discussões sobre diretrizes de moderação e proteção de dados'), sem emitir opiniões.

4. **NÚCLEOS TEMÁTICOS SUBSTANTIVOS MAPEADOS**
   - Apresente os grandes eixos temáticos identificados nas audiências com suas contagens e exemplos práticos:
{thematic_clusters_str}

5. **RED FLAGS E SINALIZADORES DE CONFORMIDADE (METODOLOGIA)**
   - Explicação didática: O que são as Red Flags acionadas e por que o sistema as classificou como pontos de atenção (ex: pauta sem objeto material delimitado, concentração temporal, proximidade de publicação).
   - Enquadramento Normativo: Citar o Art. 11, § 2º do Decreto nº 10.889/2021, que estabelece o dever de publicação com a descrição objetiva do interesse representado e do assunto tratado.

6. **TRÂNSITO INSTITUCIONAL & AUTORIDADES ACESSADAS (e-Agendas)**
   - Apresente uma TABELA COMPLETA contendo:
     | Órgão | Autoridade Demandada | Cargo da Autoridade | Data da Audiência | Pauta Registrada |
   - CRÍTICO: Preencha a coluna 'Cargo da Autoridade' com o cargo público oficial exato fornecido no histórico abaixo (ex: MINISTRO DE ESTADO, SECRETÁRIO(A)-EXECUTIVO(A), DIRETOR(A)). NUNCA coloque 'Não publicado' se o cargo constar na relação de audiências fornecida.
   - Diagnóstico dos registros: percentual de registros com pauta detalhada versus pautas sintéticas/genéricas cadastradas pelos órgãos públicos.

7. **REDE VISUAL DE RELAÇÕES INSTITUCIONAIS**
   - Apresente um diagrama visual em bloco Mermaid (fenced code block com ```mermaid ... ```) utilizando `graph LR` conectando:
     [Interlocutor: Nome] -->|representa| [Entidades]
     [Interlocutor: Nome] -->|reuniu-se com| [Órgãos Públicos]
     [Órgãos Públicos] -->|gabinete| [Autoridades Chave]
     [Órgãos / Entidades] -.->|atos publicados| [Atos do DOU / Valores]
   - Mantenha o diagrama limpo, elegante e sintético (máximo de 6 a 8 nós principais).

8. **PANORAMA DE ATOS OFICIAIS NO DIÁRIO OFICIAL (DOU) & CORRELAÇÃO DE PAUTA**
   - Explique todos os atos ocorridos oficialmente com as empresas representadas no período auditado (extratos contratuais, aditivos, homologações, dispensas de licitação e valores).
   - Analise os deltas temporais (Δt) entre audiências e publicações no DOU (destaque casos de proximidade temporal).
   - Esclareça o critério da coluna 'Trata da matéria da pauta?': quando o registro no e-Agendas possui pauta genérica, a correlação é categorizada como 'Impossível determinar (pauta genérica)' em virtude da ausência de matéria especificada.

9. **RECOMENDAÇÕES TÉCNICAS E SALVAGUARDA CÍVICA (CONTROLE SOCIAL)**
   - 3 a 4 recomendações práticas de escrutínio e transparência.
   - DECLARAÇÃO FORMAL DE SALVAGUARDA CÍVICA: O presente relatório é um serviço público e cívico de controle social e transparência ativa, decorrente de iniciativa cidadã independente com base exclusiva em dados governamentais abertos (e-Agendas e DOU). Não constitui processo administrativo, documento interno de órgão público ou relatório oficial da CGU. Destina-se ao fortalecimento do escrutínio republicano e da integridade, não configurando imputação de ilícito, crime ou infração disciplinar contra quaisquer pessoas físicas ou jurídicas mencionadas, as quais gozam da presunção de legalidade e integridade.

10. **GLOSSÁRIO TÉCNICO DE MÉTRICAS CÍVICAS**
   - **Índice de Atividade Institucional (IAI):** Métrica ponderada (0 a 100) desenvolvida para quantificar a intensidade e a capilaridade de acesso de um agente privado aos tomadores de decisão pública.
   - **Entropia Temporal de Trânsito (ETT):** Indicador estatístico baseado na entropia de Shannon que mensura a dispersão ou concentração temática da interlocução.

DADOS DO INTERLOCUTOR:
- Nome: {p['name']} | Identificação: {p['maskedCpf']}
- Entidades Representadas: {', '.join(entities) if entities else 'Atuação individual / não declarada'}
- IAI: {p['iaiScore']}/100 | ETT: {p['entropyScore']:.2f}

HISTÓRICO OFICIAL NO E-AGENDAS COM CARGOS PÚBLICOS:
{meetings_str}

ATOS DIRETAMENTE CORRELACIONADOS NO DOU:
{acts_str}

ACERVO GERAL DE ATOS NO DOU DAS EMPRESAS VINCULADAS NO PERÍODO:
{company_dou_str}

REGRAS DE REDAÇÃO:
- Linguagem formal, sóbria e estritamente técnica.
- Diagramação Markdown: tabelas com `|`, títulos `###`, subtítulos `####`, listas `-` e bloco ` ```mermaid ` para a rede de relações.
- Finalize o documento com a data atual exata: "{data_emissao_extenso}" e a assinatura institucional:
---
**Robô Antunes**  
*Auditor Robô Aposentado — Conselheiro Cívico de Transparência e Integridade*
"""

    keys = _get_api_keys()
    report_text = ""
    provider_name = ""

    # 1. PRIORIDADE MÁXIMA: DEEPSEEK (deepseek-chat V3 - Melhor Custo-Benefício e Inteligência)
    if keys.get("deepseek"):
        report_text, provider_name = _call_deepseek(prompt, keys["deepseek"], model="deepseek-chat")

    # 2. Se DeepSeek não responder, tenta Google Gemini
    if not report_text and keys.get("google"):
        report_text = _call_gemini(prompt, keys["google"])
        if report_text:
            provider_name = "Robô Antunes — Google Gemini Flash (Fallback)"

    # 3. Se não, tenta OpenAI
    if not report_text and keys.get("openai") and not keys["openai"].startswith("sua_"):
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {keys['openai']}",
                },
                data=json.dumps({
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": "Você é o Robô Antunes, auditor de integridade da CGU."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                }).encode("utf-8")
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                report_text = res["choices"][0]["message"]["content"]
                provider_name = "Robô Antunes — OpenAI GPT-4o-mini"
        except Exception:
            report_text = ""

    # 4. Fallback determinístico pericial
    if not report_text:
        report_text = _generate_deterministic_dossier_report(dossier)
        provider_name = "Robô Antunes — Inteligência Pericial (CGU)"

    # Salva no cache com o hash de dados
    generated_iso = datetime.now().isoformat()
    _DOSSIER_REPORT_CACHE[name] = {
        "hash": current_data_hash,
        "report": report_text,
        "provider": provider_name,
        "generatedAt": generated_iso,
        "evidenceCounts": {
            "meetings": len(meetings),
            "correlations": len(corrs),
            "companyDouActs": len(company_acts_all)
        }
    }

    return {
        "personName": name,
        "report": report_text,
        "generatedAt": generated_iso,
        "provider": provider_name,
        "dataHash": current_data_hash,
        "isCached": False,
        "evidenceCounts": {
            "meetings": len(meetings),
            "correlations": len(corrs),
            "companyDouActs": len(company_acts_all)
        }
    }

@app.post("/api/v1/graph/generate-report")
def generate_graph_report(body: dict):
    """Gera relatório de análise da rede de influência via LLM a partir de filtros e nós ativos."""
    import urllib.request, json
    nodes_count = body.get("nodesCount", 0)
    edges_count = body.get("edgesCount", 0)
    public_body = body.get("publicBody", "Todos os Órgãos")
    filter_date = body.get("dateFilter", "Período Integral")
    actor_name = body.get("actorName", "Múltiplos Atores")
    
    prompt = f"""Você é o Robô Antunes, Auditor Pericial da CGU e Especialista em Análise de Redes Sociais Complexas (SNA).
Elabore uma análise pericial sintética da topologia e das conexões desta rede de influência:

PARÂMETROS DA REDE ATIVA:
- Órgão / Ministério Selecionado: {public_body}
- Filtro Temporal: {filter_date}
- Ator de Referência: {actor_name}
- Total de Nós (Entidades / Pessoas / Atos): {nodes_count}
- Total de Arestas (Interações / Conexões): {edges_count}

ESTRUTURA DO PARECER:
1. Centralidade e Hubs de Influência: Como os atores privados e autoridades interagem nesta amostragem.
2. Densidade da Rede e Pontes de Contato: Há concentração excessiva em gabinetes específicos?
3. Riscos de Captura Regulatória / Integridade Pública.
4. Próximos Passos recomendados aos Auditores da CGU.

Seja direto, técnico e institucional. Use markdown formal.
"""
    default_topology_report = f"""### 🌐 Parecer Pericial de Topologia de Rede — Robô Antunes (CGU)

**1. Parâmetros e Centralidade da Amostragem:**
- **Âmbito Auditado:** {public_body} (Filtro: {filter_date})
- **Ator(es) de Referência:** {actor_name}
- **Densidade Topológica:** A rede estruturada compreende **{nodes_count} nós** ativos e **{edges_count} conexões de interlocução**.

**2. Padrão de Circulação e Pontes Institucionais:**
- Observa-se a formação de clusters em torno de gabinetes ministeriais estratégicos e órgãos reguladores setoriais.
- Atores com alta centralidade de intermediação (*betweenness*) atuam como pontes prioritárias entre grupos empresariais e centros de tomada de decisão pública.

**3. Indicadores de Risco e Salvaguarda:**
- Recomenda-se o cruzamento específico com os extratos de inexigibilidade, dispensa de licitação e termos aditivos publicados no Diário Oficial da União (DOU).
- Correlações de rede fornecem sinalizadores de inteligência relacional para priorização pericial e não constituem presunção antecipada de irregularidade.
"""

    keys = _get_api_keys()
    report_text = ""
    provider_name = ""

    # 1. PRIORIDADE MÁXIMA: DEEPSEEK
    if keys.get("deepseek"):
        report_text, provider_name = _call_deepseek(prompt, keys["deepseek"], model="deepseek-chat")

    if not report_text and keys.get("google"):
        report_text = _call_gemini(prompt, keys["google"])
        if report_text:
            provider_name = "Robô Antunes — Google Gemini Flash (Fallback)"

    if not report_text and keys.get("openai") and not keys["openai"].startswith("sua_"):
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {keys['openai']}"},
                data=json.dumps({
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "system", "content": "Você é o Robô Antunes da CGU."}, {"role": "user", "content": prompt}],
                    "temperature": 0.2
                }).encode("utf-8")
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                report_text = res["choices"][0]["message"]["content"]
                provider_name = "Robô Antunes — OpenAI GPT-4o-mini"
        except Exception:
            report_text = ""

    if not report_text:
        report_text = default_topology_report
        provider_name = "Robô Antunes — Análise Pericial Cívica"

    return {
        "actorName": actor_name,
        "report": report_text,
        "generatedAt": datetime.now().isoformat(),
        "provider": provider_name
    }


# =========================================================================
# DOSSIÊ E ANÁLISE DE AUTORIDADES PÚBLICAS
# =========================================================================

_AUTHORITY_REPORT_CACHE: dict[str, dict] = {}


@app.get("/api/v1/authorities")
def list_authorities(
    q: Optional[str] = None,
    company: Optional[str] = None,
    organ: Optional[str] = None,
    tier: Optional[str] = None,
    sort_by: str = "meetings",
    page: int = 1,
    size: int = 20,
):
    """Lista autoridades públicas com agregação de métricas de audiências e transparência."""
    conn = db()
    try:
        where = ["m.authority_name IS NOT NULL AND length(trim(m.authority_name)) > 2"]
        params = []
        if q and q.strip():
            term = f"%{q.strip().lower()}%"
            where.append("(lower(m.authority_name) LIKE ? OR lower(m.authority_role) LIKE ? OR lower(m.entity_name) LIKE ?)")
            params.extend([term, term, term])
        if company and company.strip():
            term_c = f"%{company.strip().lower()}%"
            where.append("lower(m.entity_name) LIKE ?")
            params.append(term_c)
        if organ and organ != "ALL":
            where.append("m.public_body = ?")
            params.append(organ)

        where_clause = "WHERE " + " AND ".join(where)

        total = one(conn, f"""
            SELECT count(DISTINCT m.authority_name) AS n
            FROM meetings m
            {where_clause}
        """, params)["n"]

        order_col = "meetings_count"
        if sort_by == "opacity":
            order_col = "opaque_meetings_count"
        elif sort_by == "entities":
            order_col = "distinct_entities"
        elif sort_by == "lobbyists":
            order_col = "distinct_lobbyists"

        offset = max(0, (page - 1) * size)

        query_sql = f"""
            SELECT 
                m.authority_name,
                arg_max(m.authority_role, m.meeting_date) AS authority_role,
                arg_max(m.public_body, m.meeting_date) AS public_body,
                count(*) AS meetings_count,
                count(DISTINCT m.lobbyist_name) AS distinct_lobbyists,
                count(DISTINCT m.entity_name) AS distinct_entities,
                list(DISTINCT m.entity_name) FILTER (WHERE m.entity_name IS NOT NULL AND length(trim(m.entity_name)) > 1)[1:4] AS matched_entities,
                sum(CASE WHEN m.declared_topic IS NULL OR length(trim(m.declared_topic)) < 25 THEN 1 ELSE 0 END) AS opaque_meetings_count,
                min(m.meeting_date) AS first_meeting,
                max(m.meeting_date) AS last_meeting
            FROM meetings m
            {where_clause}
            GROUP BY m.authority_name
            ORDER BY {order_col} DESC
            LIMIT ? OFFSET ?
        """
        rows_data = rows(conn, query_sql, params + [size, offset])

        items = []
        for r in rows_data:
            total_m = r["meetings_count"] or 1
            opaque_m = r["opaque_meetings_count"] or 0
            tier_code, _ = authority_tier(r["authority_role"])
            if tier and tier != "ALL" and tier_code != tier:
                continue
            matched = [e for e in (r.get("matched_entities") or []) if e and e.strip()]
            items.append({
                "id": person_id(r["authority_name"]),
                "authorityName": r["authority_name"],
                "authorityRole": r["authority_role"] or "Cargo não publicado",
                "publicBody": r["public_body"] or "Órgão não informado",
                "tier": tier_code,
                "tierLabel": TIER_LABELS.get(tier_code, "Outro Cargo"),
                "meetingsCount": r["meetings_count"],
                "distinctLobbyists": r["distinct_lobbyists"],
                "distinctEntities": r["distinct_entities"],
                "matchedEntities": matched,
                "opaqueMeetingsCount": opaque_m,
                "opacityRate": round(opaque_m / total_m, 3),
                "firstMeeting": iso(r["first_meeting"]),
                "lastMeeting": iso(r["last_meeting"]),
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "size": size,
            "totalPages": max(1, math.ceil(total / size)),
        }
    finally:
        conn.close()


@app.get("/api/v1/dossier/authority/{authority_key}")
def authority_dossier(authority_key: str):
    """Dossiê completo da autoridade pública (perfil, reuniões recebidas, top entidades e atos DOU)."""
    conn = db()
    try:
        exact_name = None
        row_name = one(conn, """
            SELECT authority_name FROM meetings
            WHERE authority_name IS NOT NULL
            GROUP BY authority_name
            HAVING md5(lower(authority_name)) = ? OR lower(authority_name) = lower(?)
            LIMIT 1
        """, [authority_key, authority_key])
        if row_name:
            exact_name = row_name["authority_name"]
        else:
            term = f"%{authority_key.strip().lower()}%"
            flex_row = one(conn, """
                SELECT authority_name FROM meetings
                WHERE lower(authority_name) LIKE ?
                GROUP BY authority_name ORDER BY count(*) DESC LIMIT 1
            """, [term])
            if flex_row:
                exact_name = flex_row["authority_name"]

        if not exact_name:
            raise HTTPException(404, f"Autoridade pública não encontrada no e-Agendas: {authority_key}")

        meetings = rows(conn, """
            SELECT event_id, meeting_date, public_body, declared_topic,
                   authority_name, authority_role, entity_name, entity_norm,
                   entity_cnpj, lobbyist_name, lobbyist_masked_cpf
            FROM meetings WHERE authority_name = ?
            ORDER BY meeting_date DESC
        """, [exact_name])

        main_role = next((m["authority_role"] for m in meetings if m.get("authority_role")), "Cargo não publicado")
        main_body = next((m["public_body"] for m in meetings if m.get("public_body")), "Órgão não informado")

        entity_counts: dict[str, int] = {}
        for m in meetings:
            ent = (m.get("entity_name") or "").strip()
            if ent and ent not in ("Não especificada", "Não informado", ""):
                entity_counts[ent] = entity_counts.get(ent, 0) + 1
        top_entities = [
            {"name": k, "count": v, "pct": round(v / len(meetings) * 100, 1)}
            for k, v in sorted(entity_counts.items(), key=lambda x: -x[1])
        ]

        lobbyist_counts: dict[str, dict] = {}
        for m in meetings:
            lob = (m.get("lobbyist_name") or "").strip()
            if lob:
                if lob not in lobbyist_counts:
                    lobbyist_counts[lob] = {
                        "name": lob,
                        "id": person_id(lob),
                        "count": 0,
                        "maskedCpf": m.get("lobbyist_masked_cpf") or "Não publicado",
                        "entity": m.get("entity_name") or "Não especificada",
                    }
                lobbyist_counts[lob]["count"] += 1
        top_lobbyists = sorted(lobbyist_counts.values(), key=lambda x: -x["count"])

        opaque_meetings = [m for m in meetings if is_opaque_topic(m.get("declared_topic"))]
        opaque_pct = round(len(opaque_meetings) / len(meetings) * 100, 1) if meetings else 0.0

        # 1. Correlações das entidades que se reuniram com esta autoridade
        correlations = rows(conn, """
            WITH auth_entities AS (
                SELECT entity_norm, min(meeting_date) AS first_mtg, max(meeting_date) AS last_mtg,
                       count(*) AS auth_meetings
                FROM meetings
                WHERE authority_name = ? AND entity_norm IS NOT NULL AND entity_norm != ''
                GROUP BY entity_norm
            )
            SELECT DISTINCT 
                c.correlation_id, c.dou_id, c.entity_norm, c.entity_name, c.act_type,
                c.value, c.delta_days, c.risk_score, c.match_confidence, c.link_url,
                a.title AS dou_title, a.summary AS dou_summary,
                a.contracted_name, a.primary_cnpj, a.is_no_bid, a.pub_date, a.organ_root,
                ae.auth_meetings, ae.last_mtg
            FROM correlations c
            JOIN auth_entities ae ON c.entity_norm = ae.entity_norm
            LEFT JOIN dou_acts a ON a.dou_id = c.dou_id
            ORDER BY c.risk_score DESC, c.delta_days ASC
            LIMIT 100
        """, [exact_name])

        seen_dou_ids = {c["dou_id"] for c in correlations if c.get("dou_id")}

        # 2. Atos diretos de dou_acts (órgão da autoridade, menção nominal ou empresas contratadas)
        auth_first_last = [p for p in exact_name.split() if len(p) > 2]
        auth_keyword = f"%{auth_first_last[-1].lower()}%" if auth_first_last else "%"

        direct_acts = rows(conn, """
            SELECT dou_id, section, title AS dou_title, act_type, pub_date, organ_root,
                   organ_hierarchy, summary AS dou_summary, link_url, contracted_name,
                   primary_cnpj, value, is_no_bid
            FROM dou_acts
            WHERE (
                (contracted_norm IN (SELECT DISTINCT entity_norm FROM meetings WHERE authority_name = ? AND entity_norm IS NOT NULL AND entity_norm != ''))
                OR (organ_root = ? OR lower(organ_root) LIKE ?)
                OR (lower(summary) LIKE ? OR lower(title) LIKE ?)
            )
            ORDER BY pub_date DESC
            LIMIT 60
        """, [exact_name, main_body, f"%{main_body.lower()}%", auth_keyword, auth_keyword])

        act_ids_for_summary = list(seen_dou_ids) + [d["dou_id"] for d in direct_acts]
        act_summaries = _llm_outputs(conn, "summarize_act", act_ids_for_summary)
        relations = _llm_outputs(conn, "judge_relation", [c["correlation_id"] for c in correlations])

        dou_items = []
        for c in correlations:
            reading = _act_reading(act_summaries.get(c["dou_id"]), relations.get(c["correlation_id"]))
            dou_items.append({
                "id": c["correlation_id"],
                "actId": c["dou_id"],
                "publicationDate": iso(c["pub_date"]),
                "issuingBody": c["organ_root"] or main_body,
                "actType": c["act_type"] or "Ato Oficial",
                "summary": (c.get("dou_summary") or c.get("dou_title") or "")[:400],
                "monetaryValue": c.get("value") or 0.0,
                "timeDeltaDays": c.get("delta_days"),
                "ownMeetingDate": iso(c.get("last_mtg")),
                "entityName": c.get("entity_name") or "",
                "lobbyistName": c.get("entity_name") or "Entidade Recebida",
                "lobbyistId": person_id(c.get("entity_name") or ""),
                "semanticScore": c.get("match_confidence", 0.0),
                "douUrl": c.get("link_url"),
                "isNoBid": bool(c.get("is_no_bid")),
                "contractedName": c.get("contracted_name") or "",
                "reading": reading,
            })

        for d in direct_acts:
            if d["dou_id"] in seen_dou_ids:
                continue
            seen_dou_ids.add(d["dou_id"])
            reading = _act_reading(act_summaries.get(d["dou_id"]), None)
            dou_items.append({
                "id": "direct-" + str(d["dou_id"]),
                "actId": d["dou_id"],
                "publicationDate": iso(d["pub_date"]),
                "issuingBody": d["organ_root"] or main_body,
                "actType": d["act_type"] or "Ato Oficial",
                "summary": (d.get("dou_summary") or d.get("dou_title") or "")[:400],
                "monetaryValue": d.get("value") or 0.0,
                "timeDeltaDays": None,
                "ownMeetingDate": None,
                "entityName": d.get("contracted_name") or main_body,
                "lobbyistName": "",
                "lobbyistId": "",
                "semanticScore": 1.0,
                "douUrl": d.get("link_url"),
                "isNoBid": bool(d.get("is_no_bid")),
                "contractedName": d.get("contracted_name") or "",
                "reading": reading,
            })

        charts = _authority_charts(meetings, dou_items)
        tier_code, _ = authority_tier(main_role)

        return {
            "authority": {
                "id": person_id(exact_name),
                "name": exact_name,
                "role": main_role,
                "publicBody": main_body,
                "tier": tier_code,
                "tierLabel": TIER_LABELS.get(tier_code, "Outro Cargo"),
                "totalMeetings": len(meetings),
                "distinctLobbyists": len(lobbyist_counts),
                "distinctEntities": len(entity_counts),
                "opaqueMeetingsCount": len(opaque_meetings),
                "clearMeetingsCount": len(meetings) - len(opaque_meetings),
                "opacityRatePct": opaque_pct,
            },
            "topEntities": top_entities[:20],
            "topLobbyists": top_lobbyists[:20],
            "charts": charts,
            "audienceTimeline": [{
                "id": m["event_id"],
                "dateTime": iso(m["meeting_date"]),
                "publicBodyName": m["public_body"] or main_body,
                "authorityName": exact_name,
                "authorityRole": m.get("authority_role") or main_role,
                "lobbyistName": m.get("lobbyist_name") or "Não informado",
                "lobbyistId": person_id(m.get("lobbyist_name") or ""),
                "lobbyistMaskedCpf": m.get("lobbyist_masked_cpf") or "Não publicado",
                "representedEntity": m.get("entity_name") or "Não informada",
                "declaredTopic": m.get("declared_topic") or "Pauta não declarada",
                "isOpaque": is_opaque_topic(m.get("declared_topic")),
            } for m in meetings[:500]],
            "douCorrelations": dou_items,
        }
    finally:
        conn.close()


def _generate_deterministic_authority_report(dossier: dict) -> str:
    auth = dossier["authority"]
    meetings = dossier.get("audienceTimeline", [])
    corrs = dossier.get("douCorrelations", [])
    top_entities = dossier.get("topEntities", [])
    top_lobbyists = dossier.get("topLobbyists", [])
    data_extenso = _format_pt_br_date()

    entities_summary = ", ".join(f"{e['name']} ({e['count']})" for e in top_entities[:4]) or "Nenhuma informada"
    lobbyists_summary = ", ".join(f"{l['name']} ({l['count']})" for l in top_lobbyists[:4]) or "Nenhum informado"

    # Mermaid diagram para autoridade
    mermaid_ent_lines = []
    for i, e in enumerate(top_entities[:4]):
        ename = e["name"][:25]
        ecnt = e["count"]
        mermaid_ent_lines.append(f'    Ent_{i}["{ename} ({ecnt} aud.)"]')
    mermaid_ents = "\n".join(mermaid_ent_lines) or '    Ent_0["Empresas Atendidas"]'
    mermaid_links = "\n".join([f'    Auth -->|recebeu| Ent_{i}' for i in range(min(len(top_entities), 4))]) or '    Auth -->|atendimento| Ent_0'

    auth_role_clean = auth["role"][:35]
    mermaid_diagram = f"""```mermaid
graph TD
  subgraph Gabinete["Autoridade Pública"]
    Auth["🏛️ {auth['name']} - {auth_role_clean}"]
  end
  subgraph SetorPrivado["Principais Entidades Atendidas"]
{mermaid_ents}
  end
{mermaid_links}
```"""

    lines = [
        "### 📋 Parecer Pericial Cívico — Robô Antunes",
        f"**Autoridade Auditada:** {auth['name']}",
        f"**Cargo Declarado:** {auth['role']}",
        f"**Órgão Público:** {auth['publicBody']}",
        f"**Índice de Opacidade de Pauta:** **{auth['opacityRatePct']}%** ({auth['opaqueMeetingsCount']} de {auth['totalMeetings']} reuniões com pauta genérica)",
        "",
        "---",
        "",
        "#### 1. Diagnóstico Executivo de Audiências Públicas",
        f"- A autoridade concedeu **{auth['totalMeetings']} audiências registradas** no sistema e-Agendas do Executivo Federal.",
        f"- Atendeu a **{auth['distinctEntities']} empresas/entidades distintas** e **{auth['distinctLobbyists']} interlocutores/representantes**.",
        f"- Principais entidades recebidas no gabinete: **{entities_summary}**.",
        f"- Principais interlocutores recebidos: **{lobbyists_summary}**.",
        "",
        "#### 2. Conformidade com o Art. 11 do Decreto nº 10.889/2021",
        f"- O gabinete registrou **{auth['clearMeetingsCount']} reuniões com pauta descritiva ({100 - auth['opacityRatePct']:.1f}%)** e **{auth['opaqueMeetingsCount']} reuniões com pauta genérica ({auth['opacityRatePct']}%)**.",
        "- Reuniões registradas apenas como 'Reunião institucional' ou apenas com o nome da empresa representam descumprimento formal ao dever de transparência ativa do agente público.",
        "",
        "#### 3. Rede Visual de Relacionamento Institucional",
        mermaid_diagram,
        "",
        "#### 4. Correlação com Atos Oficiais Publicados no DOU",
    ]

    if corrs:
        lines.append(f"- Foram identificados **{len(corrs)} atos oficiais no DOU** relacionados a empresas que se reuniram previamente com esta autoridade.")
        short_deltas = [c for c in corrs if c.get("timeDeltaDays") is not None and c.get("timeDeltaDays") <= 30]
        if short_deltas:
            lines.append(f"- ⚠️ **Atenção:** {len(short_deltas)} atos foram publicados em até 30 dias após reuniões concedidas.")
            for c in short_deltas[:4]:
                lines.append(f"  - **{c.get('actType')}** ({c.get('publicationDate')}) — empresa: *{c.get('entityName')}* (Δt: {c.get('timeDeltaDays')} dias).")
    else:
        lines.append("- Não constam correlações diretas com atos do DOU registradas para as reuniões desta autoridade no recorte analisado.")

    lines.append("")
    lines.append("#### 5. Recomendações Cívicas e Controle Social")
    lines.append("1. **Aperfeiçoamento dos Registros da Agenda:** Recomenda-se à chefia de gabinete o preenchimento pormenorizado do assunto das reuniões no e-Agendas, evitando designações genéricas.")
    lines.append("2. **Transparência Passiva (LAI):** Cidadãos e pesquisadores podem solicitar cópia das memórias de reunião dos encontros que tiveram correlação com atos do DOU via Fala.BR.")
    lines.append("")
    lines.append("#### 6. Declaração Formal de Salvaguarda Cívica (Controle Social)")
    lines.append("O presente relatório é um **serviço público e cívico independente**, fundamentado no controle social da administração pública (Art. 5º, XXXIII da CF/88 e Lei nº 12.527/2011 — LAI). **Não se trata de processo administrativo, expediente interno de órgão público ou relatório oficial da CGU.** As análises e métricas têm caráter estritamente analítico e informativo, não configurando acusação de conduta imprópria contra a autoridade ou quaisquer participantes, que gozam da presunção de legitimidade de seus atos.")
    lines.append("")
    lines.append(f"{data_extenso}")
    lines.append("")
    lines.append("---")
    lines.append("**Robô Antunes**  ")
    lines.append("*Auditor Robô Aposentado — Conselheiro Cívico de Transparência e Integridade*")

    return "\n".join(lines)


@app.post("/api/v1/dossier/generate-authority-report/{authority_key}")
def generate_authority_report(authority_key: str):
    """Gera relatório forense cívico via LLM para uma autoridade pública com cache inteligente."""
    import urllib.request, json, hashlib

    dossier = authority_dossier(authority_key)
    auth = dossier["authority"]
    name = auth["name"]
    meetings = dossier.get("audienceTimeline", [])
    corrs = dossier.get("douCorrelations", [])
    top_entities = dossier.get("topEntities", [])
    top_lobbyists = dossier.get("topLobbyists", [])

    hash_payload = {
        "authority_name": name,
        "meetings_count": len(meetings),
        "opaque_count": auth["opaqueMeetingsCount"],
        "corrs_count": len(corrs),
        "corrs_ids": [f"{c.get('id')}:{c.get('publicationDate')}" for c in corrs[:30]],
        "top_entities": [e["name"] for e in top_entities[:10]],
    }
    current_data_hash = hashlib.sha256(json.dumps(hash_payload, sort_keys=True).encode("utf-8")).hexdigest()

    cached = _AUTHORITY_REPORT_CACHE.get(name)
    if cached and cached.get("hash") == current_data_hash and cached.get("report"):
        return {
            "authorityName": name,
            "report": cached["report"],
            "generatedAt": cached["generatedAt"],
            "provider": cached["provider"],
            "dataHash": current_data_hash,
            "isCached": True,
            "evidenceCounts": {
                "meetings": len(meetings),
                "correlations": len(corrs),
                "entities": len(top_entities)
            }
        }

    data_emissao_extenso = _format_pt_br_date()

    meetings_formatted = []
    for idx, m in enumerate(meetings[:60], 1):
        dt = m.get("dateTime", "Data N/I")
        lob = m.get("lobbyistName", "Interlocutor N/I")
        ent = m.get("representedEntity", "Entidade N/I")
        pauta = m.get("declaredTopic", "Pauta não declarada")
        meetings_formatted.append(f"{idx}. [{dt}] Interlocutor: {lob} | Entidade: {ent} | Pauta: {pauta}")
    meetings_str = "\n".join(meetings_formatted) if meetings_formatted else "Nenhuma audiência registrada."

    acts_formatted = []
    for idx, c in enumerate(corrs[:30], 1):
        act = c.get("actType", "Ato")
        dt_pub = c.get("publicationDate", "Data N/I")
        val = c.get("monetaryValue", 0.0)
        val_str = f"R$ {val:,.2f}" if val else "Sem valor financeiro estipulado"
        dt_delta = c.get("timeDeltaDays")
        delta_str = f"Δt = {dt_delta} dias" if dt_delta is not None else "Δt N/I"
        ent = c.get("entityName", "")
        acts_formatted.append(f"{idx}. [{dt_pub}] {act} — Empresa: {ent} | {val_str} | Proximidade: {delta_str}")
    acts_str = "\n".join(acts_formatted) if acts_formatted else "Nenhum ato com vínculo monetário direto localizado no DOU."

    prompt = f"""Você é o Robô Antunes — Auditor Robô Aposentado, prestando um serviço cívico voluntário de inteligência em dados abertos para a sociedade civil e cidadãos, exercendo o controle social constitucional da administração pública (Art. 5º, XXXIII da CF/88 e Lei nº 12.527/2011 — LAI).
Sua missão é emitir um PARECER PERICIAL CÍVICO SOBRE A AGENDA DA AUTORIDADE PÚBLICA, estritamente baseado em fatos registrados no e-Agendas e Diário Oficial da União (DOU), com sobriedade analítica, equilíbrio institucional e isenção absoluta de juízos acusatórios ou conjecturas de má-fé.

DIRETRIZES DE SEGURANÇA JURÍDICA E DEVER DE URBANIDADE:
- IMPORTANTE: Este documento NÃO É um expediente oficial nem processo disciplinar de órgão público ou da CGU. É um SERVIÇO CÍVICO INDEPENDENTE DE TRANSPARÊNCIA PÚBLICA por iniciativa cidadã.
- Não faça acusações de conduta ilícita, improbidade ou direcionamento. A autoridade pública tem presunção de legalidade e integridade.
- A obrigação de detalhamento de pauta recai sobre o órgão e o gabinete da autoridade (Art. 11, § 2º do Decreto nº 10.889/2021). Avalie objetivamente a proporção de pautas com objeto delimitado vs pautas genéricas/opacas.
- CRITÉRIO PERICIAL 'TRATA DA MATÉRIA DA PAUTA?': Quando a pauta é genérica, é tecnicamente impossível determinar relação temático-causal com o ato do DOU.

ESTRUTURA DO RELATÓRIO CÍVICO:
1. **SUMÁRIO EXECUTIVO DA AUTORIDADE**
   - Tabela concisa: Autoridade, Cargo/Função, Órgão Público, Total de Reuniões ({auth['totalMeetings']}), Entidades Recebidas ({auth['distinctEntities']}), Interlocutores ({auth['distinctLobbyists']}) e Índice de Opacidade ({auth['opacityRatePct']}%).
   - Síntese de 1 parágrafo sobre a intensidade de interlocução da autoridade.

2. **DIAGNÓSTICO DE TRANSPARÊNCIA DA AGENDA (DECRETO Nº 10.889/2021)**
   - Avaliação detalhada do cumprimento do Art. 11, § 2º pelo gabinete.
   - Análise estatística de pautas claras vs genéricas (quantas descrevem assunto específico vs quantas apenas nomeiam empresas ou 'Reunião').

3. **PADRÃO DE ACESSO E ASSIMETRIA DE REPRESENTAÇÃO**
   - Identificação dos setores econômicos e empresas com maior presença no gabinete da autoridade.
   - Observação sobre pluralidade de representação social e empresarial.

4. **REDE VISUAL DE RELACIONAMENTO INSTITUCIONAL**
   - Diagrama visual em bloco Mermaid (fenced code block com ```mermaid ... ```) utilizando `graph TD` ou `graph LR`:
     [Autoridade: Nome] -->|recebeu| [Principais Empresas]
     [Autoridade: Nome] -->|interlocutores| [Principais Visitantes]
     [Empresas] -.->|atos publicados| [Atos do DOU]
   - Sintético e legível.

5. **PANORAMA DE ATOS OFICIAIS NO DOU APÓS AUDIÊNCIAS**
   - Descrição dos atos publicados após as reuniões da autoridade, destacando proximidade temporal (Δt ≤ 30 dias) e o critério de pauta genérica.

6. **RECOMENDAÇÕES CÍVICAS E SALVAGUARDA (CONTROLE SOCIAL)**
   - Recomendações de aprimoramento da transparência e gestão de integridade pública.
   - DECLARAÇÃO FORMAL DE SALVAGUARDA CÍVICA: O presente parecer é fruto de iniciativa cidadã independente de controle social e transparência ativa. Não constitui documento interno governamental ou acusação formal, preservada a presunção de legalidade de todos os agentes e entidades envolvidas.

DADOS DA AUTORIDADE AUDITADA:
- Nome: {name} | Cargo: {auth['role']} | Órgão: {auth['publicBody']}
- Total de Reuniões: {auth['totalMeetings']} | Pautas Opacas: {auth['opaqueMeetingsCount']} ({auth['opacityRatePct']}%)
- Entidades Mais Frequentes: {', '.join([f"{e['name']} ({e['count']})" for e in top_entities[:8]])}
- Interlocutores Mais Frequentes: {', '.join([f"{l['name']} ({l['count']})" for l in top_lobbyists[:8]])}

AMOSTRA CRONOLÓGICA DE AUDIÊNCIAS NO E-AGENDAS:
{meetings_str}

ATOS DO DOU RELACIONADOS:
{acts_str}

REGRAS DE REDAÇÃO:
- Linguagem formal, sóbria e técnica.
- Diagramação Markdown com tabelas `|`, títulos `###`, subtítulos `####`, listas `-` e bloco ` ```mermaid `.
- Finalize com a data: "{data_emissao_extenso}" e a assinatura:
---
**Robô Antunes**  
*Auditor Robô Aposentado — Conselheiro Cívico de Transparência e Integridade*
"""

    keys = _get_api_keys()
    report_text = ""
    provider_name = ""

    if keys.get("deepseek"):
        report_text, provider_name = _call_deepseek(prompt, keys["deepseek"], model="deepseek-chat")

    if not report_text and keys.get("google") and not keys["google"].startswith("sua_"):
        report_text = _call_gemini_rest(prompt, keys["google"])
        if report_text:
            provider_name = "Robô Antunes — Google Gemini Flash (Fallback)"

    if not report_text:
        report_text = _generate_deterministic_authority_report(dossier)
        provider_name = "Robô Antunes — Análise Pericial Cívica"

    _AUTHORITY_REPORT_CACHE[name] = {
        "hash": current_data_hash,
        "report": report_text,
        "provider": provider_name,
        "generatedAt": datetime.now().isoformat(),
    }

    return {
        "authorityName": name,
        "report": report_text,
        "generatedAt": datetime.now().isoformat(),
        "provider": provider_name,
        "dataHash": current_data_hash,
        "isCached": False,
        "evidenceCounts": {
            "meetings": len(meetings),
            "correlations": len(corrs),
            "entities": len(top_entities)
        }
    }

