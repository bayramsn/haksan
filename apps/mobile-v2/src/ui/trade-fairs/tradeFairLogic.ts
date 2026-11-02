import type {
  TradeFairContact,
  TradeFairContactBody,
  TradeFairFlags,
  TradeFairStaff,
  TradeFairSummary,
} from '../../api/trade-fairs.api';

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

export function followUpDraft(row: TradeFairContact): TradeFairFlags {
  return { called: Boolean(row.calledAt), quoted: Boolean(row.quotedAt) };
}

export function tradeFairRowTone(row: Pick<TradeFairContact, 'calledAt' | 'quotedAt' | 'companyId' | 'opportunityId'>): 'success' | 'warning' | null {
  if (row.quotedAt || row.companyId || row.opportunityId) return 'success';
  if (row.calledAt) return 'warning';
  return null;
}

/** Bölüm değişiminde önceki bölümün ürünleri taşınmaz. */
export function changeTradeFairDivision(form: TradeFairContactBody, divisionId: string): TradeFairContactBody {
  return form.divisionId === divisionId ? form : { ...form, divisionId, productModelIds: [], productCategory: '', productType: '' };
}

export function toggleTradeFairProduct(form: TradeFairContactBody, product: { id: string; name: string; category: string | null }): TradeFairContactBody {
  const selected = form.productModelIds ?? [];
  if (selected.includes(product.id)) return { ...form, productModelIds: selected.filter((id) => id !== product.id) };
  if (selected.length >= 20) return form;
  return { ...form, productModelIds: [...selected, product.id], productCategory: product.category ?? form.productCategory, productType: product.name };
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
    divisionId: '',
    productModelIds: [],
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
    out[key] = (row as unknown as Record<string, unknown>)[key] ?? base[key];
  }
  out.productModelIds = row.products.map((p) => p.id);
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

/** Gecikmiş native onaylar hesap değişiminden veya ekran kapanışından sonra yazamaz. */
export function createTradeFairActionGuard(context: string, readContext: () => string) {
  let alive = true;
  let busy = false;
  const isCurrent = () => alive && context === readContext();
  return {
    isCurrent,
    begin: () => { if (!isCurrent() || busy) return false; busy = true; return true; },
    finish: () => { busy = false; },
    activate: () => { alive = true; },
    dispose: () => { alive = false; },
  };
}

/** Başarılı ilk işaret, ikinci istek hata verse de tekrar gönderilmez. */
export async function saveTradeFairFlags(
  form: TradeFairFlags,
  confirmed: TradeFairFlags,
  save: (flag: keyof TradeFairFlags, value: boolean) => Promise<unknown>,
  isCurrent: () => boolean,
): Promise<boolean> {
  for (const flag of ['called', 'quoted'] as const) {
    if (!isCurrent()) return false;
    if (form[flag] !== confirmed[flag]) {
      await save(flag, form[flag]);
      confirmed[flag] = form[flag];
    }
  }
  return isCurrent();
}

export type TradeFairListFilters = {
  fairName: string | null;
  q: string;
  divisionId: string | null;
  metByUserId: string | null;
  province: string | null;
  district: string | null;
};

/** Web `listParams` ile aynı: boş süzgeç gönderilmez, il yoksa ilçe de gitmez. */
export function tradeFairListParams(filters: TradeFairListFilters) {
  const pick = (value: string | null | undefined) => value?.trim() || undefined;
  const province = pick(filters.province);
  return {
    fairName: pick(filters.fairName),
    q: pick(filters.q),
    divisionId: pick(filters.divisionId),
    metByUserId: pick(filters.metByUserId),
    province,
    district: province ? pick(filters.district) : undefined,
  };
}

/** Görüşen süzgeci yalnız görüşmesi olanları listeler; seçili kişi özetten düşerse kaybolmasın (web `metByOptions`). */
export function metByFilterOptions(
  byUser: TradeFairSummary['byUser'],
  selected: string | null,
  staff: TradeFairStaff[],
): { value: string; label: string }[] {
  const options = byUser
    .filter((u): u is typeof u & { userId: string } => Boolean(u.userId))
    .map((u) => ({ value: u.userId, label: u.fullName ?? 'Belirtilmemiş' }));
  if (selected && !options.some((o) => o.value === selected)) {
    options.push({ value: selected, label: staff.find((s) => s.id === selected)?.fullName ?? 'Seçili kişi' });
  }
  return options;
}

/** Aynı dosya birden çok görüşmeye bağlı olabilir; anahtar bağlantı başınadır. */
export function tradeFairPhotoKey(photo: { contactId: string; fileId: string }): string {
  return `${photo.contactId}:${photo.fileId}`;
}

/** Yetkili görsel önizlemesi (web `fileService.imagePreview`). */
export function filePreviewPath(fileId: string): string {
  return `/files/${encodeURIComponent(fileId)}/preview`;
}
