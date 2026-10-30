/**
 * Ticari belge merkezinin saf mantığı (React'siz, node:test ile sınanır).
 * Kurallar web `DocumentsPage`, `proformaPricing` ve `QuickDocumentEditor`
 * ile birebir tutulur.
 */

export type DocFolder =
  | 'all'
  | 'proforma'
  | 'contract'
  | 'invoice'
  | 'accounting_invoice'
  | 'external_quote'
  | 'delivery_form'
  | 'installation_form'
  | 'other';

/** Web `DOC_TYPE_LABELS` ile aynı etiketler. */
export const DOC_FOLDERS: { value: DocFolder; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'proforma', label: 'Proforma' },
  { value: 'contract', label: 'Sözleşme' },
  { value: 'invoice', label: 'Ticari fatura' },
  { value: 'accounting_invoice', label: 'Muhasebe faturası' },
  { value: 'external_quote', label: 'Dış teklif' },
  { value: 'delivery_form', label: 'Teslim formu' },
  { value: 'installation_form', label: 'Kurulum formu' },
  { value: 'other', label: 'Diğer' },
];

export function folderLabel(folder: DocFolder): string {
  return DOC_FOLDERS.find((entry) => entry.value === folder)?.label ?? 'Diğer';
}

/** Kayıt tabanlı (proforma/sözleşme/ticari fatura tablosu olan) klasörler. */
export const RECORD_FOLDERS = ['proforma', 'contract', 'invoice'] as const;
export type RecordFolder = (typeof RECORD_FOLDERS)[number];

export function isRecordFolder(folder: DocFolder): folder is RecordFolder {
  return (RECORD_FOLDERS as readonly string[]).includes(folder);
}

/** Web `mapLinkDocType`: dosya bağlantısının belge türü → klasör. */
export function folderForDocumentType(code: string | null | undefined): Exclude<DocFolder, 'all'> {
  switch (code) {
    case 'external_quote':
      return 'external_quote';
    case 'proforma_pdf':
      return 'proforma';
    case 'contract_pdf':
      return 'contract';
    case 'commercial_invoice_pdf':
      return 'invoice';
    case 'accounting_invoice_pdf':
      return 'accounting_invoice';
    case 'delivery_form':
    case 'service_document':
      return 'delivery_form';
    case 'installation_form':
      return 'installation_form';
    default:
      return 'other';
  }
}

/** Web `formatDocSize`. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LinkLike = { fileId: string; documentType: { code: string } | null };

/**
 * Dosya bağlantılarını klasöre süzer. Bir ticari kayda zaten bağlı olan dosya
 * (proforma/sözleşme/fatura `fileId`) kayıt satırında gösterildiği için tekrar
 * listelenmez — web `dedupedDocs` ile aynı kural.
 */
export function filterLinksForFolder<T extends LinkLike>(links: T[], folder: DocFolder, recordFileIds: Set<string>): T[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (recordFileIds.has(link.fileId) || seen.has(link.fileId)) return false;
    seen.add(link.fileId);
    return folder === 'all' || folderForDocumentType(link.documentType?.code) === folder;
  });
}

/** Klasör sayaçları: dosya bağlantıları türüne göre sayılır, kayıt toplamları eklenir. */
export function folderCounts<T extends LinkLike>(
  links: T[],
  recordTotals: Record<RecordFolder, number>,
  recordFileIds: Set<string>
): Record<DocFolder, number> {
  const counts: Record<DocFolder, number> = {
    all: 0,
    proforma: recordTotals.proforma,
    contract: recordTotals.contract,
    invoice: recordTotals.invoice,
    accounting_invoice: 0,
    external_quote: 0,
    delivery_form: 0,
    installation_form: 0,
    other: 0,
  };
  for (const link of filterLinksForFolder(links, 'all', recordFileIds)) {
    counts[folderForDocumentType(link.documentType?.code)] += 1;
  }
  counts.all = Object.entries(counts).reduce((sum, [key, value]) => (key === 'all' ? sum : sum + value), 0);
  return counts;
}

