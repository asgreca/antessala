"""Módulo de Configurações Globais e Parâmetros do Antessala (`config.py`).

FUNÇÃO NO PROJETO:
- Centraliza todos os caminhos do sistema de arquivos (`DATA_DIR`, `DB_PATH`, `SERVING_DB_PATH`, `CACHE_DIR`), URLs de dados abertos do governo, formatos de data e parâmetros de janelas de correlação.
- Garante padronização e constância entre o pipeline de ingestão, banco DuckDB e a API FastAPI.

COMO FUNCIONA:
1. Define a estrutura de diretórios base e caminhos estáticos.
2. Armazena limites de janelas temporais de correlação (ex: `CORRELATION_WINDOW_DAYS = 365`).
3. Define os endpoints oficiais de busca do Diário Oficial da União (in.gov.br) e portais da CGU.
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "dou_cache"
DB_PATH = DATA_DIR / "saril.duckdb"
# Cópia servida pela API. O DuckDB só admite um escritor: publicar um snapshot
# após cada etapa mantém a API respondendo durante a ingestão.
SERVING_DB_PATH = DATA_DIR / "saril_serving.duckdb"

EAGENDAS_PARQUET = DATA_DIR / "eagendas_consolidado_2023_2026.parquet"
EXTRACT_DIR = DATA_DIR / "extracted"
CGU_SYNC_STATE_FILE = DATA_DIR / "cgu_sync_state.json"
CGU_DOWNLOAD_USER_AGENT = "Antessala/CGU Data Sync Engine (+https://github.com/cgu/saril)"

# Formato real das datas do e-Agendas. NUNCA deixar o pandas inferir:
# a inferência transforma 60% da base em NaT e troca dia/mês no restante.
EAGENDAS_DATE_FORMAT = "%d-%m-%Y"

# ---------------------------------------------------------------- DOU
# Endpoint público de busca da Imprensa Nacional. Devolve HTML com um
# <script type="application/json"> embutido contendo os atos estruturados.
DOU_SEARCH_URL = "https://www.in.gov.br/consulta/-/buscar/dou"
DOU_ARTICLE_URL = "https://www.in.gov.br/web/dou/-/{url_title}"
DOU_JSON_SCRIPT_ID = "_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params"

# DO1: atos normativos (portarias, resoluções). DO3: contratos e licitações.
DOU_SECTIONS = ("do1", "do3")
DOU_PAGE_SIZE = 50          # máximo aceito pelo portal
DOU_REQUEST_DELAY = 1.1     # segundos entre requisições (respeito ao rate limit)
DOU_MAX_RETRIES = 4
DOU_TIMEOUT = 45

USER_AGENT = (
    "SARIL/2.0 (Auditoria Continua de Lobby; +https://www.gov.br/cgu) "
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
)

# ------------------------------------------------------- Correlação
# Janela em que uma reunião anterior à publicação é considerada relevante.
# 60 dias por decisão de escopo: além disso o intervalo deixa de sustentar
# hipótese de influência sobre aquele ato específico, e passa a medir apenas a
# frequência com que a empresa circula pela Esplanada.
CORRELATION_WINDOW_DAYS = 60
# Entidades com menos reuniões que isso não entram na varredura dirigida.
MIN_MEETINGS_FOR_TARGET = 20

# Faixas redistribuídas para a janela de 60 dias: com o teto anterior de 365,
# tudo caberia na primeira faixa e a graduação desapareceria.
SEVERITY_BANDS = (
    # (limite superior de Δt em dias, severidade, peso no score)
    (7, "CRITICA", 1.00),
    (20, "ALTA", 0.75),
    (40, "MEDIA", 0.45),
    (60, "BAIXA", 0.20),
)

# Abaixo disso, a proximidade entre reunião e ato é explicada pela própria
# cadência de reuniões da entidade e não sustenta a severidade da faixa de Δt.
MIN_PROXIMITY_LIFT = 1.0

HIGH_VALUE_THRESHOLD = 1_000_000.0      # R$ que qualifica contrato de alto valor
CRITICAL_VALUE_THRESHOLD = 50_000_000.0

# Tipos de ato que caracterizam contratação sem concorrência plena.
NO_BID_ACT_TYPES = (
    "inexigibilidade",
    "dispensa",
    "ratifica",
)
