import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "https://www.haksancnc.com.tr/";
const allowedHosts = new Set(["www.haksancnc.com.tr", "haksancnc.com.tr"]);
const maxImageBytes = 8 * 1024 * 1024;
const maxPdfBytes = 30 * 1024 * 1024;

// Scrape into the API seed staging area (NOT web/public). Binaries here are
// uploaded to object storage by `db:import:haksancnc` and served only through
// the auth-gated public media endpoint — never as world-readable static files.
const stagingDir = path.join(repoRoot, "apps/api/src/db/seed/data/haksancnc");
const publicDir = path.join(stagingDir, "images");
const pdfDir = path.join(stagingDir, "pdfs");
const dataFile = path.join(stagingDir, "products.json");

const seriesPages = [
  {
    path: "urun-vmserisi-1565",
    series: "VM Serisi",
    category: "CNC Dik İşleme Merkezleri",
    type: "CNC Dik İşleme Merkezi",
    productTypeCode: "CNC_DIK_ISLEME_MERKEZ",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-mvserisi-1566",
    series: "MV Serisi",
    category: "CNC Dik İşleme Merkezleri",
    type: "CNC Dik İşleme Merkezi",
    productTypeCode: "CNC_DIK_ISLEME_MERKEZ",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-vcserisi-1567",
    series: "VC Serisi",
    category: "CNC Dik İşleme Merkezleri",
    type: "CNC Dik İşleme Merkezi",
    productTypeCode: "CNC_DIK_ISLEME_MERKEZ",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-slserisi-1572",
    series: "SL Serisi",
    category: "CNC Torna Tezgahları",
    type: "CNC Torna Tezgahı",
    productTypeCode: "CNC_YATAY_TORNA_TEZGAHI",
    subcategory: "Torna",
    subcategoryCode: "TORNA"
  },
  {
    path: "urun-mtserisi-1578",
    series: "MT Serisi",
    category: "CNC Torna Tezgahları",
    type: "CNC Torna Tezgahı",
    productTypeCode: "CNC_YATAY_TORNA_TEZGAHI",
    subcategory: "Torna",
    subcategoryCode: "TORNA"
  },
  {
    path: "urun-sjserisi-1573",
    series: "SJ Serisi",
    category: "CNC Torna Tezgahları",
    type: "CNC Torna Tezgahı",
    productTypeCode: "CNC_YATAY_TORNA_TEZGAHI",
    subcategory: "Torna",
    subcategoryCode: "TORNA"
  },
  {
    path: "urun-tcserisi-1571",
    series: "TC Serisi",
    category: "CNC Tapping Center",
    type: "CNC Tapping Center",
    productTypeCode: "CNC_TAPPING_CENTER",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-htserisi-1574",
    series: "HT Serisi",
    category: "CNC Yatay İşleme Merkezleri",
    type: "CNC Yatay İşleme Merkezi",
    productTypeCode: "CNC_YATAY_ISLEME_MERKEZI",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-lhserisi-1583",
    series: "LH Serisi",
    category: "CNC Yatay İşleme Merkezleri",
    type: "CNC Yatay İşleme Merkezi",
    productTypeCode: "CNC_YATAY_ISLEME_MERKEZI",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-dserisi-1587",
    series: "D Serisi",
    category: "CNC 5 Eksen İşleme Merkezleri",
    type: "CNC 5 Eksen İşleme Merkezi",
    productTypeCode: "CNC_5_EKSEN_ISLEME_MERKEZI",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-cserisi-1588",
    series: "C Serisi",
    category: "CNC 5 Eksen İşleme Merkezleri",
    type: "CNC 5 Eksen İşleme Merkezi",
    productTypeCode: "CNC_5_EKSEN_ISLEME_MERKEZI",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  },
  {
    path: "urun-dlserisi-1586",
    series: "DL Serisi",
    category: "CNC Köprü Tipi İşleme Merkezleri",
    type: "CNC Köprü Tipi İşleme Merkezi",
    productTypeCode: "CNC_KOPRU_TIPI_ISLEME_MERKEZI",
    subcategory: "İşleme Merkezi",
    subcategoryCode: "ISLEME_MERKEZI"
  }
];

