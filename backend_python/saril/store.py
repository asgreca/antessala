"""Gerenciador de Banco de Dados DuckDB e Persistência do Antessala (`store.py`).

FUNÇÃO NO PROJETO:
- Define o schema SQL, conexões e operações de banco de dados analítico de altíssima performance (DuckDB).
- Garante a consistência entre a base de escrita do pipeline (`saril.duckdb`) e a base de leitura atômica da API (`saril_serving.duckdb`).

COMO FUNCIONA:
1. `init_db`: cria tabelas otimizadas (`meetings`, `entities`, `dou_acts`, `correlations`, `sanctions`, `ingest_log`).
2. `write_connection`: abre conexão exclusiva para processos de escrita do pipeline.
3. `serving_connection`: abre conexões somente leitura para a API FastAPI servindo requisições dos usuários em tempo real sem concorrência de trava.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from contextlib import contextmanager

import duckdb

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS meetings (
    event_id        BIGINT,
    meeting_date    DATE,
    public_body     VARCHAR,
    declared_topic  VARCHAR,
    authority_name  VARCHAR,
    authority_role  VARCHAR,
    lobbyist_name   VARCHAR,
    lobbyist_role   VARCHAR,
    lobbyist_masked_cpf VARCHAR,
    entity_name     VARCHAR,
    entity_norm     VARCHAR,
    entity_cnpj     VARCHAR
);

CREATE TABLE IF NOT EXISTS entities (
    entity_norm      VARCHAR PRIMARY KEY,
    display_name     VARCHAR,
    cnpj             VARCHAR,
    cnpjs            VARCHAR,
    meetings_count   BIGINT,
    lobbyists_count  BIGINT,
    bodies_count     BIGINT,
    authorities_count BIGINT,
    first_meeting    DATE,
    last_meeting     DATE
);

CREATE TABLE IF NOT EXISTS dou_acts (
    dou_id          VARCHAR PRIMARY KEY,
    section         VARCHAR,
    url_title       VARCHAR,
    title           VARCHAR,
    act_type        VARCHAR,
    pub_date        DATE,
    edition         VARCHAR,
    page            VARCHAR,
    organ_hierarchy VARCHAR,
    organ_root      VARCHAR,
    summary         VARCHAR,
    link_url        VARCHAR,
    full_text       VARCHAR,
    contracted_name VARCHAR,
    contracted_norm VARCHAR,
    contracting_name VARCHAR,
    contracting_norm VARCHAR,
    primary_cnpj    VARCHAR,
    all_cnpjs       VARCHAR,
    value           DOUBLE,
    value_label     VARCHAR,
    process_number  VARCHAR,
    uasg            VARCHAR,
    act_number      VARCHAR,
    legal_basis     VARCHAR,
    is_no_bid       BOOLEAN,
    is_federal      BOOLEAN,
    found_by_term   VARCHAR,
    fetched_at      TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS correlations (
    correlation_id   VARCHAR PRIMARY KEY,
    dou_id           VARCHAR,
    entity_norm      VARCHAR,
    entity_name      VARCHAR,
    event_id         BIGINT,
    meeting_date     DATE,
    pub_date         DATE,
    delta_days       INTEGER,
    match_basis      VARCHAR,
    match_confidence DOUBLE,
    same_organ       BOOLEAN,
    severity         VARCHAR,
    risk_score       DOUBLE,
    value            DOUBLE,
    authority_name   VARCHAR,
    lobbyist_name    VARCHAR,
    public_body      VARCHAR,
    organ_root       VARCHAR,
    declared_topic   VARCHAR,
    act_type         VARCHAR,
    link_url         VARCHAR,
    proximity_lift        DOUBLE,
    prior_meetings_count  INTEGER,
    distinct_authorities  INTEGER,
    distinct_lobbyists    INTEGER,
    earliest_meeting_date DATE
);

CREATE TABLE IF NOT EXISTS sanctions (
    sanction_id       VARCHAR,
    registry          VARCHAR,
    person_type       VARCHAR,
    document          VARCHAR,
    cnpj              VARCHAR,
    name              VARCHAR,
    name_norm         VARCHAR,
    corporate_name    VARCHAR,
    category          VARCHAR,
    is_blocking       BOOLEAN,
    start_date        DATE,
    end_date          DATE,
    publication_date  DATE,
    publication       VARCHAR,
    process_number    VARCHAR,
    scope             VARCHAR,
    sanctioning_body  VARCHAR,
    body_sphere       VARCHAR,
    legal_basis       VARCHAR
);

CREATE TABLE IF NOT EXISTS sanction_hits (
    hit_id                   VARCHAR PRIMARY KEY,
    entity_norm              VARCHAR,
    entity_name              VARCHAR,
    sanctioned_name          VARCHAR,
    cnpj                     VARCHAR,
    sanction_id              VARCHAR,
    registry                 VARCHAR,
    category                 VARCHAR,
    is_blocking              BOOLEAN,
    scope                    VARCHAR,
    body_sphere              VARCHAR,
    sanctioning_body         VARCHAR,
    start_date               DATE,
    end_date                 DATE,
    meetings_during          INTEGER,
    meetings_in_scope        INTEGER,
    bodies_in_scope          INTEGER,
    scope_reason             VARCHAR,
    first_meeting_during     DATE,
    last_meeting_during      DATE,
    authorities_during       INTEGER,
    bodies_during            INTEGER,
    lobbyists_during         INTEGER,
    dou_acts_during          INTEGER,
    dou_value_during         DOUBLE,
    severity                 VARCHAR,
    risk_score               DOUBLE
);

-- Saídas do LLM, gravadas com modelo, versão do prompt e hash da entrada.
-- Um achado citado num relatório precisa ser reproduzível meses depois.
CREATE TABLE IF NOT EXISTS llm_outputs (
    output_id      VARCHAR PRIMARY KEY,
    task           VARCHAR,
    ref_type       VARCHAR,   -- dou_act | correlation
    ref_id         VARCHAR,
    model          VARCHAR,
    prompt_version VARCHAR,
    input_hash     VARCHAR,
    output_json    VARCHAR,
    ok             BOOLEAN,
    error          VARCHAR,
    duration_s     DOUBLE,
    created_at     TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS ingest_log (
    run_id     VARCHAR,
    stage      VARCHAR,
    detail     VARCHAR,
    rows       BIGINT,
    started_at TIMESTAMP,
    ended_at   TIMESTAMP
);
"""


