"""Cliente real do Diário Oficial da União (Imprensa Nacional).

Substitui o scraper anterior, que apontava para o catálogo CKAN de metadados
do dados.gov.br — um endpoint que jamais devolveu atos do DOU — e caía num
fallback de três registros escritos à mão.

A busca pública do in.gov.br devolve HTML com um <script type="application/json">
embutido contendo os atos já estruturados (órgão, tipo de ato, data, título,
ementa e slug do artigo). O texto integral vem da página do próprio ato.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import date

from . import config

_SCRIPT_RE = re.compile(
    rf'<script id="{config.DOU_JSON_SCRIPT_ID}" type="application/json">(.*?)</script>',
    re.S,
)
_TEXT_DIV_RE = re.compile(
    r'<div[^>]*class="[^"]*texto-dou[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S
)
_TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class DouRecord:
    """Um ato publicado no DOU, exatamente como a Imprensa Nacional o devolve."""
    dou_id: str
    section: str
    url_title: str
    title: str
    act_type: str
    pub_date: str            # ISO yyyy-mm-dd
    edition: str
    page: str
    organ_hierarchy: str
    organ_root: str
    summary: str
    link_url: str
    full_text: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


class DouClient:
    def __init__(self, delay: float | None = None, use_cache: bool = True):
        self.delay = config.DOU_REQUEST_DELAY if delay is None else delay
        self.use_cache = use_cache
        self._last_request = 0.0
        if use_cache:
            config.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- HTTP
    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request = time.monotonic()

    def _cache_path(self, url: str):
        key = hashlib.sha256(url.encode()).hexdigest()[:32]
        return config.CACHE_DIR / f"{key}.html"

    def _get(self, url: str) -> str:
        if self.use_cache:
            cached = self._cache_path(url)
            if cached.exists():
                return cached.read_text(encoding="utf-8", errors="replace")

        last_error: Exception | None = None
        for attempt in range(config.DOU_MAX_RETRIES):
            self._throttle()
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": config.USER_AGENT,
                    "Accept": "text/html,application/json",
                    "Accept-Language": "pt-BR,pt;q=0.9",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=config.DOU_TIMEOUT) as resp:
                    html = resp.read().decode("utf-8", errors="replace")
                if self.use_cache:
                    self._cache_path(url).write_text(html, encoding="utf-8")
                return html
            except urllib.error.HTTPError as exc:
                # 404 e 410 são determinísticos: repetir só gasta tempo. Alguns
                # slugs do portal têm acento e não resolvem na forma canônica.
                if exc.code in (404, 410):
                    raise RuntimeError(f"DOU retornou {exc.code} para {url}") from exc
                last_error = exc
                _sleep_backoff(attempt, exc)
            except (urllib.error.URLError, TimeoutError) as exc:
                last_error = exc
                _sleep_backoff(attempt, exc)

        raise RuntimeError(f"DOU inacessível após {config.DOU_MAX_RETRIES} tentativas: {last_error}")

    # -------------------------------------------------------------- Busca
    def search_page(
        self,
        query: str,
        section: str,
        date_from: date,
        date_to: date,
        page: int = 1,
    ) -> list[DouRecord]:
        params = {
            "q": query,
            "s": section,
            "exactDate": "personalizado",
            "publishFrom": date_from.strftime("%d-%m-%Y"),
            "publishTo": date_to.strftime("%d-%m-%Y"),
            "delta": str(config.DOU_PAGE_SIZE),
            "currentPage": str(page),
            "sortType": "0",
        }
        url = f"{config.DOU_SEARCH_URL}?{urllib.parse.urlencode(params)}"
        return self._parse_search_html(self._get(url), section)

    def _parse_search_html(self, html: str, section: str) -> list[DouRecord]:
        match = _SCRIPT_RE.search(html)
        if not match:
            return []
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            return []

        records = []
        for item in payload.get("jsonArray", []):
            record = self._to_record(item, section)
            if record:
                records.append(record)
        return records

    @staticmethod
    def _to_record(item: dict, section: str) -> DouRecord | None:
        url_title = item.get("urlTitle") or ""
        if not url_title:
            return None

        pub_date = item.get("pubDate") or ""
        iso_date = ""
        if re.fullmatch(r"\d{2}/\d{2}/\d{4}", pub_date):
            day, month, year = pub_date.split("/")
            iso_date = f"{year}-{month}-{day}"

        hierarchy = item.get("hierarchyList") or []
        summary = _strip_html(item.get("content") or "")

        return DouRecord(
            dou_id=str(item.get("classPK") or url_title),
            section=(item.get("pubName") or section).upper(),
            url_title=url_title,
            title=_strip_html(item.get("title") or ""),
            act_type=(item.get("artType") or "").strip(),
            pub_date=iso_date,
            edition=str(item.get("editionNumber") or ""),
            page=str(item.get("numberPage") or ""),
            organ_hierarchy=item.get("hierarchyStr") or "",
            organ_root=hierarchy[0] if hierarchy else "",
            summary=summary,
            link_url=config.DOU_ARTICLE_URL.format(
                url_title=urllib.parse.quote(url_title, safe="/-")
            ),
        )

    def search(
        self,
        query: str,
        date_from: date,
        date_to: date,
        sections: tuple[str, ...] = config.DOU_SECTIONS,
        max_pages: int = 10,
    ) -> list[DouRecord]:
        """Todos os atos que casam com a consulta, paginando até esgotar."""
        found: dict[str, DouRecord] = {}
        for section in sections:
            for page in range(1, max_pages + 1):
                try:
                    batch = self.search_page(query, section, date_from, date_to, page)
                except RuntimeError as exc:
                    print(f"[dou] busca interrompida em {section} p{page}: {exc}")
                    break
                if not batch:
                    break
                for record in batch:
                    found.setdefault(record.dou_id, record)
                if len(batch) < config.DOU_PAGE_SIZE:
                    break
        return list(found.values())

    # -------------------------------------------------------- Texto integral
    def fetch_full_text(self, record: DouRecord) -> str:
        """Texto completo do ato — é dele que saem CNPJ, contratada e valor."""
        if record.full_text:
            return record.full_text
        try:
            html = self._get(record.link_url)
        except RuntimeError as exc:
            print(f"[dou] texto integral indisponível para {record.url_title}: {exc}")
            return ""
        match = _TEXT_DIV_RE.search(html)
        text = _strip_html(match.group(1)) if match else ""
        record.full_text = text
        return text


def _sleep_backoff(attempt: int, exc: Exception) -> None:
    backoff = 2 ** attempt
    print(f"[dou] tentativa {attempt + 1} falhou ({exc}); aguardando {backoff}s")
    time.sleep(backoff)


def _strip_html(raw: str) -> str:
    text = _TAG_RE.sub(" ", raw or "")
    text = (
        text.replace("&nbsp;", " ").replace("&amp;", "&")
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    return re.sub(r"\s+", " ", text).strip()
