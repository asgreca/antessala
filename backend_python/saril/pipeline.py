"""CLI e Orquestrador Principal do Pipeline de Dados (`pipeline.py`).

FUNÇÃO NO PROJETO:
- Atua como a Interface de Linha de Comando (CLI) e o motor orquestrador de execução de todas as etapas de dados do Antessala.
- Permite rodar a sincronização contínua do e-Agendas (`sync-cgu`), a varredura dirigida do DOU (`ingest-dou`), o recálculo de correlações (`correlate`) ou a carga completa (`all`).

COMO FUNCIONA:
1. `sync-cgu`: baixa novos CSVs mensais do e-Agendas, identifica deltas e insere no DuckDB de forma incremental e atômica.
2. `ingest-dou`: executa a varredura dirigida de atos oficiais no Diário Oficial para as entidades mais frequentes da Esplanada.
3. `correlate`: executa o algoritmo de cruzamento temporal e gera os alertas de proximidade entre reuniões e atos contratuais.
4. `publish_serving_snapshot`: copia o banco primário (`saril.duckdb`) para o snapshot atômico (`saril_serving.duckdb`) com `os.replace`, garantindo zero downtime para a API.
"""
from __future__ import annotations

import argparse
import sys
import uuid
from datetime import date, datetime

import pandas as pd

import hashlib
import json

from . import config, llm, sanctions as sanctions_mod, store
from .correlation import build_correlations, match_act_to_entity
from .dou_client import DouClient
from .dou_parser import parse_act
from .eagendas import explode_private_participants, load_meetings
from .normalize import (is_generic, is_public_entity, is_role_description,
                        search_terms, starts_with_role)


def _run_id() -> str:
    return uuid.uuid4().hex[:12]


# ------------------------------------------------------------ e-Agendas
def build_meetings(limit: int | None = None) -> None:
    run_id, started = _run_id(), datetime.now()
    print("[1/2] Carregando e-Agendas real (1,22M compromissos)...")
    df = load_meetings(
        columns=["event_id", "authority_name", "authority_role", "public_body",
                 "date_start", "declared_topic", "raw_participants"]
    )
    print(f"      {len(df):,} compromissos com data válida")

    mask = df["raw_participants"].astype(str).str.contains(
        "Agentes privados participantes", na=False
    )
    df_private = df[mask]
    if limit:
        df_private = df_private.head(limit)
    print(f"      {len(df_private):,} com agentes privados declarados")

    print("[2/3] Estruturando participantes privados...")
    exploded = explode_private_participants(df_private)
    exploded = exploded[exploded["entity_norm"].str.len() >= 3]

    # O objeto do SARIL é a relação entre quem é EXTERNO ao governo e a
    # autoridade pública. Participantes que representam entes públicos
    # (estados, agências reguladoras, ministérios) estão do lado de dentro:
    # a reunião deles é articulação intergovernamental, não lobby privado.
    before = len(exploded)
    exploded = exploded[~exploded["entity_name"].map(is_public_entity)]
    print(f"      {before - len(exploded):,} participações de entes públicos excluídas")

    # Sem autoridade identificada não há relação a auditar.
    exploded = exploded[exploded["authority_name"].astype(str).str.len() > 2]
    print(f"      {len(exploded):,} pares (visitante externo, autoridade)")

    print("[3/4] Consolidando entidades pelo CNPJ declarado...")
    exploded = consolidate_entities(exploded)

    print("[4/4] Uniformizando grafias da mesma empresa...")
    exploded = consolidate_by_similarity(exploded)

    with store.session() as conn:
        conn.execute("DELETE FROM meetings")
        conn.register("df_exploded", exploded)
        conn.execute("INSERT INTO meetings SELECT * FROM df_exploded")

        conn.execute("DELETE FROM entities")
        conn.execute("""
            INSERT INTO entities
            SELECT
                entity_norm,
                mode(entity_name)                       AS display_name,
                -- CNPJ principal (o mais declarado) serve para exibição; o
                -- casamento com o DOU usa o conjunto completo, porque matriz,
                -- filiais e controladora aparecem todos nas agendas.
                mode(entity_cnpj) FILTER (WHERE entity_cnpj IS NOT NULL) AS cnpj,
                NULL AS cnpjs,
                count(*)                                AS meetings_count,
                count(DISTINCT lobbyist_name)           AS lobbyists_count,
                count(DISTINCT public_body)             AS bodies_count,
                count(DISTINCT authority_name)          AS authorities_count,
                min(meeting_date)                       AS first_meeting,
                max(meeting_date)                       AS last_meeting
            FROM meetings
            GROUP BY entity_norm
        """)
        # Trava: uma tabela de reuniões vazia derruba todo o resto em silêncio
        # (o cruzamento simplesmente devolve zero, sem erro). Falhar aqui é
        # muito melhor que publicar uma base vazia.
        stored = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]
        if stored != len(exploded):
            raise RuntimeError(
                f"gravação inconsistente: {len(exploded):,} pares processados, "
                f"{stored:,} gravados em meetings")

        _refine_entity_cnpjs(conn)
        total_entities = conn.execute("SELECT count(*) FROM entities").fetchone()[0]
        store.log_stage(conn, run_id, "build-meetings",
                        f"{len(exploded)} pares", len(exploded), started, datetime.now())

    store.publish_snapshot()
    print(f"OK: {len(exploded):,} participações privadas, {total_entities:,} entidades distintas")


# Um CNPJ só pertence à entidade se for representativo dela. O campo é
# preenchido à mão e recebe engano: o CNPJ da Claro apareceu 6 vezes sob
# "Telefônica" contra 1.997 do correto, e bastava isso para a Telefônica casar
# com um contrato cuja contratada era a Claro.
MIN_CNPJ_SHARE = 0.02