/** Bağlantı satırının kaynağı (web "Kaynak ve akış" sütunu). */
export function linkRelationLabel(entityType: string, folder: Exclude<DocFolder, 'all'>, description?: string | null): string {
  if (description && /Kasa hareketi #/i.test(description)) return 'Kasa hareketine bağlı';
  if (entityType === 'service_ticket' || entityType === 'service_request') return 'Servis talebine bağlı';
  if (folder === 'accounting_invoice') return 'Muhasebe kaydına bağlı';
  if (entityType === 'quote') return 'Teklife doğrudan bağlı';
  if (entityType === 'opportunity') return 'Fırsattan eşleştirildi';
  if (entityType === 'company') return 'Firma kaydına bağlı';
  return 'Bağlantı gerekli';
}

/** Açıklamadaki "Kasa hareketi #<uuid>" referansı (web store `paymentId`). */
export function paymentIdFromDescription(description: string | null | undefined): string | null {
  const match = description?.match(/Kasa hareketi #([A-F0-9-]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Bağlantı tamamlama yalnız ticari tür + teklifsiz dosyada anlamlı (web `LinkCommercialDocumentDialog`). */
export function canCompleteLink(folder: Exclude<DocFolder, 'all'>, entityType: string): boolean {
  return isRecordFolder(folder) && entityType !== 'quote';
}

type Snapshot = Record<string, unknown> | null | undefined;

export function isStandaloneSnapshot(snapshot: Snapshot): boolean {
  return Boolean(snapshot && snapshot.standalone === true);
}

/** Web: `İmzalandı · tarih` ya da `İmza durumu bekleniyor`. */
export function contractSignatureLabel(snapshot: Snapshot, statusCode?: string | null): string {
  const raw = snapshot?.signedAt ?? snapshot?.signatureDate;
  const signedAt = typeof raw === 'string' ? raw : '';
  if (signedAt) return `İmzalandı · ${signedAt.slice(0, 10)}`;
  if (statusCode === 'signed') return 'İmzalandı';
  return 'İmza durumu bekleniyor';
}

/** Teklifsiz belgede "Bağlantı gerekli" yerine hızlı belge etiketi (web relationLabel). */
export function recordRelationLabel(input: {
  quoteId: string | null | undefined;
  companyId: string | null | undefined;
  standalone: boolean;
  kind: RecordFolder;
}): string {
  if (input.quoteId) return 'Teklife doğrudan bağlı';
  if (input.companyId) return 'Firma kaydına bağlı';
  if (input.standalone) return input.kind === 'contract' ? 'Teklifsiz hızlı sözleşme' : 'Teklifsiz hızlı proforma';
  return 'Bağlantı gerekli';
}

/* ------------------------------------------------------ fiyat satırları ---- */

export type PriceRow = {
  quoteItemId: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountAmount: number;
  vatRate: number;
};

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => Number(value.toFixed(4));
const unit = (value: unknown) => String(value ?? '').trim() || 'adet';

type ItemLike = Record<string, unknown>;

/** Web `quoteToProformaPriceRows`. */
export function quoteToPriceRows(items: ItemLike[] | null | undefined): PriceRow[] {
  return (items ?? []).map((item) => ({
    quoteItemId: String(item.id ?? ''),
    description: String(item.description ?? '').trim(),
    quantity: num(item.quantity),
    unitCode: unit(item.unitCode),
    unitPrice: money(num(item.unitPrice)),
    discountAmount: money(Math.max(0, num(item.discountAmount))),
    vatRate: num(item.vatRate),
  }));
}

/** Web `snapshotToProformaPriceRows`. */
export function snapshotToPriceRows(snapshot: Snapshot): PriceRow[] {
  const items = Array.isArray(snapshot?.items) ? (snapshot.items as ItemLike[]) : [];
  return items.map((item) => ({
    quoteItemId: String(item.id ?? item.quoteItemId ?? ''),
    description: String(item.description ?? '').trim(),
    quantity: num(item.quantity),
    unitCode: unit(item.unitCode),
    unitPrice: money(num(item.unitPrice)),
    discountAmount: money(Math.max(0, num(item.discountAmount))),
    vatRate: num(item.vatRate),
  }));
}

/**
 * Web `EditDocumentDialog`: kalem listesi canlı tekliften gelir, belgeye daha
 * önce yazılmış fiyat varsa satır onunla açılır.
 */
export function mergeStoredPrices(quoteRows: PriceRow[], storedRows: PriceRow[]): PriceRow[] {
  const stored = new Map(storedRows.map((row) => [row.quoteItemId, row]));
  return quoteRows.map((row) => {
    const match = stored.get(row.quoteItemId);
    return match ? { ...row, unitPrice: match.unitPrice, discountAmount: match.discountAmount } : row;
  });
}

export type DocumentDiscount = { amount: number; percent: number };

export function hasDocumentDiscount(discount: DocumentDiscount | null | undefined): boolean {
  return Boolean(discount && (discount.amount > 0 || discount.percent > 0));
}

export function snapshotDiscount(snapshot: Snapshot): DocumentDiscount {
  const stored = snapshot?.documentDiscount;
  if (!stored || typeof stored !== 'object') return { amount: 0, percent: 0 };
  const value = stored as Record<string, unknown>;
  return { amount: Math.max(num(value.amount), 0), percent: Math.max(num(value.percent), 0) };
}

export type DocumentTotals = {
  gross: number;
  lineDiscount: number;
  headerDiscount: number;
  subtotal: number;
  vat: number;
  customs: number;
  grand: number;
};

/** Web `computeProformaTotals` — API `buildProformaDocumentSnapshot` ile aynı hesap. */
export function computeDocumentTotals(
  rows: PriceRow[],
  context: { quoteDiscountTotal?: number; headerDiscountAmount?: number; customsTotal?: number; documentDiscount?: DocumentDiscount | null } = {}
): DocumentTotals {
  const lines = rows.map((row) => {
    const gross = Math.max(0, row.quantity * row.unitPrice);
    const discount = Math.max(0, row.discountAmount);
    return { gross, discount, net: money(Math.max(0, gross - discount)), vatRate: row.vatRate };
  });
  const gross = money(lines.reduce((sum, line) => sum + line.gross, 0));
  const lineDiscount = money(lines.reduce((sum, line) => sum + line.discount, 0));
  const taxableBeforeHeader = money(lines.reduce((sum, line) => sum + line.net, 0));
  const documentDiscount = context.documentDiscount;
  const requested = documentDiscount && hasDocumentDiscount(documentDiscount)
    ? Math.max(documentDiscount.percent > 0 ? taxableBeforeHeader * (documentDiscount.percent / 100) : documentDiscount.amount, 0)
    : context.headerDiscountAmount !== undefined
      ? Math.max(num(context.headerDiscountAmount), 0)
      : Math.max(num(context.quoteDiscountTotal) - lineDiscount, 0);
  const headerDiscount = money(Math.min(requested, taxableBeforeHeader));
  const ratio = taxableBeforeHeader > 0 ? (taxableBeforeHeader - headerDiscount) / taxableBeforeHeader : 1;
  const vat = money(lines.reduce((sum, line) => sum + line.net * ratio * (line.vatRate / 100), 0));
  const subtotal = money(taxableBeforeHeader - headerDiscount);
  const customs = money(Math.max(0, num(context.customsTotal)));
  return { gross, lineDiscount, headerDiscount, subtotal, vat, customs, grand: money(subtotal + vat + customs) };
}

/** Web `proformaRowError`: API brüt tutarı aşan satır iskontosunu reddeder. */
export function priceRowError(row: PriceRow): string | null {
  const gross = row.quantity * row.unitPrice;
  if (!Number.isFinite(gross) || gross < 0) return 'Geçersiz tutar';
  if (row.discountAmount > gross + 0.0001) return 'Satır iskontosu brüt tutarı aşıyor';
  return null;
}

/** Fiyata dokunulmadıysa kalem gönderilmez (web CreateContractDialog `pricesChanged`). */
export function pricesChanged(rows: PriceRow[], initial: PriceRow[]): boolean {
  return (
    rows.length !== initial.length ||
    rows.some((row, index) => row.unitPrice !== initial[index]?.unitPrice || row.discountAmount !== initial[index]?.discountAmount)
  );
}

/* ----------------------------------------------- hızlı belge (teklifsiz) ---- */

export type QuickParty = {
  manualCompany: boolean;
  companyId: string;
  companyName: string;
  companyAddress: string;
  companyTaxOffice: string;
  companyTaxNumber: string;
  contactName: string;
  contactPhone: string;
};

export const emptyQuickParty = (): QuickParty => ({
  manualCompany: false,
  companyId: '',
  companyName: '',
  companyAddress: '',
  companyTaxOffice: '',
  companyTaxNumber: '',
  contactName: '',
  contactPhone: '',
});

/** Web `snapshotAddressLine`: tam adres yoksa sokak + bina no; ilçe/il/ülke tekrar edilmeden eklenir. */
export function addressLine(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const value = address as Record<string, unknown>;
  const field = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return '';
  };
  const base = field('fullAddress', 'full_address') || [field('street'), field('buildingNumber', 'building_number')].filter(Boolean).join(' ');
  const lower = base.toLocaleLowerCase('tr-TR');
  const tail = [field('district'), field('province', 'city'), field('country')].filter(
    (part) => part && !lower.includes(part.toLocaleLowerCase('tr-TR'))
  );
  return [base, ...tail].filter(Boolean).join(' ');
}

/** Web `quickPartyFromSnapshot`. */
export function quickPartyFromSnapshot(snapshot: Snapshot): QuickParty {
  if (!snapshot) return emptyQuickParty();
  const company = (snapshot.company ?? null) as Record<string, unknown> | null;
  const contact = (snapshot.contact ?? null) as Record<string, unknown> | null;
  const addresses = Array.isArray(snapshot.companyAddresses) ? snapshot.companyAddresses : [];
  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    manualCompany: !company?.id,
    companyId: str(company?.id),
    companyName: str(company?.legalTitle),
    companyAddress: addressLine(addresses[0]),
    companyTaxOffice: str(company?.taxOffice),
    companyTaxNumber: str(company?.taxNumber),
    contactName: str(contact?.fullName),
    contactPhone: str(contact?.mobilePhone),
  };
}

/** Web `quickPartyPayload`. */
export function quickPartyPayload(party: QuickParty) {
  const opt = (value: string) => value.trim() || undefined;
  return {
    companyId: party.manualCompany ? undefined : party.companyId,
    companyName: party.manualCompany ? party.companyName.trim() : undefined,
    companyAddress: party.manualCompany ? opt(party.companyAddress) : undefined,
    companyTaxOffice: party.manualCompany ? opt(party.companyTaxOffice) : undefined,
    companyTaxNumber: party.manualCompany ? opt(party.companyTaxNumber) : undefined,
    contactName: opt(party.contactName),
    contactPhone: opt(party.contactPhone),
  };
}

/** Web `quickPartyValidationError`. */
export function quickPartyError(party: QuickParty): string | null {
  if (!party.manualCompany && !party.companyId) return 'Firma seçin veya elle girişe geçin';
  if (party.manualCompany && !party.companyName.trim()) return 'Firma unvanını yazın';
  return null;
}

/** Web `quickItemsValidationError` — `proformaFreeItemSchema` kuralları. */
export function quickItemsError(rows: Pick<PriceRow, 'description' | 'quantity' | 'unitPrice' | 'discountAmount'>[]): string | null {
  const filled = rows.filter((row) => row.description.trim() || row.unitPrice > 0);
  if (!filled.length) return 'En az bir kalem girin';
  if (filled.some((row) => !row.description.trim())) return 'Her kalemin açıklaması olmalı';
  if (filled.some((row) => row.quantity <= 0)) return 'Kalem adedi sıfırdan büyük olmalı';
  if (filled.some((row) => row.discountAmount > row.quantity * row.unitPrice + 0.0001)) return 'Satır iskontosu brüt tutarını aşamaz';
  return null;
}

/** Hızlı belge kalemlerinin anlık görüntüden geri yüklenmesi (web `quickFreeItemsFromSnapshot`). */
export function quickItemsFromSnapshot(snapshot: Snapshot): {
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  discountAmount: number;
  vatRate: number;
  brand: string;
  model: string;
  originCountry: string;
  hsCode: string;
}[] {
  const items = Array.isArray(snapshot?.items) ? (snapshot.items as ItemLike[]) : [];
  return items.map((item) => {
    const product = (item.product ?? null) as Record<string, unknown> | null;
    const str = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
      description: String(item.description ?? ''),
      quantity: num(item.quantity ?? 1),
      unitCode: unit(item.unitCode),
      unitPrice: num(item.unitPrice),
      discountAmount: num(item.discountAmount),
      vatRate: item.vatRate === undefined || item.vatRate === null ? 20 : num(item.vatRate),
      brand: str(product?.brandName),
      model: str(product?.modelName),
      originCountry: str(product?.originCountry),
      hsCode: str(product?.hsCode),
    };
  });
}

