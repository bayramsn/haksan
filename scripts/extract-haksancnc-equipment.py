#!/usr/bin/env python3
"""
Extract standard / optional equipment lists from the staged Haksan CNC brochure
PDFs into equipment.json (consumed by db:import:haksancnc).

Two brochure templates:
  - Turkish (Mitsubishi/Haksan): a "TEZGAH DONANIMI" / "STANDART DONANIM" bullet
    list. These PDFs use a cipher font whose ToUnicode is broken (ı->2, ş->`,
    ğ->space, İ->1), so text extraction is garbage — we render the equipment
    page(s) and OCR them with Turkish Tesseract instead, which reads the glyph
    shapes correctly.
  - Maximart (English, C/D series): a spec sheet with a right-hand "Machine
    Accessories" column + a ●/○ standard/optional legend. Text is clean, so we
    pull the right-column item names with pdfplumber.

Output: { "<pdf-stem>": { "standard": [...], "optional": [...] } }
  pdf-stem == manifest product id (e.g. "haksan-cnc-mv-1050").
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "apps/api/src/db/seed/data/haksancnc/pdfs"
OUT = ROOT / "apps/api/src/db/seed/data/haksancnc/equipment.json"

# Lines that are page furniture / footers / headers, never equipment.
NOISE_RE = re.compile(
    r"(www\.|http|@|\.com|\.tr|İSTANBUL|TÜRKİYE|TURKIYE|Bayrampa|Mah\.|Cad\.|No:"
    r"|haksan makina|haksan tak|HAKSAN|1972|maximart|TEL:|FAX:|Specification|ITEM/MODEL"
    r"|reference only|Checking sign|prior notice)",
    re.IGNORECASE,
)
SECTION_STD = re.compile(r"(TEZGAH DONANIMI|STANDART DONANIM|STANDART AKSESUAR)", re.IGNORECASE)
SECTION_OPT = re.compile(r"(OPS[İI]YONEL|İSTE[ĞG]E BA[ĞG]LI|ISTEGE BAGLI|OPTIONAL)", re.IGNORECASE)
LOWER_RE = re.compile(r"[a-zçğıöşü]")
LEAD_BULLET_RE = re.compile(r"^[\s\W_➢»>•\-–—o*●○☐□]+")


def clean_item(line: str) -> str:
    # Table grid lines OCR as runs of pipes / lone O,0 — strip them out.
    s = re.sub(r"[|]+", " ", line)
    s = re.sub(r"\s[O0Çç]{1,2}(?=\s|$)", " ", s)  # stray cell-border blobs
    s = LEAD_BULLET_RE.sub("", s).strip()
    s = re.sub(r"\s+", " ", s)
    # OCR sometimes reads MPG as WPG etc; light, safe fixups only.
    s = s.replace("(WPG)", "(MPG)")
    return s.strip(" .·-–—|")


def is_equipment_line(s: str) -> bool:
    if not (5 <= len(s) <= 110):
        return False
    if NOISE_RE.search(s):
        return False
    if SECTION_STD.search(s) or SECTION_OPT.search(s):
        return False
    letters = sum(c.isalpha() for c in s)
    if letters < 4:
        return False
    # Reject rotated-sidebar OCR garbage ("VON NN N NN NNNN...") — needs lowercase.
    if not LOWER_RE.search(s):
        return False
    # Reject lines that are mostly the same repeated char.
    compact = re.sub(r"\s", "", s)
    if compact and len(set(compact.lower())) <= 3:
        return False
    return True


def classify(pdf_path: Path) -> str:
    out = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"], capture_output=True, text=True
    ).stdout
    if re.search(r"Standard Accessor|Machine Accessories|Optional Accessor", out):
        return "maximart"
    if "DONANIM" in out or "➢" in out:
        return "turkish"
    return "unknown"


def equipment_pages(pdf_path: Path) -> list[int]:
    """1-based page numbers whose (possibly ciphered) text mentions DONANIM."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, pg in enumerate(pdf.pages, 1):
            t = pg.extract_text() or ""
            if "DONANIM" in t.upper() or "➢" in t:
                pages.append(i)
    return pages


