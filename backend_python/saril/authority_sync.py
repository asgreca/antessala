"""Sincronização Contínua e Automática de Fotos Oficiais de Ministros e Autoridades.

Identifica autoridades de primeiro escalão (Ministros de Estado, Presidente e
Vice-Presidente da República) presentes nas reuniões do e-Agendas, consulta bases oficiais
abertas (Wikimedia Commons / Wikipedia API) para localizar seus retratos oficiais,
valida correspondência estrita de nomes (evitando falsos positivos) e realiza o
download para `frontend/public/authorities/`, atualizando
`frontend/src/data/authorityPhotos.json` automaticamente.

Funciona de forma resiliente, idempotente e sem onerar a máquina do usuário.
"""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import duckdb

logger = logging.getLogger(__name__)

# Diretórios do projeto
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
PHOTOS_DIR = FRONTEND_DIR / "public" / "authorities"
CATALOG_PATH = FRONTEND_DIR / "src" / "data" / "authorityPhotos.json"
SERVING_DB = PROJECT_ROOT / "data" / "saril_serving.duckdb"
PRIMARY_DB = PROJECT_ROOT / "data" / "saril.duckdb"

USER_AGENT = "Mozilla/5.0 (compatible; AntessalaBot/1.0; +https://antessala.cgu.gov.br)"

STOPWORDS = {"de", "da", "do", "das", "dos", "e", "em", "para", "com", "ministro", "ministra", "politico", "politica"}


def normalize_name(name: str) -> str:
    """Normaliza nome removendo acentos e caracteres especiais."""
    if not name:
        return ""
    norm = unicodedata.normalize("NFD", name)
    norm = "".join(ch for ch in norm if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", norm).strip().upper()


def norm_clean(text: str) -> str:
    """Normaliza para minúsculas sem acentos e sem pontuação."""
    n = unicodedata.normalize("NFD", text)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-zA-Z0-9\s]", "", n).lower().strip()


def slugify(name: str) -> str:
    """Converte nome para slug de arquivo (ex: 'margareth_menezes')."""
    norm = norm_clean(name)
    norm = re.sub(r"[^a-z0-9]+", "_", norm)
    return norm.strip("_")


def get_db_connection() -> duckdb.DuckDBPyConnection:
    """Abre conexão com o DuckDB (preferindo o banco de serving se existir)."""
    db_path = SERVING_DB if SERVING_DB.exists() else PRIMARY_DB
    return duckdb.connect(str(db_path), read_only=True)


def extract_ministerial_authorities(min_meetings: int = 5) -> List[Dict[str, Any]]:
    """Extrai estritamente Ministros de Estado e Presidente da República."""
    try:
        con = get_db_connection()
        query = """
            SELECT 
                authority_name,
                authority_role,
                public_body,
                COUNT(*) as total_meetings
            FROM meetings
            WHERE (authority_role ILIKE 'MINISTRO%' 
               OR authority_role ILIKE 'MINISTRA%' 
               OR authority_role ILIKE 'PRESIDENTE DA REP%')
               AND authority_role NOT ILIKE '%CHEFE DE GABINETE%'
               AND authority_role NOT ILIKE '%ASSESSOR%'
               AND authority_role NOT ILIKE '%SUBSECRET%'
               AND authority_role NOT ILIKE '%ADJUNTO%'
               AND authority_role NOT ILIKE '%CONSELHEIRO%'
               AND authority_role NOT ILIKE '%SUPERINTENDENTE%'
            GROUP BY authority_name, authority_role, public_body
            HAVING COUNT(*) >= ?
            ORDER BY total_meetings DESC
        """
        rows = con.execute(query, [min_meetings]).fetchall()
        con.close()

        results = []
        for name, role, body, count in rows:
            results.append({
                "name": name.strip(),
                "role": role.strip(),
                "public_body": body.strip(),
                "total_meetings": count,
            })
        return results
    except Exception as e:
        logger.error(f"Erro ao extrair autoridades ministeriais do banco: {e}")
        return []


