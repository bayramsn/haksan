// İndirilen teklif / proforma / sözleşme dosyalarının adı.
//
// Üç belge tipi de aynı kuralı kullanır:
//   <Tip>_<BölümKodu-BelgeNo>_<Firma>_<Makine>
// Tip ve belge numarası başta durur ki klasörde sıralama belge tipine, bölüme
// ve numaraya göre anlamlı olsun. Eksik parçalar (firma kaydı olmayan hızlı
// proforma, kataloğa bağlanmamış makine, bölümü belirsiz eski kayıt) sessizce
// atlanır — ad hiçbir zaman boş kalmaz.

import { asciiFold } from "./core";
import type { ContractPrintData, ProformaPrintData, QuotePrintData } from "./templates";

export type PrintDocumentKind = "quote" | "proforma" | "contract";

export type DocumentFilenameInput = {
  kind: PrintDocumentKind;
  /** Belge numarası — ör. "CNC-PRF-2026/005". Bölüm ön ekini taşıyabilir. */
  documentNo?: string | null;
  /** Firma unvanı; kayıtlı firma yoksa serbest metin (companyNameText). */
  company?: string | null;
  /** Tezgah / model adı. Birden çok makine " / " ile ayrılmış olabilir. */
  machine?: string | null;
  /** Bölüm kodu ya da adı: "cnc", "CNC", "universal", "Sac İşleme", "SACISLE"… */
  division?: string | null;
};

const KIND_LABELS: Record<PrintDocumentKind, string> = {
  quote: "Teklif",
  proforma: "Proforma",
  contract: "Sozlesme",
};

/** Bölüm ön eki taşıyan belge serileri (apps/api document-series.ts ile aynı). */
const SERIES_PREFIX = /^(CNC|UNI|SACISLE)(?=[-/_\s]|$)/i;

const COMPANY_MAX = 40;
const MACHINE_MAX = 40;
const DOCUMENT_NO_MAX = 48;
const DIVISION_CODE_MAX = 8;
/** ".html" uzantısı ve arşiv/senkron araçları için rahat bir tavan. */
const FILENAME_MAX = 120;

/** Uzun adı sözcük sınırında keser; sınır çok başta kalıyorsa sert keser. */
const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const boundary = Math.max(cut.lastIndexOf("-"), cut.lastIndexOf("_"));
  const kept = boundary >= Math.floor(maxLength * 0.6) ? cut.slice(0, boundary) : cut;
  return kept.replace(/[-_]+$/, "");
};

/**
 * Tek bir ad parçasını dosya sistemi için güvenli hale getirir: ASCII'ye
 * indirger, `/ \ : * ? " < > |` ve kontrol karakterlerini atar, boşlukları
 * tireye çevirir. `_` parça ayracı olduğu için parça içinde bırakılmaz.
 */
const sanitizeSegment = (value: unknown, maxLength: number): string => {
  const cleaned = asciiFold(String(value ?? ""))
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return truncate(cleaned, maxLength);
};

/** Unvan sonundaki hukuki biçim ekleri dosya adında yer kaplamasın. */
const LEGAL_FORM_TOKENS = new Set([
  "A", "S", "AS", "ANONIM", "SIRKET", "SIRKETI",
  "LTD", "LIMITED", "STI",
  "SAN", "SANAYI", "SANAYII",
  "TIC", "TICARET",
  "ITH", "IHR", "ITHALAT", "IHRACAT",
  "VE",
]);

const COMPANY_TOKEN_LIMIT = 4;

/** "BARTIN OTOMOTİV PAZARLAMA VE TİC.LTD.ŞTİ." → "BARTIN-OTOMOTIV-PAZARLAMA" */
export const shortCompanyToken = (value?: string | null): string => {
  const tokens = sanitizeSegment(value, 200).split("-").filter(Boolean);
  // Yalnız sondan soyar: "A PLUS MAKINA" gibi baştaki tek harfler korunur.
  while (tokens.length > 1 && LEGAL_FORM_TOKENS.has(tokens[tokens.length - 1].toUpperCase())) {
    tokens.pop();
  }
  return truncate(tokens.slice(0, COMPANY_TOKEN_LIMIT).join("-"), COMPANY_MAX);
};

