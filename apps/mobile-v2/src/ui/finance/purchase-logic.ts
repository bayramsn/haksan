/**
 * Satın alma siparişi hesapları — web `PurchaseOrdersPage` ile aynı kurallar.
 * Çalışma zamanı importu yok.
 */

export type PurchaseType = 'commercial' | 'administrative';
export type PurchasePaymentType = 'cash' | 'leasing' | 'term';

export const PURCHASE_STATUS_TABS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'sent', label: 'Gönderilen' },
  { value: 'pending_manager_approval', label: 'Onay' },
  { value: 'approved', label: 'Onaylı' },
  { value: 'received', label: 'Teslim' },
] as const;

export const PURCHASE_STEPS = ['Taslak', 'Gönderildi', 'Onay', 'Onaylandı', 'Teslim'] as const;

export const purchaseTypeLabel = (value?: string | null) => (value === 'administrative' ? 'İdari' : 'Ticari');

export function purchaseStep(code?: string | null): number {
  if (code === 'received') return 4;
  if (code === 'approved') return 3;
  if (code === 'pending_manager_approval') return 2;
  if (code === 'sent') return 1;
  return 0;
}

export type EtaTone = 'neutral' | 'danger' | 'warning' | 'success';

export function etaState(value: string | null | undefined, now: Date = new Date()): { label: string; tone: EtaTone } {
  if (!value) return { label: 'ETA yok', tone: 'neutral' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: value, tone: 'neutral' };
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikmiş`, tone: 'danger' };
  if (days <= 7) return { label: days === 0 ? 'Bugün' : `${days} gün kaldı`, tone: 'warning' };
  return { label: `${days} gün kaldı`, tone: 'success' };
}

type OrderRow = {
  orderNo: string;
  invoiceNo: string | null;
  purchaseType: string;
  grandTotal: string;
  status: { code: string } | null;
  currency: { code: string } | null;
  supplier: { legalTitle: string; shortName: string | null } | null;
};

const supplierName = (row: OrderRow) => row.supplier?.shortName || row.supplier?.legalTitle || '—';

export function filterPurchaseOrders<T extends OrderRow>(rows: readonly T[], tab: string | null, query: string): T[] {
  const term = query.trim().toLocaleLowerCase('tr');
  return rows.filter((row) => {
    if (tab && row.status?.code !== tab) return false;
    if (!term) return true;
    return [row.orderNo, row.invoiceNo, supplierName(row)].some((value) =>
      String(value ?? '').toLocaleLowerCase('tr').includes(term),
    );
  });
}

/** KPI: toplam, ticari, idari, bekleyen + para birimi bazında toplam tutar (web USD'ye çevirir). */
export function purchaseKpis(rows: readonly OrderRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const code = row.currency?.code ?? 'USD';
    totals.set(code, (totals.get(code) ?? 0) + Number(row.grandTotal ?? 0));
  }
  return {
    total: rows.length,
    commercial: rows.filter((row) => (row.purchaseType ?? 'commercial') === 'commercial').length,
    administrative: rows.filter((row) => row.purchaseType === 'administrative').length,
    pending: rows.filter((row) => ['draft', 'sent', 'pending_manager_approval'].includes(row.status?.code ?? '')).length,
    totals: [...totals].sort(([, a], [, b]) => b - a).map(([currencyCode, amount]) => ({ currencyCode, amount })),
  };
}

/** "Tedarikçi İçgörüsü": sipariş adedine göre sıralı; açık teslim = teslim/iptal dışı. */
export function supplierInsights(rows: readonly OrderRow[]) {
  const map = new Map<string, { name: string; count: number; pending: number }>();
  for (const row of rows) {
    const name = supplierName(row);
    const entry = map.get(name) ?? { name, count: 0, pending: 0 };
    entry.count += 1;
    if (!['received', 'cancelled'].includes(row.status?.code ?? '')) entry.pending += 1;
    map.set(name, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------ form ---- */

export type PurchaseLineForm = {
  key: string;
  productModelId: string;
  description: string;
  quantity: string;
  listPrice: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  expectedDate: string;
};

export type PurchaseForm = {
  purchaseType: PurchaseType;
  paymentType: PurchasePaymentType;
  paymentTermDays: string;
  previousPaymentTermDays: string;
  termChangeReason: string;
  supplierCompanyId: string;
  invoiceNo: string;
  orderNo: string;
  orderDate: string;
  expectedDate: string;
  currencyCode: string;
  incoterm: string;
  shipmentReference: string;
  notes: string;
};

export function toDecimal(value: string | number | null | undefined): number {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

export function defaultPurchaseForm(today = new Date()): PurchaseForm {
  return {
    purchaseType: 'commercial',
    paymentType: 'cash',
    paymentTermDays: '0',
    previousPaymentTermDays: '',
    termChangeReason: '',
    supplierCompanyId: '',
    invoiceNo: '',
    orderNo: '',
    orderDate: today.toISOString().slice(0, 10),
    expectedDate: '',
    currencyCode: 'USD',
    incoterm: '',
    shipmentReference: '',
    notes: '',
  };
}

let seq = 0;
export function blankPurchaseLine(type: PurchaseType): PurchaseLineForm {
  seq += 1;
  return {
    key: `po-line-${Date.now()}-${seq}`,
    productModelId: '',
    description: type === 'administrative' ? 'İdari satın alma gideri' : '',
    quantity: '1',
    listPrice: '',
    unitPrice: '',
    discountAmount: '0',
    vatRate: '20',
    expectedDate: '',
  };
}

export function purchaseLineTotals(line: Pick<PurchaseLineForm, 'quantity' | 'unitPrice' | 'discountAmount' | 'vatRate'>) {
  const gross = toDecimal(line.quantity) * toDecimal(line.unitPrice);
  const discount = toDecimal(line.discountAmount);
  const taxable = Math.max(gross - discount, 0);
  const vat = taxable * (toDecimal(line.vatRate) / 100);
  return { gross, discount, taxable, vat, total: taxable + vat };
}

export function purchaseTotals(lines: readonly PurchaseLineForm[]) {
  return lines.reduce(
    (acc, line) => {
      const totals = purchaseLineTotals(line);
      acc.subtotal += totals.taxable;
      acc.discount += totals.discount;
      acc.vat += totals.vat;
      acc.total += totals.total;
      return acc;
    },
    { subtotal: 0, discount: 0, vat: 0, total: 0 },
  );
}

export const cleanPurchaseLines = (lines: readonly PurchaseLineForm[]) =>
  lines
    .map((line) => ({ ...line, description: line.description.trim() }))
    .filter((line) => line.description && toDecimal(line.quantity) > 0 && toDecimal(line.unitPrice) > 0);

export type PurchaseValidation = { ok: true } | { ok: false; title: string; description?: string };

export function validatePurchase(form: PurchaseForm, lines: readonly PurchaseLineForm[], withLines: boolean): PurchaseValidation {
  if (form.purchaseType !== 'administrative' && !form.supplierCompanyId) {
    return { ok: false, title: 'Ticari satın alma için firma seçimi zorunludur' };
  }
  if (Number.isNaN(new Date(form.orderDate).getTime())) {
    return { ok: false, title: 'Sipariş tarihi geçersiz', description: 'YYYY-AA-GG biçiminde girin.' };
  }
  if (!withLines) return { ok: true };
  const clean = cleanPurchaseLines(lines);
  if (!clean.length) {
    return { ok: false, title: 'En az bir geçerli satın alma kalemi girin', description: 'Açıklama, adet ve olur fiyatı zorunludur.' };
  }
  const bad = clean.find((line) => toDecimal(line.discountAmount) > toDecimal(line.quantity) * toDecimal(line.unitPrice));
  if (bad) return { ok: false, title: 'İndirim kalem tutarını aşamaz', description: bad.description };
  return { ok: true };
}

const days = (value: string) => (value === '' ? undefined : Math.max(0, Math.trunc(toDecimal(value))));
const iso = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** `purchaseOrderCreateSchema` gövdesi. */
export function buildPurchaseHeader(form: PurchaseForm) {
  return {
    supplierCompanyId: form.supplierCompanyId || undefined,
    purchaseType: form.purchaseType,
    paymentType: form.paymentType,
    paymentTermDays: days(form.paymentTermDays),
    previousPaymentTermDays: days(form.previousPaymentTermDays),
    termChangeReason: form.termChangeReason.trim() || undefined,
    invoiceNo: form.invoiceNo.trim() || undefined,
    orderNo: form.orderNo.trim() || undefined,
    orderDate: iso(form.orderDate) ?? new Date().toISOString(),
    expectedDate: iso(form.expectedDate),
    currencyCode: form.currencyCode,
    incoterm: form.purchaseType === 'commercial' ? form.incoterm.trim() || undefined : undefined,
    shipmentReference: form.shipmentReference.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

export type PurchaseHeaderPayload = ReturnType<typeof buildPurchaseHeader>;

/** `purchaseOrderItemCreateSchema` gövdeleri; idaride gider türü açıklamaya eklenir. */
export function buildPurchaseItems(form: PurchaseForm, lines: readonly PurchaseLineForm[]) {
  return cleanPurchaseLines(lines).map((line, index) => ({
    productModelId: form.purchaseType === 'commercial' && line.productModelId ? line.productModelId : undefined,
    description:
      form.purchaseType === 'administrative' && line.productModelId
        ? `${line.productModelId.trim()} - ${line.description}`
        : line.description,
    quantity: toDecimal(line.quantity),
    unitCode: 'adet',
    unitPrice: toDecimal(line.unitPrice),
    listPrice: line.listPrice === '' ? undefined : toDecimal(line.listPrice),
    approvedPrice: toDecimal(line.unitPrice),
    discountAmount: toDecimal(line.discountAmount),
    vatRate: toDecimal(line.vatRate),
    expectedDate: iso(line.expectedDate || form.expectedDate),
    sortOrder: index + 1,
  }));
}

export type PurchaseItemPayload = ReturnType<typeof buildPurchaseItems>[number];

const s = (value: unknown, fallback = '') => (value === null || value === undefined ? fallback : String(value));

/** Düzenleme: mevcut siparişin başlık alanlarını forma taşır. */
export function purchaseFormFromDetail(detail: {
  supplierCompanyId: string | null;
  purchaseType: string;
  paymentType: string;
  paymentTermDays: number | null;
  previousPaymentTermDays: number | null;
  termChangeReason: string | null;
  invoiceNo: string | null;
  orderNo: string;
  orderDate: string;
  expectedDate: string | null;
  currencyCode: string;
  incoterm: string | null;
  shipmentReference: string | null;
  notes: string | null;
}): PurchaseForm {
  return {
    purchaseType: detail.purchaseType === 'administrative' ? 'administrative' : 'commercial',
    paymentType: detail.paymentType === 'leasing' || detail.paymentType === 'term' ? detail.paymentType : 'cash',
    paymentTermDays: s(detail.paymentTermDays, '0'),
    previousPaymentTermDays: s(detail.previousPaymentTermDays),
    termChangeReason: detail.termChangeReason ?? '',
    supplierCompanyId: detail.supplierCompanyId ?? '',
    invoiceNo: detail.invoiceNo ?? '',
    orderNo: detail.orderNo ?? '',
    orderDate: detail.orderDate.slice(0, 10),
    expectedDate: detail.expectedDate?.slice(0, 10) ?? '',
    currencyCode: detail.currencyCode || 'USD',
    incoterm: detail.incoterm ?? '',
    shipmentReference: detail.shipmentReference ?? '',
    notes: detail.notes ?? '',
  };
}
