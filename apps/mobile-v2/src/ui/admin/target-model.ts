/**
 * Kullanıcı / departman / rol hedef formu — web `components/admin/TargetDialog.tsx`
 * yardımcılarının birebir aynası (şablonlar, ölçüm anahtarı eşlemesi, sayı ayrıştırma).
 */

export type TargetType = 'sales' | 'service' | 'finance' | 'purchase' | 'operations' | 'logistics' | 'other';
export type TargetUnit = 'count' | 'amount';
export type TrackingMode = 'automatic' | 'manual';
export type TargetMetricKey =
  | 'salesAmount'
  | 'salesNewCustomers'
  | 'quoteTarget'
  | 'visitTarget'
  | 'callTarget'
  | 'serviceCompleted'
  | 'serviceAmount'
  | 'digitalLeadTarget'
  | 'digitalConversionTarget'
  | 'digitalBudget'
  | 'paymentsInAmount'
  | 'purchaseInvoiceAmount'
  | 'purchaseOrderAmount'
  | 'purchaseOrderCount'
  | 'salesOrderAmount'
  | 'salesOrderCount'
  | 'installationCompleted'
  | 'machineDeliveredCount';

export type TargetItem = {
  targetType: TargetType;
  category: string;
  activity: string;
  description: string;
  unit: TargetUnit;
  defaultTarget: string;
  target: string;
  metricKey?: TargetMetricKey | null;
  trackingMode?: TrackingMode;
  manualActual?: string;
};

type TemplateRow = Omit<TargetItem, 'target' | 'manualActual' | 'targetType'>;
type TemplateItem = Omit<TargetItem, 'target' | 'manualActual'>;

export type MainFieldKey =
  | 'salesAmount'
  | 'salesNewCustomers'
  | 'serviceAmount'
  | 'serviceCompleted'
  | 'digitalLeadTarget'
  | 'digitalConversionTarget'
  | 'digitalBudget'
  | 'visitTarget'
  | 'callTarget'
  | 'quoteTarget';

export type TargetForm = Record<MainFieldKey, string> & {
  period: string;
  currency: 'USD';
  targetItems: TargetItem[];
  note: string;
};

/** Dönem YEREL takvimden okunur (UTC ay başında önceki ayı verir). */
export const currentPeriod = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  const date = new Date(year, month - 1 + delta, 1);
  return currentPeriod(date);
}

export const expectedPeriodPct = (period: string, now = new Date()) => {
  const current = currentPeriod(now);
  if (period < current) return 100;
  if (period > current) return 0;
  const [year, month] = period.split('-').map(Number);
  const days = new Date(year ?? 0, month ?? 0, 0).getDate();
  return Math.round((now.getDate() / days) * 100);
};

export const TARGET_TYPE_ORDER: TargetType[] = ['sales', 'service', 'finance', 'purchase', 'operations', 'logistics', 'other'];

export const TARGET_TYPE_META: Record<TargetType, { label: string; title: string }> = {
  sales: { label: 'Satış', title: 'Satış Hedefleri' },
  service: { label: 'Servis', title: 'Servis Hedefleri' },
  finance: { label: 'Finans', title: 'Finans Hedefleri' },
  purchase: { label: 'Satınalma', title: 'Satınalma Hedefleri' },
  operations: { label: 'Operasyon', title: 'Operasyon Hedefleri' },
  logistics: { label: 'Lojistik', title: 'Lojistik Hedefleri' },
  other: { label: 'Diğer', title: 'Diğer Hedefler' },
};

const sharedVisitTargets: TemplateRow[] = [
  {
    category: 'ZİYARET',
    activity: 'MÜŞTERİ ZİYARETİ',
    description: 'Halihazırdaki cari hesaplarda bulunan müşterimize yapılan ziyaret',
    unit: 'count',
    defaultTarget: '20',
  },
  {
    category: 'ZİYARET',
    activity: 'TEKLİF TAKİP ZİYARETİ',
    description: 'Verilen teklifler ile ilgili müşterilerle değerlendirme toplantısı yapılacak.',
    unit: 'count',
    defaultTarget: '30',
  },
  {
    category: 'ZİYARET',
    activity: 'YENİ MÜŞTERİ ZİYARETİ',
    description:
      'Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve ziyaret edilmemiş potansiyel müşteri ziyareti',
    unit: 'count',
    defaultTarget: '30',
  },
  {
    category: 'ZİYARET',
    activity: 'FUAR ZİYARETİ',
    description:
      'Sektörel ve ilgili potansiyel sektör fuarları ziyaret edilecek, müşterilerimizin standları ziyaret edilip, potansiyel firmalar ile görüşmeler sağlanacak.',
    unit: 'count',
    defaultTarget: '2',
  },
];