# Colunas de contexto agregado, introduzidas quando a correlação passou a ser
# por ato em vez de por reunião. `correlations` é integralmente derivada, então
# recriar é mais seguro que migrar.
_CORRELATION_COLUMNS = {
    "proximity_lift", "prior_meetings_count", "distinct_authorities",
    "distinct_lobbyists", "earliest_meeting_date",
}


def connect(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        conn = duckdb.connect(str(config.DB_PATH), read_only=read_only)
    except duckdb.IOException as exc:
        # O DuckDB admite um só escritor. Etapas do pipeline não podem correr
        # em paralelo, e o traceback cru não dizia isso a quem opera.
        raise RuntimeError(
            "Banco em uso por outra etapa do pipeline (o DuckDB aceita um "
            "único escritor). Encerre a etapa em andamento antes de seguir:\n"
            "  pkill -f 'saril.pipeline'\n"
            f"Detalhe: {exc}"
        ) from exc
    if not read_only:
        _migrate_dou_acts(conn)
        _migrate_sanction_hits(conn)
        _migrate_meetings(conn)
        _migrate_entities(conn)
        _migrate_correlations(conn)
        conn.execute(SCHEMA)
    return conn


def _migrate_sanction_hits(conn: duckdb.DuckDBPyConnection) -> None:
    existing = conn.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'sanction_hits'
    """).fetchall()
    if existing and "sanctioned_name" not in {r[0] for r in existing}:
        conn.execute("DROP TABLE sanction_hits")


def _migrate_dou_acts(conn: duckdb.DuckDBPyConnection) -> None:
    """Adiciona all_cnpjs preservando os atos já coletados.

    Diferente de `entities` e `correlations`, `dou_acts` guarda o resultado de
    coleta na rede: recriar custaria milhares de requisições ao portal.
    """
    existing = conn.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'dou_acts'
    """).fetchall()
    names = {r[0] for r in existing} if existing else set()
    for column in ("all_cnpjs", "contracting_name", "contracting_norm"):
        if existing and column not in names:
            conn.execute(f"ALTER TABLE dou_acts ADD COLUMN {column} VARCHAR")


