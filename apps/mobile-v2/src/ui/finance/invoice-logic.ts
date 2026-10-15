/**
 * Muhasebe faturası hesapları — web `AccountingInvoicesPage` ve
 * `CreateAccountingInvoiceDialog` ile aynı kurallar. Çalışma zamanı importu yok.
 */

export type InvoiceCategory = 'commercial' | 'administrative';
export type InvoiceType = 'sales' | 'purchase';
export type PaymentType = 'cash' | 'leasing' | 'term';
export type LineKind = 'product' | 'stock' | 'expense';

export const VAT_RATE_OPTIONS = ['20', '18', '10', '8', '1', '0'] as const;
export const INVOICE_CURRENCIES = ['USD', 'EUR', 'TRY'] as const;

export const invoiceCategoryLabel = (category?: string | null) => (category === 'administrative' ? 'İdari' : 'Ticari');
export const invoiceTypeLabel = (type?: string | null) => (type === 'purchase' ? 'Alış' : 'Satış');
export function paymentTypeLabel(value?: string | null): string {
  if (value === 'leasing') return 'Leasing';
  if (value === 'term') return 'Vadeli';
  return 'Peşin';
}

export const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export function parseMoneyInput(value: string | number | null | undefined): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export const vatAmountFromRate = (amount: string | number, vatRate: string | number) =>
  roundMoney(Math.max(parseMoneyInput(amount), 0) * (Math.max(parseMoneyInput(vatRate), 0) / 100));

const DAY_MS = 86_400_000;