const sharedDigitalTargets: TemplateRow[] = [
  {
    category: 'DİJİTAL PAZARLAMA',
    activity: 'ÇEVRİMİÇİ TOPLANTI',
    description:
      'Potansiyel müşterilerle ilk tanışma toplantısı ve şirket sunumu için Zoom veya Windows Teams üzerinden toplantı yapılacak',
    unit: 'count',
    defaultTarget: '8',
  },
  {
    category: 'DİJİTAL PAZARLAMA',
    activity: 'LINKEDIN PAYLAŞIMI',
    description:
      'Kurumsal sosyal medya hesaplarının gönderilerinin yeniden paylaşılması, web sitesi ürünlerinin link ile paylaşılması, üretici firmaların gönderilerinin yeniden paylaşılması',
    unit: 'count',
    defaultTarget: '10',
  },
  {
    category: 'DİJİTAL PAZARLAMA',
    activity: 'INSTAGRAM PAYLAŞIMI',
    description: 'Şirket ve ürünler ile ilgili hikaye paylaşımı',
    unit: 'count',
    defaultTarget: '4',
  },
  {
    category: 'DİJİTAL PAZARLAMA',
    activity: 'YOUTUBE PAYLAŞIMI',
    description: 'Haksan Makina Youtube hesabındaki videoların linkedin ve instagram hesaplarında paylaşılması',
    unit: 'count',
    defaultTarget: '4',
  },
  {
    category: 'DİJİTAL PAZARLAMA',
    activity: 'WHATSAPP DURUM',
    description: 'Şahsi ve şirket hatlarında Haksan Makina paylaşımı',
    unit: 'count',
    defaultTarget: '10',
  },
];

const sharedQuoteTargets: TemplateRow[] = [
  {
    category: 'TEKLİF',
    activity: 'YENİ TEKLİF',
    description: 'Yeni tekliflerde firma baz alınacak',
    unit: 'count',
    defaultTarget: '30',
  },
  {
    category: 'TEKLİF',
    activity: 'TEKLİF DURUM GÜNCELLEMESİ',
    description:
      'Sistemde açık olan tekliflerin durumlarının müşteri ile iletişim kurularak güncellenmesi, iptal veya kayıp olan tekliflerin teklif sahipleri ile iletişim kurularak güncellenmesi',
    unit: 'count',
    defaultTarget: '30',
  },
];

export const inferTemplateMetricKey = (targetType: TargetType, row: TemplateRow): TargetMetricKey | null => {
  const text = `${row.category} ${row.activity}`.toLocaleUpperCase('tr-TR');
  if (text.includes('DİJİTAL PAZARLAMA')) return null;
  if (text.includes('TAHSİLAT')) return 'paymentsInAmount';
  if (targetType === 'sales' && text.includes('SATIŞ HEDEF')) return 'machineDeliveredCount';
  if (targetType === 'sales' && row.unit === 'amount') return 'salesAmount';
  if (targetType === 'service' && text.includes('KURULUM')) return 'installationCompleted';
  if (targetType === 'service' && (text.includes('SERVİS') || text.includes('BAKIM')))
    return row.unit === 'amount' ? 'serviceAmount' : 'serviceCompleted';
  if (targetType === 'finance' && text.includes('ALIŞ FATUR')) return 'purchaseInvoiceAmount';
  if (targetType === 'finance' && row.unit === 'amount') return 'paymentsInAmount';
  if (targetType === 'purchase') return row.unit === 'amount' ? 'purchaseOrderAmount' : 'purchaseOrderCount';
  if (targetType === 'operations' && text.includes('SATIŞ SİPARİŞ'))
    return row.unit === 'amount' ? 'salesOrderAmount' : 'salesOrderCount';
  if (targetType === 'operations' && text.includes('KURULUM')) return 'installationCompleted';
  if (text.includes('ZİYARET')) return 'visitTarget';
  if (text.includes('ARAMA')) return 'callTarget';
  if (text.includes('TEKLİF')) return 'quoteTarget';
  if (text.includes('LEAD')) return 'digitalLeadTarget';
  if (row.unit === 'amount') return 'salesAmount';
  return null;
};

