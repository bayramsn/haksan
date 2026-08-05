export type ProformaPriceRow = {
  quoteItemId: string;
  description: string;
  quantity: number;
  unitCode: string;
  /** Brüt birim fiyat — proformada düzenlenebilen tek alan. */
  unitPrice: number;
  /** Satır iskontosu; tekliften gelir ve proforma bunu değiştiremez. */
  discountAmount: number;
  vatRate: number;
};

type QuoteItemLike = {
  id?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitCode?: unknown;
  unitPrice?: unknown;
  discountAmount?: unknown;
  lineTotal?: unknown;
  vatRate?: unknown;
};

type QuoteLike = {
  discountTotal?: unknown;
  items?: QuoteItemLike[];
};

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => Number(value.toFixed(4));

const unitCodeValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "adet";
};

/** Teklifin brüt birim fiyatlarını proforma düzenleme satırlarına taşır. */
export function quoteToProformaPriceRows(quote: QuoteLike): ProformaPriceRow[] {
  const items = quote.items ?? [];
  return items.map((item) => ({
    quoteItemId: String(item.id ?? ""),
    description: String(item.description ?? "").trim(),
    quantity: numberValue(item.quantity),
    unitCode: unitCodeValue(item.unitCode),
    unitPrice: money(numberValue(item.unitPrice)),
    discountAmount: money(Math.max(0, numberValue(item.discountAmount))),
    vatRate: numberValue(item.vatRate),
  }));
}

export function snapshotToProformaPriceRows(snapshot: Record<string, any> | undefined): ProformaPriceRow[] {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  return items.map((item: any) => ({
    quoteItemId: String(item.id ?? item.quoteItemId ?? ""),
    description: String(item.description ?? "").trim(),
    quantity: numberValue(item.quantity),
    unitCode: unitCodeValue(item.unitCode),
    unitPrice: money(numberValue(item.unitPrice)),
    discountAmount: money(Math.max(0, numberValue(item.discountAmount))),
    vatRate: numberValue(item.vatRate),
  }));
}

export type ProformaTotals = {
  /** Kalemlerin brüt toplamı (adet × birim fiyat). */
  gross: number;
  /** Tekliften gelen satır iskontolarının toplamı. */
  lineDiscount: number;
  /** Teklif geneline uygulanmış iskontonun proformaya düşen payı. */
  headerDiscount: number;
  /** İskontolar düşülmüş net ara toplam. */
  subtotal: number;
  vat: number;
  customs: number;
  grand: number;
};

export type ProformaTotalsContext = {
  /** Teklifin toplam iskontosu (satır + teklif geneli). */
  quoteDiscountTotal?: number;
  /** Millileştirme / gümrük vergileri; tekliften okunur. */
  customsTotal?: number;
};

/**
 * Proforma toplamlarını API'nin `buildProformaDocumentSnapshot` mantığıyla birebir
 * hesaplar: satır iskontosu düşülür, teklif geneli iskonto net toplamla sınırlanır ve
 * KDV bu iskonto oranıyla ölçeklenmiş satır tutarları üzerinden bulunur. Gümrük tutarı
 * KDV matrahına girmeyip genel toplama eklenir — yazdırılan proforma da böyle toplar.
 */
export function computeProformaTotals(
  rows: ProformaPriceRow[],
  context: ProformaTotalsContext = {},
): ProformaTotals {
  const lines = rows.map((row) => {
    const gross = Math.max(0, row.quantity * row.unitPrice);
    const discount = Math.max(0, row.discountAmount);
    return { gross, discount, net: money(Math.max(0, gross - discount)), vatRate: row.vatRate };
  });

  const gross = money(lines.reduce((sum, line) => sum + line.gross, 0));
  const lineDiscount = money(lines.reduce((sum, line) => sum + line.discount, 0));
  const taxableBeforeHeader = money(lines.reduce((sum, line) => sum + line.net, 0));
  const requestedHeaderDiscount = Math.max(numberValue(context.quoteDiscountTotal) - lineDiscount, 0);
  const headerDiscount = money(Math.min(requestedHeaderDiscount, taxableBeforeHeader));
  const headerRatio = taxableBeforeHeader > 0
    ? (taxableBeforeHeader - headerDiscount) / taxableBeforeHeader
    : 1;
  const vat = money(
    lines.reduce((sum, line) => sum + line.net * headerRatio * (line.vatRate / 100), 0),
  );
  const subtotal = money(taxableBeforeHeader - headerDiscount);
  const customs = money(Math.max(0, numberValue(context.customsTotal)));

  return { gross, lineDiscount, headerDiscount, subtotal, vat, customs, grand: money(subtotal + vat + customs) };
}

/**
 * Kaydetmeden önce satırı doğrular. API, iskontosu brüt tutarını aşan satırı
 * reddettiği için aynı kural burada da uygulanır; hata sunucuya gitmeden görünür.
 */
export function proformaRowError(row: ProformaPriceRow): string | null {
  const gross = row.quantity * row.unitPrice;
  if (!Number.isFinite(gross) || gross < 0) return "Geçersiz tutar";
  if (row.discountAmount > gross + 0.0001) return "Satır iskontosu brüt tutarı aşıyor";
  return null;
}

/** Para alanını tr-TR biçiminde gösterir (binlik ayraç + virgüllü ondalık). */
export const formatMoneyInput = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** tr-TR ("1.234,56") veya düz ("1234.56") girdiyi sayıya çevirir. */
export const parseMoneyInput = (raw: string): number => {
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return 0;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Hem nokta hem virgül varsa nokta binlik, virgül ondalıktır (tr-TR).
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