def load_photo_catalog() -> Dict[str, Any]:
    """Carrega o arquivo authorityPhotos.json existente."""
    if not CATALOG_PATH.exists():
        return {}
    try:
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Erro ao ler catálogo de fotos ({CATALOG_PATH}): {e}")
        return {}


def save_photo_catalog(catalog: Dict[str, Any]) -> None:
    """Salva o arquivo authorityPhotos.json de forma atômica e formatada."""
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = CATALOG_PATH.with_suffix(".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    temp_path.replace(CATALOG_PATH)


def is_strictly_matching_person(raw_name: str, wiki_title: str) -> bool:
    """Validação estrita de identidade pessoal.
    
    1. Rejeita páginas genéricas (listas, prêmios, instituições).
    2. O primeiro nome deve coincidir.
    3. Todos os tokens do título (sobrenomes) devem estar presentes no nome completo da autoridade.
    """
    title_lower = wiki_title.lower()
    if any(bad in title_lower for bad in ["lista de", "família", "prêmio", "eleição", "governo", "ministério", "gabinete", "sepultados"]):
        return False

    clean_title = re.sub(r"\s*\([^)]*\)", "", wiki_title).strip()
    norm_raw = norm_clean(raw_name)
    norm_title = norm_clean(clean_title)

    raw_parts = [p for p in norm_raw.split() if len(p) >= 3 and p not in STOPWORDS]
    title_parts = [p for p in norm_title.split() if len(p) >= 3 and p not in STOPWORDS]

    if not raw_parts or not title_parts:
        return False

    # Primeiro nome coincidente
    if raw_parts[0] != title_parts[0]:
        return False

    # Todos os sobrenomes do título da Wikipédia devem estar presentes nos sobrenomes da autoridade
    for p in title_parts[1:]:
        if p not in raw_parts[1:]:
            return False

    return True


def search_wikipedia_portrait(name: str, role: str) -> Optional[Tuple[str, str, str]]:
    """Pesquisa retrato oficial da autoridade na Wikipedia/Wikimedia Commons.
    
    Retorna: (title, photo_url, display_name) ou None.
    """
    clean_name = name.title()
    queries = [
        f"{clean_name} ministro",
        clean_name,
    ]
    parts = clean_name.split()
    if len(parts) > 2:
        short_name = f"{parts[0]} {parts[-1]}"
        queries.append(f"{short_name} ministro")
        queries.append(short_name)

    headers = {"User-Agent": USER_AGENT}

    for q in queries:
        try:
            url = f"https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(q)}&format=json"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as res:
                data = json.load(res)
                hits = data.get("query", {}).get("search", [])
                if not hits:
                    continue

                for hit in hits[:3]:
                    page_title = hit["title"]

                    # Valida correspondência estrita de identidade
                    if not is_strictly_matching_person(name, page_title):
                        continue

                    # Obtém a imagem principal da página
                    img_url_api = (
                        f"https://pt.wikipedia.org/w/api.php?action=query&titles={urllib.parse.quote(page_title)}"
                        f"&prop=pageimages&piprop=original|thumbnail&pithumbsize=500&format=json"
                    )
                    req_img = urllib.request.Request(img_url_api, headers=headers)
                    with urllib.request.urlopen(req_img, timeout=8) as img_res:
                        img_data = json.load(img_res)
                        pages = img_data.get("query", {}).get("pages", {})
                        for _, page_info in pages.items():
                            thumb = page_info.get("thumbnail", {}).get("source")
                            original = page_info.get("original", {}).get("source")
                            target_url = thumb or original
                            if target_url:
                                display_title = re.sub(r"\s*\([^)]*\)", "", page_title).strip()
                                return (page_title, target_url, display_title)
        except Exception as e:
            logger.debug(f"Falha na busca para '{q}': {e}")
            continue

    return None


def download_photo_file(photo_url: str, slug: str) -> Optional[str]:
    """Baixa o arquivo de imagem para frontend/public/authorities/{slug}.jpg.
    
    Retorna o caminho relativo web (ex: '/authorities/slug.jpg') ou None.
    """
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    ext = ".jpg"
    if ".png" in photo_url.lower():
        ext = ".png"
    elif ".webp" in photo_url.lower():
        ext = ".webp"

    filename = f"{slug}{ext}"
    dest_path = PHOTOS_DIR / filename

    if dest_path.exists() and dest_path.stat().st_size > 1000:
        return f"/authorities/{filename}"

    headers = {"User-Agent": USER_AGENT}
    try:
        req = urllib.request.Request(photo_url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as response:
            content = response.read()
            if len(content) < 1000:
                logger.warning(f"Imagem retornada é muito pequena ({len(content)} bytes) para {photo_url}")
                return None
            with open(dest_path, "wb") as f:
                f.write(content)
        return f"/authorities/{filename}"
    except Exception as e:
        logger.error(f"Erro ao baixar imagem de {photo_url} para {dest_path}: {e}")
        return None


def sync_authority_photos(min_meetings: int = 5, max_new_downloads: int = 25) -> Dict[str, Any]:
    """Executa a rotina completa de sincronização contínua de fotos de autoridades."""
    catalog = load_photo_catalog()
    authorities = extract_ministerial_authorities(min_meetings=min_meetings)

    synced_count = 0
    skipped_count = 0
    failed_count = 0
    new_authorities = []

    for auth in authorities:
        raw_name = auth["name"]
        norm = normalize_name(raw_name)

        existing = catalog.get(norm)
        if existing and existing.get("photoUrl"):
            local_rel = existing["photoUrl"].lstrip("/")
            if (FRONTEND_DIR / "public" / local_rel).exists():
                skipped_count += 1
                continue

        if synced_count >= max_new_downloads:
            logger.info(f"Limite de {max_new_downloads} downloads por ciclo atingido.")
            break

        logger.info(f"🔍 Buscando foto oficial para autoridade ministerial: {raw_name} ({auth['role']})...")
        portrait_info = search_wikipedia_portrait(raw_name, auth["role"])

        if not portrait_info:
            logger.info(f"   ℹ Foto oficial não localizada no momento para: {raw_name}")
            failed_count += 1
            continue

        wiki_title, photo_url, display_name = portrait_info
        slug = slugify(display_name if display_name else raw_name)
        local_web_url = download_photo_file(photo_url, slug)

        if local_web_url:
            entry = {
                "photoUrl": local_web_url,
                "id": slug,
                "displayName": display_name,
            }
            catalog[norm] = entry

            norm_display = normalize_name(display_name)
            if norm_display not in catalog:
                catalog[norm_display] = entry

            parts = norm.split()
            if len(parts) > 2:
                short_norm = f"{parts[0]} {parts[-1]}"
                if short_norm not in catalog:
                    catalog[short_norm] = entry

            synced_count += 1
            new_authorities.append({
                "name": raw_name,
                "displayName": display_name,
                "photoUrl": local_web_url,
                "role": auth["role"],
            })
            logger.info(f"   ✔ Foto baixada e vinculada com sucesso: {display_name} ({raw_name}) -> {local_web_url}")
            time.sleep(0.4)
        else:
            failed_count += 1

    if synced_count > 0:
        save_photo_catalog(catalog)
        logger.info(f"Catálogo de autoridades atualizado com {synced_count} novas fotos.")

    return {
        "status": "success",
        "synced": synced_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "totalCatalogEntries": len(catalog),
        "newAuthorities": new_authorities,
        "timestamp": datetime.now().isoformat(),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    res = sync_authority_photos()
    print("\nResultado da sincronização de fotos:")
    print(json.dumps(res, indent=2, ensure_ascii=False))