def _migrate_meetings(conn: duckdb.DuckDBPyConnection) -> None:
    existing = conn.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'meetings'
    """).fetchall()
    if existing and "lobbyist_masked_cpf" not in {r[0] for r in existing}:
        conn.execute("DROP TABLE meetings")


def _migrate_entities(conn: duckdb.DuckDBPyConnection) -> None:
    existing = conn.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'entities'
    """).fetchall()
    if existing and "cnpjs" not in {r[0] for r in existing}:
        conn.execute("DROP TABLE entities")


def _migrate_correlations(conn: duckdb.DuckDBPyConnection) -> None:
    existing = conn.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'correlations'
    """).fetchall()
    if not existing:
        return
    names = {r[0] for r in existing}
    if not _CORRELATION_COLUMNS.issubset(names):
        conn.execute("DROP TABLE correlations")


@contextmanager
def session(read_only: bool = False):
    conn = connect(read_only=read_only)
    try:
        yield conn
    finally:
        conn.close()


def publish_snapshot() -> None:
    """Publica uma cópia consistente do banco para a API ler.

    O DuckDB admite um único escritor por arquivo: sem isso, a API cairia com
    "Conflicting lock" toda vez que o pipeline estivesse rodando. A troca final
    é atômica (os.replace), então a API nunca lê um arquivo pela metade.
    """
    if not config.DB_PATH.exists():
        return
    tmp_fd, tmp_name = tempfile.mkstemp(
        dir=str(config.DATA_DIR), prefix=".saril_serving_", suffix=".duckdb"
    )
    os.close(tmp_fd)
    try:
        try:
            with duckdb.connect(str(config.DB_PATH)) as conn:
                conn.execute("CHECKPOINT")
        except duckdb.IOException:
            # Outro processo está escrevendo. Copiar assim mesmo entrega o
            # último estado consolidado, que é consistente por construção.
            pass
        shutil.copyfile(config.DB_PATH, tmp_name)
        os.replace(tmp_name, config.SERVING_DB_PATH)
    except Exception:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


class SnapshotUnavailable(RuntimeError):
    """Nem o snapshot nem o banco vivo estão legíveis no momento."""


def serving_connection() -> duckdb.DuckDBPyConnection:
    """Conexão somente-leitura ao snapshot servido pela API.

    Cai para o banco vivo apenas quando ainda não há snapshot publicado — o que
    funciona fora de uma janela de ingestão. Durante a ingestão o DuckDB nega o
    lock, e a mensagem precisa dizer ao operador o que fazer.
    """
    if config.SERVING_DB_PATH.exists():
        return duckdb.connect(str(config.SERVING_DB_PATH), read_only=True)

    try:
        return duckdb.connect(str(config.DB_PATH), read_only=True)
    except duckdb.IOException as exc:
        raise SnapshotUnavailable(
            "Ingestão em andamento e nenhum snapshot publicado ainda. "
            "Ao final da ingestão o snapshot é publicado automaticamente; "
            "para forçar agora, rode: python -m saril.pipeline publish"
        ) from exc


def log_stage(conn, run_id: str, stage: str, detail: str, rows: int, started, ended) -> None:
    conn.execute(
        "INSERT INTO ingest_log VALUES (?, ?, ?, ?, ?, ?)",
        [run_id, stage, detail, rows, started, ended],
    )