/* ------------------------------------------------------- dosya yükleme ---- */

export type UploadFolder = Exclude<DocFolder, 'all'>;

export type UploadBucket = 'erp-quote-documents' | 'erp-proforma-documents' | 'erp-contract-documents' | 'erp-invoice-documents' | 'erp-service-documents';

/** Web `DocumentUploadDialog` DOCUMENT_TYPE_OPTIONS ile aynı sıra, kova ve belge türü. */
export const UPLOAD_TYPES: { folder: UploadFolder; label: string; bucket: UploadBucket; documentTypeCode: string }[] = [
  { folder: 'external_quote', label: 'Dış teklif', bucket: 'erp-quote-documents', documentTypeCode: 'external_quote' },
  { folder: 'proforma', label: 'Proforma', bucket: 'erp-proforma-documents', documentTypeCode: 'proforma_pdf' },
  { folder: 'contract', label: 'Sözleşme', bucket: 'erp-contract-documents', documentTypeCode: 'contract_pdf' },
  { folder: 'invoice', label: 'Ticari fatura', bucket: 'erp-invoice-documents', documentTypeCode: 'commercial_invoice_pdf' },
  { folder: 'accounting_invoice', label: 'Muhasebe faturası', bucket: 'erp-invoice-documents', documentTypeCode: 'accounting_invoice_pdf' },
  { folder: 'delivery_form', label: 'Teslim formu', bucket: 'erp-service-documents', documentTypeCode: 'delivery_form' },
  { folder: 'installation_form', label: 'Kurulum formu', bucket: 'erp-service-documents', documentTypeCode: 'installation_form' },
  { folder: 'other', label: 'Diğer', bucket: 'erp-quote-documents', documentTypeCode: 'other' },
];