const withTargetType = (targetType: TargetType, rows: TemplateRow[]): TemplateItem[] =>
  rows.map((row) => {
    const metricKey = row.metricKey ?? inferTemplateMetricKey(targetType, row);
    return {
      targetType,
      ...row,
      metricKey,
      trackingMode: row.trackingMode ?? (metricKey ? 'automatic' : 'manual'),
    };
  });

export const TARGET_TEMPLATES: Record<TargetType, TemplateItem[]> = {
  sales: withTargetType('sales', [
    {
      category: 'SATIŞ',
      activity: 'SATIŞ HEDEFİ',
      description: 'Tezgah teslimi yapıldığında hedef gerçekleşmiş olur.',
      unit: 'count',
      defaultTarget: '3',
    },
    {
      category: 'SATIŞ',
      activity: 'TAHSİLAT HEDEFİ',
      description:
        'Satılan tezgahların bedellerinin tahsil edilmesi, sıralı ödemelerin takip edilmesi, açık kalan bakiyenin aylık ciro içindeki payı maksimum %5 olmalı.',
      unit: 'amount',
      defaultTarget: '',
    },
    ...sharedVisitTargets,
    {
      category: 'ARAMA',
      activity: 'MÜŞTERİ MEMNUNİYET ARAMASI',
      description: 'Halihazırdaki cari hesaplarda bulunan müşterimize yapılan telefon araması',
      unit: 'count',
      defaultTarget: '60',
    },
    {
      category: 'ARAMA',
      activity: 'TEKLİF TAKİP ARAMASI',
      description: 'Özellikle şehir dışı müşterilerin teklif durumları ile ilgili aramalar',
      unit: 'count',
      defaultTarget: '40',
    },
    {
      category: 'ARAMA',
      activity: 'YENİ MÜŞTERİ ARAMASI',
      description: 'Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve aranmamış potansiyel müşteri araması',
      unit: 'count',
      defaultTarget: '40',
    },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
  ]),
  service: withTargetType('service', [
    {
      category: 'SATIŞ',
      activity: 'DIŞ SERVİS',
      description: 'Satışını bizim yapmadığımız, tezgahımızı kullanmayan firmalara servis hizmet verme',
      unit: 'amount',
      defaultTarget: '50000',
    },
    {
      category: 'SATIŞ',
      activity: 'PERİYODİK BAKIM',
      description: 'Periyodik bakım hizmet satışı',
      unit: 'count',
      defaultTarget: '3',
    },
    {
      category: 'SATIŞ',
      activity: 'YEDEK PARÇA & AKSESUAR SATIŞI',
      description: 'Yedek parça ve tezgah aksesuarlarının satışı',
      unit: 'amount',
      defaultTarget: '25000',
    },
    ...sharedVisitTargets,
    {
      category: 'ARAMA',
      activity: 'HİZMET MEMNUNİYET ARAMASI',
      description:
        'Servis hizmeti verdiğimiz müşterilerin servis hizmet sonrası aranması, tezgahın bakım/onarım sonrası durumu hakkında bilgi alınması ve hizmet kalitemiz için müşterinin aranması',
      unit: 'count',
      defaultTarget: '40',
    },
    {
      category: 'ARAMA',
      activity: 'TEKLİF TAKİP ARAMASI',
      description: 'Teklif verdiğimiz müşterinin teklifin durumu hakkında aranması',
      unit: 'count',
      defaultTarget: '40',
    },
    {
      category: 'ARAMA',
      activity: 'YENİ MÜŞTERİ ARAMASI',
      description: 'Servis hizmeti verebileceğimiz yeni müşteri tarama araması',
      unit: 'count',
      defaultTarget: '25',
    },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
    {
      category: 'TEKNİK',
      activity: 'DEMO PARÇA ÜRETİMİ',
      description: 'Tezgahlarımızın teknik kabiliyet ve kapasitesini gösteren demo parça işlenmesi, video çekimi',
      unit: 'count',
      defaultTarget: '30',
    },
    {
      category: 'TEKNİK',
      activity: 'MÜŞTERİ BİLGİ PAYLAŞIMI',
      description:
        'Tezgahların kullanım kolaylığı sağlayan fonksiyonlarını, gizli özelliklerini, bakım ipuçları v.s. gibi müşterilere mail yoluyla bilgi paylaşımı, Youtube kanalımıza kısa video hazırlanması',
      unit: 'count',
      defaultTarget: '30',
    },
    {
      category: 'TEKNİK',
      activity: 'TEZGAH ARGE ÇALIŞMASI',
      description: 'Tezgahların teknik olarak eksik kalan, yetersiz kalan ve geliştirilmesi gerek konuların raporlanması',
      unit: 'count',
      defaultTarget: '1',
    },
  ]),
  finance: withTargetType('finance', [
    {
      category: 'FİNANS',
      activity: 'TAHSİLAT',
      description: 'Dönem içinde müşterilerden gelen tahsilat toplamı.',
      unit: 'amount',
      defaultTarget: '',
      metricKey: 'paymentsInAmount',
    },
    {
      category: 'FİNANS',
      activity: 'ALIŞ FATURASI KONTROLÜ',
      description: 'Dönem içinde işlenen alış faturalarının toplam tutarı.',
      unit: 'amount',
      defaultTarget: '',
      metricKey: 'purchaseInvoiceAmount',
    },
    {
      category: 'FİNANS',
      activity: 'CARİ MUTABAKAT',
      description: 'Müşteri ve tedarikçi cari mutabakatlarının tamamlanması.',
      unit: 'count',
      defaultTarget: '20',
      trackingMode: 'manual',
    },
    {
      category: 'FİNANS',
      activity: 'VADE TAKİBİ',
      description: 'Vadesi yaklaşan ve geciken ödemelerin takip edilmesi.',
      unit: 'count',
      defaultTarget: '30',
      trackingMode: 'manual',
    },
  ]),
  purchase: withTargetType('purchase', [
    {
      category: 'SATINALMA',
      activity: 'SATINALMA SİPARİŞİ',
      description: 'Dönem içinde oluşturulan satınalma siparişi adedi.',
      unit: 'count',
      defaultTarget: '20',
      metricKey: 'purchaseOrderCount',
    },
    {
      category: 'SATINALMA',
      activity: 'SATINALMA SİPARİŞ TUTARI',
      description: 'Dönem içinde oluşturulan satınalma siparişlerinin toplam tutarı.',
      unit: 'amount',
      defaultTarget: '',
      metricKey: 'purchaseOrderAmount',
    },
    {
      category: 'TEDARİK',
      activity: 'TEDARİKÇİ GÖRÜŞMESİ',
      description: 'Fiyat, teslim ve termin takibi için yapılan tedarikçi görüşmeleri.',
      unit: 'count',
      defaultTarget: '30',
      trackingMode: 'manual',
    },
  ]),
  operations: withTargetType('operations', [
    {
      category: 'OPERASYON',
      activity: 'SATIŞ SİPARİŞİ',
      description: 'Dönem içinde satış siparişine çevrilen işler.',
      unit: 'count',
      defaultTarget: '15',
      metricKey: 'salesOrderCount',
    },
    {
      category: 'OPERASYON',
      activity: 'SATIŞ SİPARİŞ TUTARI',
      description: 'Dönem içinde oluşturulan satış siparişlerinin toplam tutarı.',
      unit: 'amount',
      defaultTarget: '',
      metricKey: 'salesOrderAmount',
    },
    {
      category: 'OPERASYON',
      activity: 'KURULUM TAMAMLAMA',
      description: 'Dönem içinde tamamlanan kurulum işleri.',
      unit: 'count',
      defaultTarget: '8',
      metricKey: 'installationCompleted',
    },
  ]),
  logistics: withTargetType('logistics', [
    {
      category: 'LOJİSTİK',
      activity: 'SEVKİYAT PLANLAMA',
      description: 'Dönem içinde planlanan sevkiyat operasyonları.',
      unit: 'count',
      defaultTarget: '20',
      trackingMode: 'manual',
    },
    {
      category: 'LOJİSTİK',
      activity: 'TESLİMAT TAKİBİ',
      description: 'Teslimat, evrak ve gümrük adımlarının takip edilmesi.',
      unit: 'count',
      defaultTarget: '20',
      trackingMode: 'manual',
    },
    {
      category: 'LOJİSTİK',
      activity: 'GECİKME AKSİYONU',
      description: 'Geciken teslimatlarda müşteri ve tedarikçi iletişimi.',
      unit: 'count',
      defaultTarget: '10',
      trackingMode: 'manual',
    },
  ]),
  other: withTargetType('other', [
    {
      category: 'GENEL',
      activity: 'PROJE / İYİLEŞTİRME',
      description: 'Departmana özel proje, süreç iyileştirme veya operasyonel iş hedefi.',
      unit: 'count',
      defaultTarget: '1',
      trackingMode: 'manual',
    },
    {
      category: 'GENEL',
      activity: 'EĞİTİM / DOKÜMANTASYON',
      description: 'Ekip içi eğitim, süreç dokümantasyonu veya bilgi paylaşımı.',
      unit: 'count',
      defaultTarget: '2',
      trackingMode: 'manual',
    },
  ]),
};