const htmlEntities = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  Ouml: "Ö",
  ouml: "ö",
  Uuml: "Ü",
  uuml: "ü",
  Ccedil: "Ç",
  ccedil: "ç",
  Iuml: "Ï",
  iuml: "ï",
  Idot: "İ",
  idot: "i",
  Scedil: "Ş",
  scedil: "ş",
  Gbreve: "Ğ",
  gbreve: "ğ",
  Oslash: "Ø",
  oslash: "ø",
  deg: "°"
};

function normalizeUrl(input) {
  const url = new URL(input, baseUrl);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(`Blocked remote host: ${url.hostname}`);
  }
  return url;
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name) => htmlEntities[name] ?? match);
}

function stripTags(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return stripTags(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sanitizeText(value) {
  return stripTags(value).replace(/\s*:\s*$/, "").trim();
}

function extensionFromContentType(contentType) {
  const cleanType = contentType.split(";")[0].trim().toLowerCase();
  if (cleanType === "image/jpeg" || cleanType === "image/jpg") return "jpg";
  if (cleanType === "image/png") return "png";
  if (cleanType === "image/webp") return "webp";
  return null;
}

async function fetchText(input) {
  const url = normalizeUrl(input);
  const response = await fetch(url, {
    headers: {
      "user-agent": "HaksanProductImporter/1.0",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url.href}`);
  }

  return response.text();
}

async function downloadImage(input, id) {
  const url = normalizeUrl(input);
  if (!url.pathname.startsWith("/images/")) {
    throw new Error(`Blocked image path: ${url.pathname}`);
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "HaksanProductImporter/1.0",
      accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed ${response.status}: ${url.href}`);
  }

  const extension = extensionFromContentType(response.headers.get("content-type") ?? "");
  if (!extension) {
    throw new Error(`Blocked image type: ${response.headers.get("content-type") ?? "unknown"}`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxImageBytes) {
    throw new Error(`Image too large: ${declaredLength} bytes`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxImageBytes) {
    throw new Error(`Image too large: ${bytes.byteLength} bytes`);
  }

  const fileName = `${id}.${extension}`;
  await writeFile(path.join(publicDir, fileName), bytes);
  return `images/${fileName}`;
}

async function downloadPdf(input, id) {
  if (!input) return undefined;
  const url = normalizeUrl(input);
  if (!url.pathname.startsWith("/images/")) {
    console.warn(`Blocked pdf path: ${url.pathname}`);
    return undefined;
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "HaksanProductImporter/1.0",
      accept: "application/pdf,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    console.warn(`PDF fetch failed ${response.status}: ${url.href}`);
    return undefined;
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxPdfBytes) {
    console.warn(`PDF too large: ${declaredLength} bytes`);
    return undefined;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxPdfBytes) {
    console.warn(`PDF too large: ${bytes.byteLength} bytes`);
    return undefined;
  }

  const fileName = `${id}.pdf`;
  await writeFile(path.join(pdfDir, fileName), bytes);
  return `pdfs/${fileName}`;
}

function parseCards(html) {
  const cards = [];
  const cardRegex =
    /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]{0,2400}?<a\s+href="(urun-detay-[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,900}?<strong>\s*Marka:\s*<\/strong>\s*([^<\n\r]*)[\s\S]{0,350}?<strong>\s*Model:\s*<\/strong>\s*([^<\n\r]*)/gi;

  for (const match of html.matchAll(cardRegex)) {
    cards.push({
      imagePath: decodeHtml(match[1]).trim(),
      imageAlt: sanitizeText(match[2]),
      detailPath: decodeHtml(match[3]).trim(),
      title: sanitizeText(match[4]),
      brand: sanitizeText(match[5]),
      model: sanitizeText(match[6])
    });
  }

  return cards;
}

function parseMetaDescription(html) {
  const match = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  return match ? sanitizeText(match[1]) : "";
}

function parseDetailTitle(html) {
  const match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return match ? sanitizeText(match[1]) : "";
}

function parseDetailImage(html) {
  const galleryMatch = html.match(/slider-thumbs-gallery-2[\s\S]{0,1200}?<img[^>]+src="(images\/[^"]+)"/i);
  if (galleryMatch) return decodeHtml(galleryMatch[1]).trim();

  const match = html.match(/thumbs-slider[\s\S]{0,2200}?<img[^>]+src="(images\/[^"]+)"/i);
  return match ? decodeHtml(match[1]).trim() : "";
}

function parseDetailPdf(html) {
  const match = html.match(/<a[^>]+href="(images\/[^"]+\.pdf)"/i);
  return match ? decodeHtml(match[1]).trim() : null;
}