export function uploadTypeFor(folder: string | null | undefined) {
  return UPLOAD_TYPES.find((entry) => entry.folder === folder) ?? UPLOAD_TYPES[UPLOAD_TYPES.length - 1]!;
}

const EXTERNAL_QUOTE_EXTENSIONS = ['pdf', 'docx', 'xlsx'];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Web yükleme doğrulaması: 25 MB sınırı, dış teklifte yalnız PDF/DOCX/XLSX. */
export function uploadFileError(folder: UploadFolder, file: { extension: string; sizeBytes: number }): string | null {
  if (file.sizeBytes > MAX_UPLOAD_BYTES) return "Dosya boyutu 25 MB'ı aşamaz";
  if (folder === 'external_quote' && !EXTERNAL_QUOTE_EXTENSIONS.includes(file.extension.toLowerCase())) {
    return 'Dış teklif için PDF, DOCX veya XLSX yükleyebilirsiniz.';
  }
  return null;
}

/* ------------------------------------------------ muhasebe faturası önerisi ---- */

export type InvoicePrefill = {
  companyId: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  invoiceNo: string;
  quoteId?: string;
  salesOrderId?: string;
  orderNo?: string;
  notes: string;
};

type MoneySource = { subtotal?: unknown; vatAmount?: unknown; grandTotal?: unknown };