def _refine_entity_cnpjs(conn) -> None:
    """Recalcula `entities.cnpjs` mantendo só os CNPJs representativos.

    Preserva sempre os que compartilham a raiz (8 primeiros dígitos) do CNPJ
    dominante: são filiais da mesma empresa, e descartá-las perderia
    casamentos legítimos.
    """
    rows = conn.execute("""
        SELECT entity_norm, entity_cnpj, count(*) AS n
        FROM meetings WHERE entity_cnpj IS NOT NULL
        GROUP BY 1, 2
    """).fetchall()

    by_entity: dict[str, list[tuple[str, int]]] = {}
    for entity_norm, cnpj, count in rows:
        by_entity.setdefault(entity_norm, []).append((cnpj, count))

    kept_total = dropped_total = 0
    updates = []
    for entity_norm, pairs in by_entity.items():
        pairs.sort(key=lambda p: -p[1])
        total = sum(c for _, c in pairs)
        dominant_root = pairs[0][0][:8]
        kept = [
            cnpj for cnpj, count in pairs
            if count / total >= MIN_CNPJ_SHARE or cnpj[:8] == dominant_root
        ]
        kept_total += len(kept)
        dropped_total += len(pairs) - len(kept)
        updates.append((entity_norm, pairs[0][0], ",".join(kept)))

    conn.execute("CREATE OR REPLACE TEMP TABLE cnpj_fix (entity_norm VARCHAR, "
                 "cnpj VARCHAR, cnpjs VARCHAR)")
    if updates:
        conn.executemany("INSERT INTO cnpj_fix VALUES (?, ?, ?)", updates)
    conn.execute("""
        UPDATE entities SET cnpj = f.cnpj, cnpjs = f.cnpjs
        FROM cnpj_fix f WHERE f.entity_norm = entities.entity_norm
    """)
    conn.execute("""
        UPDATE entities SET cnpj = NULL, cnpjs = NULL
        WHERE entity_norm NOT IN (SELECT entity_norm FROM cnpj_fix)
    """)
    print(f"      CNPJs por entidade: {kept_total:,} mantidos, "
          f"{dropped_total:,} descartados por baixa representatividade")


def consolidate_entities(exploded: pd.DataFrame) -> pd.DataFrame:
    """Funde grafias distintas da mesma empresa usando o CNPJ como chave.

    O e-Agendas é preenchido manualmente, então a mesma empresa aparece como
    "Transnordestina Logistica", "FTL Ferrovia Transnordestina Logistica",
    "Transnordestina" e mais uma dúzia de variações. Fragmentada, ela dispersa
    as reuniões entre entidades e enfraquece tanto a varredura do DOU quanto o
    cálculo de cadência.

    Só se funde o que compartilha CNPJ — prova documental. Semelhança de nome
    não basta: fundiria Vale e Valec.
    """
    with_cnpj = exploded[exploded["entity_cnpj"].notna()]
    if with_cnpj.empty:
        return exploded

    # Forma canônica por CNPJ. Frequência sozinha elegia rótulos como
    # "Presidente" — um cargo digitado no campo de entidade. Grafias genéricas
    # e cargos são despriorizados, e entre as válidas vence a mais frequente.
    grouped = (
        with_cnpj.groupby(["entity_cnpj", "entity_norm", "entity_name"])
        .size().reset_index(name="n")
    )
    grouped["usable"] = ~(
        grouped["entity_name"].map(is_generic)
        | grouped["entity_name"].map(starts_with_role)
    )
    canonical = (
        grouped.sort_values(["usable", "n"], ascending=[False, False])
        .drop_duplicates(subset=["entity_cnpj"])
        .set_index("entity_cnpj")[["entity_norm", "entity_name"]]
    )

    # Toda grafia que já apareceu com aquele CNPJ passa a apontar para a canônica.
    norm_to_cnpj = (
        with_cnpj.groupby(["entity_norm", "entity_cnpj"]).size()
        .reset_index(name="n").sort_values("n", ascending=False)
        .drop_duplicates(subset=["entity_norm"])
        .set_index("entity_norm")["entity_cnpj"]
    )

    mapped_cnpj = exploded["entity_norm"].map(norm_to_cnpj)
    exploded = exploded.copy()
    # O CNPJ declarado em cada reunião é preservado. Sobrescrevê-lo pelo mais
    # frequente propagaria o CNPJ da controladora (a CSN aparece declarada em
    # reuniões da Transnordestina) e faria o ato do DOU deixar de casar.
    resolvable = mapped_cnpj.notna()
    exploded.loc[resolvable, "entity_norm"] = (
        mapped_cnpj[resolvable].map(canonical["entity_norm"]).values)
    exploded.loc[resolvable, "entity_name"] = (
        mapped_cnpj[resolvable].map(canonical["entity_name"]).values)

    merged = int(resolvable.sum())
    print(f"      {merged:,} participações reatribuídas a "
          f"{canonical.shape[0]:,} entidades canônicas por CNPJ")
    return exploded


def consolidate_by_similarity(exploded: pd.DataFrame,
                              threshold: float = 0.82) -> pd.DataFrame:
    """Funde grafias da mesma empresa que o CNPJ não alcançou.

    "AZUL LINHAS AEREAS BRASILEIRAS S.A" e "Azul Linhas Áreas" são a mesma
    companhia, mas nem sempre trazem CNPJ declarado, e um erro de digitação
    impede o casamento exato.

    Semelhança de nome, isolada, é perigosa: fundiria Vale com Valec. Por isso
    a fusão exige DOIS sinais — as duas grafias precisam ter sido declaradas
    **pelo mesmo lobista** (evidência de que ele se refere à mesma empresa) e
    ter similaridade alta. Nos testes, esse par de condições une
    "algar telecom"/"algartelecom" e mantém separados Vale/Valec (0,18),
    Claro/Claro TV (0,77) e Banco do Brasil/BB Seguridade (0,73).
    """
    import difflib

    co_declared: set[tuple[str, str]] = set()
    for _, group in exploded.groupby("lobbyist_name")["entity_norm"]:
        norms = sorted(set(group.dropna()))
        for i, a in enumerate(norms):
            for b in norms[i + 1:]:
                co_declared.add((a, b))

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    merged_pairs = 0
    for a, b in co_declared:
        if len(a) < 6 or len(b) < 6:
            continue  # nomes curtos são ambíguos demais para fundir por semelhança
        if difflib.SequenceMatcher(None, a, b).ratio() >= threshold:
            union(a, b)
            merged_pairs += 1

    if not merged_pairs:
        print("      nenhuma grafia adicional a uniformizar")
        return exploded

    # Forma canônica de cada grupo: a grafia mais frequente que não seja
    # genérica nem descrição de cargo.
    counts = (exploded.groupby(["entity_norm", "entity_name"]).size()
              .reset_index(name="n"))
    counts["group"] = counts["entity_norm"].map(find)
    counts["usable"] = ~(
        counts["entity_name"].map(is_generic)
        | counts["entity_name"].map(starts_with_role)
        | counts["entity_name"].map(is_role_description)
    )
    canonical = (counts.sort_values(["usable", "n"], ascending=[False, False])
                 .drop_duplicates(subset=["group"])
                 .set_index("group")[["entity_norm", "entity_name"]])

    exploded = exploded.copy()
    groups = exploded["entity_norm"].map(find)
    exploded["entity_norm"] = groups.map(canonical["entity_norm"]).fillna(
        exploded["entity_norm"])
    exploded["entity_name"] = groups.map(canonical["entity_name"]).fillna(
        exploded["entity_name"])

    grupos = len({find(k) for k in parent})
    print(f"      {merged_pairs:,} pares de grafias unidos em {grupos:,} grupos")
    return exploded


