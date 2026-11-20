#!/usr/bin/env python3
"""Capture tr.aorelaser.com pages for the HEX 2026 PDF series only (user decision 2026-10-13).

Run manually: python3 scripts/extract-aore-catalog.py
The site supplies series name, Turkish title, highlights and feature headings.
Images come from the HEX PDF instead (AORE photos carry the AORE logo).
Its technical tables are kept as raw evidence only: labels are shifted on the live site
(e.g. "Konumlandırma doğruluğu" = "115m/min"), so values are never applied automatically.
Writes apps/api/src/db/seed/data/aore-site/series.json; never touches the CRM.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

from bs4 import BeautifulSoup

BASE = "https://tr.aorelaser.com/"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/api/src/db/seed/data/aore-site/series.json"
MANIFEST = ROOT / "packages/shared/src/hexlaser-2026-data.ts"
USER_AGENT = "Mozilla/5.0 HaksanCRM-CatalogImport/1.0"


def pdf_series() -> list[str]:
    text = MANIFEST.read_text(encoding="utf-8")
    manifest = json.loads(text[text.index("{"): text.rindex("}") + 1])
    return [row["series"] for row in manifest["series"]]


def fetch(url: str) -> str:
    request = urllib.request.Request(quote(url, safe=":/%+?=&"), headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if urlparse(response.url).hostname != "tr.aorelaser.com":
                    raise ValueError(f"Unexpected redirect: {response.url}")
                body = response.read(5_000_001)
                if len(body) > 5_000_000:
                    raise ValueError(f"Oversized page: {url}")
                return body.decode("utf-8", "replace")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("unreachable")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def absolute(src: str | None) -> str:
    if not src:
        return ""
    url = urljoin(BASE, src)
    return url if urlparse(url).hostname == "tr.aorelaser.com" else ""


def series_links(home: str) -> dict[str, str]:
    """Series code is the URL suffix before the numeric id: ...-GR-H-354.html -> GR-H."""
    links: dict[str, str] = {}
    for href in set(re.findall(r'href="(/product/[^"]+-\d+\.html)"', home)):
        slug = href.rsplit("/", 1)[1][: -len(".html")]
        words = slug.split("-")[:-1]
        code = []
        for word in reversed(words):  # codes are upper-case tokens such as PGT, GR-H, LGD+RW
            if not re.fullmatch(r"[A-Z0-9+]{1,5}", word):
                break
            code.insert(0, word)
        if code:
            links["-".join(code)] = urljoin(BASE, href)
    return links


def parse(series: str, url: str, raw: str, captured: str) -> dict:
    page = BeautifulSoup(raw, "html.parser")
    banner = page.select_one(".banner")
    hero = banner.select_one("img") if banner else None
    heading = clean(banner.select_one(".banner-div h3").get_text()) if banner and banner.select_one(".banner-div h3") else ""
    title = clean(banner.select_one(".banner-div p").get_text()) if banner and banner.select_one(".banner-div p") else ""
    highlights = [clean(span.get_text()) for span in page.select(".home-button h4 span") if clean(span.get_text())]
    features: list[str] = []
    for h3 in page.find_all("h3"):
        text = clean(h3.get_text())
        if text in {"Teknik Parametreler", "Teklif İste", "Uygulamalar", "Müşteri Başarı Hikayeleri", "Dilinizi Seçin", heading}:
            continue
        if text not in features:
            features.append(text)
    tables = [[[clean(cell.get_text(" ")) for cell in row.find_all(["td", "th"])] for row in table.find_all("tr")]
              for table in page.find_all("table")]
    models = []
    for table in tables:
        for row in table:
            if row and row[0].lower() == "model":
                models.extend(cell for cell in row[1:] if cell)
    meta = page.find("meta", attrs={"name": "description"})
    return {
        "series": series, "url": url, "capturedAt": captured, "sha256": hashlib.sha256(raw.encode()).hexdigest(),
        "heading": heading, "title": title, "highlights": highlights, "features": features,
        "description": clean(meta.get("content", "")) if meta else "",
        "imageUrl": absolute(hero.get("src") or hero.get("data-src")) if hero else "",
        "models": models,
        # Evidence only: the live site shifts labels against values.
        "rawTables": tables, "verification": "evidence_only",
    }


def main() -> None:
    captured = datetime.datetime.now(datetime.timezone.utc).isoformat()
    wanted = pdf_series()
    links = series_links(fetch(BASE))
    records, errors = [], []
    for series in wanted:
        url = links.get(series)
        if not url:
            continue
        try:
            records.append(parse(series, url, fetch(url), captured))
        except Exception as exc:  # recorded; an incomplete snapshot is refused below
            errors.append({"series": series, "url": url, "error": str(exc)})
    result = {
        "schemaVersion": 1, "source": BASE, "capturedAt": captured, "scope": "hex2026_pdf_series",
        "series": records, "missingOnSite": [s for s in wanted if s not in links],
        "outOfScopeOnSite": sorted(s for s in links if s not in wanted), "errors": errors,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"series": len(records), "missingOnSite": result["missingOnSite"],
                      "outOfScopeOnSite": result["outOfScopeOnSite"], "errors": len(errors)}, ensure_ascii=False))
    if errors:
        sys.exit("Incomplete AORE snapshot; no import permitted")


if __name__ == "__main__":
    main()