function moneyParts(source: MoneySource) {
  const grandTotal = num(source.grandTotal);
  const vatAmount = num(source.vatAmount);
  const subtotal = num(source.subtotal);
  const amount = subtotal > 0 ? subtotal : Math.max(0, grandTotal - vatAmount);
  const vatRate = amount > 0 && vatAmount > 0 ? Math.round((vatAmount / amount) * 10000) / 100 : 20;
  return { amount, vatAmount, grandTotal, vatRate };
}

/**
 * Web `invoicePrefillFromOrder`: tutarlar siparişten, fatura no `MF-<sipariş>`.
 * Sipariş yoksa aynı kural onaylı tekliften uygulanır.
 */
export function invoicePrefill(input: {
  order?: (MoneySource & { id: string; orderNo: string; companyId: string; quoteId?: string | null }) | null;
  quote?: (MoneySource & { id: string; documentNo: string; companyId: string }) | null;
}): InvoicePrefill | null {
  const { order, quote } = input;
  if (order) {
    return {
      companyId: order.companyId,
      ...moneyParts(order),
      invoiceNo: `MF-${order.orderNo}`,
      quoteId: order.quoteId ?? quote?.id ?? undefined,
      salesOrderId: order.id,
      orderNo: order.orderNo,
      notes: quote ? `Satış siparişi ${order.orderNo} / teklif ${quote.documentNo}` : `Satış siparişi ${order.orderNo} kaynaklı`,
    };
  }
  if (quote) {
    return {
      companyId: quote.companyId,
      ...moneyParts(quote),
      invoiceNo: `MF-${quote.documentNo}`,
      quoteId: quote.id,
      notes: `Teklif ${quote.documentNo} kaynaklı`,
    };
  }
  return null;
}