# ------------------------------------------------------------------ DOU
def select_targets(top: int, min_meetings: int,
                   only: list[str] | None = None) -> list[dict]:
    """Entidades que dirigem a varredura do DOU.

    Por padrão, as que mais frequentam a Esplanada. Com `only`, apenas as que
    casam com os termos informados — usado para buscar a prova de um ator
    específico sem reprocessar toda a lista.
    """
    conn = store.serving_connection()
    try:
        if only:
            clause = " OR ".join(["lower(display_name) LIKE ?"] * len(only))
            params = [f"%{term.strip().lower()}%" for term in only]
            sql = f"""
                SELECT entity_norm, display_name, cnpj, cnpjs, meetings_count,
                       lobbyists_count, bodies_count, authorities_count,
                       first_meeting, last_meeting
                FROM entities WHERE ({clause}) AND meetings_count >= ?
                ORDER BY meetings_count DESC
            """
            rows = conn.execute(sql, params + [min_meetings]).fetchall()
        else:
            rows = conn.execute("""
                SELECT entity_norm, display_name, cnpj, cnpjs, meetings_count,
                       lobbyists_count, bodies_count, authorities_count,
                       first_meeting, last_meeting
                FROM entities
                WHERE meetings_count >= ?
                ORDER BY meetings_count DESC
            """, [min_meetings]).fetchall()
        cols = [d[0] for d in conn.description]
    finally:
        conn.close()

    targets = []
    for row in rows:
        entity = dict(zip(cols, row))
        if is_generic(entity["display_name"]):
            continue
        if not search_terms(entity["display_name"]):
            continue
        targets.append(entity)
        if len(targets) >= top:
            break
    return targets


def ingest_dou(top: int, min_meetings: int, date_from: date, date_to: date,
               max_pages: int, fetch_text: bool, delay: float | None,
               only: list[str] | None = None) -> None:
    run_id, started = _run_id(), datetime.now()
    targets = select_targets(top, min_meetings, only)
    if not targets:
        print("Nenhuma entidade alvo. Rode 'build-meetings' primeiro.")
        return

    print(f"Varredura dirigida do DOU: {len(targets)} entidades, "
          f"{date_from} a {date_to}, seções {'+'.join(config.DOU_SECTIONS)}")

    client = DouClient(delay=delay)
    total_new = 0

    with store.session() as conn:
        known = {r[0] for r in conn.execute("SELECT dou_id FROM dou_acts").fetchall()}

        for index, entity in enumerate(targets, 1):
            terms = search_terms(entity["display_name"])
            query = f'"{terms[0]}"'
            print(f"  [{index}/{len(targets)}] {entity['display_name'][:45]:45} "
                  f"({entity['meetings_count']} reuniões) -> {query}")
            try:
                records = client.search(query, date_from, date_to, max_pages=max_pages)
            except Exception as exc:                      # noqa: BLE001
                print(f"      falha na busca: {exc}")
                continue

            fresh = [r for r in records if r.dou_id not in known]
            print(f"      {len(records)} atos, {len(fresh)} novos")

            for record in fresh:
                if fetch_text:
                    client.fetch_full_text(record)
                parsed = parse_act(record)
                conn.execute("""
                    INSERT OR REPLACE INTO dou_acts
                    (dou_id, section, url_title, title, act_type, pub_date, edition,
                     page, organ_hierarchy, organ_root, summary, link_url, full_text,
                     contracted_name, contracted_norm, contracting_name,
                     contracting_norm, primary_cnpj, all_cnpjs,
                     value, value_label, process_number, uasg, act_number,
                     legal_basis, is_no_bid, is_federal, found_by_term, fetched_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,current_timestamp)
                """, [
                    record.dou_id, record.section, record.url_title, record.title,
                    record.act_type, record.pub_date or None, record.edition, record.page,
                    record.organ_hierarchy, record.organ_root, record.summary,
                    record.link_url, record.full_text, parsed.contracted_name,
                    parsed.contracted_norm, parsed.contracting_name,
                    parsed.contracting_norm, parsed.primary_cnpj,
                    ",".join(parsed.cnpjs), parsed.value,
                    parsed.value_label, parsed.process_number, parsed.uasg,
                    parsed.act_number, parsed.legal_basis, parsed.is_no_bid,
                    parsed.is_federal, entity["entity_norm"],
                ])
                known.add(record.dou_id)
                total_new += 1

        store.log_stage(conn, run_id, "ingest-dou",
                        f"{len(targets)} entidades {date_from}..{date_to}",
                        total_new, started, datetime.now())

    store.publish_snapshot()
    print(f"OK: {total_new:,} atos reais do DOU ingeridos")


def reparse_acts() -> None:
    """Reaplica o parser aos atos já armazenados, sem tocar na rede.

    O texto integral fica no banco e as páginas ficam em data/dou_cache, então
    melhorar a extração de contratada, CNPJ ou valor não exige nova coleta.
    """
    run_id, started = _run_id(), datetime.now()

    class _Record:
        __slots__ = ("title", "summary", "full_text", "act_type",
                     "organ_root", "organ_hierarchy")

    with store.session() as conn:
        acts = conn.execute("""
            SELECT dou_id, title, summary, full_text, act_type,
                   organ_root, organ_hierarchy FROM dou_acts
        """).fetchall()
        print(f"Reprocessando {len(acts):,} atos já coletados...")

        updated = 0
        for dou_id, title, summary, full_text, act_type, organ_root, hierarchy in acts:
            record = _Record()
            record.title, record.summary = title or "", summary or ""
            record.full_text, record.act_type = full_text or "", act_type or ""
            record.organ_root, record.organ_hierarchy = organ_root or "", hierarchy or ""

            parsed = parse_act(record)
            conn.execute("""
                UPDATE dou_acts SET contracted_name = ?, contracted_norm = ?,
                    contracting_name = ?, contracting_norm = ?,
                    primary_cnpj = ?, all_cnpjs = ?, value = ?, value_label = ?,
                    process_number = ?,
                    uasg = ?, act_number = ?, legal_basis = ?, is_no_bid = ?,
                    is_federal = ? WHERE dou_id = ?
            """, [parsed.contracted_name, parsed.contracted_norm,
                  parsed.contracting_name, parsed.contracting_norm,
                  parsed.primary_cnpj, ",".join(parsed.cnpjs), parsed.value,
                  parsed.value_label,
                  parsed.process_number, parsed.uasg,
                  parsed.act_number, parsed.legal_basis, parsed.is_no_bid,
                  parsed.is_federal, dou_id])
            updated += 1

        store.log_stage(conn, run_id, "reparse", "reprocessamento local",
                        updated, started, datetime.now())

    store.publish_snapshot()
    print(f"OK: {updated:,} atos reprocessados")


