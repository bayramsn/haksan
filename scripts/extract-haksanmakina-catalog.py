"""Capture the public, new, non-CNC Haksan Makina catalog as a reviewable snapshot.

Run manually: python3 scripts/extract-haksanmakina-catalog.py
Requires beautifulsoup4. The snapshot records source URLs and only values found
on product pages. It never writes to CRM or follows second-hand categories.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

from bs4 import BeautifulSoup


BASE = "https://www.haksanmakina.com.tr/"
ROOT_CATEGORIES = [
    ("UNIVERSAL", "?y13/talasli-imalat-makinalari.html"),
    ("SAC_ISLEME", "?y4/sac-isleme-makinalari.html"),
    ("KAYNAK", "?y9/kaynak-teknolojileri.html"),
    ("HAVA", "?y8/hava-uretim-teknolojileri.html"),
    ("TASIMA", "?y11/tasima-ve-kaldirma-ekipmanlari.html"),
    ("AYDINLATMA", "?y162/endustriyel-makina-aydinlatma-lambalari.html"),
    ("HIRDAVAT", "?y12/hirdavat-ve-makina-ekipmanlari.html"),
    ("YEDEK_PARCA", "?y142/makina-yedek-parcalari.html"),
]
OUTPUT = Path(__file__).resolve().parents[1] / "apps/api/src/db/seed/data/haksanmakina/products.json"
FIBER_OUTPUT = OUTPUT.with_name("fiber-laser-products.json")
FIBER_CATEGORIES = [
    ("SAC_ISLEME", "?z59/cnc-laser-kesim-makinalari.html"),
    ("SAC_ISLEME", "?z174/cnc-fiber-lazer-boru-kesim-makinalari.html"),
    ("SAC_ISLEME", "?z175/cnc-sac-boru-fiber-laser-kesim.html"),
]
FIBER_CATEGORY_NAMES = {
    "?z59/cnc-laser-kesim-makinalari.html": "CNC Laser Kesim Makinaları",
    "?z174/cnc-fiber-lazer-boru-kesim-makinalari.html": "CNC Fiber Lazer Boru Kesim Makinaları",
    "?z175/cnc-sac-boru-fiber-laser-kesim.html": "CNC Saç & Boru Fiber Laser Kesim",
}
USER_AGENT = "HaksanCRM-CatalogImport/1.0 (+https://www.haksanmakina.com.tr/)"


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def absolute(href: str) -> str:
    result = urljoin(BASE, href)
    if urlparse(result).hostname not in {"www.haksanmakina.com.tr", "haksanmakina.com.tr"}:
        raise ValueError(f"Unexpected source host: {result}")
    return quote(result, safe=":/?=&%#")


def soup(url: str) -> BeautifulSoup:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                if int(response.headers.get("Content-Length", "0")) > 3_000_000:
                    raise ValueError(f"Oversized page: {url}")
                return BeautifulSoup(response.read(3_000_001), "html.parser")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("unreachable")


def text_of(node) -> str:
    return clean(node.get_text(" ", strip=True)) if node else ""


def extract_detail(card: dict) -> dict:
    page = soup(card["sourceUrl"])
    details = {}
    for item in page.select(".detail-item"):
        label = text_of(item.select_one(".detail-label"))
        if label:
            details[label] = text_of(item.select_one(".detail-value"))
    if details.get("Marka"):
        card["brand"] = details["Marka"]
    if details.get("Model"):
        card["model"] = details["Model"]

    technical = page.select_one("#tab-content-1")
    card["technicalText"] = text_of(technical)[:12000]
    specs: list[dict[str, str]] = []
    seen: set[str] = set()
    field_hints: list[dict[str, str]] = []
    seen_hints: set[str] = set()

    def add(key: str, value: str, unit: str = "") -> None:
        key, value, unit = clean(key), clean(value), clean(unit)
        if not key or not value or len(key) > 255 or len(value) > 2000:
            return
        if key.casefold() in {"model", "model no", "modelno", "teknik özellikler", "özellik"}:
            return
        if key.casefold() == card["model"].casefold():
            return
        if value in {"-", "--", "—"}:
            return
        signature = key.casefold()
        if signature in seen:
            return
        seen.add(signature)
        specs.append({"key": key, "value": value, "unit": unit})

    if technical:
        # Some catalog pages format series specifications as alternating
        # paragraphs instead of a table. Keep the labels as blank fields;
        # values in a multi-model series are not assigned to one variant.
        specs_block = technical.select_one(".technical-specs")
        if specs_block and text_of(specs_block.select_one("h3")).casefold() == "technical specifications":
            for node in specs_block.children:
                if getattr(node, "name", None) == "hr":
                    break
                if getattr(node, "name", None) != "p":
                    continue
                strong = node.select_one("strong")
                key = text_of(node)
                if strong and text_of(strong) == key and key.casefold() != "model" and not re.search(r"\d", key) and 3 <= len(key) <= 80 and key.casefold() not in seen_hints:
                    seen_hints.add(key.casefold())
                    field_hints.append({"key": key, "unit": ""})
        for table in technical.select("table"):
            rows = [[text_of(cell) for cell in row.select("th,td")] for row in table.select("tr")]
            rows = [row for row in rows if len(row) >= 2]
            if not rows:
                continue
            # Series pages list several machine sizes under one product card.
            # Their measurements cannot be assigned to a specific model, but
            # the row labels are valid blank CRM fields for that series.
            if len(rows[0]) >= 3 and rows[0][0].casefold() == "model":
                for row in rows[1:]:
                    key = clean(row[0])
                    if 3 <= len(key) <= 80 and key.casefold() not in seen_hints:
                        seen_hints.add(key.casefold())
                        field_hints.append({"key": key, "unit": ""})
            for row in rows:
                if len(row) < 3:
                    continue
                key, unit = row[0], row[1]
                if (len(key) < 3 or key.casefold() == "model" or len(key) > 80
                        or not unit or len(unit) > 18 or re.search(r"\d", unit)):
                    continue
                if not re.fullmatch(r"[A-Za-zÀ-ÿ°Ø/%²³. -]+", unit):
                    continue
                if key.casefold() not in seen_hints:
                    seen_hints.add(key.casefold())
                    field_hints.append({"key": key, "unit": unit})
            if all(len(row) == 2 for row in rows):
                for key, value in rows:
                    add(key, value)
                continue
            table_model = re.sub(r"[^A-Z0-9]", "", rows[0][2].upper()) if len(rows[0]) == 3 else ""
            product_model = re.sub(r"[^A-Z0-9]", "", card["model"].upper())
            if rows[0][0].casefold() == "model" and table_model == product_model and all(len(row) == 3 for row in rows[: min(len(rows), 8)]):
                for key, unit, value in rows[1:]:
                    add(key, value, unit)
                continue
            model = re.sub(r"[^A-Z0-9]", "", card["model"].upper())
            for index, row in enumerate(rows):
                if not row or len(row) < 3:
                    continue
                row_model = re.sub(r"[^A-Z0-9]", "", row[0].upper())
                if not model or not row_model or not (model == row_model or row_model.endswith(model)
                                                       or (model.startswith("EB") and row_model.endswith(model[2:]))):
                    continue
                if len(row_model) < 3:
                    continue
                headers = next((r for r in reversed(rows[:index]) if r[0].casefold() == "model" and len(r) == len(row)), None)
                if headers:
                    units = rows[index - 1] if index and rows[index - 1] is not headers and len(rows[index - 1]) == len(row) else []
                    for position in range(1, len(row)):
                        add(headers[position], row[position], units[position - 1] if units and position - 1 < len(units) else "")
        for line in technical.stripped_strings:
            line = clean(line)
            for fragment in re.split(r"\s+/\s+", line):
                match = re.match(r"^([^:]{3,80})\s*:\s*(.{1,120})$", fragment)
                if match and len(match.group(1).split()) <= 8:
                    add(match.group(1), match.group(2))

    card["specs"] = specs[:100]
    card["fieldHints"] = field_hints[:100]
    card["referenceNo"] = details.get("Referans No", card["sourceId"])
    return card


def main() -> None:
    fiber_only = "--fiber-laser-only" in sys.argv[1:]
    categories = []
    excluded_categories = []
    for group, path in (FIBER_CATEGORIES if fiber_only else ROOT_CATEGORIES):
        if fiber_only:
            title = FIBER_CATEGORY_NAMES[path]
            categories.append({"group": group, "name": title, "url": absolute(path)})
            continue
        page = soup(absolute(path))
        for link in page.select(".category-card .card-link"):
            title = text_of(link.select_one(".category-title"))
            category = {"group": group, "name": title, "url": absolute(link.get("href", ""))}
            if re.search(r"\bCNC\b", title, re.I):
                excluded_categories.append(category)
            else:
                categories.append(category)
        time.sleep(0.15)

    cards = []
    for category in categories:
        page = soup(category["url"])
        for link in page.select(".product-card .product-card-link"):
            url = absolute(link.get("href", ""))
            match = re.search(r"[?]d(\d+)/", url)
            if not match:
                continue
            cards.append({
                "sourceId": match.group(1),
                "sourceUrl": url,
                "group": category["group"],
                "sourceCategory": category["name"],
                "sourceCategoryUrl": category["url"],
                "sourceCategoryId": re.search(r"[?]z(\d+)/", category["url"]).group(1),
                "title": text_of(link.select_one(".product-title")),
                "model": text_of(link.select_one(".product-model")),
                "summary": text_of(link.select_one(".product-description")),
                "imageUrl": absolute(link.select_one(".product-image").get("src")) if link.select_one(".product-image") else "",
            })
        time.sleep(0.15)
    unique = {card["sourceId"]: card for card in cards}
    cards = list(unique.values())
    excluded_products = ([] if fiber_only else
                         [card for card in cards if re.search(r"\bCNC\b", card["title"] + " " + card["model"], re.I)])
    cards = [card for card in cards if (re.search(r"fiber", card["title"], re.I) if fiber_only else card not in excluded_products)]
    print(f"Categories: {len(categories)}; cards: {len(cards)}; CNC categories: {len(excluded_categories)}; CNC cards: {len(excluded_products)}", flush=True)

    products = []
    errors = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(extract_detail, card): card for card in cards}
        for future in as_completed(futures):
            try:
                products.append(future.result())
            except Exception as exc:
                errors.append({"sourceUrl": futures[future]["sourceUrl"], "error": str(exc)})
            if (len(products) + len(errors)) % 50 == 0:
                print(f"Details: {len(products) + len(errors)}/{len(cards)}", flush=True)
    products.sort(key=lambda item: (item["group"], item["sourceCategory"], int(item["sourceId"])))
    if fiber_only:
        # The FT series has two public cards. Prefer the newer, more specific
        # sheet-and-tube category, while retaining source IDs for traceability.
        unique_series = {}
        for product in products:
            key = (product["brand"].casefold(), product["model"].casefold())
            previous = unique_series.get(key)
            if previous is None or int(product["sourceId"]) > int(previous["sourceId"]):
                unique_series[key] = product
        products = sorted(unique_series.values(), key=lambda item: int(item["sourceId"]))
    snapshot = {
        "source": BASE,
        "capturedOn": date.today().isoformat(),
        "scope": ("Public new fiber laser cutting machines from three CNC sheet/tube categories; no second-hand products"
                  if fiber_only else "Public new-product categories excluding CNC category and CNC-named products; no second-hand products"),
        "excludedCategories": excluded_categories,
        "excludedProducts": [{"sourceId": p["sourceId"], "sourceUrl": p["sourceUrl"]} for p in excluded_products],
        "errors": errors,
        "products": products,
    }
    output = FIBER_OUTPUT if fiber_only else OUTPUT
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(products)} products to {output}; errors: {len(errors)}", flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