const allTargetTemplates = () => TARGET_TYPE_ORDER.flatMap((targetType) => TARGET_TEMPLATES[targetType]);

export const targetItemKey = (item: Pick<TargetItem, 'targetType' | 'category' | 'activity'>) =>
  `${item.targetType}:${item.category}:${item.activity}`;

export const MAIN_FIELD_KEYS: MainFieldKey[] = [
  'salesAmount',
  'salesNewCustomers',
  'serviceAmount',
  'serviceCompleted',
  'digitalLeadTarget',
  'digitalConversionTarget',
  'digitalBudget',
  'visitTarget',
  'callTarget',
  'quoteTarget',
];

/** Yeni hedef BOŞ açılır; doldurmak için açık "Şablondan doldur" aksiyonu var. */
export const emptyTarget = (period = currentPeriod()): TargetForm => ({
  period,
  currency: 'USD',
  salesAmount: '',
  salesNewCustomers: '',
  serviceAmount: '',
  serviceCompleted: '',
  digitalLeadTarget: '',
  digitalConversionTarget: '',
  digitalBudget: '',
  visitTarget: '',
  callTarget: '',
  quoteTarget: '',
  targetItems: allTargetTemplates().map((item) => ({ ...item, target: '', manualActual: '' })),
  note: '',
});

