"""Capture the public, new Haksan Makina catalog as a reviewable snapshot.

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
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

from bs4 import BeautifulSoup


BASE = "https://www.haksanmakina.com.tr/"
ROOT_CATEGORIES = [
    ("CNC", "?y10/cnc-talasli-imalat-teknolojileri.html"),
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
                body = response.read(3_000_001)
                if len(body) > 3_000_000:
                    raise ValueError(f"Oversized page: {url}")
                if urlparse(response.url).hostname not in {"www.haksanmakina.com.tr", "haksanmakina.com.tr"}:
                    raise ValueError(f"Unexpected redirect: {response.url}")
                return BeautifulSoup(body, "html.parser")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("unreachable")


def text_of(node) -> str:
    return clean(node.get_text(" ", strip=True)) if node else ""


def table_grid(table):
    """Expand source spans while retaining cell identity (never nested rows)."""
    result, occupied = [], {}
    for ri, tr in enumerate(table.find_all('tr')):
        if tr.find_parent('table') is not table:
            continue
        row, ci = {}, 0
        for (r, c), cell in list(occupied.items()):
            if r == len(result):
                row[c] = cell
        for cell in tr.find_all(['td', 'th'], recursive=False):
            while ci in row:
                ci += 1
            cs, rs = min(int(cell.get('colspan', 1)), 32), min(int(cell.get('rowspan', 1)), 100)
            for dr in range(rs):
                for dc in range(cs):
                    occupied[(len(result) + dr, ci + dc)] = cell
                    if dr == 0:
                        row[ci + dc] = cell
            ci += cs
        result.append([row.get(i) for i in range(max(row, default=-1) + 1)])
    return result


def model_token(value):
    return re.sub(r'[^A-Z0-9]', '', value.upper())


def is_unit(value):
    return bool(re.fullmatch(r'(?:mm|cm|m|kg|kgs|kg\.?|ton|t|kw|kva|hp|w|v|a|amp|lt\.?|l|rpm|r/?min|dev\.?/?dak\.?|d/?dk\.?|m/?min|mm/?min|mm/?dak\.?|m/?dak\.?|hz|bar|mpa|n|kn|nm|°|º|˚|derece|adet|ad\.?|%|inch|inç|mm²|m²|m³|mm/sn|m/sn|sn|sec|dak)', value.replace("İ", "i").replace("I", "ı").casefold()))


def extract_structured_tables(technical, card):
    specs, configurations, warnings = [], {}, []
    seen = set()
    def append(target, key, value, unit=''):
        key, value, unit = clean(key), clean(value), clean(unit)
        if not key or not value or value in {'-', '--', '—'} or len(key) > 255 or len(value) > 2000:
            return
        if key.replace("İ", "i").replace("I", "ı").casefold() in {'model', 'model no', 'teknik bilgiler', 'teknik özellikler', 'technical specifications', 'birim', 'unit'}:
            return
        sig = (key.replace("İ", "i").replace("I", "ı").casefold(), value, unit)
        if sig not in {(x['key'].replace("İ", "i").replace("I", "ı").casefold(), x['value'], x['unit']) for x in target}:
            target.append({'key': key, 'value': value, 'unit': unit})
    for table in technical.find_all('table'):
        if table.find('table'):
            continue
        rows = table_grid(table)
        header_index, model_columns, unit_column = None, {}, None
        for index, row in enumerate(rows):
            unique = []
            for cell in row:
                if cell is not None and not any(cell is old for old in unique):
                    unique.append(cell)
            unique = [cell for cell in unique if text_of(cell)]
            texts = [text_of(cell) for cell in unique]
            if not texts:
                continue
            first = texts[0].replace("İ", "i").replace("I", "ı").casefold().strip(':')
            if first in {'model', 'model no', 'teknik bilgiler', 'teknik özellikler', 'technical specifications', 'specifications'} and len(unique) >= 2:
                candidate = {}
                for col, cell in enumerate(row):
                    value = text_of(cell)
                    if value.replace("İ", "i").replace("I", "ı").casefold() in {'birim', 'unit', 'units'}:
                        unit_column = col
                    elif cell is not unique[0] and value and re.search(r'\d', value) and not is_unit(value):
                        candidate[id(cell)] = (col, value)
                if candidate:
                    model_columns = {col: value for col, value in candidate.values()}
                    header_index = index
                    break
        if model_columns:
            for ri, row in enumerate(rows[(header_index or 0) + 1:], start=(header_index or 0) + 1):
                first_value = min(model_columns)
                labels, unit = [], ''
                for ci, cell in enumerate(row[:first_value]):
                    value = text_of(cell)
                    if not value or any(cell is prior for prior in row[:ci]):
                        continue
                    if is_unit(value) or ci == unit_column:
                        unit = value
                    else:
                        labels.append(value)
                key = ' — '.join(labels)
                if not key:
                    continue
                row_values = []
                for ci, model in model_columns.items():
                    if ci >= len(row):
                        continue
                    value = text_of(row[ci])
                    if value:
                        row_values.append((model, value))
                        append(configurations.setdefault(model, []), key, value, unit)
                if len(model_columns) == 1 or (len(row_values) == len(model_columns) and len({value for _, value in row_values}) == 1):
                    if row_values:
                        append(specs, key, row_values[0][1], unit)
            continue
        # Some pages transpose the table: one row per model, field headings
        # across columns. Preserve every row as a scoped configuration.
        header = None
        for ri, row in enumerate(rows):
            texts = [text_of(cell) for cell in row]
            if texts and texts[0].replace('İ','i').casefold() in {'model','tip – type','tip - type','tip','type'} and len(texts) >= 3:
                header = texts
                continue
            if header and len(texts) == len(header) and texts[0] and re.search(r'\d', texts[0]):
                values = configurations.setdefault(texts[0], [])
                for ci in range(1, len(texts)):
                    append(values, header[ci], texts[ci])
        if header and configurations:
            keys = {item['key'] for values in configurations.values() for item in values}
            for key in keys:
                present = [next((item for item in values if item['key'] == key), None) for values in configurations.values()]
                if all(present) and len({(item['value'],item['unit']) for item in present}) == 1:
                    append(specs,key,present[0]['value'],present[0]['unit'])
            continue
        # Repeated field-header/value row pairs (e.g. eccentric presses).
        for ri in range(len(rows) - 1):
            labels = [text_of(cell) for cell in rows[ri]]
            values = [text_of(cell) for cell in rows[ri+1]]
            if len(labels) >= 3 and len(labels) == len(values) and all(labels) and all(values):
                if all(re.search(r'[A-Za-zÇĞİÖŞÜçğıöşü]', label) for label in labels) and all(re.search(r'\d', value) for value in values):
                    for key,value in zip(labels,values):
                        append(specs,key,value)

        # Explicit two/three-column key/unit/value tables without series headers.
        for row in rows:
            unique = []
            for cell in row:
                if cell is not None and not any(cell is old for old in unique):
                    unique.append(cell)
            values = [text_of(cell) for cell in unique]
            if len(values) == 2 and all(values) and len(values[0]) <= 100:
                append(specs, values[0], values[1])
            elif len(values) == 3 and is_unit(values[-1]) and values[-2]:
                append(specs, values[0], values[1], values[2])
            elif len(values) >= 3 and is_unit(values[-2]) and values[-1]:
                append(specs, ' — '.join(x for x in values[:-2] if x), values[-1], values[-2])
    if len(configurations) == 1:
        header = next(iter(configurations))
        a, b = model_token(header), model_token(card['model'])
        scoped = a == b or (min(len(a), len(b)) >= 4 and (a in b or b in a))
        if not scoped:
            warnings.append('Single-model table header differs from source card model: ' + header)
            specs = []
    return specs, configurations, warnings


def standard_equipment(technical):
    values, enabled = [], False
    for node in technical.find_all(['p', 'li', 'h3', 'h4']):
        if node.find_parent('table'):
            continue
        value = text_of(node)
        folded = value.replace("İ", "i").replace("I", "ı").casefold()
        if any(x in folded for x in ('standart donanım', 'standart aksesuar', 'standard accessories', 'standard equipment')):
            enabled = True
            continue
        if any(x in folded for x in ('opsiyonel', 'optional', 'teknik özellik', 'technical specification')):
            enabled = False
        if enabled and value and len(value) <= 1000 and value not in values:
            values.append(value)
    return values


def extract_detail(card: dict, page=None) -> dict:
    page = page if page is not None else soup(card["sourceUrl"])
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

    if technical:
        structured, configurations, warnings = extract_structured_tables(technical, card)
        # Structured source tables take precedence; colon fallback only fills
        # labels absent from tables, and is disabled for multi-model sources.
        if structured or configurations:
            table_keys = {item['key'].casefold() for item in structured}
            specs = structured + ([item for item in specs if item['key'].casefold() not in table_keys]
                                  if not configurations else [])
            exact = next((values for model, values in configurations.items()
                          if model_token(model) == model_token(card['model'])), None)
            if exact is not None:
                specs = exact
        captured = datetime.now(ZoneInfo("Europe/Istanbul")).date().isoformat()
        card['technicalConfigurations'] = [
            {'sourceModelCode': model, 'specs': values, 'sourceUrl': card['sourceUrl'],
             'capturedOn': captured, 'verificationStatus': 'source_verified'}
            for model, values in configurations.items() if values
        ]
        card['standardEquipment'] = standard_equipment(technical)
        card['technicalImages'] = [absolute(image.get('src')) for image in technical.select('img[src]')
                                   if urlparse(urljoin(BASE,image.get('src'))).hostname in {'www.haksanmakina.com.tr','haksanmakina.com.tr'}]
        card['technicalCoverage'] = {'tableCount': len(technical.select('table')),
                                    'imageCount': len(card['technicalImages']),
                                    'textLength': len(text_of(technical))}

        card['extractionWarnings'] = warnings
    card["specs"] = specs[:150]
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
            categories.append(category)
        time.sleep(0.15)

    cards = []
    external_links = []
    for category in categories:
        # Walk only pagination belonging to this exact category; never follow
        # sidebar categories or the separate second-hand catalog.
        pending = [category["url"]]
        visited = set()
        links = []
        while pending:
            page_url = pending.pop(0)
            if page_url in visited:
                continue
            visited.add(page_url)
            page = soup(page_url)
            links.extend(page.select(".product-card .product-card-link"))
            for pagination in page.select(".pagination a, .pager a, a[rel=next]"):
                candidate = absolute(pagination.get("href", ""))
                category_id = re.search(r"[?]z(\d+)/", category["url"])
                candidate_id = re.search(r"[?]z(\d+)/", candidate)
                if category_id and candidate_id and category_id.group(1) == candidate_id.group(1) and candidate not in visited:
                    pending.append(candidate)
            if len(visited) > 100:
                raise ValueError(f"Pagination exceeds safety limit: {category['url']}")
        for link in links:
            href = link.get("href", "")
            if urlparse(urljoin(BASE, href)).hostname not in {"www.haksanmakina.com.tr", "haksanmakina.com.tr"}:
                external_links.append({"sourceUrl": urljoin(BASE, href), "category": category["name"], "title": text_of(link.select_one(".product-title")), "reason": "external_product_reference"})
                continue
            url = absolute(href)
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
    unique = {}
    for card in cards:
        previous = unique.get(card["sourceId"])
        if previous and (previous["group"], previous["sourceCategory"]) != (card["group"], card["sourceCategory"]):
            raise ValueError(f"Ambiguous source category for {card['sourceId']}")
        unique[card["sourceId"]] = card
    cards = list(unique.values())
    excluded_products = []
    if fiber_only:
        cards = [card for card in cards if re.search(r"fiber", card["title"], re.I)]
    print(f"Categories: {len(categories)}; cards: {len(cards)}", flush=True)

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
        "capturedOn": datetime.now(ZoneInfo("Europe/Istanbul")).date().isoformat(),
        "scope": ("Public new fiber laser cutting machines from three CNC sheet/tube categories; no second-hand products"
                  if fiber_only else "All public new-product categories including CNC and CNC sheet metal machines; no second-hand products"),
        "excludedCategories": excluded_categories,
        "excludedProducts": [{"sourceId": p["sourceId"], "sourceUrl": p["sourceUrl"]} for p in excluded_products],
        "externalReferences": external_links,
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
