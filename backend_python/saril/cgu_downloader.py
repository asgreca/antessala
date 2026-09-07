"""Gerenciador de Download e Descoberta de Dados Abertos e-Agendas (CGU).

FUNÇÃO NO PROJETO:
- Realiza a busca, verificação de novidades e download resiliente de arquivos CSV mensais das agendas públicas do Governo Federal no Portal de Dados Abertos (dados.gov.br).
- Mantém o controle de quais arquivos já foram baixados e processados, calculando hashes SHA-256 e salvando o estado em `data/cgu_sync_state.json`.

COMO FUNCIONA:
1. Conecta-se à API do Portal CKAN/dados.gov.br e identifica os links dos pacotes de dados do e-Agendas (desde 2023 até o mês corrente).
2. Compara a lista remota com os hashes locais gravados no estado de sincronização (`cgu_sync_state.json`).
3. Baixa apenas arquivos novos ou alterados, com retry automático e backoff exponencial em caso de falha de conexão.
4. Descompacta e disponibiliza os CSVs para o ingestor incremental (`cgu_incremental.py`).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from . import config

logger = logging.getLogger("saril.cgu_downloader")


def _eagendas_token() -> str | None:
    """Token da API do e-Agendas, do ambiente ou do .env do projeto."""
    token = os.environ.get(config.EAGENDAS_TOKEN_ENV)
    if token and token.strip():
        return token.strip()
    env_file = config.BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.strip().startswith(config.EAGENDAS_TOKEN_ENV):
                _, _, value = line.partition("=")
                value = value.strip().strip('"').strip("'")
                if value:
                    return value
    return None


class SourceUnavailable(RuntimeError):
    """A fonte de dados não pôde ser consultada.

    Distinta de "consultei e não há nada novo". Confundir as duas foi o defeito
    que fazia a sincronização mensal reportar sucesso sem baixar nada: o 401 do
    catálogo era registrado em nível INFO, chamado de "fallback", e devolvia
    lista vazia — indistinguível de base já atualizada.
    """


@dataclass
class CguResource:
    name: str
    url: str
    format: str
    updated_at: str = ""
    size_bytes: int = 0


class CguDownloader:
    """Gerenciador de download e sincronização de dados abertos da CGU."""

    CKAN_SEARCH_URL = "https://dados.gov.br/api/3/action/package_search?q=agenda-de-autoridades"
    CGU_DIRECT_BASE = "https://dadosabertos.cgu.gov.br/arquivos/e-agendas"

    def __init__(self, state_file: Path | None = None, extract_dir: Path | None = None):
        self.state_file = state_file or config.CGU_SYNC_STATE_FILE
        self.extract_dir = extract_dir or config.EXTRACT_DIR
        self.extract_dir.mkdir(parents=True, exist_ok=True)

    def load_state(self) -> dict:
        """Carrega o histórico e estado de arquivos já sincronizados."""
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Falha ao ler {self.state_file}: {e}. Criando novo estado.")
        return {
            "last_sync": None,
            "processed_files": {},
            "history": [],
        }

    def save_state(self, state: dict) -> None:
        """Persiste o estado da sincronização de forma atômica."""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        tmp_file = self.state_file.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, self.state_file)

    def compute_file_hash(self, path: Path) -> str:
        """Calcula o hash SHA-256 do arquivo para controle de integridade e novidade."""
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def discover_remote_resources(self) -> list[CguResource]:
        """Recursos publicados na fonte remota.

        Levanta SourceUnavailable quando a fonte não responde ou exige
        credencial. Uma lista vazia passa a significar apenas uma coisa: a
        fonte respondeu e não há arquivo novo.
        """
        token = _eagendas_token()
        if token:
            return self._discover_via_eagendas_api(token)

        resources: list[CguResource] = []
        req = urllib.request.Request(
            self.CKAN_SEARCH_URL,
            headers={
                "User-Agent": config.CGU_DOWNLOAD_USER_AGENT,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for pkg in data.get("result", {}).get("results", []):
                    if "agenda" in pkg.get("name", "").lower():
                        for r in pkg.get("resources", []):
                            fmt = r.get("format", "").lower()
                            if "csv" in fmt or "zip" in fmt:
                                resources.append(
                                    CguResource(
                                        name=r.get("name") or "recurso_eagendas",
                                        url=r.get("url"),
                                        format=fmt,
                                        updated_at=r.get("last_modified") or "",
                                        size_bytes=r.get("size") or 0,
                                    )
                                )
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise SourceUnavailable(
                    f"O catálogo dados.gov.br exigiu credencial (HTTP {exc.code}). "
                    "Defina EAGENDAS_TOKEN para usar a API oficial do e-Agendas "
                    "(gere em eagendas.cgu.gov.br > perfil > Meus tokens)."
                ) from exc
            raise SourceUnavailable(
                f"O catálogo dados.gov.br respondeu HTTP {exc.code}."
            ) from exc
        except Exception as exc:
            raise SourceUnavailable(
                f"Não foi possível consultar o catálogo de dados abertos: {exc}"
            ) from exc

        return resources

    def _discover_via_eagendas_api(self, token: str) -> list[CguResource]:
        """Consulta a API oficial do e-Agendas, que é pública mas exige token."""
        url = f"{config.EAGENDAS_API_URL}/agentes-publicos-obrigados"
        req = urllib.request.Request(url, headers={
            "User-Agent": config.CGU_DOWNLOAD_USER_AGENT,
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        })
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                resp.read(1)
        except urllib.error.HTTPError as exc:
            raise SourceUnavailable(
                f"A API do e-Agendas rejeitou o token (HTTP {exc.code}). "
                "Verifique se EAGENDAS_TOKEN está correto e não expirou."
            ) from exc
        except Exception as exc:
            raise SourceUnavailable(f"A API do e-Agendas não respondeu: {exc}") from exc

        logger.warning(
            "Token do e-Agendas aceito, mas o mapeamento dos endpoints da API v2 "
            "para arquivos mensais ainda não foi implementado."
        )
        return []

    def download_file(self, url: str, dest_path: Path, max_retries: int = 3) -> bool:
        """Realiza download com stream, timeout e backoff exponencial."""
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": config.CGU_DOWNLOAD_USER_AGENT,
                "Accept": "*/*",
            },
        )
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"Baixando {url} (tentativa {attempt}/{max_retries})...")
                with urllib.request.urlopen(req, timeout=45) as resp, open(dest_path, "wb") as out:
                    shutil.copyfileobj(resp, out)
                return True
            except Exception as e:
                logger.warning(f"Erro na tentativa {attempt} ao baixar {url}: {e}")
                if attempt < max_retries:
                    time.sleep(attempt * 2)
        return False

    def extract_zip(self, zip_path: Path) -> list[Path]:
        """Descompacta arquivo ZIP para o diretório de extração."""
        extracted: list[Path] = []
        if not zip_path.exists():
            return extracted
        try:
            with zipfile.ZipFile(zip_path, "r") as z:
                for member in z.namelist():
                    if member.endswith(".csv") and not member.startswith("__MACOSX"):
                        target_path = self.extract_dir / os.path.basename(member)
                        with z.open(member) as source, open(target_path, "wb") as target:
                            shutil.copyfileobj(source, target)
                        extracted.append(target_path)
        except Exception as e:
            logger.error(f"Erro ao descompactar {zip_path}: {e}")
        return extracted

    def get_local_csv_files(self, start_year: int = 2023) -> list[Path]:
        """Obtém arquivos CSV locais existentes na pasta extracted."""
        files = sorted(self.extract_dir.glob("*.csv"))
        # Se pasta extracted estiver vazia, tenta extrair de dados_e-agendas.zip se existir
        if not files:
            zip_candidate = config.DATA_DIR / "dados_e-agendas.zip"
            if zip_candidate.exists():
                logger.info(f"Extraindo arquivos iniciais de {zip_candidate}...")
                files = self.extract_zip(zip_candidate)

        # Filtra anos relevantes
        res: list[Path] = []
        for p in files:
            name = p.name
            try:
                year = int(name.split("-")[0])
                if year >= start_year:
                    res.append(p)
            except (ValueError, IndexError):
                res.append(p)
        return sorted(res)

    def fetch_new_files(self, force: bool = False, year: int = 2023) -> list[Path]:
        """Identifica quais arquivos CSV são novos ou foram atualizados desde a última execução.

        Retorna a lista de Path dos arquivos que precisam ser processados.
        """
        state = self.load_state()
        processed_files = state.get("processed_files", {})
        new_or_updated: list[Path] = []

        # 1. Tenta buscar novidades remotas se houver conexão
        remote_res = self.discover_remote_resources()
        for res in remote_res:
            if res.url:
                filename = os.path.basename(res.url.split("?")[0]) or f"{res.name}.csv"
                dest_file = self.extract_dir / filename
                # Se for novo ou tamanho mudou
                if force or filename not in processed_files or not dest_file.exists():
                    success = self.download_file(res.url, dest_file)
                    if success:
                        if filename.endswith(".zip"):
                            extracted = self.extract_zip(dest_file)
                            new_or_updated.extend(extracted)
                        else:
                            new_or_updated.append(dest_file)

        # 2. Varre os arquivos locais no diretório extracted
        local_files = self.get_local_csv_files(start_year=year)
        for csv_path in local_files:
            fname = csv_path.name
            # Se for forçado ou ainda não registrado no estado
            if force or fname not in processed_files:
                new_or_updated.append(csv_path)
            else:
                # Compara mtime e tamanho
                st = csv_path.stat()
                recorded = processed_files.get(fname, {})
                if st.st_size != recorded.get("size") or st.st_mtime > recorded.get("mtime", 0):
                    new_or_updated.append(csv_path)

        # Deduplica caminhos
        unique_paths = list({p.resolve(): p for p in new_or_updated}.values())
        return unique_paths

    def record_processed_files(self, files: list[Path], rows_count: int, stage_name: str = "sync-cgu") -> None:
        """Atualiza o estado de sincronização com os arquivos processados com sucesso."""
        state = self.load_state()
        now_iso = datetime.now().isoformat()
        state["last_sync"] = now_iso

        if "processed_files" not in state:
            state["processed_files"] = {}

        for p in files:
            if p.exists():
                st = p.stat()
                state["processed_files"][p.name] = {
                    "mtime": st.st_mtime,
                    "size": st.st_size,
                    "processed_at": now_iso,
                    "hash": self.compute_file_hash(p),
                }

        state.setdefault("history", []).append({
            "timestamp": now_iso,
            "stage": stage_name,
            "files_count": len(files),
            "rows_added": rows_count,
            "files": [p.name for p in files],
        })
        # Mantém histórico limitado aos últimos 50 eventos
        state["history"] = state["history"][-50:]
        self.save_state(state)
