#!/usr/bin/env python3
"""AORE "Technical Parameters" çalışma kitabından packages/shared/src/laser-source-data.ts üretir.

  python3 -I scripts/generate-aore-workbook-source.py "<Technical Parameters.xlsx>"

Hücre metni ve birleştirme koordinatları olduğu gibi korunur; ayrıştırma laser.ts'te yapılır.
Yalnız kesim serisi sayfaları ve standart yapılandırma sayfası alınır (kaynak/temizleme ve
otomasyon sayfaları ayrı kaynak ailesidir). Etiket sözlüğü (AORE_LABEL_ALIASES) dosyanın
sonundan korunur. Stdlib dışında bağımlılık yoktur: exceljs bu dosyada gömülü görseller
yüzünden asılı kalıyor.
"""
import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(REPO, "packages", "shared", "src", "laser-source-data.ts")
CUTTING_SHEET = re.compile(r"^(F|FT|GR|S|FB|PG|PGT|PU|PB|H|TG|TH|V|M|TA|TS|TZ)系列$")
STANDARDS_SHEET = "配置参数"
# Standart sayfada S serisi iki sütun: kremayerli varyant serinin standart karşılığıdır.
STANDARD_COLUMN_NAMES = {"S（Gear rack and pinion）": "S", "S（Ball screw）": "S (Vidalı mil)"}


def col_row(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    col = 0
    for ch in m.group(1):
        col = col * 26 + ord(ch) - 64
    return col, int(m.group(2))


def read_workbook(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    for s in ET.fromstring(z.read("xl/workbook.xml")).iter(NS + "sheet"):
        target = rels[s.get(RNS + "id")].lstrip("/")
        root = ET.fromstring(z.read(target if target.startswith("xl/") else "xl/" + target))
        cells, max_col, max_row = {}, 0, 0
        for c in root.iter(NS + "c"):
            t, v, inline = c.get("t"), c.find(NS + "v"), c.find(NS + "is")
            if inline is not None:
                value = "".join(x.text or "" for x in inline.iter(NS + "t"))
            elif v is None:
                continue
            elif t == "s":
                value = shared[int(v.text)]
            else:
                value = v.text or ""
            col, row = col_row(c.get("r"))
            cells[(row, col)] = value.strip()
            max_col, max_row = max(max_col, col), max(max_row, row)
        rows = [[cells.get((r, c), "") for c in range(1, max_col + 1)] for r in range(1, max_row + 1)]
        while rows and not any(rows[-1]):
            rows.pop()
        merges = []
        for mc in root.iter(NS + "mergeCell"):
            a, _, b = mc.get("ref").partition(":")
            (c1, r1), (c2, r2) = col_row(a), col_row(b or a)
            merges.append({"startRow": r1, "endRow": r2, "startColumn": c1, "endColumn": c2})
        yield s.get("name"), rows, merges


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sheets = []
    for name, rows, merges in read_workbook(sys.argv[1]):
        if name == STANDARDS_SHEET:
            rows = [[STANDARD_COLUMN_NAMES.get(cell, cell) for cell in row] for row in rows]
            name = "Standart Yapılandırma"
        elif not CUTTING_SHEET.match(name):
            continue
        sheets.append((name, rows, merges))
    if not any(name == "Standart Yapılandırma" for name, _, _ in sheets):
        sys.exit("Standart yapılandırma sayfası bulunamadı")
    with open(TARGET, encoding="utf-8") as handle:
        current = handle.read()
    aliases = current[current.index("export const AORE_LABEL_ALIASES"):]
    out = [
        f"// Read-only extraction from {os.path.basename(sys.argv[1])} (scripts/generate-aore-workbook-source.py).",
        "// Original cell text and merged-cell coordinates are preserved; cutting series and series-wide standards only.",
        "export const AORE_WORKBOOK_SHEETS = [",
    ]
    for name, rows, merges in sheets:
        out.append(f"  {{ name: {json.dumps(name, ensure_ascii=False)}, rows: [")
        out.append(",\n".join("    " + json.dumps(row, ensure_ascii=False) for row in rows))
        out.append(f"  ], merges: {json.dumps(merges)} }},")
    out.append("];\n")
    with open(TARGET, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out) + "\n" + aliases)
    print(f"{len(sheets)} sayfa yazıldı: " + ", ".join(name for name, _, _ in sheets))


if __name__ == "__main__":
    main()