const targetValue = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** "1.250.000,50" (TR binlik) ve "1250000.5" / "1250000,5" biçimlerini kabul eder. */
export const parseTargetNumber = (value: string) => {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const turkishThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const plainNumber = /^\d+([.,]\d+)?$/;
  if (!turkishThousands.test(compact) && !plainNumber.test(compact)) return null;
  const normalized = turkishThousands.test(compact)
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(',', '.');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

export const mergeTargetItems = (items: unknown): TargetItem[] => {
  const incoming = Array.isArray(items) ? items : [];
  const byKey = new Map<string, Partial<TargetItem>>();
  incoming.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const maybe = item as Partial<TargetItem>;
    if (!maybe.targetType || !maybe.category || !maybe.activity) return;
    byKey.set(targetItemKey(maybe as TargetItem), maybe);
  });
  return allTargetTemplates().map((template) => {
    const existing = byKey.get(targetItemKey(template));
    return {
      ...template,
      target: targetValue(existing?.target ?? ''),
      manualActual: targetValue(existing?.manualActual ?? ''),
      metricKey: template.metricKey,
      trackingMode: template.trackingMode,
    };
  });
};

export type TargetApiRow = Partial<Record<MainFieldKey, unknown>> & {
  period?: string;
  targetItems?: unknown;
  note?: string | null;
};

export const targetFromApi = (row: TargetApiRow, period = currentPeriod()): TargetForm => ({
  period: row.period ?? period,
  currency: 'USD',
  salesAmount: targetValue(row.salesAmount),
  salesNewCustomers: targetValue(row.salesNewCustomers),
  serviceAmount: targetValue(row.serviceAmount),
  serviceCompleted: targetValue(row.serviceCompleted),
  digitalLeadTarget: targetValue(row.digitalLeadTarget),
  digitalConversionTarget: targetValue(row.digitalConversionTarget),
  digitalBudget: targetValue(row.digitalBudget),
  visitTarget: targetValue(row.visitTarget),
  callTarget: targetValue(row.callTarget),
  quoteTarget: targetValue(row.quoteTarget),
  targetItems: mergeTargetItems(row.targetItems),
  note: row.note ?? '',
});

