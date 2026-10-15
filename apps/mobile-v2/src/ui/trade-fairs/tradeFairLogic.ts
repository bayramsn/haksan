import type {
  TradeFairContact,
  TradeFairContactBody,
  TradeFairContactMethod,
  TradeFairFollowUp,
  TradeFairStaff,
  TradeFairSummary,
} from '../../api/trade-fairs.api';

export const CONTACT_METHODS: { value: TradeFairContactMethod; label: string }[] = [
  { value: 'phone', label: 'Telefon' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-posta' },
  { value: 'in_person', label: 'Yüz yüze' },
  { value: 'other', label: 'Diğer' },
];

/** Web ile aynı ek kısıtları: uzantıdan türetilen MIME, en fazla 25 MB. */
export const ATTACHMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'webp'] as const;
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export function attachmentProblem(file: { name: string; extension: string; sizeBytes: number }): string | null {
  if (!(ATTACHMENT_EXTENSIONS as readonly string[]).includes(file.extension.toLocaleLowerCase('tr-TR'))) {
    return `${file.name}: PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz.`;
  }
  if (file.sizeBytes > ATTACHMENT_MAX_BYTES) return `${file.name}: dosya 25 MB'ı aşamaz.`;
  return null;
}

export const emptyFollowUp = (): TradeFairFollowUp => ({
  contacted: false,
  contactMethod: null,
  contactDate: null,
  contactNotes: null,
  offerSent: false,
  customerConverted: false,
});

/** Europe/Istanbul takvim günü (`YYYY-MM-DD`). */
export const istanbulToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(now);

/** Web `openFollowUp`: "Görüşüldü" kutusuna basınca işaretli ve bugünün tarihiyle açılır. */
export function followUpDraft(row: TradeFairContact, markContacted: boolean, now = new Date()): TradeFairFollowUp {
  return {
    contacted: markContacted ? true : row.contacted,
    contactMethod: row.contactMethod ?? null,
    contactDate: row.contactDate ?? istanbulToday(now),
    contactNotes: row.contactNotes ?? '',
    offerSent: row.offerSent ?? false,
    customerConverted: row.customerConverted ?? false,
  };
}

/** Satır rengi: teklif/müşteri → yeşil, görüşüldü → sarı. */
export function tradeFairRowTone(row: TradeFairFollowUp): 'success' | 'warning' | null {
  if (row.offerSent || row.customerConverted) return 'success';
  if (row.contacted) return 'warning';
  return null;
}

export function tradeFairLocation(row: Pick<TradeFairContact, 'district' | 'province' | 'country'>): string {
  return [row.district, row.province, row.country !== 'Türkiye' ? row.country : null].filter(Boolean).join(' / ') || '—';
}

export function distinctSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b, 'tr-TR'),
  );
}

export function emptyContactForm(fairName = '', metByUserId = ''): TradeFairContactBody {
  return {
    ...emptyFollowUp(),
    fairName,
    companyName: '',
    contactName: '',
    contactTitle: '',
    mobilePhone: '',
    email: '',
    country: 'Türkiye',
    province: '',
    district: '',
    productCategory: '',
    productType: '',
    notes: '',
    metByUserId: metByUserId || null,
    visitorCount: 1,
  };
}

/** Kayıttan form değerleri: boş alanlar varsayılanlara düşer. */
export function formFromRow(row: TradeFairContact): TradeFairContactBody {
  const base = emptyContactForm();
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof TradeFairContactBody)[]) {
    out[key] = row[key] ?? base[key];
  }
  return out as TradeFairContactBody;
}

/** Görüşen çalışan sonradan ayrıldıysa seçim boş görünmesin. */
export function staffOptions(staff: TradeFairStaff[], editing: TradeFairContact | null): TradeFairStaff[] {
  if (editing?.metByUserId && !staff.some((s) => s.id === editing.metByUserId)) {
    return [...staff, { id: editing.metByUserId, fullName: `${editing.metByName ?? 'Silinmiş kullanıcı'} (ayrıldı)` }];
  }
  return staff;
}

export function summaryTotals(summary: TradeFairSummary | undefined) {
  const byUser = summary?.byUser ?? [];
  return {
    fairs: summary?.fairs.length ?? 0,
    meetings: byUser.reduce((sum, u) => sum + u.meetings, 0),
    people: byUser.reduce((sum, u) => sum + u.people, 0),
    staff: byUser.length,
  };
}

/** Web `canDeleteRow`: silme izni + yönetici ya da kaydı oluşturan. */
export function canDeleteTradeFair(
  row: Pick<TradeFairContact, 'createdBy'>,
  ctx: { canDelete: boolean; isManager: boolean; userId: string | null | undefined },
): boolean {
  return ctx.canDelete && (ctx.isManager || (Boolean(ctx.userId) && row.createdBy === ctx.userId));
}

/** Kategoriye göre ürün tipi önerileri; kategori boşsa tümü. */
export function productTypeOptions(products: { category: string | null; type: string | null }[], category: string | null | undefined): string[] {
  return distinctSorted(products.filter((p) => !category || p.category === category).map((p) => p.type));
}