PROGRESS_PATH = config.DATA_DIR / "read_acts_progress.json"


def _write_progress(done: int, total: int, stage: str) -> None:
    """Publica o andamento num arquivo à parte.

    Não dá para consultar o banco durante a escrita (o DuckDB trava o arquivo),
    então o progresso sai por fora. Escrita atômica para o leitor nunca pegar
    JSON pela metade.
    """
    payload = {
        "done": done,
        "total": total,
        "percent": round(done / total * 100, 1) if total else 100.0,
        "remaining": max(total - done, 0),
        "stage": stage,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    }
    tmp = PROGRESS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(PROGRESS_PATH)


def read_progress() -> dict | None:
    if not PROGRESS_PATH.exists():
        return None
    try:
        return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


# ------------------------------------------------------ Leitura assistida
def read_acts(limit: int | None = None, model: str = llm.DEFAULT_MODEL,
              force: bool = False) -> None:
    """Resume os atos correlacionados e julga a relação com a pauta da reunião.

    Roda só sobre atos que já estão em alguma correlação: resumir os 1.778 atos
    inteiros gastaria tempo em documentos que ninguém vai abrir.
    """
    if not llm.available(model):
        print(f"Modelo {model} indisponível no Ollama (localhost:11434).")
        return

    run_id, started = _run_id(), datetime.now()

    with store.session() as conn:
        done = set()
        if not force:
            # A versão precisa casar com a versão DAQUELA tarefa. Comparar com
            # o conjunto de todas as versões fazia um julgamento v1 contar como
            # pronto para a tarefa que já está na v2 — 161 relações ficariam
            # sem julgamento, exibidas como "—" na tela.
            done = {
                (r[0], r[1]) for r in conn.execute(
                    """SELECT task, ref_id, prompt_version FROM llm_outputs
                       WHERE ok""").fetchall()
                if r[2] == llm.prompt_version(r[0])
            }

        acts = conn.execute("""
            SELECT DISTINCT a.dou_id, a.act_type, a.title, a.full_text
            FROM dou_acts a JOIN correlations c ON c.dou_id = a.dou_id
            WHERE length(coalesce(a.full_text, '')) > 120
        """).fetchall()

        pairs = conn.execute("""
            SELECT c.correlation_id, c.declared_topic, c.delta_days,
                   a.act_type, a.title, a.full_text
            FROM correlations c JOIN dou_acts a ON a.dou_id = c.dou_id
            WHERE length(coalesce(a.full_text, '')) > 120
        """).fetchall()

        if limit:
            acts, pairs = acts[:limit], pairs[:limit]

        pending_acts = [a for a in acts if ("summarize_act", a[0]) not in done]
        pending_pairs = [p for p in pairs if ("judge_relation", p[0]) not in done]
        total_pending = len(pending_acts) + len(pending_pairs)
        print(f"Resumindo {len(pending_acts)} atos e julgando {len(pending_pairs)} "
              f"relações com {model} ({total_pending} chamadas)...", flush=True)
        _write_progress(0, total_pending, "iniciando")

        def store_result(task, ref_type, ref_id, result):
            output_id = hashlib.sha1(
                f"{task}|{llm.prompt_version(task)}|{model}|{ref_id}".encode()
            ).hexdigest()[:24]
            conn.execute("""
                INSERT OR REPLACE INTO llm_outputs
                (output_id, task, ref_type, ref_id, model, prompt_version,
                 input_hash, output_json, ok, error, duration_s, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,current_timestamp)
            """, [output_id, task, ref_type, ref_id, model, llm.PROMPT_VERSION,
                  result.input_hash, json.dumps(result.output, ensure_ascii=False),
                  result.ok, result.error, result.duration_s])

        # Commit a cada lote: um job de meia hora que só grava no fim perde
        # tudo se cair, e não deixa o progresso observável — o banco fica
        # travado pela própria escrita e o log, bufferizado.
        BATCH = 10
        processed = 0

        for dou_id, act_type, title, text in pending_acts:
            result = llm.summarize_act(act_type, title, text, model)
            store_result("summarize_act", "dou_act", dou_id, result)
            processed += 1
            if processed % BATCH == 0:
                conn.commit()
                _write_progress(processed, total_pending, "resumindo atos")
                print(f"  {processed}/{total_pending}", flush=True)

        for corr_id, pauta, delta, act_type, title, text in pending_pairs:
            result = llm.judge_relation(pauta, act_type, title, text,
                                        delta or 0, model)
            store_result("judge_relation", "correlation", corr_id, result)
            processed += 1
            if processed % BATCH == 0:
                conn.commit()
                _write_progress(processed, total_pending, "julgando relações")
                print(f"  {processed}/{total_pending}", flush=True)

        conn.commit()
        _write_progress(total_pending, total_pending, "concluído")

        counts = conn.execute("""
            SELECT task, count(*), sum(CASE WHEN ok THEN 1 ELSE 0 END)
            FROM llm_outputs WHERE prompt_version = ANY(?) GROUP BY 1
        """, [list(set(llm.PROMPT_VERSIONS.values()))]).fetchall()
        store.log_stage(conn, run_id, "read-acts",
                        f"{model} {llm.PROMPT_VERSIONS}",
                        len(acts) + len(pairs), started, datetime.now())

    store.publish_snapshot()
    print("\nOK:")
    for task, total, ok in counts:
        print(f"  {task:16} {ok}/{total} com saída válida")