def ocr_page(pdf_path: Path, page: int) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        prefix = Path(tmp) / "pg"
        subprocess.run(
            ["pdftoppm", "-r", "300", "-f", str(page), "-l", str(page), "-png",
             str(pdf_path), str(prefix)],
            capture_output=True,
        )
        imgs = sorted(Path(tmp).glob("pg*.png"))
        if not imgs:
            return ""
        # Default page segmentation (psm 3, auto) handles this mixed layout far
        # better than a forced uniform block.
        return subprocess.run(
            ["tesseract", str(imgs[0]), "-", "-l", "tur"],
            capture_output=True, text=True,
        ).stdout


def extract_turkish(pdf_path: Path) -> dict:
    standard, optional = [], []
    seen = set()
    for page in equipment_pages(pdf_path):
        text = ocr_page(pdf_path, page)
        section = "standard"
        for raw in text.splitlines():
            if SECTION_OPT.search(raw):
                section = "optional"
                continue
            if SECTION_STD.search(raw):
                section = "standard"
                continue
            item = clean_item(raw)
            if not is_equipment_line(item):
                continue
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            (standard if section == "standard" else optional).append(item)
    return {"standard": standard, "optional": optional}


CONT_RE = re.compile(r"^([a-z(&+/]|with\b|Type\b)", re.IGNORECASE)
DROP_RE = re.compile(r"Accessor|Available|^MODEL$|^C\d|^D-?\d|Specifications?$|^Options?$|^Machine$", re.IGNORECASE)


def extract_maximart(pdf_path: Path) -> dict:
    """Pull the right-hand 'Machine Accessories' name column off the spec sheet.

    The C/D-series Maximart sheets are a dense multi-column ●/○ grid that does
    not parse cleanly, so we are conservative: take only well-formed accessory
    names from the right column (rejoining obvious wrapped lines) and skip the
    page entirely if it looks too noisy, rather than emit fragments."""
    standard, seen = [], set()
    with pdfplumber.open(pdf_path) as pdf:
        for pg in pdf.pages:
            words = pg.extract_words(use_text_flow=False)
            machine_hdrs = [w for w in words if w["text"] == "Machine"
                            and any(a["text"] == "Accessories" and abs(a["top"] - w["top"]) < 6
                                    and 0 < a["x0"] - w["x0"] < 120 for a in words)]
            if not machine_hdrs:
                continue
            cut = min(h["x0"] for h in machine_hdrs) - 10
            top0 = min(h["top"] for h in machine_hdrs) + 8
            rights = [w for w in words if w["x0"] >= cut and w["top"] > top0]
            lines = {}
            for w in rights:
                top = round(w["top"] / 6) * 6
                lines.setdefault(top, []).append(w)
            ordered = [clean_item(" ".join(p["text"] for p in sorted(lines[t], key=lambda w: w["x0"])))
                       for t in sorted(lines)]
            merged = []
            for ln in ordered:
                if merged and ln and CONT_RE.match(ln) and not DROP_RE.search(ln) and len(merged[-1]) < 60:
                    merged[-1] = f"{merged[-1]} {ln}".strip()
                else:
                    merged.append(ln)
            for line in merged:
                if not is_equipment_line(line) or DROP_RE.search(line):
                    continue
                # accessory names are multi-word and start with a capital/digit
                if len(line.split()) < 2 or not re.match(r"[A-Z0-9]", line):
                    continue
                key = line.lower()
                if key in seen:
                    continue
                seen.add(key)
                standard.append(line)
    return {"standard": standard, "optional": []}


def main():
    result = {}
    only = sys.argv[1:]  # optional: restrict to given stems for testing
    for pdf in sorted(PDF_DIR.glob("*.pdf")):
        stem = pdf.stem
        if only and stem not in only:
            continue
        kind = classify(pdf)
        if kind == "turkish":
            eq = extract_turkish(pdf)
        elif kind == "maximart":
            eq = extract_maximart(pdf)
        else:
            eq = {"standard": [], "optional": []}
        result[stem] = {**eq, "kind": kind}
        print(f"{stem:32s} {kind:9s} std={len(eq['standard']):3d} opt={len(eq['optional']):3d}",
              file=sys.stderr)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"\nwrote {OUT} ({len(result)} products)", file=sys.stderr)


if __name__ == "__main__":
    main()