/** Sunucu `targetUpsertSchema` gövdesi. Tüm alanlar boşsa API atamayı siler ve `null` döner. */
export const targetToApi = (target: TargetForm) => ({
  period: target.period,
  currency: 'USD' as const,
  salesAmount: parseTargetNumber(target.salesAmount),
  salesNewCustomers: parseTargetNumber(target.salesNewCustomers),
  serviceAmount: parseTargetNumber(target.serviceAmount),
  serviceCompleted: parseTargetNumber(target.serviceCompleted),
  digitalLeadTarget: parseTargetNumber(target.digitalLeadTarget),
  digitalConversionTarget: parseTargetNumber(target.digitalConversionTarget),
  digitalBudget: parseTargetNumber(target.digitalBudget),
  visitTarget: parseTargetNumber(target.visitTarget),
  callTarget: parseTargetNumber(target.callTarget),
  quoteTarget: parseTargetNumber(target.quoteTarget),
  targetItems: target.targetItems.map(
    ({ targetType, category, activity, description, unit, target: value, metricKey, trackingMode, manualActual }) => ({
      targetType,
      category,
      activity,
      description,
      unit,
      target: value.trim(),
      metricKey: metricKey ?? undefined,
      trackingMode: trackingMode ?? (metricKey ? ('automatic' as const) : ('manual' as const)),
      manualActual: (manualActual ?? '').trim(),
    })
  ),
  note: target.note.trim() || undefined,
});

export const hasTargetValue = (t?: TargetForm) =>
  !!t &&
  (MAIN_FIELD_KEYS.some((key) => !!t[key]?.trim()) ||
    t.targetItems.some((item) => !!item.target.trim() || !!item.manualActual?.trim()));

export const targetFilledCount = (target: TargetForm, targetType: TargetType) =>
  target.targetItems.filter((item) => item.targetType === targetType && !!item.target.trim()).length;

export const targetTotalCount = (targetType: TargetType) => TARGET_TEMPLATES[targetType].length;

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "2026-10" → "Ekim 2026" (Hermes'te tr-TR ay adları garanti olmadığından sabit tablo). */
export const formatPeriodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return period;
  return `${TR_MONTHS[month - 1]} ${year}`;
};