# ---------------------------------------------------------- Sanções
def ingest_sanctions(stamp: str | None = None) -> None:
    """Baixa CEIS e CNEP e cruza contra as entidades do e-Agendas."""
    run_id, started = _run_id(), datetime.now()
    all_sanctions: list = []

    for registry in sanctions_mod.REGISTRIES:
        print(f"Baixando {registry.upper()}...")
        try:
            path = sanctions_mod.download_registry(registry, stamp)
        except Exception as exc:                                   # noqa: BLE001
            print(f"  falha ao baixar {registry}: {exc}")
            continue
        parsed = sanctions_mod.parse_registry(path, registry)
        print(f"  {len(parsed):,} sanções")
        all_sanctions.extend(parsed)

    if not all_sanctions:
        print("Nenhuma sanção obtida.")
        return

    with store.session() as conn:
        conn.execute("DELETE FROM sanctions")
        df = pd.DataFrame([vars(x) for x in all_sanctions])
        conn.register("df_sanctions", df)
        conn.execute("INSERT INTO sanctions SELECT * FROM df_sanctions")
        store.log_stage(conn, run_id, "ingest-sanctions",
                        "+".join(sanctions_mod.REGISTRIES), len(all_sanctions),
                        started, datetime.now())

    store.publish_snapshot()
    print(f"OK: {len(all_sanctions):,} sanções armazenadas")
    cross_sanctions()


def cross_sanctions() -> None:
    """Reuniões e atos ocorridos ENQUANTO a sanção estava vigente E no seu alcance.

    Empresa sancionada é fato; o achado é o acesso durante a vigência. Mas
    "vigente" não basta: a abrangência define onde a sanção vincula. Uma
    empresa suspensa por um município pode legalmente se reunir com um
    ministério. Contar essas reuniões como achado seria acusação indevida — por
    isso o alcance é apurado órgão a órgão, e as duas contagens (na vigência e
    no alcance) aparecem separadas.
    """
    run_id, started = _run_id(), datetime.now()

    with store.session() as conn:
        rows_raw = conn.execute("""
            WITH ent AS (
                SELECT e.entity_norm, e.display_name,
                       unnest(string_split(
                           coalesce(e.cnpjs, coalesce(e.cnpj, '')), ',')) AS cnpj
                FROM entities e
                WHERE coalesce(e.cnpjs, e.cnpj) IS NOT NULL
            ),
            pair AS (
                SELECT DISTINCT ent.entity_norm, ent.display_name, ent.cnpj, s.*
                FROM ent JOIN sanctions s ON s.cnpj = ent.cnpj
                WHERE s.start_date IS NOT NULL
            )
            SELECT p.entity_norm, p.display_name, p.cnpj, p.sanction_id, p.registry,
                   p.category, p.is_blocking, p.scope, p.body_sphere,
                   p.sanctioning_body, p.start_date, p.end_date,
                   coalesce(nullif(p.corporate_name, ''), p.name) AS sanctioned_name,
                   m.public_body,
                   count(m.event_id)                AS meetings,
                   min(m.meeting_date)              AS first_meeting,
                   max(m.meeting_date)              AS last_meeting,
                   count(DISTINCT m.authority_name) AS authorities,
                   count(DISTINCT m.lobbyist_name)  AS lobbyists
            FROM pair p
            JOIN meetings m
              ON m.entity_norm = p.entity_norm
             AND m.meeting_date >= p.start_date
             AND (p.end_date IS NULL OR m.meeting_date <= p.end_date)
            GROUP BY ALL
        """).fetchall()
        cols = [d[0] for d in conn.description]

        acts = {
            (r[0], r[1]): (r[2], r[3])
            for r in conn.execute("""
                SELECT c.entity_norm, s.sanction_id, count(DISTINCT c.dou_id),
                       coalesce(sum(DISTINCT c.value), 0)
                FROM correlations c
                JOIN sanctions s ON s.cnpj IN (
                    SELECT unnest(string_split(coalesce(e.cnpjs, coalesce(e.cnpj,'')), ','))
                    FROM entities e WHERE e.entity_norm = c.entity_norm
                )
                WHERE s.start_date IS NOT NULL
                  AND c.pub_date >= s.start_date
                  AND (s.end_date IS NULL OR c.pub_date <= s.end_date)
                GROUP BY 1, 2
            """).fetchall()
        }

        # Agrupa por (entidade, sanção), apurando o alcance órgão a órgão.
        grouped: dict[tuple, dict] = {}
        for raw in rows_raw:
            row = dict(zip(cols, raw))
            key = (row["entity_norm"], row["sanction_id"])
            bucket = grouped.setdefault(key, {
                "row": row, "meetings": 0, "in_scope": 0, "bodies": set(),
                "bodies_in_scope": set(), "authorities": 0, "lobbyists": 0,
                "first": None, "last": None, "reasons": set(),
            })
            bucket["meetings"] += row["meetings"]
            bucket["authorities"] += row["authorities"]
            bucket["lobbyists"] += row["lobbyists"]
            bucket["bodies"].add(row["public_body"])
            for field, key_name in (("first_meeting", "first"), ("last_meeting", "last")):
                value = row[field]
                if value is None:
                    continue
                current = bucket[key_name]
                if current is None:
                    bucket[key_name] = value
                elif key_name == "first":
                    bucket[key_name] = min(current, value)
                else:
                    bucket[key_name] = max(current, value)

            sanction = sanctions_mod.Sanction(
                sanction_id=row["sanction_id"], registry=row["registry"],
                person_type="J", document=row["cnpj"], cnpj=row["cnpj"],
                name=row["display_name"], name_norm="", corporate_name="",
                category=row["category"], is_blocking=row["is_blocking"],
                start_date=row["start_date"], end_date=row["end_date"],
                publication_date=None, publication="", process_number="",
                scope=row["scope"], sanctioning_body=row["sanctioning_body"],
                body_sphere=row["body_sphere"], legal_basis="",
            )
            applies, reason = sanctions_mod.scope_applies(sanction, row["public_body"])
            bucket["reasons"].add(reason)
            if applies:
                bucket["in_scope"] += row["meetings"]
                bucket["bodies_in_scope"].add(row["public_body"])

        records = []
        for (entity_norm, sanction_id), bucket in grouped.items():
            row = bucket["row"]
            dou_acts, dou_value = acts.get((entity_norm, sanction_id), (0, 0.0))
            in_scope = bucket["in_scope"]

            # Fora do alcance, o encontro é lícito: não pontua como achado.
            score = 0.0
            if in_scope:
                score = 25.0
                if row["is_blocking"]:
                    score += 30.0
                score += min(in_scope / 10.0, 1.0) * 10.0
                score += min(len(bucket["bodies_in_scope"]) / 5.0, 1.0) * 5.0
                if dou_acts:
                    score += 15.0
            score = round(min(score, 100.0), 1)

            if in_scope and dou_acts and row["is_blocking"]:
                severity = "CRITICA"
            elif in_scope and row["is_blocking"]:
                severity = "ALTA"
            elif in_scope:
                severity = "MEDIA"
            else:
                severity = "FORA_DE_ALCANCE"

            records.append({
                "hit_id": hashlib.sha1(
                    f"{entity_norm}|{sanction_id}".encode()).hexdigest()[:24],
                "entity_norm": entity_norm,
                "entity_name": row["display_name"],
                # A razão social vem do cadastro da Receita, via CEIS/CNEP. A
                # grafia do e-Agendas é digitada à mão e às vezes traz o cargo
                # no lugar da empresa ("Presidente da Medix Brasil") — nomear
                # assim uma empresa num achado o tornaria indefensável.
                "sanctioned_name": row["sanctioned_name"],
                "cnpj": row["cnpj"],
                "sanction_id": sanction_id,
                "registry": row["registry"],
                "category": row["category"],
                "is_blocking": row["is_blocking"],
                "scope": row["scope"],
                "body_sphere": row["body_sphere"],
                "sanctioning_body": row["sanctioning_body"],
                "start_date": row["start_date"],
                "end_date": row["end_date"],
                "meetings_during": bucket["meetings"],
                "meetings_in_scope": in_scope,
                "bodies_in_scope": len(bucket["bodies_in_scope"]),
                "scope_reason": " | ".join(sorted(bucket["reasons"]))[:300],
                "first_meeting_during": bucket["first"],
                "last_meeting_during": bucket["last"],
                "authorities_during": bucket["authorities"],
                "bodies_during": len(bucket["bodies"]),
                "lobbyists_during": bucket["lobbyists"],
                "dou_acts_during": dou_acts,
                "dou_value_during": dou_value,
                "severity": severity,
                "risk_score": score,
            })

        conn.execute("DELETE FROM sanction_hits")
        if records:
            df = pd.DataFrame(records)
            # INSERT ... SELECT * é posicional: alinhar a ordem evita gravar
            # valor na coluna errada sem erro algum.
            table_columns = [r[0] for r in conn.execute("DESCRIBE sanction_hits").fetchall()]
            missing = set(table_columns) - set(df.columns)
            if missing:
                raise RuntimeError(f"colunas ausentes: {sorted(missing)}")
            conn.register("df_hits", df[table_columns])
            conn.execute("INSERT INTO sanction_hits SELECT * FROM df_hits")

        store.log_stage(conn, run_id, "cross-sanctions", "CEIS+CNEP x e-Agendas",
                        len(records), started, datetime.now())

        summary = conn.execute(
            "SELECT severity, count(*) FROM sanction_hits GROUP BY 1 ORDER BY 2 DESC"
        ).fetchall()

    store.publish_snapshot()
    print(f"\nOK: {len(records):,} pares empresa-sanção com reunião na vigência")
    for severity, count in summary:
        rotulo = "(reunião lícita: fora do alcance da sanção)" if severity == "FORA_DE_ALCANCE" else ""
        print(f"  {severity:16} {count:5}  {rotulo}")


