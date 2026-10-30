/**
 * Web ServicePages.tsx tamamlanma formu ve servis teklifi taslak/doğrulama
 * kurallarının saf kopyası (buildDefaultCompletionForm, mergeCompletionForm,
 * serviceQuoteMissingFields). Sunucu şeması: service.controller.ts.
 * Node testleri uzantısız göreli importu çözemediği için dosya bağımsızdır.
 */

export type Currency = 'USD' | 'EUR' | 'TRY';
export const CURRENCIES: Currency[] = ['USD', 'EUR', 'TRY'];

export type CheckStatus = 'done' | 'not_done' | 'na';
export type CompletionCheck = { id: string; label: string; status: CheckStatus; note?: string; custom?: boolean };
export type CompletionPart = { id: string; description: string; quantity: number; unitPrice: number };
export type ServiceFormType = 'montaj' | 'ariza' | 'periyodik';
export type Responsibility = 'ucretli' | 'garanti' | 'bakim';

export type CompletionForm = {
  formNo: string;
  teslimTarihi: string;
  kurulumTarihi: string;
  tezgah: { marka: string; tip: string; model: string; seriNo: string };
  cnc: { marka: string; model: string; seriNo: string; mainSw: string };
  kullanici: {
    firma: string;
    ilgili: string;
    adres: string;
    telefon: string;
    faks: string;
    gsm: string;
    eposta: string;
    vergiDairesi: string;
    vergiNo: string;
  };
  checks: CompletionCheck[];
  musteriSikayeti: string;
  serviceType: ServiceFormType;
  responsibility: Responsibility;
  yapilanIsler: string;
  notlar: string;
  degisenParcalar: CompletionPart[];
  servisUcreti: number;
  ulasimUcreti: number;
  currency: Currency;
  kurulumuYapan: string;
  teslimAlan: string;
  signedAt?: string;
  signedByUserId?: string;
};

export const SERVICE_COMPLETION_DEFAULT_CHECKS: { id: string; label: string }[] = [
  { id: 'tezgah-montaji', label: 'Tezgah Montajı' },
  { id: 'tezgah-dengeye-alinmasi', label: 'Tezgahın Dengeye Alınması' },
  { id: 'elektrik-baglantisi', label: 'Elektrik Bağlantısı' },
  { id: 'yaglama-sistemi', label: 'Yağlama Sistemi Kontrolü' },
  { id: 'sogutma-sistemi', label: 'Soğutma Sistemi Kontrolü' },
  { id: 'hidrolik-sistemi', label: 'Hidrolik Sistemi Kontrolü' },
  { id: 'cnc-parametreleri', label: 'Cnc Parametreleri Kontrolü' },
  { id: 'ilk-calistirma', label: 'Tezgahın İlk Çalıştırılması' },
  { id: 'parametre-yedek', label: 'Parametrelerin Yedeklenmesi' },
];

export const SERVICE_FORM_TYPE_LABELS: Record<ServiceFormType, string> = {
  montaj: 'Montaj',
  ariza: 'Arıza',
  periyodik: 'Periyodik Bakım',
};

export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  ucretli: 'Ücretli',
  garanti: 'Garanti',
  bakim: 'Bakım Anlaşması',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  done: 'Yapıldı',
  not_done: 'Yapılmadı',
  na: 'Uygulanmaz',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);

type MetaOperation = { id: string; description: string; quantity: number; unitPrice: number; kind: unknown };

function metaOperations(metadata: Record<string, unknown> | null): MetaOperation[] {
  const raw = metadata?.operations;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((item) => typeof item.description === 'string')
    .map((item, index) => ({
      id: str(item.id) || `op-${index}`,
      description: item.description as string,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      kind: item.kind,
    }));
}

function isPartOperation(operation: MetaOperation): boolean {
  return (
    operation.kind === 'part' ||
    operation.id.startsWith('srv-part-') ||
    operation.description.trim().toLocaleLowerCase('tr-TR').startsWith('parça kullanımı:')
  );
}

function metaComplaints(metadata: Record<string, unknown> | null): string[] {
  const raw = metadata?.complaints;
  return Array.isArray(raw) ? raw.filter(isRecord).map((item) => str(item.text).trim()).filter(Boolean) : [];
}

function istanbulToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export type CompletionContext = {
  ticket: {
    id: string;
    ticketNo: string | null;
    description: string | null;
    resolutionNote: string | null;
    metadata: Record<string, unknown> | null;
    warrantyApproved: boolean;
  };
  company?: {
    name?: string | null;
    address?: string | null;
    district?: string | null;
    city?: string | null;
    phone?: string | null;
    fax?: string | null;
    email?: string | null;
    taxOffice?: string | null;
    taxNumber?: string | null;
  } | null;
  contact?: { name?: string | null; mobile?: string | null; email?: string | null } | null;
  machine?: {
    brand?: string | null;
    type?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    controlUnit?: string | null;
    controlUnitSerial?: string | null;
    deliveryDate?: string | null;
  } | null;
  assigneeName?: string | null;
};

function formTypeFrom(text: string): ServiceFormType {
  const source = text.toLocaleLowerCase('tr-TR');
  if (source.includes('montaj') || source.includes('kurulum')) return 'montaj';
  if (source.includes('periyodik') || source.includes('bakım')) return 'periyodik';
  return 'ariza';
}

export function defaultCompletionForm(context: CompletionContext, now: Date): CompletionForm {
  const { ticket, company, contact, machine } = context;
  const metadata = ticket.metadata;
  const operations = metaOperations(metadata);
  const elapsed = num(metadata?.timerElapsedSeconds);
  const hourlyRate = num(metadata?.serviceHourlyRate) || 0;
  const currency = CURRENCIES.includes(metadata?.serviceCurrency as Currency) ? (metadata!.serviceCurrency as Currency) : 'TRY';
  const sourceText = [ticket.description].filter(Boolean).join(' ');
  const complaints = metaComplaints(metadata);
  const controlParts = (machine?.controlUnit ?? '').split(' ');
  const parts: CompletionPart[] = operations
    .filter(isPartOperation)
    .map((operation) => ({
      id: operation.id,
      description: operation.description.replace(/^Parça kullanımı:\s*/i, '').trim(),
      quantity: Math.max(1, operation.quantity || 1),
      unitPrice: Math.max(0, operation.unitPrice || 0),
    }))
    .slice(0, 6);
  return {
    formNo: ticket.ticketNo || ticket.id,
    teslimTarihi: machine?.deliveryDate?.slice(0, 10) ?? '',
    kurulumTarihi: istanbulToday(now),
    tezgah: { marka: machine?.brand ?? '', tip: machine?.type ?? '', model: machine?.model ?? '', seriNo: machine?.serialNumber ?? '' },
    cnc: {
      marka: machine ? controlParts[0] ?? '' : '',
      model: machine ? controlParts.slice(1).join(' ') : '',
      seriNo: machine?.controlUnitSerial ?? '',
      mainSw: '',
    },
    kullanici: {
      firma: company?.name ?? '',
      ilgili: contact?.name ?? '',
      adres: company ? [company.address, company.district, company.city].filter(Boolean).join(' ') : '',
      telefon: company?.phone ?? '',
      faks: company?.fax ?? '',
      gsm: contact?.mobile ?? '',
      eposta: contact?.email ?? company?.email ?? '',
      vergiDairesi: company?.taxOffice ?? '',
      vergiNo: company?.taxNumber ?? '',
    },
    checks: [],
    musteriSikayeti: complaints.join('\n') || ticket.description || '',
    serviceType: formTypeFrom(sourceText),
    responsibility: ticket.warrantyApproved ? 'garanti' : sourceText.toLocaleLowerCase('tr-TR').includes('bakım anl') ? 'bakim' : 'ucretli',
    yapilanIsler:
      operations.filter((operation) => !isPartOperation(operation)).map((operation) => operation.description.trim()).filter(Boolean).join('\n') ||
      ticket.resolutionNote ||
      '',
    notlar: '',
    degisenParcalar: parts,
    servisUcreti: Number(((elapsed / 3600) * hourlyRate).toFixed(2)),
    ulasimUcreti: 0,
    currency,
    kurulumuYapan: context.assigneeName ?? '',
    teslimAlan: contact?.name ?? '',
  };
}

