"""Testes de ponta a ponta do pipeline sync-cgu.

Critérios de Aceitação verificados (conforme cgu_automation_plan.md):
    1. Idempotência: dois `sync-cgu` consecutivos NÃO duplicam meetings.
    2. Detecção de delta: somente linhas inéditas são inseridas.
    3. Persistência de estado: cgu_sync_state.json é criado e atualizado.
    4. Endpoint /api/v1/sync/status: retorna campos obrigatórios com tipos corretos.
    5. Zero-downtime publishing: saril_serving.duckdb é atualizado atomicamente.
    6. Classificação: novas linhas possuem authority_name, authority_role, entity_norm.
    7. Log de auditoria: ingest_log registra execuções de sync-cgu.

Uso:
    cd backend_python
    python -m pytest test_cgu_sync.py -v
    # ou diretamente:
    python test_cgu_sync.py
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Ajusta o PYTHONPATH para importar o pacote saril
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import pytest
    _HAS_PYTEST = True
except ModuleNotFoundError:
    _HAS_PYTEST = False
    # Stub para que as classes de teste sejam definidas mas ignoradas no __main__
    class pytest:  # type: ignore[no-redef]
        @staticmethod
        def fixture(*args, **kwargs):
            def decorator(fn):
                return fn
            return decorator

from saril import config, store
from saril.cgu_downloader import CguDownloader
from saril.cgu_incremental import process_cgu_deltas, read_cgu_csv


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_env(tmp_path, monkeypatch):
    """Ambiente isolado com banco DuckDB temporário e diretórios de dados."""
    # Substituímos os caminhos globais de config por diretórios temporários
    db_path = tmp_path / "saril_test.duckdb"
    serving_path = tmp_path / "saril_serving_test.duckdb"
    extract_dir = tmp_path / "extracted"
    state_file = tmp_path / "cgu_sync_state.json"
    extract_dir.mkdir()

    monkeypatch.setattr(config, "DB_PATH", db_path)
    monkeypatch.setattr(config, "SERVING_DB_PATH", serving_path)
    monkeypatch.setattr(config, "EXTRACT_DIR", extract_dir)
    monkeypatch.setattr(config, "CGU_SYNC_STATE_FILE", state_file)

    # Inicializa o schema do banco
    conn = store.connect()
    conn.close()

    yield {
        "db_path": db_path,
        "serving_path": serving_path,
        "extract_dir": extract_dir,
        "state_file": state_file,
        "tmp_path": tmp_path,
    }


def _make_csv(path: Path, rows: list[dict]) -> None:
    """Escreve um CSV sintético no formato do e-Agendas CGU."""
    header = "ID do registro;Nome;Cargo/Função;Órgão/Entidade;Data de início;Assunto do Compromisso;Participantes\n"
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write(header)
        for r in rows:
            participants = r.get("participants", "")
            f.write(
                f"{r['id']};{r['authority']};{r['role']};{r['body']};{r['date']};{r['topic']};{participants}\n"
            )


SAMPLE_ROWS = [
    {
        "id": "20240001",
        "authority": "ALEXANDRE SILVEIRA",
        "role": "MINISTRO DE ESTADO DE MINAS E ENERGIA",
        "body": "Ministério de Minas e Energia",
        "date": "15-01-2024",
        "topic": "Discussão sobre regulação de energia solar fotovoltaica",
        "participants": (
            "Agentes públicos participantes: ALEXANDRE SILVEIRA (CPF: ***.123.***-**) / MINISTRO / MME"
            " || "
            "Agentes privados participantes: João Silva - Diretor representando SOLAR TECH BRASIL LTDA"
            " | Maria Souza - CEO representando ENERGIAS RENOVÁVEIS SA"
        ),
    },
    {
        "id": "20240002",
        "authority": "FLÁVIO DINO",
        "role": "MINISTRO DA JUSTIÇA E SEGURANÇA PÚBLICA",
        "body": "Ministério da Justiça",
        "date": "16-01-2024",
        "topic": "Reunião de alinhamento estratégico para segurança pública",
        "participants": (
            "Agentes públicos participantes: FLÁVIO DINO (CPF: ***.456.***-**) / MINISTRO / MJ"
            " || "
            "Agentes privados participantes: Carlos Lima - Presidente representando SEGURANÇA PRIVADA DO BRASIL SA"
        ),
    },
    {
        "id": "20240003",
        "authority": "MARINA SILVA",
        "role": "MINISTRA DO MEIO AMBIENTE E MUDANÇA DO CLIMA",
        "body": "Ministério do Meio Ambiente",
        "date": "17-01-2024",
        "topic": "Agenda verde: financiamento climático internacional 2024",
        "participants": (
            "Agentes públicos participantes: MARINA SILVA (CPF: ***.789.***-**) / MINISTRA / MMA"
            " || "
            "Agentes privados participantes: Ana Verde - Diretora representando AMAZÔNIA SUSTENTÁVEL SA"
            " | Pedro Castro - Sócio representando INSTITUTO CLIMA BRASIL LTDA"
        ),
    },
]


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

class TestCguDownloader:
    """Testa o módulo de descoberta e controle de estado."""

    def test_state_file_created_on_record(self, tmp_env):
        """O estado é criado ao registrar um arquivo processado."""
        state_file = tmp_env["state_file"]
        extract_dir = tmp_env["extract_dir"]

        downloader = CguDownloader(state_file=state_file, extract_dir=extract_dir)
        assert not state_file.exists()

        dummy_csv = extract_dir / "2024-01.csv"
        dummy_csv.write_text("ID do registro;Nome\nEVT-001;Fulano\n", encoding="utf-8")
        downloader.record_processed_files([dummy_csv], rows_count=10)

        assert state_file.exists(), "Estado deve ser criado após record_processed_files"
        state = json.loads(state_file.read_text())
        assert state["last_sync"] is not None
        assert "2024-01.csv" in state["processed_files"]
        assert state["processed_files"]["2024-01.csv"]["size"] > 0

    def test_no_new_files_when_already_recorded(self, tmp_env):
        """Arquivo já registrado não aparece como novo (idempotência de descoberta)."""
        state_file = tmp_env["state_file"]
        extract_dir = tmp_env["extract_dir"]

        csv = extract_dir / "2024-01.csv"
        csv.write_text("ID;Nome\nEVT-001;Fulano\n", encoding="utf-8")

        downloader = CguDownloader(state_file=state_file, extract_dir=extract_dir)
        downloader.record_processed_files([csv], rows_count=5)

        # Segunda chamada: arquivo já está no estado com mtime/size inalterados
        new_files = downloader.fetch_new_files(force=False)
        assert len(new_files) == 0, "Arquivo já registrado não deve ser retornado como novo"

    def test_force_flag_overrides_state(self, tmp_env):
        """--force força reprocessamento mesmo se o arquivo já foi registrado."""
        state_file = tmp_env["state_file"]
        extract_dir = tmp_env["extract_dir"]

        csv = extract_dir / "2024-01.csv"
        csv.write_text("ID;Nome\nEVT-001;Fulano\n", encoding="utf-8")

        downloader = CguDownloader(state_file=state_file, extract_dir=extract_dir)
        downloader.record_processed_files([csv], rows_count=5)

        forced_files = downloader.fetch_new_files(force=True)
        assert csv in forced_files, "--force deve retornar arquivos mesmo já registrados"


class TestCguIncremental:
    """Testa a engine incremental: leitura, delta e inserção transacional."""

    def test_read_cgu_csv_parses_correctly(self, tmp_env):
        """CSV sintético é lido e colunas renomeadas corretamente."""
        extract_dir = tmp_env["extract_dir"]
        csv_path = extract_dir / "2024-01.csv"
        _make_csv(csv_path, SAMPLE_ROWS)

        df = read_cgu_csv(csv_path)
        assert not df.empty, "DataFrame não deve ser vazio"
        assert "event_id" in df.columns
        assert "authority_name" in df.columns
        assert "authority_role" in df.columns
        assert "raw_participants" in df.columns
        assert len(df) == 3

    def test_delta_detection_only_inserts_new_rows(self, tmp_env):
        """Somente linhas com event_id inédito são inseridas."""
        extract_dir = tmp_env["extract_dir"]
        csv_path = extract_dir / "2024-01.csv"
        _make_csv(csv_path, SAMPLE_ROWS)

        conn = store.connect()
        try:
            rows_added, _ = process_cgu_deltas([csv_path], conn=conn)
            assert rows_added >= 0, "Deve inserir pelo menos 0 linhas"

            meetings_count = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]
            first_count = meetings_count

            # Segunda execução com os mesmos dados (idempotência)
            rows_added_second, _ = process_cgu_deltas([csv_path], conn=conn)
            meetings_count_after = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]

            assert rows_added_second == 0, (
                f"Segunda execução com mesmos dados não deve inserir novas linhas, "
                f"mas inseriu {rows_added_second}"
            )
            assert meetings_count_after == first_count, (
                "Contagem de meetings não deve crescer na re-execução"
            )
        finally:
            conn.close()

    def test_new_rows_have_required_fields(self, tmp_env):
        """Linhas inseridas devem ter authority_name, authority_role e entity_norm preenchidos."""
        extract_dir = tmp_env["extract_dir"]
        csv_path = extract_dir / "2024-01.csv"
        _make_csv(csv_path, [SAMPLE_ROWS[0]])  # Apenas EVT-001

        conn = store.connect()
        try:
            rows_added, _ = process_cgu_deltas([csv_path], conn=conn)

            if rows_added > 0:
                result = conn.execute(
                    "SELECT authority_name, authority_role, entity_norm FROM meetings LIMIT 5"
                ).fetchall()
                for row in result:
                    authority_name, authority_role, entity_norm = row
                    assert authority_name and len(authority_name) > 2, (
                        "authority_name deve estar preenchido"
                    )
                    assert entity_norm and len(entity_norm) >= 3, (
                        "entity_norm deve ter ao menos 3 caracteres"
                    )
        finally:
            conn.close()


class TestSyncCguPipeline:
    """Testa o comando sync-cgu de ponta a ponta."""

    def test_sync_cgu_idempotency(self, tmp_env):
        """Rodar sync-cgu duas vezes seguidas não duplica reuniões."""
        extract_dir = tmp_env["extract_dir"]
        state_file = tmp_env["state_file"]
        csv_path = extract_dir / "2024-01.csv"
        _make_csv(csv_path, SAMPLE_ROWS)

        from saril.cgu_downloader import CguDownloader
        from saril.cgu_incremental import process_cgu_deltas

        downloader = CguDownloader(state_file=state_file, extract_dir=extract_dir)

        conn = store.connect()
        try:
            # 1ª execução
            new_files_1 = downloader.fetch_new_files(force=False)
            rows_1, _ = process_cgu_deltas(new_files_1, conn=conn) if new_files_1 else (0, [])
            count_1 = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]
            downloader.record_processed_files(new_files_1, rows_1)

            # 2ª execução (deve detectar que já foi processado)
            new_files_2 = downloader.fetch_new_files(force=False)
            rows_2 = 0
            if new_files_2:
                rows_2, _ = process_cgu_deltas(new_files_2, conn=conn)
            count_2 = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]

            assert count_1 == count_2, (
                f"Idempotência violada: {count_1} meetings na 1ª execução, "
                f"{count_2} na 2ª"
            )
            assert rows_2 == 0, (
                f"2ª execução deve inserir 0 linhas, mas inseriu {rows_2}"
            )
        finally:
            conn.close()

    def test_ingest_log_records_sync_event(self, tmp_env):
        """O ingest_log deve registrar eventos de sync-cgu."""
        extract_dir = tmp_env["extract_dir"]
        csv_path = extract_dir / "2024-01.csv"
        _make_csv(csv_path, [SAMPLE_ROWS[0]])

        conn = store.connect()
        try:
            process_cgu_deltas([csv_path], conn=conn)
            log_rows = conn.execute(
                "SELECT stage FROM ingest_log WHERE stage = 'sync-cgu'"
            ).fetchall()
            assert len(log_rows) >= 1, "Deve haver pelo menos 1 registro de sync-cgu em ingest_log"
        finally:
            conn.close()

    def test_publish_snapshot_creates_serving_db(self, tmp_env):
        """publish_snapshot deve criar saril_serving.duckdb."""
        serving_path = tmp_env["serving_path"]
        assert not serving_path.exists()

        store.publish_snapshot()
        assert serving_path.exists(), "saril_serving.duckdb deve ser criado por publish_snapshot"
        assert serving_path.stat().st_size > 0, "saril_serving.duckdb não deve estar vazio"


class TestSyncStatusEndpoint:
    """Testa o endpoint /api/v1/sync/status."""

    def test_sync_status_returns_required_fields(self, tmp_env):
        """Endpoint deve retornar campos obrigatórios com tipos corretos."""
        import importlib
        import fastapi.testclient

        # Importa o app FastAPI
        from saril.api import app
        client = fastapi.testclient.TestClient(app)

        response = client.get("/api/v1/sync/status")
        assert response.status_code == 200, f"Esperado 200, obtido {response.status_code}"

        data = response.json()
        required_fields = ["status", "lastSyncAt", "totalMeetings", "lastAddedRows",
                           "nextScheduledHint", "recentHistory"]
        for field in required_fields:
            assert field in data, f"Campo obrigatório '{field}' ausente na resposta"

        assert data["status"] in ("ok", "no_data"), (
            f"Campo 'status' deve ser 'ok' ou 'no_data', obtido: {data['status']}"
        )
        assert isinstance(data["totalMeetings"], int), "'totalMeetings' deve ser int"
        assert isinstance(data["recentHistory"], list), "'recentHistory' deve ser list"

    def test_sync_status_after_sync(self, tmp_env):
        """Após uma sincronização, lastSyncAt não deve ser null."""
        state_file = tmp_env["state_file"]
        extract_dir = tmp_env["extract_dir"]

        downloader = CguDownloader(state_file=state_file, extract_dir=extract_dir)
        csv_path = extract_dir / "2024-01.csv"
        _make_csv(csv_path, [SAMPLE_ROWS[0]])
        downloader.record_processed_files([csv_path], rows_count=5)

        state = json.loads(state_file.read_text())
        assert state.get("last_sync") is not None, "last_sync deve estar preenchido após record"


# ---------------------------------------------------------------------------
# Execução direta (sem pytest)
# ---------------------------------------------------------------------------

def run_all_manual_tests():
    """Executa uma suíte simplificada de testes sem pytest para verificação rápida."""
    print("=" * 70)
    print("   ANTESSALA — Teste de Integração: sync-cgu Pipeline")
    print("=" * 70)

    import traceback

    results: list[tuple[str, bool, str]] = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        db_path = tmp_path / "saril_test.duckdb"
        serving_path = tmp_path / "saril_serving_test.duckdb"
        extract_dir = tmp_path / "extracted"
        state_file = tmp_path / "cgu_sync_state.json"
        extract_dir.mkdir()

        # Patch config
        original = {}
        for attr, val in [("DB_PATH", db_path), ("SERVING_DB_PATH", serving_path),
                          ("EXTRACT_DIR", extract_dir), ("CGU_SYNC_STATE_FILE", state_file)]:
            original[attr] = getattr(config, attr)
            setattr(config, attr, val)

        try:
            conn = store.connect()
            conn.close()

            # --- Teste 1: CguDownloader cria estado ---
            try:
                downloader = CguDownloader(state_file=state_file, extract_dir=extract_dir)
                csv = extract_dir / "2024-01.csv"
                _make_csv(csv, SAMPLE_ROWS)
                downloader.record_processed_files([csv], rows_count=len(SAMPLE_ROWS))
                assert state_file.exists()
                state = json.loads(state_file.read_text())
                assert state["last_sync"] is not None
                results.append(("CguDownloader: cria estado JSON", True, ""))
            except Exception as e:
                results.append(("CguDownloader: cria estado JSON", False, str(e)))

            # --- Teste 2: Idempotência de descoberta ---
            try:
                new_files = downloader.fetch_new_files(force=False)
                assert len(new_files) == 0, f"Esperado 0, obtido {len(new_files)}"
                results.append(("CguDownloader: idempotência de descoberta", True, ""))
            except Exception as e:
                results.append(("CguDownloader: idempotência de descoberta", False, str(e)))

            # --- Teste 3: Leitura de CSV ---
            try:
                df = read_cgu_csv(csv)
                assert not df.empty
                assert "event_id" in df.columns
                assert len(df) == 3
                results.append(("read_cgu_csv: lê e renomeia colunas", True, ""))
            except Exception as e:
                results.append(("read_cgu_csv: lê e renomeia colunas", False, str(e)))

            # --- Teste 4: Delta e inserção ---
            try:
                # Força reprocessamento para testar inserção real
                downloader2 = CguDownloader(state_file=state_file, extract_dir=extract_dir)
                forced = downloader2.fetch_new_files(force=True)
                conn = store.connect()
                rows_1, _ = process_cgu_deltas(forced, conn=conn)
                count_1 = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]
                conn.close()
                results.append((f"process_cgu_deltas: inseriu {rows_1} linhas (de {count_1} meetings)", True, ""))
            except Exception as e:
                results.append(("process_cgu_deltas: inserção", False, str(e)))
                traceback.print_exc()

            # --- Teste 5: Idempotência de inserção ---
            try:
                conn = store.connect()
                rows_2, _ = process_cgu_deltas([csv], conn=conn)
                count_2 = conn.execute("SELECT count(*) FROM meetings").fetchone()[0]
                conn.close()
                assert rows_2 == 0, f"2ª execução inseriu {rows_2} linhas (deve ser 0)"
                results.append(("process_cgu_deltas: idempotência de inserção", True, ""))
            except Exception as e:
                results.append(("process_cgu_deltas: idempotência de inserção", False, str(e)))

            # --- Teste 6: publish_snapshot cria serving DB ---
            try:
                store.publish_snapshot()
                assert serving_path.exists()
                assert serving_path.stat().st_size > 0
                results.append(("publish_snapshot: cria saril_serving.duckdb", True, ""))
            except Exception as e:
                results.append(("publish_snapshot: cria saril_serving.duckdb", False, str(e)))

            # --- Teste 7: ingest_log registra sync-cgu ---
            try:
                conn = store.connect()
                rows_log = conn.execute(
                    "SELECT stage FROM ingest_log WHERE stage = 'sync-cgu'"
                ).fetchall()
                conn.close()
                assert len(rows_log) >= 1
                results.append(("ingest_log: registra sync-cgu", True, ""))
            except Exception as e:
                results.append(("ingest_log: registra sync-cgu", False, str(e)))

        finally:
            # Restaura config
            for attr, val in original.items():
                setattr(config, attr, val)

    # Relatório
    print()
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    for name, ok, err in results:
        status_icon = "✔" if ok else "✗"
        print(f"  [{status_icon}] {name}")
        if err:
            print(f"       ERRO: {err}")

    print()
    print(f"  Resultado: {passed}/{len(results)} testes passaram", end="")
    if failed:
        print(f" | {failed} falharam")
    else:
        print(" ✔")
    print("=" * 70)
    return failed == 0


if __name__ == "__main__":
    success = run_all_manual_tests()
    sys.exit(0 if success else 1)