# ---------------------------------------------------------- Correlação
def correlate(federal_only: bool = True) -> None:
    run_id, started = _run_id(), datetime.now()

    with store.session() as conn:
        where = "WHERE pub_date IS NOT NULL"
        if federal_only:
            where += " AND is_federal"
        acts = conn.execute(f"""
            SELECT dou_id, title, pub_date, organ_root, organ_hierarchy, act_type,
                   link_url, contracted_name, contracted_norm, contracting_name,
                   contracting_norm, primary_cnpj, all_cnpjs, value, is_no_bid,
                   found_by_term
            FROM dou_acts {where}
        """).fetchall()
        act_cols = [d[0] for d in conn.description]

        entities = conn.execute(
            "SELECT entity_norm, display_name, cnpj, cnpjs FROM entities"
        ).fetchall()
        entity_by_norm = {
            r[0]: {"entity_norm": r[0], "display_name": r[1],
                   "cnpj": r[2], "cnpjs": r[3]}
            for r in entities
        }

        # Índice CNPJ -> entidade. Sem ele, o CNPJ só confirmava um vínculo já
        # suspeitado pelo nome; um ato cujo termo de busca ficou defasado por
        # renormalização deixava de casar mesmo carregando o CNPJ da empresa.
        entity_by_cnpj: dict[str, dict] = {}
        entity_by_root: dict[str, dict] = {}
        for entity in entity_by_norm.values():
            declared = {c for c in (entity["cnpjs"] or "").split(",") if c}
            if entity["cnpj"]:
                declared.add(entity["cnpj"])
            for cnpj in declared:
                # Em empate, prevalece a entidade com mais reuniões declaradas.
                entity_by_cnpj.setdefault(cnpj, entity)
                entity_by_root.setdefault(cnpj[:8], entity)

        print(f"Cruzando {len(acts):,} atos federais do DOU contra a base de reuniões...")

        meetings_cache: dict[str, list[dict]] = {}
        all_correlations = []

        for row in acts:
            act = dict(zip(act_cols, row))
            act["cnpjs"] = [c for c in (act.get("all_cnpjs") or "").split(",") if c]

            # A entidade que originou a busca é a candidata natural; ainda assim
            # o vínculo precisa ser confirmado por CNPJ ou razão social.
            candidates = []
            # CNPJ primeiro: é prova documental e independe de grafia.
            for cnpj in act["cnpjs"]:
                if cnpj in entity_by_cnpj:
                    candidates.append(entity_by_cnpj[cnpj])
                elif cnpj[:8] in entity_by_root:
                    candidates.append(entity_by_root[cnpj[:8]])
            if act["found_by_term"] in entity_by_norm:
                candidates.append(entity_by_norm[act["found_by_term"]])
            if act["contracted_norm"] in entity_by_norm:
                candidates.append(entity_by_norm[act["contracted_norm"]])

            seen = set()
            for entity in candidates:
                if entity["entity_norm"] in seen:
                    continue
                seen.add(entity["entity_norm"])

                basis, confidence = match_act_to_entity(act, entity)
                if not basis:
                    continue

                norm = entity["entity_norm"]
                if norm not in meetings_cache:
                    rows = conn.execute("""
                        SELECT event_id, meeting_date, public_body, declared_topic,
                               authority_name, lobbyist_name
                        FROM meetings WHERE entity_norm = ?
                    """, [norm]).fetchall()
                    cols = [d[0] for d in conn.description]
                    meetings_cache[norm] = [dict(zip(cols, r)) for r in rows]

                all_correlations.extend(
                    build_correlations(act, entity, meetings_cache[norm], basis, confidence)
                )

        conn.execute("DELETE FROM correlations")
        if all_correlations:
            df = pd.DataFrame([c.__dict__ for c in all_correlations])
            df = df.drop_duplicates(subset=["correlation_id"])
            conn.register("df_corr", df)
            conn.execute("INSERT INTO correlations SELECT * FROM df_corr")

        store.log_stage(conn, run_id, "correlate", "cruzamento real",
                        len(all_correlations), started, datetime.now())

        summary = conn.execute("""
            SELECT severity, count(*), count(DISTINCT dou_id), count(DISTINCT entity_norm)
            FROM correlations GROUP BY severity ORDER BY 2 DESC
        """).fetchall()

    store.publish_snapshot()
    print(f"\nOK: {len(all_correlations):,} correlações reais")
    for severity, count, acts_n, entities_n in summary:
        print(f"  {severity:8} {count:6,} correlações | {acts_n} atos | {entities_n} entidades")