function readChecks(value: unknown): CompletionCheck[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isRecord).map((check, index) => ({
    id: str(check.id) || `check-${index}`,
    label: str(check.label),
    status: check.status === 'done' || check.status === 'not_done' ? check.status : 'na',
    ...(str(check.note) ? { note: str(check.note) } : {}),
    ...(check.custom === true ? { custom: true } : {}),
  }));
}

function readParts(value: unknown): CompletionPart[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isRecord).map((part, index) => ({
    id: str(part.id) || `part-${index}`,
    description: str(part.description),
    quantity: num(part.quantity) || 1,
    unitPrice: num(part.unitPrice),
  }));
}

/** Kayıtlı form varsa varsayılanların üstüne biner (web mergeCompletionForm). */
export function mergeCompletionForm(existing: unknown, fallback: CompletionForm): CompletionForm {
  if (!isRecord(existing)) return fallback;
  const pick = <T extends Record<string, string>>(base: T, saved: unknown): T => {
    if (!isRecord(saved)) return base;
    const next = { ...base };
    for (const key of Object.keys(base) as (keyof T)[]) {
      if (typeof saved[key as string] === 'string') next[key] = saved[key as string] as T[keyof T];
    }
    return next;
  };
  const text = (key: keyof CompletionForm, base: string) => (typeof existing[key] === 'string' ? (existing[key] as string) : base);
  return {
    ...fallback,
    formNo: text('formNo', fallback.formNo),
    teslimTarihi: text('teslimTarihi', fallback.teslimTarihi),
    kurulumTarihi: text('kurulumTarihi', fallback.kurulumTarihi),
    tezgah: pick(fallback.tezgah, existing.tezgah),
    cnc: pick(fallback.cnc, existing.cnc),
    kullanici: pick(fallback.kullanici, existing.kullanici),
    checks: readChecks(existing.checks) ?? fallback.checks,
    musteriSikayeti: text('musteriSikayeti', fallback.musteriSikayeti),
    serviceType: existing.serviceType === 'montaj' || existing.serviceType === 'ariza' || existing.serviceType === 'periyodik' ? existing.serviceType : fallback.serviceType,
    responsibility:
      existing.responsibility === 'ucretli' || existing.responsibility === 'garanti' || existing.responsibility === 'bakim'
        ? existing.responsibility
        : fallback.responsibility,
    yapilanIsler: text('yapilanIsler', fallback.yapilanIsler),
    notlar: text('notlar', fallback.notlar),
    degisenParcalar: readParts(existing.degisenParcalar) ?? fallback.degisenParcalar,
    servisUcreti: existing.servisUcreti !== undefined ? num(existing.servisUcreti) : fallback.servisUcreti,
    ulasimUcreti: existing.ulasimUcreti !== undefined ? num(existing.ulasimUcreti) : fallback.ulasimUcreti,
    currency: CURRENCIES.includes(existing.currency as Currency) ? (existing.currency as Currency) : fallback.currency,
    kurulumuYapan: text('kurulumuYapan', fallback.kurulumuYapan),
    teslimAlan: text('teslimAlan', fallback.teslimAlan),
    ...(str(existing.signedAt) ? { signedAt: str(existing.signedAt) } : {}),
    ...(str(existing.signedByUserId) ? { signedByUserId: str(existing.signedByUserId) } : {}),
  };
}

/** Varsayılan kontrol satırlarını formda yoksa ekler; özel satırlar korunur. */
export function withDefaultChecks(checks: CompletionCheck[]): CompletionCheck[] {
  const existing = new Set(checks.map((check) => check.id));
  const defaults = SERVICE_COMPLETION_DEFAULT_CHECKS.filter((check) => !existing.has(check.id)).map(
    (check): CompletionCheck => ({ ...check, status: 'na' }),
  );
  return [...checks, ...defaults];
}

