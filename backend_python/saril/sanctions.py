"""Módulo de Ingestão e Cruzamento de Sanções Administrativas da CGU (CEIS / CNEP).

FUNÇÃO NO PROJETO:
- Cruza os dados do e-Agendas e do DOU com as listas de sanções da CGU: **CEIS** (Cadastro de Empresas Inidôneas e Suspensas) e **CNEP** (Cadastro Nacional de Empresas Punidas).
- Sinaliza interações críticas e de alto risco: empresas sancionadas/impedidas de licitar reunindo-se com autoridades ou sendo contempladas por atos contratuais durante a vigência da punição.

COMO FUNCIONA:
1. Faz o download em lote ou leitura local dos arquivos abertos do CEIS/CNEP.
2. Indexa empresas punidas por CNPJ e razão social sanitizada.
3. Cruza datas de reuniões e publicação de atos com o período de vigência da sanção administrativa.
"""
from __future__ import annotations

import csv
import io
import os
import re
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from . import config
from .normalize import clean_cnpj, normalize_name

DOWNLOAD_URL = "https://portaldatransparencia.gov.br/download-de-dados/{registry}/{stamp}"
REGISTRIES = ("ceis", "cnep")

# O CSV do Portal vem em latin-1 com separador ";".
CSV_ENCODING = "latin-1"
CSV_DELIMITER = ";"

COLUMNS = {
    "person_type": "TIPO DE PESSOA",
    "document": "CPF OU CNPJ DO SANCIONADO",
    "name": "NOME DO SANCIONADO",
    "corporate_name": "RAZÃO SOCIAL - CADASTRO RECEITA",
    "category": "CATEGORIA DA SANÇÃO",
    "start_date": "DATA INÍCIO SANÇÃO",
    "end_date": "DATA FINAL SANÇÃO",
    "publication_date": "DATA PUBLICAÇÃO",
    "publication": "PUBLICAÇÃO",
    "process_number": "NÚMERO DO PROCESSO",
    "scope": "ABRAGÊNCIA DA SANÇÃO",
    "body": "ÓRGÃO SANCIONADOR",
    "body_sphere": "ESFERA ÓRGÃO SANCIONADOR",
    "legal_basis": "FUNDAMENTAÇÃO LEGAL",
    "sanction_code": "CÓDIGO DA SANÇÃO",
}

# Sanções que efetivamente impedem contratar. Uma multa não impede; uma
# declaração de inidoneidade sim. A distinção muda a gravidade do achado.
BLOCKING_CATEGORIES = (
    "inidoneidade", "impedimento", "suspensão", "suspensao", "proibição",
    "proibicao", "declaração de inidoneidade",
)


@dataclass
class Sanction:
    sanction_id: str
    registry: str
    person_type: str
    document: str
    cnpj: str | None
    name: str
    name_norm: str
    corporate_name: str
    category: str
    is_blocking: bool
    start_date: date | None
    end_date: date | None
    publication_date: date | None
    publication: str
    process_number: str
    scope: str
    sanctioning_body: str
    body_sphere: str
    legal_basis: str


def _parse_date(raw: str | None) -> date | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _api_key() -> str | None:
    """Token do Portal da Transparência, do ambiente ou do .env do projeto."""
    key = os.environ.get("TRANSPARENCIA")
    if key:
        return key.strip()
    env_file = config.BASE_DIR / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.strip().startswith("TRANSPARENCIA"):
            _, _, value = line.partition("=")
            return value.strip().strip('"').strip("'") or None
    return None