/** Matrah + KDV oranından KDV ve genel toplam (kuruş yuvarlamalı). */
export function invoiceTotals(amount: number, vatRate: number): { vatAmount: number; grandTotal: number } {
  const vatAmount = Math.round(amount * vatRate) / 100;
  return { vatAmount, grandTotal: Math.round((amount + vatAmount) * 100) / 100 };
}

/* ------------------------------------------------- belge merkezi sayaçları ---- */

type CenterRecord = { quoteId: string | null; companyId: string | null; standalone: boolean };
type CenterLink = LinkLike & { entityType: string; description?: string | null };

/**
 * Web DocumentsPage üst sayaçları: Toplam / Kaynağa Bağlı / Teklife Bağlı /
 * Bağlantı İncele. Teklifsiz hızlı belge ve kasa hareketine bağlı dosya
 * bilerek teklifsizdir; incelemeye düşmez.
 */
export function documentCenterStats(records: CenterRecord[], links: CenterLink[]) {
  const commercialLinks = links.filter((link) => isRecordFolder(folderForDocumentType(link.documentType?.code)));
  return {
    total: records.length + links.length,
    linked: records.filter((record) => record.quoteId || record.companyId).length + links.filter((link) => link.entityType).length,
    quoteLinked: records.filter((record) => record.quoteId).length + links.filter((link) => link.entityType === 'quote').length,
    review:
      records.filter((record) => !record.quoteId && !record.standalone).length +
      commercialLinks.filter((link) => link.entityType !== 'quote' && !paymentIdFromDescription(link.description)).length,
  };
}

/** Kayıt satırının kaynak etiketi; web "Kaynak ve akış" sütunu. */
export function recordFolderLabel(kind: RecordFolder): string {
  return kind === 'proforma' ? 'Proforma' : kind === 'contract' ? 'Sözleşme' : 'Ticari fatura';
}