export const formatTargetNumber = (value: number) => {
  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const [int, frac] = fixed.split('.');
  const grouped = (int ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${frac}` : grouped;
};

export const isInvalidNumberFor = (item: Pick<TargetItem, 'unit'>, raw: string) => {
  if (!raw.trim()) return false;
  const numeric = parseTargetNumber(raw);
  if (numeric === null || numeric < 0) return true;
  return item.unit === 'count' && !Number.isInteger(numeric);
};

export const isInvalidTargetItem = (item: TargetItem) =>
  isInvalidNumberFor(item, item.target) || isInvalidNumberFor(item, item.manualActual ?? '');

export const summarizeTargetItems = (items: TargetItem[]) =>
  items.reduce(
    (summary, item) => {
      const filled = !!item.target.trim();
      const numeric = parseTargetNumber(item.target);
      const invalid = isInvalidTargetItem(item);
      if (filled) summary.filled += 1;
      if (invalid) summary.invalid += 1;
      if (!invalid && numeric !== null) {
        if (item.unit === 'count') summary.countTotal += numeric;
        if (item.unit === 'amount') summary.amountTotal += numeric;
      }
      return summary;
    },
    { filled: 0, total: items.length, countTotal: 0, amountTotal: 0, invalid: 0 }
  );

/** Backend'in sistem verisinden ölçtüğü metrikler (reports.service MEASURED_METRICS aynası). */
export const MEASURED_METRIC_KEYS: TargetMetricKey[] = [
  'salesAmount',
  'salesNewCustomers',
  'quoteTarget',
  'visitTarget',
  'callTarget',
  'serviceCompleted',
  'serviceAmount',
  'digitalLeadTarget',
  'paymentsInAmount',
  'purchaseInvoiceAmount',
  'purchaseOrderAmount',
  'purchaseOrderCount',
  'salesOrderAmount',
  'salesOrderCount',
  'installationCompleted',
  'machineDeliveredCount',
];
const measuredMetricSet = new Set<TargetMetricKey>(MEASURED_METRIC_KEYS);

export const isMeasuredMetric = (key: TargetMetricKey) => measuredMetricSet.has(key);

export const isAutoTracked = (item: Pick<TargetItem, 'metricKey' | 'trackingMode'>) =>
  item.trackingMode !== 'manual' && !!item.metricKey && measuredMetricSet.has(item.metricKey);

export const MAIN_METRIC_FIELDS: { key: MainFieldKey; label: string; unit: 'USD' | 'adet'; metricKey: TargetMetricKey }[] = [
  { key: 'salesAmount', label: 'Satış Cirosu', unit: 'USD', metricKey: 'salesAmount' },
  { key: 'salesNewCustomers', label: 'Yeni Müşteri', unit: 'adet', metricKey: 'salesNewCustomers' },
  { key: 'quoteTarget', label: 'Teklif', unit: 'adet', metricKey: 'quoteTarget' },
  { key: 'visitTarget', label: 'Ziyaret', unit: 'adet', metricKey: 'visitTarget' },
  { key: 'callTarget', label: 'Arama', unit: 'adet', metricKey: 'callTarget' },
  { key: 'serviceAmount', label: 'Servis Cirosu', unit: 'USD', metricKey: 'serviceAmount' },
  { key: 'serviceCompleted', label: 'Tamamlanan Servis', unit: 'adet', metricKey: 'serviceCompleted' },
  { key: 'digitalLeadTarget', label: 'Dijital Fırsat', unit: 'adet', metricKey: 'digitalLeadTarget' },
  { key: 'digitalConversionTarget', label: 'Dijital Dönüşüm', unit: 'adet', metricKey: 'digitalConversionTarget' },
  { key: 'digitalBudget', label: 'Dijital Bütçe', unit: 'USD', metricKey: 'digitalBudget' },
];

export const progressPct = (actual: number | null, target: number | null) =>
  actual != null && target != null && target > 0 ? Math.round((actual / target) * 100) : null;

export const invalidMainFieldCount = (form: TargetForm) =>
  MAIN_METRIC_FIELDS.filter((f) => {
    const value = form[f.key] ?? '';
    return !!value.trim() && parseTargetNumber(value) === null;
  }).length;

export const applyTemplateTargets = (form: TargetForm, targetType?: TargetType): TargetForm => ({
  ...form,
  targetItems: form.targetItems.map((item) =>
    !targetType || item.targetType === targetType ? { ...item, target: item.defaultTarget } : item
  ),
});

export const clearTargets = (form: TargetForm, targetType?: TargetType): TargetForm => ({
  ...form,
  targetItems: form.targetItems.map((item) =>
    !targetType || item.targetType === targetType ? { ...item, target: '', manualActual: '' } : item
  ),
});

export function groupTargetItems(items: TargetItem[]) {
  const groups: { category: string; items: TargetItem[] }[] = [];
  items.forEach((item) => {
    const last = groups[groups.length - 1];
    if (last?.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  });
  return groups;
}

/** Ölçülen metriklerin canlı gerçekleşme ortalaması (web "Dönem temposu"). */
export function livePace(
  form: TargetForm,
  actualFor: (key: TargetMetricKey) => number | null,
  factor: number | null
): number | null {
  const configured = new Map<TargetMetricKey, number>();
  const mainConfigured = new Set<TargetMetricKey>();
  for (const field of MAIN_METRIC_FIELDS) {
    if (!measuredMetricSet.has(field.metricKey)) continue;
    const value = parseTargetNumber(form[field.key] ?? '');
    if (value != null && value > 0) {
      configured.set(field.metricKey, value * (factor ?? 1));
      mainConfigured.add(field.metricKey);
    }
  }
  for (const item of form.targetItems) {
    if (!isAutoTracked(item) || !item.metricKey || mainConfigured.has(item.metricKey)) continue;
    const value = parseTargetNumber(item.target);
    if (value == null || value <= 0) continue;
    configured.set(item.metricKey, (configured.get(item.metricKey) ?? 0) + value * (factor ?? 1));
  }
  const values = [...configured.entries()]
    .map(([key, value]) => progressPct(actualFor(key), value))
    .filter((value): value is number => value != null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + Math.min(100, Math.max(0, value)), 0) / values.length);
}