def status() -> None:
    conn = store.serving_connection()
    try:
        for table in ("meetings", "entities", "dou_acts", "correlations"):
            count = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            print(f"  {table:14} {count:>10,}")
        print("\n  últimas execuções:")
        for row in conn.execute(
            "SELECT stage, detail, rows, started_at FROM ingest_log "
            "ORDER BY started_at DESC LIMIT 5"
        ).fetchall():
            print(f"    {row[3]:%Y-%m-%d %H:%M}  {row[0]:15} {row[2]:>8,}  {row[1]}")
    finally:
        conn.close()


# ---------------------------------------------------------------- sync-cgu
def sync_cgu(force: bool = False, limit: int | None = None, year: int = 2023) -> int:
    """Sincroniza dados do e-Agendas da CGU de forma incremental.

    Fluxo:
      1. CguDownloader detecta arquivos novos/atualizados (local ou remoto).
      2. CguIncrementalEngine processa apenas as linhas inéditas (delta).
      3. Insere transacionalmente em data/saril.duckdb.
      4. Recalcula correlações DOU afetadas.
      5. Publica snapshot atômico em data/saril_serving.duckdb.

    Returns:
        Número de novas linhas inseridas.
    """
    from .cgu_downloader import CguDownloader
    from .cgu_incremental import process_cgu_deltas

    started = datetime.now()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║          ANTESSALA — SYNC-CGU — e-Agendas Incremental       ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print(f"  Iniciado em: {started:%Y-%m-%d %H:%M:%S}")
    print(f"  Modo: {'forçado (reprocessa todos)' if force else 'incremental (apenas delta)'}")
    print()

    # Fase 1 — Descoberta e download de arquivos novos/atualizados
    print("[1/5] Verificando fontes do e-Agendas CGU...")
    downloader = CguDownloader()
    new_files = downloader.fetch_new_files(force=force, year=year)

    if not new_files:
        print("      ✔ Nenhum arquivo novo encontrado. Base já atualizada.")
        print()
        return 0

    print(f"      {len(new_files)} arquivo(s) para processar:")
    for p in new_files:
        size_mb = p.stat().st_size / 1_048_576 if p.exists() else 0
        print(f"        • {p.name}  ({size_mb:.1f} MB)")
    print()

    # Fase 2 — Detecção de delta e classificação incremental
    print("[2/5] Processando deltas e classificando novas participações...")

    if limit:
        print(f"      (limitado a {limit:,} linhas novas — modo de teste)")

    conn = store.connect()
    try:
        # Passa o limite de linhas novas ao engine incremental
        files_to_process = new_files
        rows_added, sample = process_cgu_deltas(files_to_process, conn=conn)

        if rows_added == 0:
            print("      ✔ Nenhuma linha nova identificada. Base já atualizada.")
            # Registra no estado mesmo que não haja novas linhas (arquivos lidos)
            downloader.record_processed_files(new_files, 0, "sync-cgu")
            return 0

        print(f"      ✔ {rows_added:,} novas participações inseridas em meetings.")
        print()

        # Fase 2.5 — Unificação canônica de entidades
        print("[2.5] Unificando grafias e razões sociais das empresas...")
        try:
            from saril.entity_canonical import unify_canonical_entities
            unify_stats = unify_canonical_entities(conn)
            print(f"      ✔ {unify_stats.get('entities_mapped', 0):,} entidades normalizadas para padrão canônico.")
        except Exception as e:
            print(f"      ⚠ Falha na unificação canônica: {e} (non-fatal)")
        print()

        # Fase 3 — Recálculo de correlações DOU (janela de 60 dias)
        print("[3/5] Recalculando correlações DOU para novas entidades...")
        conn.close()
        conn = None
        try:
            correlate()
            print("      ✔ Correlações atualizadas.")
        except Exception as e:
            print(f"      ⚠ Correlações não atualizadas: {e} (non-fatal)")
        print()

        # Fase 4 — Publicação atômica do snapshot
        print("[4/5] Publicando snapshot atômico em saril_serving.duckdb...")
        store.publish_snapshot()
        print(f"      ✔ Snapshot publicado em {config.SERVING_DB_PATH}")
        print()

        # Fase 5 — Sincronização contínua de fotos oficiais de autoridades de 1º escalão
        print("[5/6] Sincronizando fotos oficiais de novos ministros e autoridades...")
        try:
            from saril.authority_sync import sync_authority_photos
            photo_stats = sync_authority_photos(min_meetings=5, max_new_downloads=15)
            print(f"      ✔ Fotos sincronizadas: {photo_stats.get('synced', 0)} novas, {photo_stats.get('skipped', 0)} já existentes.")
        except Exception as e:
            print(f"      ⚠ Sincronização de fotos não concluída: {e} (non-fatal)")
        print()

        # Fase 6 — Atualização de estado e log de auditoria
        print("[6/6] Registrando histórico de sincronização...")
        downloader.record_processed_files(new_files, rows_added, "sync-cgu")

        ended = datetime.now()
        duration_s = (ended - started).total_seconds()
        print(f"      ✔ {len(new_files)} arquivo(s) registrado(s) no catálogo de sincronização.")
        print()
        print("═" * 65)
        print(f"  Sync concluído em {duration_s:.1f}s")
        print(f"  Novas linhas inseridas: {rows_added:,}")
        print(f"  Arquivo(s) processado(s): {', '.join(p.name for p in new_files)}")
        print("═" * 65)

        if sample:
            print("\n  Amostra das novas reuniões inseridas:")
            for i, s in enumerate(sample[:5], 1):
                print(f"    {i}. [{s['date']}] {s['authority']} ({s['role']}) — {s['entity']}")
                print(f"       Pauta: {s['topic']}")

        return rows_added

    except Exception as exc:
        print(f"\n  ✗ ERRO durante sync-cgu: {exc}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="saril.pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    p_meet = sub.add_parser("build-meetings")
    p_meet.add_argument("--limit", type=int, default=None)

    p_dou = sub.add_parser("ingest-dou")
    p_dou.add_argument("--top", type=int, default=40)
    p_dou.add_argument("--min-meetings", type=int, default=config.MIN_MEETINGS_FOR_TARGET)
    p_dou.add_argument("--from", dest="date_from", default="2023-01-01")
    p_dou.add_argument("--to", dest="date_to", default=date.today().isoformat())
    p_dou.add_argument("--max-pages", type=int, default=4)
    p_dou.add_argument("--no-text", action="store_true", help="não baixar texto integral")
    p_dou.add_argument("--delay", type=float, default=None)
    p_dou.add_argument("--entity", action="append", dest="only", default=None,
                       help="varre só entidades cujo nome contenha o termo "
                            "(repetível): --entity intelbras --entity 'p&d'")

    p_corr = sub.add_parser("correlate")
    p_corr.add_argument("--include-non-federal", action="store_true")

    p_all = sub.add_parser("all")
    p_all.add_argument("--top", type=int, default=40)
    p_all.add_argument("--from", dest="date_from", default="2023-01-01")
    p_all.add_argument("--to", dest="date_to", default=date.today().isoformat())
    p_all.add_argument("--max-pages", type=int, default=4)

    p_sanc = sub.add_parser("ingest-sanctions", help="baixa CEIS/CNEP e cruza")
    p_sanc.add_argument("--stamp", default=None, help="data do pacote, AAAAMMDD")
    sub.add_parser("cross-sanctions", help="recruza sanções já baixadas")
    p_read = sub.add_parser("read-acts", help="resume atos e julga relação (LLM local)")
    p_read.add_argument("--limit", type=int, default=None)
    p_read.add_argument("--model", default=llm.DEFAULT_MODEL)
    p_read.add_argument("--force", action="store_true", help="ignora o cache")
    sub.add_parser("status")
    sub.add_parser("publish", help="republica o snapshot lido pela API")
    sub.add_parser("reparse", help="reaplica o parser aos atos já coletados")

    p_sync = sub.add_parser(
        "sync-cgu",
        help="baixa e ingere incrementalmente dados do e-Agendas da CGU",
    )
    p_sync.add_argument(
        "--force",
        action="store_true",
        help="força reprocessamento de todos os arquivos locais",
    )
    p_sync.add_argument(
        "--limit",
        type=int,
        default=None,
        help="limita o número de novas linhas (útil para testes)",
    )
    p_sync.add_argument(
        "--year",
        type=int,
        default=2023,
        help="ano mínimo dos arquivos a considerar (padrão: 2023)",
    )

    p_auth = sub.add_parser(
        "sync-authorities",
        help="Sincroniza retratos oficiais de ministros e autoridades de 1º escalão via Wikipedia/Wikimedia",
    )
    p_auth.add_argument(
        "--min-meetings",
        type=int,
        default=5,
        help="mínimo de audiências públicas para incluir autoridade (padrão: 5)",
    )
    p_auth.add_argument(
        "--max-downloads",
        type=int,
        default=25,
        help="máximo de novos downloads por ciclo (padrão: 25)",
    )

    p_unify = sub.add_parser(
        "unify-entities",
        help="Unifica grafias divergentes, siglas e razões sociais de empresas no banco",
    )

    args = parser.parse_args(argv)

    if args.command == "build-meetings":
        build_meetings(args.limit)
    elif args.command == "ingest-dou":
        ingest_dou(args.top, args.min_meetings,
                   date.fromisoformat(args.date_from), date.fromisoformat(args.date_to),
                   args.max_pages, not args.no_text, args.delay, args.only)
    elif args.command == "correlate":
        correlate(federal_only=not args.include_non_federal)
    elif args.command == "all":
        build_meetings()
        ingest_dou(args.top, config.MIN_MEETINGS_FOR_TARGET,
                   date.fromisoformat(args.date_from), date.fromisoformat(args.date_to),
                   args.max_pages, True, None)
        correlate()
    elif args.command == "ingest-sanctions":
        ingest_sanctions(args.stamp)
    elif args.command == "cross-sanctions":
        cross_sanctions()
    elif args.command == "read-acts":
        read_acts(args.limit, args.model, args.force)
    elif args.command == "status":
        status()
    elif args.command == "reparse":
        reparse_acts()
    elif args.command == "publish":
        store.publish_snapshot()
        print(f"Snapshot publicado em {config.SERVING_DB_PATH}")
    elif args.command == "sync-authorities":
        from saril.authority_sync import sync_authority_photos
        res = sync_authority_photos(min_meetings=args.min_meetings, max_new_downloads=args.max_downloads)
        print(f"✔ Concluído: {res.get('synced', 0)} fotos novas sincronizadas, {res.get('skipped', 0)} já existentes.")
        return 0
    elif args.command == "unify-entities":
        from saril.entity_canonical import unify_canonical_entities
        with store.session() as conn:
            res = unify_canonical_entities(conn)
            print(f"✔ Unificação concluída: {res.get('entities_mapped', 0):,} entidades mapeadas.")
        store.publish_snapshot()
        print(f"✔ Snapshot publicado em {config.SERVING_DB_PATH}")
        return 0
    elif args.command == "sync-cgu":
        rows = sync_cgu(
            force=args.force,
            limit=args.limit,
            year=args.year,
        )
        return 0 if rows >= 0 else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
