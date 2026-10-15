#!/usr/bin/env python3
"""Cut the HEX LASER product photo of each series out of the 2026 PDF catalog.

Run manually: python3 scripts/extract-hexlaser-2026-images.py "<HEX LASER ... 2026 -pdf.pdf>"
Needs poppler (pdfimages) and Pillow. Each series page carries one large photo with a
transparency mask; it is kept transparent as WebP (max 1600 px). Writes
apps/api/src/db/seed/data/hexlaser-2026/images/<SERIES>.webp and images.json with checksums.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "packages/shared/src/hexlaser-2026-data.ts"
OUTPUT = ROOT / "apps/api/src/db/seed/data/hexlaser-2026"


def manifest() -> dict:
    text = MANIFEST.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def page_rows(pdf: Path, page: int) -> list[dict]:
    listing = subprocess.run(["pdfimages", "-f", str(page), "-l", str(page), "-list", str(pdf)],
                             check=True, capture_output=True, text=True).stdout.splitlines()[2:]
    rows = []
    for index, line in enumerate(listing):
        cols = line.split()
        rows.append({"index": index, "type": cols[2], "width": int(cols[3]), "height": int(cols[4])})
    return rows


def extract(pdf: Path, series: str, page: int, images_dir: Path) -> dict:
    rows = page_rows(pdf, page)
    # The series photo is the largest image on its page; pdfimages lists its transparency
    # mask (if any) on the very next row with the same size.
    photos = [row for row in rows if row["type"] == "image"]
    if not photos:
        raise ValueError(f"{series}: page {page} has no image")
    photo = max(photos, key=lambda row: row["width"] * row["height"])
    after = rows[photo["index"] + 1] if photo["index"] + 1 < len(rows) else None
    mask = after if after and after["type"] == "smask" and (after["width"], after["height"]) == (photo["width"], photo["height"]) else None
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-f", str(page), "-l", str(page), "-png", str(pdf), f"{tmp}/p"], check=True)
        image = Image.open(f"{tmp}/p-{photo['index']:03d}.png").convert("RGB")
        if mask:
            image.putalpha(Image.open(f"{tmp}/p-{mask['index']:03d}.png").convert("L"))
    image.thumbnail((1600, 1600))
    filename = f"{series}.webp"
    image.save(images_dir / filename, "WEBP", quality=85)
    body = (images_dir / filename).read_bytes()
    return {"series": series, "page": page, "file": filename, "mimeType": "image/webp",
            "sizeBytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pdf = Path(sys.argv[1])
    data = manifest()
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if digest != data["sha256"]:
        sys.exit(f"PDF does not match the manifest ({data['document']}); regenerate the manifest first")
    images_dir = OUTPUT / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    images = [extract(pdf, row["series"], row["page"], images_dir) for row in data["series"]]
    (OUTPUT / "images.json").write_text(json.dumps({"document": data["document"], "sha256": digest,
                                                    "revision": data["revision"], "images": images},
                                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"images": len(images), "bytes": sum(i["sizeBytes"] for i in images)}))


if __name__ == "__main__":
    main()