/** Sunucu serviceCompletionFormSchema'ya uygun gövde: kırpılır, boş parça/kontrol atılır. */
export function completionPayload(form: CompletionForm): Record<string, unknown> {
  const trimRecord = <T extends Record<string, string>>(value: T): T =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item.trim()])) as T;
  return {
    ...form,
    formNo: form.formNo.trim(),
    tezgah: trimRecord(form.tezgah),
    cnc: trimRecord(form.cnc),
    kullanici: trimRecord(form.kullanici),
    checks: form.checks
      .filter((check) => check.label.trim())
      .map((check) => ({ ...check, label: check.label.trim(), ...(check.note?.trim() ? { note: check.note.trim() } : { note: undefined }) })),
    musteriSikayeti: form.musteriSikayeti.trim(),
    yapilanIsler: form.yapilanIsler.trim(),
    notlar: form.notlar.trim(),
    degisenParcalar: form.degisenParcalar
      .filter((part) => part.description.trim())
      .map((part) => ({ ...part, description: part.description.trim(), quantity: Math.max(1, part.quantity || 1), unitPrice: Math.max(0, part.unitPrice || 0) })),
    servisUcreti: Math.max(0, form.servisUcreti || 0),
    ulasimUcreti: Math.max(0, form.ulasimUcreti || 0),
    kurulumuYapan: form.kurulumuYapan.trim(),
    teslimAlan: form.teslimAlan.trim(),
  };
}

/** Kapatma (Signed Form/Closed) için sunucu serviceCompletionCloseSchema zorunlu alanları. */
export function completionCloseMissing(form: CompletionForm): string[] {
  const missing: string[] = [];
  if (!form.serviceType) missing.push('Servis tipi');
  if (!form.responsibility) missing.push('Yükümlülük');
  if (!form.yapilanIsler.trim()) missing.push('Yapılan işlemler');
  if (!form.kurulumuYapan.trim()) missing.push('Servis yetkilisi');
  if (!form.teslimAlan.trim()) missing.push('Firma yetkilisi');
  return missing;
}

export function completionPartsTotal(form: CompletionForm): number {
  return form.degisenParcalar.reduce((sum, part) => sum + (part.quantity || 0) * (part.unitPrice || 0), 0);
}

/* -------------------------------------------------------- servis teklifi ---- */