def download_registry(registry: str, stamp: str | None = None,
                      dest_dir: Path | None = None) -> Path:
    """Baixa e extrai o CSV de um cadastro. Retorna o caminho do arquivo."""
    stamp = stamp or date.today().strftime("%Y%m%d")
    dest_dir = dest_dir or (config.DATA_DIR / "sanctions")
    dest_dir.mkdir(parents=True, exist_ok=True)

    url = DOWNLOAD_URL.format(registry=registry, stamp=stamp)
    request = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    key = _api_key()
    if key:
        request.add_header("chave-api-dados", key)

    with urllib.request.urlopen(request, timeout=180) as response:
        payload = response.read()

    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
        if not names:
            raise RuntimeError(f"Nenhum CSV no pacote de {registry}")
        target = dest_dir / names[0]
        target.write_bytes(archive.read(names[0]))
    return target


def parse_registry(path: Path, registry: str) -> list[Sanction]:
    with open(path, encoding=CSV_ENCODING, newline="") as handle:
        reader = csv.DictReader(handle, delimiter=CSV_DELIMITER)
        rows = list(reader)

    sanctions: list[Sanction] = []
    for index, row in enumerate(rows):
        def get(field: str) -> str:
            return (row.get(COLUMNS[field]) or "").strip()

        document = re.sub(r"\D", "", get("document"))
        person_type = get("person_type").upper()
        category = get("category")
        name = get("name")

        sanctions.append(Sanction(
            sanction_id=f"{registry.upper()}-{get('sanction_code') or index}",
            registry=registry.upper(),
            person_type=person_type,
            document=document,
            cnpj=clean_cnpj(document) if person_type == "J" else None,
            name=name,
            name_norm=normalize_name(name),
            corporate_name=get("corporate_name"),
            category=category,
            is_blocking=any(term in category.lower() for term in BLOCKING_CATEGORIES),
            start_date=_parse_date(get("start_date")),
            end_date=_parse_date(get("end_date")),
            publication_date=_parse_date(get("publication_date")),
            publication=get("publication")[:300],
            process_number=get("process_number"),
            scope=get("scope"),
            sanctioning_body=get("body"),
            body_sphere=get("body_sphere"),
            legal_basis=get("legal_basis")[:300],
        ))
    return sanctions


# A abrangência define ONDE a sanção vincula. Ignorá-la transforma um encontro
# lícito em acusação: uma empresa suspensa por um município pode legalmente se
# reunir com um ministério federal.
SCOPE_ALL = "todas as esferas"
SCOPE_SPHERE = "esfera do órgão sancionador"
SCOPE_BODY = "no órgão sancionador"


def scope_applies(sanction: Sanction, meeting_body: str) -> tuple[bool, str]:
    """A sanção alcança o órgão em que a reunião aconteceu?

    Retorna (alcança, motivo). Quando a abrangência não é informada, devolve
    False com motivo explícito: um achado de auditoria não se sustenta em
    presunção contra o sancionado.
    """
    scope = (sanction.scope or "").strip().lower()
    sphere = (sanction.body_sphere or "").strip().upper()

    if SCOPE_ALL in scope:
        return True, "sanção vale em todas as esferas e poderes"

    if SCOPE_SPHERE in scope:
        # O e-Agendas cobre o Executivo federal.
        if sphere == "FEDERAL":
            return True, "sanção vale em toda a esfera federal"
        return False, f"sanção restrita à esfera {sphere.lower() or 'não informada'}"

    if SCOPE_BODY in scope:
        a = normalize_name(sanction.sanctioning_body)
        b = normalize_name(meeting_body)
        if a and b and (a == b or a in b or b in a):
            return True, "reunião no próprio órgão sancionador"
        return False, "sanção restrita ao órgão sancionador, que não é o da reunião"

    return False, "abrangência não informada no cadastro"


def active_on(sanction: Sanction, when: date) -> bool:
    """A sanção estava vigente naquela data?

    Fim vazio significa sanção sem prazo determinado (inidoneidade), que segue
    vigente. Início vazio torna a vigência indeterminável, e nesse caso não se
    afirma vigência — um achado de auditoria não se sustenta em suposição.
    """
    if sanction.start_date is None:
        return False
    if when < sanction.start_date:
        return False
    if sanction.end_date is None:
        return True
    return when <= sanction.end_date