export function addDaysToDateInput(dateText: string, days: number): string {
  const base = new Date(dateText);
  if (Number.isNaN(base.getTime())) return '';
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export type DueTone = 'danger' | 'warning' | 'success' | 'neutral';

/** Listedeki "Vade / Aging" rozeti. */
export function dueState(
  invoice: { firstDueDate: string | null; installmentCount: number },
  now: Date = new Date(),
): { label: string; tone: DueTone; detail: string } {
  if (!invoice.firstDueDate) return { label: 'Vade yok', tone: 'neutral', detail: 'Peşin / tanımsız' };
  const due = new Date(invoice.firstDueDate);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / DAY_MS);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikmiş`, tone: 'danger', detail: 'Takip gerekli' };
  if (days === 0) return { label: 'Bugün vadeli', tone: 'warning', detail: 'Gün içi aksiyon' };
  if (days <= 7) return { label: `${days} gün kaldı`, tone: 'warning', detail: 'Yaklaşan vade' };
  return { label: `${days} gün kaldı`, tone: 'success', detail: invoice.installmentCount > 1 ? 'Taksit planı' : 'Planlı' };
}

type InvoiceListRow = {
  invoiceNo: string;
  grandTotal: string;
  installmentCount: number;
  company: { id: string; legalTitle: string; shortName: string | null } | null;
  currency: { code: string } | null;
};

const lower = (value: string) => value.toLocaleLowerCase('tr');

export function filterInvoices<T extends InvoiceListRow>(rows: readonly T[], query: string): T[] {
  const term = lower(query.trim());
  if (!term) return [...rows];
  return rows.filter((row) => {
    const name = row.company?.shortName || row.company?.legalTitle || '';
    return lower(row.invoiceNo).includes(term) || lower(name).includes(term);
  });
}

/** KPI: fatura adedi, para birimi bazında toplamlar (büyükten küçüğe), taksitli, firma. */
export function invoiceKpis(rows: readonly InvoiceListRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const code = row.currency?.code ?? '—';
    totals.set(code, (totals.get(code) ?? 0) + Number(row.grandTotal || 0));
  }
  return {
    count: rows.length,
    totals: [...totals].sort(([, a], [, b]) => b - a).map(([currencyCode, amount]) => ({ currencyCode, amount })),
    installmented: rows.filter((row) => row.installmentCount > 1).length,
    companies: new Set(rows.map((row) => row.company?.id).filter(Boolean)).size,
  };
}

/* ------------------------------------------------------------ form ---- */

export type InvoiceLineForm = {
  id: string;
  kind: LineKind;
  inventoryItemId?: string;
  productModelId: string;
  categoryCode: string;
  description: string;
  quantity: string;
  listPrice: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  expectedDate: string;
};

export type InstallmentRow = { installmentNo: number; dueDate: string; amount: string };

export type InvoiceForm = {
  type: InvoiceType;
  invoiceCategory: InvoiceCategory;
  companyId: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: string;
  vatRate: string;
  vatAmount: string;
  currencyCode: string;
  paymentType: PaymentType;
  paymentTermDays: string;
  previousPaymentTermDays: string;
  termChangeReason: string;
  incoterm: string;
  shipmentReference: string;
  orderNo: string;
  expectedDate: string;
  firstDueDate: string;
  lastDueDate: string;
  installmentCount: string;
  notes: string;
};

export function defaultInvoiceForm(companyId = '', today = new Date()): InvoiceForm {
  return {
    type: 'sales',
    invoiceCategory: 'commercial',
    companyId,
    invoiceNo: '',
    invoiceDate: today.toISOString().slice(0, 10),
    amount: '',
    vatRate: '20',
    vatAmount: '0',
    currencyCode: 'USD',
    paymentType: 'cash',
    paymentTermDays: '',
    previousPaymentTermDays: '',
    termChangeReason: '',
    incoterm: '',
    shipmentReference: '',
    orderNo: '',
    expectedDate: '',
    firstDueDate: '',
    lastDueDate: '',
    installmentCount: '1',
    notes: '',
  };
}

let lineSeq = 0;
export function blankInvoiceLine(category: InvoiceCategory): InvoiceLineForm {
  lineSeq += 1;
  return {
    id: `line-${Date.now()}-${lineSeq}`,
    kind: category === 'administrative' ? 'expense' : 'product',
    productModelId: '',
    categoryCode: '',
    description: '',
    quantity: '1',
    listPrice: '',
    unitPrice: '',
    discountAmount: '0',
    vatRate: '20',
    expectedDate: '',
  };
}

export function invoiceLineTotals(line: Pick<InvoiceLineForm, 'quantity' | 'unitPrice' | 'discountAmount' | 'vatRate'>) {
  const gross = parseMoneyInput(line.quantity) * parseMoneyInput(line.unitPrice);
  const discount = Math.min(Math.max(parseMoneyInput(line.discountAmount), 0), gross);
  const taxable = Math.max(gross - discount, 0);
  const vat = taxable * (parseMoneyInput(line.vatRate) / 100);
  return { gross, discount, taxable, vat, total: taxable + vat };
}

export function gridTotals(lines: readonly InvoiceLineForm[]) {
  return lines.reduce(
    (acc, line) => {
      const totals = invoiceLineTotals(line);
      acc.subtotal += totals.taxable;
      acc.discount += totals.discount;
      acc.vat += totals.vat;
      acc.total += totals.total;
      return acc;
    },
    { subtotal: 0, discount: 0, vat: 0, total: 0 },
  );
}

export const isValidLine = (line: InvoiceLineForm) =>
  Boolean(line.description.trim()) && parseMoneyInput(line.quantity) > 0 && parseMoneyInput(line.unitPrice) > 0;

export const isBlankLine = (line: InvoiceLineForm) =>
  !line.description.trim() &&
  !line.productModelId &&
  !line.inventoryItemId &&
  !line.categoryCode.trim() &&
  parseMoneyInput(line.unitPrice) <= 0 &&
  parseMoneyInput(line.listPrice) <= 0;

export function invoiceTotals(form: Pick<InvoiceForm, 'amount' | 'vatRate' | 'vatAmount'>) {
  const amount = parseMoneyInput(form.amount);
  const vatRate = parseMoneyInput(form.vatRate);
  const net = amount > 0 ? amount : 0;
  const vatAmount = roundMoney(Math.max(parseMoneyInput(form.vatAmount), 0));
  return {
    amount: roundMoney(net),
    vatRate: vatRate >= 0 ? vatRate : 0,
    vatAmount,
    grandTotal: roundMoney(net + vatAmount),
  };
}

/** Eşit taksit; son taksit kuruş farkını alır. Son vade yoksa 30 günlük adım. */
export function previewInstallments(
  grandTotal: number,
  form: Pick<InvoiceForm, 'installmentCount' | 'firstDueDate' | 'invoiceDate' | 'lastDueDate'>,
): InstallmentRow[] {
  const count = Math.max(1, Number(form.installmentCount) || 1);
  if (!Number.isFinite(grandTotal) || grandTotal <= 0) return [];
  const base = Math.floor((grandTotal / count) * 100) / 100;
  const first = new Date(form.firstDueDate || form.invoiceDate);
  if (Number.isNaN(first.getTime())) return [];
  const last = form.lastDueDate ? new Date(form.lastDueDate) : null;
  const stepMs = last && count > 1 ? (last.getTime() - first.getTime()) / (count - 1) : 30 * DAY_MS;
  let allocated = 0;
  const rows: InstallmentRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const amount = index === count - 1 ? Math.round((grandTotal - allocated) * 100) / 100 : base;
    allocated += amount;
    const date = new Date(first.getTime() + stepMs * index);
    rows.push({ installmentNo: index + 1, dueDate: date.toISOString().slice(0, 10), amount: String(amount) });
  }
  return rows;
}

/** Tür/sınıf değişince satırlar yeni moda taşınır; idariye geçişte ürün/seri bağları düşer. */
export function retargetLines(lines: readonly InvoiceLineForm[], type: InvoiceType, category: InvoiceCategory): InvoiceLineForm[] {
  return lines.map((line) => {
    if (category === 'administrative') return { ...line, kind: 'expense', productModelId: '', inventoryItemId: undefined };
    if (type === 'purchase' && line.kind === 'stock') {
      return { ...line, kind: 'product', inventoryItemId: undefined, categoryCode: '' };
    }
    if (line.kind === 'expense') {
      return { ...line, kind: line.inventoryItemId ? 'stock' : 'product', categoryCode: '' };
    }
    return line;
  });
}

export type InvoiceValidation = { ok: true } | { ok: false; title: string; description?: string };

export function validateInvoice(
  form: InvoiceForm,
  lines: readonly InvoiceLineForm[],
  gridVisible: boolean,
): InvoiceValidation {
  if (!form.companyId) return { ok: false, title: 'Firma seçin' };
  if (Number.isNaN(new Date(form.invoiceDate).getTime())) {
    return { ok: false, title: 'Fatura tarihi geçersiz', description: 'YYYY-AA-GG biçiminde girin.' };
  }
  if (gridVisible) {
    const clean = lines.filter(isValidLine);
    if (lines.some((line) => !isBlankLine(line)) && clean.length === 0) {
      return { ok: false, title: 'En az bir geçerli kalem girin', description: 'Açıklama, adet ve olur fiyatı zorunludur.' };
    }
    const badDiscount = clean.find(
      (line) => parseMoneyInput(line.discountAmount) > parseMoneyInput(line.quantity) * parseMoneyInput(line.unitPrice),
    );
    if (badDiscount) return { ok: false, title: 'İndirim kalem tutarını aşamaz', description: badDiscount.description.trim() };
    if (clean.some((line) => line.kind === 'stock' && !line.inventoryItemId)) {
      return { ok: false, title: 'Tezgah satışı için seri numarası seçin' };
    }
    if (form.type === 'sales') {
      const fractional = clean.find((line) => {
        if (line.kind !== 'product' || !line.productModelId) return false;
        const qty = parseMoneyInput(line.quantity);
        return Math.trunc(qty) !== qty;
      });
      if (fractional) return { ok: false, title: 'Ürün satışında adet tam sayı olmalı', description: fractional.description.trim() };
    }
  }
  if (invoiceTotals(form).amount <= 0) return { ok: false, title: 'Geçerli matrah girin' };
  return { ok: true };
}

const termDays = (value: string) => (value === '' ? undefined : Math.max(0, Math.trunc(parseMoneyInput(value))));
const toIso = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** `accountingInvoiceCreateSchema` gövdesi; düzenlemede boş metin alanı temizler. */
export function buildInvoicePayload(input: {
  form: InvoiceForm;
  lines: readonly InvoiceLineForm[];
  installments: readonly InstallmentRow[];
  gridVisible: boolean;
  isEditing: boolean;
  quoteId?: string;
  salesOrderId?: string;
}) {
  const { form, isEditing } = input;
  const totals = invoiceTotals(form);
  const isAdministrative = form.invoiceCategory === 'administrative';
  const text = (value: string) => {
    const trimmed = value.trim();
    return isEditing ? trimmed : trimmed || undefined;
  };
  const clean = input.gridVisible
    ? input.lines
        .map((line) => ({ ...line, description: line.description.trim(), categoryCode: line.categoryCode.trim() }))
        .filter(isValidLine)
    : [];
  const lineItems = clean.length
    ? clean.map((line) => ({
        saleType: line.kind === 'stock' ? ('tezgah' as const) : line.kind === 'product' && line.productModelId ? ('product' as const) : undefined,
        inventoryItemId: line.inventoryItemId,
        productModelId: line.productModelId || undefined,
        categoryCode: line.kind === 'stock' ? 'TEZGAH' : line.categoryCode || undefined,
        description: line.description,
        quantity: parseMoneyInput(line.quantity),
        listPrice: line.listPrice === '' ? undefined : parseMoneyInput(line.listPrice),
        unitPrice: parseMoneyInput(line.unitPrice),
        discountAmount: parseMoneyInput(line.discountAmount),
        vatRate: parseMoneyInput(line.vatRate),
        lineTotal: roundMoney(invoiceLineTotals(line).total),
        expectedDate: toIso(line.expectedDate || form.expectedDate),
      }))
    : undefined;
  const sendInstallments = form.paymentType !== 'term' || Boolean(form.paymentTermDays.trim()) || Boolean(form.firstDueDate);
  return {
    companyId: form.companyId,
    type: form.type,
    invoiceCategory: form.invoiceCategory,
    invoiceNo: form.invoiceNo,
    invoiceDate: toIso(form.invoiceDate) ?? new Date().toISOString(),
    amount: totals.amount,
    vatRate: totals.vatRate,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grandTotal,
    currencyCode: form.currencyCode,
    paymentType: form.paymentType,
    paymentTermDays: form.paymentType === 'cash' ? 0 : termDays(form.paymentTermDays),
    previousPaymentTermDays: termDays(form.previousPaymentTermDays),
    termChangeReason: text(form.termChangeReason),
    incoterm: isAdministrative ? (isEditing ? '' : undefined) : text(form.incoterm),
    shipmentReference: text(form.shipmentReference),
    orderNo: text(form.orderNo),
    expectedDate: toIso(form.expectedDate),
    quoteId: input.quoteId,
    salesOrderId: input.salesOrderId,
    firstDueDate: toIso(form.firstDueDate),
    lastDueDate: toIso(form.lastDueDate),
    installmentCount: Number(form.installmentCount) || 1,
    notes: form.notes || undefined,
    installments: sendInstallments
      ? input.installments.map((row) => ({
          installmentNo: row.installmentNo,
          dueDate: toIso(row.dueDate) ?? new Date().toISOString(),
          amount: Number(row.amount),
        }))
      : undefined,
    lineItems,
  };
}

export type InvoicePayload = ReturnType<typeof buildInvoicePayload>;

/* -------------------------------------------------------- ön dolum ---- */

export type InvoicePrefill = {
  form: InvoiceForm;
  lines: InvoiceLineForm[];
  installments: InstallmentRow[];
};

const str = (value: unknown, fallback = '') => (value === null || value === undefined ? fallback : String(value));
const date10 = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

type DetailLike = {
  type: string;
  invoiceCategory: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: string;
  vatAmount: string;
  grandTotal: string;
  paymentType: string;
  paymentTermDays: number | null;
  previousPaymentTermDays: number | null;
  termChangeReason: string | null;
  incoterm: string | null;
  shipmentReference: string | null;
  orderNo: string | null;
  expectedDate: string | null;
  firstDueDate: string | null;
  lastDueDate: string | null;
  installmentCount: number;
  notes?: string | null;
  company: { id: string } | null;
  companyId: string;
  currency: { code: string } | null;
  installments: { installmentNo: number; dueDate: string; amount: string }[];
};

const asPaymentType = (value: string | null | undefined): PaymentType =>
  value === 'leasing' || value === 'term' ? value : 'cash';

/** Web `invoicePrefill`: düzenleme diyaloğu mevcut faturadan dolar (kalem ızgarası düzenlemede yok). */
export function invoicePrefillFromDetail(detail: DetailLike): InvoicePrefill {
  const amount = Number(detail.amount ?? detail.grandTotal ?? 0);
  const vatAmount = Number(detail.vatAmount ?? 0);
  const category: InvoiceCategory = detail.invoiceCategory === 'administrative' ? 'administrative' : 'commercial';
  return {
    form: {
      ...defaultInvoiceForm(detail.company?.id ?? detail.companyId),
      type: detail.type === 'purchase' ? 'purchase' : 'sales',
      invoiceCategory: category,
      invoiceNo: detail.invoiceNo,
      invoiceDate: date10(detail.invoiceDate),
      amount: String(amount),
      vatRate: String(amount > 0 ? Math.round((vatAmount / amount) * 10000) / 100 : 0),
      vatAmount: String(vatAmount),
      currencyCode: detail.currency?.code ?? 'USD',
      paymentType: asPaymentType(detail.paymentType),
      paymentTermDays: str(detail.paymentTermDays),
      previousPaymentTermDays: str(detail.previousPaymentTermDays),
      termChangeReason: detail.termChangeReason ?? '',
      incoterm: detail.incoterm ?? '',
      shipmentReference: detail.shipmentReference ?? '',
      orderNo: detail.orderNo ?? '',
      expectedDate: date10(detail.expectedDate),
      firstDueDate: date10(detail.firstDueDate ?? detail.invoiceDate),
      lastDueDate: date10(detail.lastDueDate),
      installmentCount: String(detail.installmentCount || detail.installments.length || 1),
      notes: detail.notes ?? '',
    },
    lines: [blankInvoiceLine(category)],
    installments: detail.installments.map((row) => ({
      installmentNo: row.installmentNo,
      dueDate: date10(row.dueDate),
      amount: String(row.amount),
    })),
  };
}

type PurchaseOrderLike = {
  orderNo: string;
  orderDate: string;
  supplierCompanyId: string | null;
  purchaseType: string;
  paymentType: string;
  paymentTermDays: number | null;
  previousPaymentTermDays: number | null;
  termChangeReason: string | null;
  incoterm: string | null;
  shipmentReference: string | null;
  invoiceNo: string | null;
  expectedDate: string | null;
  subtotal: string;
  vatAmount: string;
  grandTotal: string;
  currencyCode: string;
  items: {
    productModelId: string | null;
    description: string;
    quantity: string;
    listPrice?: string | null;
    unitPrice: string;
    discountAmount: string;
    vatRate: string;
    expectedDate?: string | null;
  }[];
};

/** Web `purchaseInvoicePrefill`: satın alma siparişinden "Alış Faturası". */
export function purchaseInvoicePrefill(order: PurchaseOrderLike): InvoicePrefill {
  const grandTotal = Number(order.grandTotal ?? 0);
  const vatAmount = Number(order.vatAmount ?? 0);
  const amount = Number(order.subtotal ?? Math.max(0, grandTotal - vatAmount));
  const category: InvoiceCategory = order.purchaseType === 'administrative' ? 'administrative' : 'commercial';
  const vatRate = amount > 0 && vatAmount > 0 ? (vatAmount / amount) * 100 : 20;
  const lines = order.items.map((item): InvoiceLineForm => ({
    ...blankInvoiceLine(category),
    kind: item.productModelId ? 'product' : category === 'administrative' ? 'expense' : 'product',
    productModelId: item.productModelId ?? '',
    description: item.description ?? '',
    quantity: str(item.quantity, '1'),
    listPrice: str(item.listPrice),
    unitPrice: str(item.unitPrice),
    discountAmount: str(item.discountAmount, '0'),
    vatRate: str(item.vatRate, '20'),
    expectedDate: date10(item.expectedDate),
  }));
  return {
    form: {
      ...defaultInvoiceForm(order.supplierCompanyId ?? ''),
      type: 'purchase',
      invoiceCategory: category,
      invoiceNo: order.invoiceNo || `MF-${order.orderNo || 'PO'}`,
      invoiceDate: date10(order.orderDate),
      amount: String(amount),
      vatRate: String(roundMoney(vatRate)),
      vatAmount: String(vatAmount),
      currencyCode: order.currencyCode || 'USD',
      paymentType: asPaymentType(order.paymentType),
      paymentTermDays: str(order.paymentTermDays),
      previousPaymentTermDays: str(order.previousPaymentTermDays),
      termChangeReason: order.termChangeReason ?? '',
      incoterm: order.incoterm ?? '',
      shipmentReference: order.shipmentReference ?? '',
      orderNo: order.orderNo ?? '',
      expectedDate: date10(order.expectedDate),
      firstDueDate: date10(order.expectedDate ?? order.orderDate),
      notes: `Satın alma siparişi ${order.orderNo ?? ''} kaynaklı`,
    },
    lines: lines.length ? lines : [blankInvoiceLine(category)],
    installments: [],
  };
}
