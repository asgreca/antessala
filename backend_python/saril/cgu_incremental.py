"""Motor de processamento e classificação incremental de audiências do e-Agendas (CGU).

Identifica estritamente registros novos (deltas), classifica transparência de pauta,
normaliza entidades e insere de forma transacional no DuckDB sem reprocessar a base histórica.
"""
from __future__ import annotations

import csv
import logging
from datetime import datetime
from pathlib import Path
import pandas as pd

from . import config, store
from .eagendas import PRIVATE_LABEL, explode_private_participants
from .normalize import is_public_entity

logger = logging.getLogger("saril.cgu_incremental")

COLS_MAP = {
    "ID do registro": "event_id",
    "Nome": "authority_name",
    "Cargo/Função": "authority_role",
    "Órgão/Entidade": "public_body",
    "Data de início": "date_start",
    "Assunto do Compromisso": "declared_topic",
    "Participantes": "raw_participants",
    "event_id": "event_id",
    "authority_name": "authority_name",
    "authority_role": "authority_role",
    "public_body": "public_body",
    "date_start": "date_start",
    "declared_topic": "declared_topic",
    "raw_participants": "raw_participants",
}


def read_cgu_csv(path: Path) -> pd.DataFrame:
    """Lê arquivo CSV do governo federal com detecção resiliente de encoding e delimitador."""
    encodings = ["utf-8-sig", "utf-8", "iso-8859-1", "latin-1"]
    sample = None
    used_encoding = "utf-8"

    for enc in encodings:
        try:
            with open(path, "r", encoding=enc, errors="replace") as f:
                sample = f.read(4096)
                used_encoding = enc
                break
        except Exception:
            continue

    delimiter = ","
    if sample:
        try:
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample, delimiters=";,|\t")
            delimiter = dialect.delimiter
        except Exception:
            delimiter = ";" if ";" in sample and sample.count(";") > sample.count(",") else ","

    df = pd.read_csv(
        path,
        sep=delimiter,
        quotechar='"',
        on_bad_lines="skip",
        low_memory=False,
        encoding=used_encoding,
    )

    df.columns = [c.strip() for c in df.columns]
    existing_cols = {k: v for k, v in COLS_MAP.items() if k in df.columns}
    df_clean = df[list(existing_cols.keys())].rename(columns=existing_cols)

    # Converte date_start para datetime
    if "date_start" in df_clean.columns:
        df_clean["date_start"] = pd.to_datetime(
            df_clean["date_start"], format=config.EAGENDAS_DATE_FORMAT, errors="coerce"
        )
        # Se falhar no formato padrão, tenta inferência ISO
        if df_clean["date_start"].isna().all():
            df_clean["date_start"] = pd.to_datetime(df["Data de início"], errors="coerce")
        df_clean = df_clean[df_clean["date_start"].notna()]

    return df_clean


def process_cgu_deltas(csv_paths: list[Path], conn=None) -> tuple[int, list[dict]]:
    """Processa novos arquivos CSV da CGU, filtrando apenas linhas inéditas e atualizando o DuckDB."""
    from .pipeline import (
        consolidate_entities,
        consolidate_by_similarity,
        _refine_entity_cnpjs,
    )

    if not csv_paths:
        return 0, []

    close_at_end = False
    if conn is None:
        conn = store.connect()
        close_at_end = True

    try:
        # 1. Carrega o conjunto de chaves existentes no banco para desduplicação O(1)
        existing_rows = conn.execute(
            "SELECT DISTINCT event_id, lobbyist_name, entity_norm FROM meetings"
        ).fetchall()
        existing_keys = {(r[0], r[1], r[2]) for r in existing_rows}
        logger.info(f"Base atual possui {len(existing_keys):,} pares únicos em meetings.")

        all_new_chunks: list[pd.DataFrame] = []

        for p in csv_paths:
            if not p.exists():
                continue
            logger.info(f"Analisando arquivo: {p.name}")
            try:
                df = read_cgu_csv(p)
            except Exception as e:
                logger.error(f"Erro ao ler {p}: {e}")
                continue

            if df.empty or "raw_participants" not in df.columns:
                continue

            # Filtra registros com participantes privados
            mask_private = df["raw_participants"].astype(str).str.contains(
                PRIVATE_LABEL, na=False
            )
            df_private = df[mask_private]
            if df_private.empty:
                continue

            # Explode participantes
            exploded = explode_private_participants(df_private)
            if exploded.empty:
                continue

            exploded = exploded[exploded["entity_norm"].str.len() >= 3]
            exploded = exploded[~exploded["entity_name"].map(is_public_entity)]
            exploded = exploded[exploded["authority_name"].astype(str).str.len() > 2]

            if exploded.empty:
                continue

            # Filtra linhas delta que NÃO existem na base
            is_new = [
                (row.event_id, row.lobbyist_name, row.entity_norm) not in existing_keys
                for row in exploded.itertuples(index=False)
            ]
            new_chunk = exploded[is_new]

            if not new_chunk.empty:
                logger.info(f"  &bull; {p.name}: {len(new_chunk):,} novas participações identificadas.")
                all_new_chunks.append(new_chunk)
                # Atualiza chaves em memória para evitar duplicações intra-lote
                for row in new_chunk.itertuples(index=False):
                    existing_keys.add((row.event_id, row.lobbyist_name, row.entity_norm))

        if not all_new_chunks:
            logger.info("Nenhuma nova linha identificada nos arquivos processados.")
            return 0, []

        df_all_new = pd.concat(all_new_chunks, ignore_index=True)
        df_all_new = consolidate_entities(df_all_new)
        df_all_new = consolidate_by_similarity(df_all_new)

        total_new_rows = len(df_all_new)
        logger.info(f"Inserindo {total_new_rows:,} novas linhas em meetings...")

        # Inserção transacional
        conn.register("df_new_meetings", df_all_new)
        conn.execute("INSERT INTO meetings SELECT * FROM df_new_meetings")

        # Atualiza tabela de entidades
        conn.execute("DELETE FROM entities")
        conn.execute("""
            INSERT INTO entities
            SELECT
                entity_norm,
                mode(entity_name)                                           AS display_name,
                mode(entity_cnpj) FILTER (WHERE entity_cnpj IS NOT NULL)    AS cnpj,
                NULL                                                        AS cnpjs,
                count(*)                                                    AS meetings_count,
                count(DISTINCT lobbyist_name)                               AS lobbyists_count,
                count(DISTINCT public_body)                                 AS bodies_count,
                count(DISTINCT authority_name)                              AS authorities_count,
                min(meeting_date)                                           AS first_meeting,
                max(meeting_date)                                           AS last_meeting
            FROM meetings
            GROUP BY entity_norm
        """)
        _refine_entity_cnpjs(conn)

        # Registra evento na tabela de auditoria
        run_id = f"sync_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        store.log_stage(
            conn,
            run_id,
            "sync-cgu",
            f"{total_new_rows} novas audiências inseridas",
            total_new_rows,
            datetime.now(),
            datetime.now(),
        )

        sample_summary = [
            {
                "authority": r["authority_name"],
                "role": r["authority_role"],
                "body": r["public_body"],
                "entity": r["entity_name"],
                "date": str(r["meeting_date"]),
                "topic": r["declared_topic"][:60],
            }
            for _, r in df_all_new.head(10).iterrows()
        ]

        return total_new_rows, sample_summary

    finally:
        if close_at_end:
            conn.close()