export type QuoteItem = {
  id: string;
  productModelId: string | null;
  stockCode: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type ServiceQuote = {
  quoteNo: string;
  date: string;
  validity: string;
  writerName: string;
  writerTitle: string;
  writerEmail: string;
  company: string;
  contact: string;
  mobile: string;
  phone: string;
  address: string;
  email: string;
  subject: string;
  currency: Currency;
  vatRate: number;
  vatAmount: number;
  noteVariantKey: string;
  notes: string[];
  items: QuoteItem[];
  savedAt?: string;
};

export const SERVICE_NOTE_VARIANTS: { key: string; label: string; notlar: string[] }[] = [
  {
    key: 'teknik-servis',
    label: 'Teknik Servis',
    notlar: [
      'Montaj Teklifimize dahil değildir. Haksan Makina Tarafından Gerçekleştirileceği takdirde, Makina Başında geçirilen her bir saat için ilave 3.000 TL + KDV Teknik Servis Hizmet Bedeli tarafınıza fatura edilecektir,',
      'Ödeme teklif onayından sonra %50 nakit/havale, kalanı teslimden en geç 30 gün sonra havale şeklindedir,',
      'Teklifimize dahil olmayan, yeni tespit edilmiş arızaların onarımı/parça değişimi müşteri onayına istinaden yapılacaktır,',
      'Fiyatlarımıza ürünlerin cari orandaki K.D.V.’leri dahil değildir,',
      'Ürünlerin teslimi kesin siparişten 7 (±3) gün sonra gerçekleştirilecektir,',
      'Sipariş için teklif onayı ve ödeme dekontunu servis@haksancnc.com.tr adresine gönderilmelidir.',
    ],
  },
  {
    key: 'periyodik-bakim',
    label: 'Periyodik Bakım',
    notlar: [
      'Fiyatlarımıza %20 KDV dahil değildir.',
      'Sözleşme kapsamında 1 yıl içerisinde her bir makinaya 2 (iki) defa bakım yapılacaktır.',
      'Periyodik Bakım esnasında tespit edilen arızaların onarım ve yedek parça fiyatları teklifimize dahil değildir.',
      'Bakım sürecince tezgahlarda kullanılacak yağ, bor yağı, filtre vs. sarf malzemeler fiyata dahil edilmemiştir.',
      'Ödeme şekli, %50 sözleşme esnasında nakit, kalan bakiye en geç 60 gün sonra tahsil edilecektir,',
      'Teklif onayı, kaşeli ve imzalı olarak servis@haksancnc.com.tr mail adresinden tarafımıza gönderilmesi ile servis planlaması yapılıp sözleşme hazırlanacaktır.',
    ],
  },
  {
    key: 'sokum-kurulum',
    label: 'Tezgah Söküm Kurulum',
    notlar: [
      'Söküm/Kurulum süresince Makina Başında geçirilen her bir saat için ilave 1.700 TL + KDV Teknik Servis Hizmet Bedeli tarafınıza fatura edilecektir,',
      'Ödeme teklif onayından sonra %50 nakit/havale, kalanı teslimden en geç 30 gün sonra havale şeklindedir,',
      'Teklifimize dahil olmayan, Tezgahların söküm/kurulumu yeni teklif hazırlanarak müşteri onayına istinaden yapılacaktır,',
      'Fiyatlarımıza %20 K.D.V. dahil değildir,',
      'Teknik Servis randevusunun oluşturulabilmesi için teklif onayı ve ödeme dekontu servis@haksancnc.com.tr adresine gönderilmelidir.',
    ],
  },
  {
    key: 'egitim',
    label: 'Tezgah Eğitim',
    notlar: [
      'Eğitim Haksan Makina Teknik Servis Personeli tarafından verilecektir,',
      'Ödeme teklif onayından sonra %50 nakit/havale, kalanı eğitimden en geç 30 gün sonra havale şeklindedir,',
      'Fiyatlarımıza %20 K.D.V. dahil değildir,',
      'Teklif onayınıza istinaden Eğitim randevusu oluşturularak tarafınıza bildirilecektir,',
      'Eğitim randevusu için teklif onayı ve ödeme dekontunu servis@haksancnc.com.tr adresine gönderilmelidir.',
    ],
  },
];

export function newQuoteItem(seed: number): QuoteItem {
  return { id: `service-quote-item-${seed}`, productModelId: null, stockCode: null, description: '', quantity: 1, unit: 'Ad.', unitPrice: 0 };
}

const BUSINESS_LINE = /^(CNC|UNI|SACISLE)[-/]/;

export type QuoteContext = {
  ticketNo: string | null;
  issue: string | null;
  metadataCurrency: unknown;
  machine?: { brand?: string | null; model?: string | null; type?: string | null; serialNumber?: string | null } | null;
  company?: { name?: string | null; phone?: string | null; email?: string | null; address?: string | null } | null;
  contact?: { name?: string | null; mobile?: string | null } | null;
  writer?: { name?: string | null; title?: string | null; email?: string | null } | null;
};

export function readServiceQuote(value: unknown): ServiceQuote | null {
  if (!isRecord(value)) return null;
  const items = Array.isArray(value.items)
    ? value.items.filter(isRecord).map((item, index) => ({
        id: str(item.id) || `service-quote-item-${index}`,
        productModelId: str(item.productModelId) || null,
        stockCode: str(item.stockCode) || null,
        description: str(item.description),
        quantity: num(item.quantity),
        unit: str(item.unit) || 'Ad.',
        unitPrice: num(item.unitPrice),
      }))
    : [];
  return {
    quoteNo: str(value.quoteNo),
    date: str(value.date),
    validity: str(value.validity),
    writerName: str(value.writerName),
    writerTitle: str(value.writerTitle),
    writerEmail: str(value.writerEmail),
    company: str(value.company),
    contact: str(value.contact),
    mobile: str(value.mobile),
    phone: str(value.phone),
    address: str(value.address),
    email: str(value.email),
    subject: str(value.subject),
    currency: CURRENCIES.includes(value.currency as Currency) ? (value.currency as Currency) : 'USD',
    vatRate: value.vatRate === undefined ? 20 : num(value.vatRate),
    vatAmount: num(value.vatAmount),
    noteVariantKey: str(value.noteVariantKey),
    notes: Array.isArray(value.notes) ? value.notes.filter((note): note is string => typeof note === 'string') : [],
    items,
    ...(str(value.savedAt) ? { savedAt: str(value.savedAt) } : {}),
  };
}

export function defaultServiceQuote(context: QuoteContext, now: Date, seed: number): ServiceQuote {
  const machine = context.machine;
  const machineName = machine ? [machine.brand, machine.model, machine.type].filter(Boolean).join(' ') : '';
  const serialPrefix = machine?.serialNumber ? `${machine.serialNumber} Seri Numaralı ` : '';
  const subjectParts = [`Teklifimiz ${serialPrefix}${machineName}`.trim(), context.issue?.trim()].filter(Boolean).join(' ');
  const businessLine = context.ticketNo?.match(BUSINESS_LINE)?.[1] ?? 'CNC';
  const sequence = context.ticketNo?.match(/(\d+)$/)?.[1] ?? '';
  return {
    quoteNo: `${businessLine}-SRVTEK-${now.getFullYear()}/${sequence || '...'}`,
    date: now.toISOString().slice(0, 10),
    validity: '5 İş Günü',
    writerName: context.writer?.name ?? '',
    writerTitle: context.writer?.title ?? '',
    writerEmail: context.writer?.email ?? '',
    company: context.company?.name ?? '',
    contact: context.contact?.name ?? '',
    mobile: context.contact?.mobile ?? '',
    phone: context.company?.phone ?? '',
    address: context.company?.address ?? '',
    email: context.company?.email ?? '',
    subject: subjectParts ? `${subjectParts} kapsamaktadır.` : '',
    currency: CURRENCIES.includes(context.metadataCurrency as Currency) ? (context.metadataCurrency as Currency) : 'USD',
    vatRate: 20,
    vatAmount: 0,
    noteVariantKey: 'teknik-servis',
    notes: [...(SERVICE_NOTE_VARIANTS[0]?.notlar ?? [])],
    items: [newQuoteItem(seed)],
  };
}

export function serviceQuoteMissingFields(quote: ServiceQuote | null | undefined): string[] {
  if (!quote) return ['servis teklif formu'];
  const missing: string[] = [];
  if (!quote.quoteNo.trim()) missing.push('teklif no');
  if (!quote.date.trim()) missing.push('tarih');
  if (!quote.validity.trim()) missing.push('geçerlilik süresi');
  if (!quote.writerName.trim()) missing.push('teklifi yazan');
  if (!quote.company.trim()) missing.push('firma');
  if (!quote.subject.trim()) missing.push('teklif kapsamı');
  if (!quote.currency) missing.push('para birimi');
  const entered = quote.items.filter((item) => item.description.trim());
  const valid = entered.filter(
    (item) => item.unit.trim() && Number.isFinite(item.quantity) && item.quantity > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0,
  );
  if (!valid.length) missing.push('en az bir ürün/hizmet kalemi');
  else if (valid.length !== entered.length) missing.push('eksik ürün/hizmet kalemi');
  return missing;
}

/** Web `save()` normalizasyonu: iş kolu öneki, kırpma, boş kalemleri atma. */
export function normalizeServiceQuote(draft: ServiceQuote, ticketNo: string | null, now: Date): ServiceQuote {
  const businessLine = ticketNo?.match(BUSINESS_LINE)?.[1] ?? 'CNC';
  const entered = draft.quoteNo.trim();
  return {
    ...draft,
    quoteNo: entered ? (BUSINESS_LINE.test(entered) ? entered : `${businessLine}-${entered}`) : '',
    writerName: draft.writerName.trim(),
    company: draft.company.trim(),
    subject: draft.subject.trim(),
    notes: draft.notes.map((note) => note.trim()).filter(Boolean),
    items: draft.items
      .map((item) => ({
        ...item,
        description: item.description.trim(),
        unit: item.unit.trim(),
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
      }))
      .filter((item) => item.description),
    savedAt: now.toISOString(),
  };
}

export function quoteTotals(quote: ServiceQuote): { subtotal: number; vat: number; total: number } {
  const subtotal = quote.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
  const vat = quote.vatAmount > 0 ? quote.vatAmount : (subtotal * (quote.vatRate || 0)) / 100;
  return { subtotal, vat, total: subtotal + vat };
}

/** Not geçmişi değişince web `resolutionNote`'u notların birleşimiyle eşitler. */
export function joinedNotes(notes: { text: string }[]): string {
  return notes.map((note) => note.text.trim()).filter(Boolean).join('\n\n');
}
