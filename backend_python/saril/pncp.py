"""Cliente do PNCP — Portal Nacional de Contratações Públicas.

Complementa o DOU em vez de substituí-lo. O DOU publica o ato (inexigibilidade,
portaria, nomeação) em texto corrido, do qual CNPJ e valor precisam ser
extraídos por expressão regular — e falham em parte dos casos. O PNCP publica o
**contrato** já estruturado: CNPJ do fornecedor, valor global, objeto, órgão e
datas em campos próprios.

Isso habilita também o teste inverso, que o DOU sozinho não permite: empresas
com contrato relevante num órgão e **nenhuma reunião declarada** na agenda dele.
Esse é um achado de subnotificação contra o órgão, não contra a empresa.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date

from . import config

CONTRACTS_URL = "https://pncp.gov.br/api/consulta/v1/contratos"
ORGANS_URL = "https://pncp.gov.br/api/pncp/v1/orgaos"

# 500 é o teto aceito; abaixo de 10 a API devolve 400.
PAGE_SIZE = 500
REQUEST_DELAY = 0.4
MAX_RETRIES = 4
TIMEOUT = 120


@dataclass
class Contract:
    pncp_id: str
    organ_cnpj: str
    organ_name: str
    sphere: str
    supplier_cnpj: str
    supplier_name: str
    object_text: str
    value_initial: float | None
    value_global: float | None
    signature_date: str
    publication_date: str
    validity_start: str
    validity_end: str
    contract_type: str
    process_category: str
    from_adhesion: bool
    parliamentary_amendment: str
    uf: str


def _get(url: str) -> dict | list:
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": config.USER_AGENT, "Accept": "application/json"}
            )
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                raw = response.read().decode("utf-8", "replace").strip()
            # O PNCP responde 200 com corpo VAZIO quando o órgão não tem
            # contrato no período. Tentar decodificar isso levanta
            # JSONDecodeError, que eu tratava como falha transitória e repetia
            # quatro vezes antes de abortar a ingestão inteira.
            if not raw:
                return {}
            return json.loads(raw)
        except urllib.error.HTTPError as exc:
            # 204 = sem conteúdo no período; 400 aqui é parâmetro, não falha
            # transitória: repetir não muda o resultado.
            if exc.code in (204, 400, 404):
                return {}
            last = exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
        time.sleep(2 ** attempt)
    raise RuntimeError(f"PNCP inacessível: {last}")


def fetch_organs() -> list[dict]:
    """Cadastro completo de órgãos do PNCP (~98 mil, com CNPJ e razão social)."""
    data = _get(ORGANS_URL)
    return data if isinstance(data, list) else []


def _to_contract(row: dict) -> Contract | None:
    supplier = (row.get("niFornecedor") or "").strip()
    if not supplier:
        return None
    organ = row.get("orgaoEntidade") or {}
    unit = row.get("unidadeOrgao") or {}
    amendment = row.get("emendaParlamentar")

    return Contract(
        pncp_id=row.get("numeroControlePNCP") or "",
        organ_cnpj=(organ.get("cnpj") or "").strip(),
        organ_name=organ.get("razaoSocial") or "",
        sphere=organ.get("esferaId") or "",
        supplier_cnpj=supplier,
        supplier_name=row.get("nomeRazaoSocialFornecedor") or "",
        object_text=(row.get("objetoContrato") or "")[:2000],
        value_initial=row.get("valorInicial"),
        value_global=row.get("valorGlobal"),
        signature_date=row.get("dataAssinatura") or "",
        publication_date=(row.get("dataPublicacaoPncp") or "")[:10],
        validity_start=row.get("dataVigenciaInicio") or "",
        validity_end=row.get("dataVigenciaFim") or "",
        contract_type=(row.get("tipoContrato") or {}).get("nome") or "",
        process_category=(row.get("categoriaProcesso") or {}).get("nome") or "",
        from_adhesion=bool(row.get("frutoAdesao")),
        parliamentary_amendment=str(amendment) if amendment else "",
        uf=unit.get("ufNome") or "",
    )


def fetch_contracts(organ_cnpj: str, date_from: date, date_to: date,
                    max_pages: int = 40) -> list[Contract]:
    """Contratos de um órgão no período, paginando até esgotar."""
    contracts: list[Contract] = []
    for page in range(1, max_pages + 1):
        params = {
            "dataInicial": date_from.strftime("%Y%m%d"),
            "dataFinal": date_to.strftime("%Y%m%d"),
            "cnpjOrgao": organ_cnpj,
            "pagina": str(page),
            "tamanhoPagina": str(PAGE_SIZE),
        }
        time.sleep(REQUEST_DELAY)
        payload = _get(f"{CONTRACTS_URL}?{urllib.parse.urlencode(params)}")
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not rows:
            break
        for row in rows:
            contract = _to_contract(row)
            if contract:
                contracts.append(contract)
        if len(rows) < PAGE_SIZE:
            break
    return contracts