function parseSpecs(html) {
  const specs = [];
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  for (const match of html.matchAll(rowRegex)) {
    const name = sanitizeText(match[1]);
    const value = sanitizeText(match[2]);
    if (!name || !value || name.toLocaleLowerCase("tr-TR") === "teknik özellikler") continue;
    if (name.length > 80 || value.length > 160) continue;
    specs.push({ key: name, value });
  }

  return specs;
}

function toProduct(card, seriesMeta, detail, imageUrl, pdfUrl) {
  const title = detail.title || card.title || `${card.model} ${seriesMeta.type}`;
  const model = card.model || title.replace(seriesMeta.type, "").trim();
  const id = `haksan-cnc-${slugify(model || title)}`;
  const description = detail.description || card.imageAlt || title;

  return {
    id,
    brand: card.brand || "Haksan CNC",
    productGroup: "CNC",
    productGroupCode: "CNC",
    model,
    modelName: title,
    type: seriesMeta.type,
    productTypeCode: seriesMeta.productTypeCode,
    controlPanel: "",
    category: seriesMeta.category,
    categoryCode: "TEZGAH",
    subcategory: seriesMeta.subcategory,
    subcategoryCode: seriesMeta.subcategoryCode,
    imageUrl,
    shortDescription: description,
    description: `${description} Kaynak: ${normalizeUrl(card.detailPath).href}`,
    listPrice: 0,
    cashPrice: 0,
    currency: "USD",
    vatRate: 20,
    originCountry: "",
    hsCode: "",
    stockCode: `HAKSAN-${slugify(model || title).toUpperCase()}`,
    specs: detail.specs,
    standardEquipment: [],
    optionalEquipment: [],
    muadilProductId: null,
    status: "active",
    ...(pdfUrl ? { pdfUrl } : {})
  };
}

function serializeProducts(products) {
  // Emits a JSON manifest consumed by apps/api db:import:haksancnc, which uploads
  // the staged binaries to object storage and registers them in the DB.
  return `${JSON.stringify(products, null, 2)}\n`;
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  await mkdir(pdfDir, { recursive: true });

  const seenDetails = new Set();
  const products = [];

  for (const seriesMeta of seriesPages) {
    const seriesHtml = await fetchText(seriesMeta.path);
    const cards = parseCards(seriesHtml);

    for (const card of cards) {
      if (seenDetails.has(card.detailPath)) continue;
      seenDetails.add(card.detailPath);

      const detailHtml = await fetchText(card.detailPath);
      const detailImage = parseDetailImage(detailHtml);
      const detail = {
        title: parseDetailTitle(detailHtml),
        description: parseMetaDescription(detailHtml),
        specs: parseSpecs(detailHtml),
        pdf: parseDetailPdf(detailHtml)
      };

      const id = `haksan-cnc-${slugify(card.model || detail.title || card.title)}`;
      const imageUrl = await downloadImage(detailImage || card.imagePath, id);
      const pdfUrl = await downloadPdf(detail.pdf, id);
      products.push(toProduct(card, seriesMeta, detail, imageUrl, pdfUrl));
    }
  }

  products.sort((a, b) => `${a.category} ${a.model}`.localeCompare(`${b.category} ${b.model}`, "tr"));
  await writeFile(dataFile, serializeProducts(products), "utf8");

  const categories = products.reduce((acc, product) => {
    acc[product.category] = (acc[product.category] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Imported ${products.length} products`);
  for (const [category, count] of Object.entries(categories)) {
    console.log(`${category}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