/**
 * Çoklu makine adı " / " ile birleştirilir; dosya adına ilki girer.
 * Model içindeki "/" (ör. "MT-210/1000") ayraç sayılmaz.
 */
export const shortMachineToken = (value?: string | null): string => {
  const first = String(value ?? "").split(/\s+\/\s+/)[0] ?? "";
  return sanitizeSegment(first, MACHINE_MAX);
};

/**
 * Bölüm (division) kısa kodu. API tarafındaki belge serisi kodlarıyla aynıdır:
 * cnc → CNC, universal/Üniversal → UNI, sac_isleme/Sac İşleme → SACISLE.
 * Tanınmayan bölümler kaybolmasın diye adın ilk sözcüğü kısa kod olur.
 */
export const divisionShortCode = (value?: string | null): string => {
  const normalized = asciiFold(String(value ?? "")).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return "";
  if (normalized.startsWith("CNC")) return "CNC";
  if (normalized.startsWith("UNI")) return "UNI";
  if (normalized.startsWith("SAC")) return "SACISLE";
  return normalized.slice(0, DIVISION_CODE_MAX);
};

/** Belge numarası + bölüm kodu parçası. */
const documentSegment = (documentNo?: string | null, division?: string | null): string => {
  const normalizedNo = sanitizeSegment(documentNo, DOCUMENT_NO_MAX);
  const code = divisionShortCode(division);
  if (!normalizedNo) return code;
  // Belge numarası zaten bir seri ön eki taşıyorsa ona güvenilir; dışarıdan
  // gelen bölüm bilgisiyle çelişse bile numara ikiye katlanmaz.
  if (SERIES_PREFIX.test(String(documentNo ?? "")) || SERIES_PREFIX.test(normalizedNo)) return normalizedNo;
  return code ? `${code}-${normalizedNo}` : normalizedNo;
};

/**
 * Teklif / proforma / sözleşme indirmelerinin ortak dosya adı üreticisi.
 * `.html` uzantısı çağıran tarafta (downloadPrintHtml) eklenir.
 */
export const buildDocumentFilename = (input: DocumentFilenameInput): string => {
  const label = KIND_LABELS[input.kind] ?? "Belge";
  const segments = [
    label,
    documentSegment(input.documentNo, input.division),
    shortCompanyToken(input.company),
    shortMachineToken(input.machine),
  ].filter(Boolean);
  return truncate(segments.join("_"), FILENAME_MAX) || label;
};

export type DocumentFilenameOptions = {
  /** Bölüm kodu/adı; belge numarası seri ön eki taşımıyorsa kullanılır. */
  division?: string | null;
  /**
   * Kayıtlı firma yoksa kullanılacak unvan (hızlı proforma/sözleşmedeki
   * serbest metin `companyNameText`). Baskı verisindeki firma boşsa devreye girer.
   */
  company?: string | null;
};

/** Teklif baskı verisinden dosya adı. */
export const quoteFilename = (data: QuotePrintData, options: DocumentFilenameOptions = {}): string =>
  buildDocumentFilename({
    kind: "quote",
    documentNo: data.belgeNo,
    company: data.firma || options.company,
    machine: [data.marka, data.model].filter(Boolean).join(" ")
      || data.machines?.[0]?.model
      || data.machines?.[0]?.urun,
    division: options.division,
  });

/** Proforma baskı verisinden dosya adı. */
export const proformaFilename = (data: ProformaPrintData, options: DocumentFilenameOptions = {}): string => {
  const firstItem = data.items?.[0];
  return buildDocumentFilename({
    kind: "proforma",
    documentNo: data.belgeNo,
    company: data.firma || options.company,
    machine: [firstItem?.marka, firstItem?.model].filter(Boolean).join(" ") || firstItem?.aciklama,
    division: options.division,
  });
};

/** Sözleşme baskı verisinden dosya adı. */
export const contractFilename = (data: ContractPrintData, options: DocumentFilenameOptions = {}): string =>
  buildDocumentFilename({
    kind: "contract",
    documentNo: data.sozlesmeNo,
    company: data.alici?.unvan || options.company,
    machine: data.machines?.[0]?.model || data.model,
    division: options.division,
  });
