// CRM Alan Ayarları metadata'sı ve saf yardımcıları. Web kaynağı:
// apps/web/src/app/components/pages/settings/lookup-meta.ts, settings-division.ts, LookupManagerTab.tsx.

export const ALL_DIVISIONS = 'all';

export const DIVISION_SCOPED_LOOKUPS = new Set([
  'product-groups',
  'product-categories',
  'product-subcategories',
  'product-types',
  'product-spec-groups',
  'brands',
]);

export type LookupParentField = 'productGroupId' | 'categoryId' | 'subcategoryId';

export const LOOKUP_PARENTS: Record<string, { lookup: string; label: string; field: LookupParentField }> = {
  'product-categories': { lookup: 'product-groups', label: 'Ürün Grubu', field: 'productGroupId' },
  'product-subcategories': { lookup: 'product-categories', label: 'Ürün Kategorisi', field: 'categoryId' },
  'product-types': { lookup: 'product-subcategories', label: 'Ürün Alt Kategorisi', field: 'subcategoryId' },
};

export const SPEC_GROUP_LOOKUP = 'product-spec-groups';
export const BRAND_LOOKUP = 'brands';
export const TAX_OFFICE_LOOKUP = 'tax-offices';

export const lookupLabels: Record<string, string> = {
  'company-sectors': 'Sektörler',
  'contact-sources': 'Firma İrtibat Şekli',
  'company-groups': 'Firma Grupları',
  'company-statuses': 'Firma Durumları',
  'company-relation-types': 'Firma İlişki Türleri',
  'decision-roles': 'Karar Rolleri',
  'user-titles': 'Kullanıcı Ünvanları',
  'activity-types': 'Aktivite Türleri',
  'pipeline-stages': 'Satış Aşamaları',
  'opportunity-statuses': 'Satış Kartı Durumları',
  'quote-statuses': 'Teklif Durumları',
  'proforma-statuses': 'Proforma Durumları',
  'contract-statuses': 'Sözleşme Durumları',
  'product-types': 'Ürün Tipleri',
  brands: 'Ürün Markaları',
  'product-groups': 'Ürün Grupları',
  'product-categories': 'Ürün Kategorileri',
  'product-subcategories': 'Ürün Alt Kategorileri',
  'product-spec-groups': 'Teknik Bilgi Grupları',
  'equipment-types': 'Donanım Tipleri',
  units: 'Birimler',
  'inventory-statuses': 'Stok Durumları',
  'stock-location-statuses': 'Stok Lokasyon Durumları',
  'warranty-statuses': 'Garanti Durumları',
  'service-ticket-statuses': 'Servis Talebi Durumları',
  'installation-statuses': 'Kurulum Durumları',
  'shipment-statuses': 'Sevkiyat Durumları',
  'shipment-package-units': 'Sevkiyat Paket Birimleri',
  'payment-statuses': 'Ödeme Durumları',
  'invoice-statuses': 'Fatura Durumları',
  currencies: 'Para Birimleri',
  'file-document-types': 'Doküman Türleri',
  'storage-providers': 'Depolama Sağlayıcıları',
  'tax-offices': 'Vergi Daireleri',
};

export const lookupUsage: Record<string, string[]> = {
  'company-sectors': ['Firma formu', 'firma filtreleri', 'rapor kırılımları'],
  'contact-sources': ['Firma formu', 'lead kaynağı', 'satış raporları'],
  'company-groups': ['Firma formu', 'portföy filtreleri', 'bölüm ayrımı'],
  'company-statuses': ['Firma kartı', 'firma filtreleri'],
  'company-relation-types': ['Firma ilişkileri', 'tedarikçi/müşteri bağlantıları'],
  'decision-roles': ['Kontak formu', 'karar verici analizi'],
  'user-titles': ['Kullanıcı formu', 'teklif/proforma/sözleşme imza satırı'],
  'activity-types': ['Aktivite formu', 'takvim', 'satış takip raporları'],
  'pipeline-stages': ['Satış kanbanı', 'satış kartı', 'pipeline raporu'],
  'opportunity-statuses': ['Satış kartı', 'fırsat filtreleri'],
  'quote-statuses': ['Teklif listesi', 'teklif onay akışı'],
  'proforma-statuses': ['Proforma listesi', 'doküman durumu'],
  'contract-statuses': ['Sözleşme listesi', 'doküman durumu'],
  'product-categories': ['Ürün formu', 'teklif satırları', 'stok filtreleri'],
  brands: ['Ürün formu', 'teklif satırları', 'fiyat listesi'],
  'product-subcategories': ['Ürün formu', 'teklif satırları', 'ürün daraltma'],
  'product-groups': ['Ürün formu', 'teklif satırları', 'bölüm bazlı katalog'],
  'product-types': ['Ürün formu', 'teklif satırları', 'teknik bilgi şablonları'],
  'product-spec-groups': ['Teknik bilgi', 'ürün özellikleri', 'teklif teknik tablo'],
  'equipment-types': ['Ürün donanımı', 'standart/opsiyonel ekipman'],
  units: ['Teklif kalemleri', 'stok', 'teknik bilgi birimleri'],
  'inventory-statuses': ['Stok kartları', 'stok filtreleri'],
  'stock-location-statuses': ['Stok lokasyonları', 'depo takibi'],
  'warranty-statuses': ['Garanti kayıtları', 'servis filtreleri'],
  'service-ticket-statuses': ['Servis talepleri', 'servis panosu'],
  'installation-statuses': ['Kurulum kayıtları', 'operasyon filtreleri'],
  'shipment-statuses': ['Sevkiyat listesi', 'operasyon filtreleri'],
  'shipment-package-units': ['Sevkiyat formu', 'paket/palet birimi', 'irsaliye paket bilgisi'],
  'payment-statuses': ['Ödeme listesi', 'finans raporları'],
  'invoice-statuses': ['Fatura listesi', 'finans raporları'],
  currencies: ['Teklif', 'fatura', 'rapor para birimi'],
  'file-document-types': ['Doküman yükleme', 'dosya filtreleri'],
  'storage-providers': ['Dosya altyapısı', 'entegrasyon ayarları'],
  'tax-offices': ['Firma formu', 'fatura bilgileri', 'vergi dairesi seçimi'],
};

export const LOOKUP_MENU_GROUPS: { label: string; names: string[] }[] = [
  {
    label: 'Firma',
    names: ['company-sectors', 'company-groups', 'company-statuses', 'company-relation-types', 'contact-sources', 'decision-roles', 'tax-offices'],
  },
  {
    label: 'Satış',
    names: ['pipeline-stages', 'opportunity-statuses', 'activity-types', 'quote-statuses', 'proforma-statuses', 'contract-statuses'],
  },
  {
    label: 'Ürün',
    names: ['product-groups', 'product-categories', 'product-subcategories', 'product-types', 'equipment-types', 'product-spec-groups', 'units', 'brands'],
  },
  {
    label: 'Stok & Servis',
    names: ['inventory-statuses', 'stock-location-statuses', 'warranty-statuses', 'service-ticket-statuses', 'installation-statuses', 'shipment-statuses', 'shipment-package-units'],
  },
  { label: 'Finans', names: ['payment-statuses', 'invoice-statuses', 'currencies'] },
  { label: 'Genel', names: ['user-titles', 'file-document-types', 'storage-providers'] },
];

export const PRODUCT_FLOW_STEPS: { lookupName: string; label: string; helper: string }[] = [
  { lookupName: 'product-groups', label: 'Ürün Grupları', helper: 'CNC, Üniversal, Sac İşleme gibi ana bölüm/grup ayrımı.' },
  { lookupName: 'product-categories', label: 'Ürün Kategorileri', helper: 'Tezgah, yedek parça, aksesuar gibi ürün ailesi.' },
  { lookupName: 'product-subcategories', label: 'Ürün Alt Kategorileri', helper: 'İşleme merkezi, torna veya parçaya ait alt ayrım; kategoriye bağlıdır.' },
  { lookupName: 'product-types', label: 'Ürün Tipleri', helper: 'Alt kategoriye bağlı ürün/tezgah tipi; teknik bilgi şablonlarının anahtarıdır.' },
  { lookupName: 'equipment-types', label: 'Donanım Tipleri', helper: 'Standart ve opsiyonel donanım sınıfları.' },
  { lookupName: 'product-spec-groups', label: 'Teknik Bilgi Grupları', helper: 'Teknik özellikleri tabloda gruplayan başlıklar.' },
  { lookupName: 'units', label: 'Birimler', helper: 'Teklif, stok ve teknik bilgi ölçü birimleri.' },
];

export const lookupLabel = (name: string) => lookupLabels[name] ?? name;
export const flowStepIndex = (name: string) => PRODUCT_FLOW_STEPS.findIndex((step) => step.lookupName === name);

export type DivisionLike = { id: string; code?: string | null; name?: string | null };

const upperTr = (value?: string | null) => String(value ?? '').trim().toLocaleUpperCase('tr-TR');
const asciiUpper = (value?: string | null) =>
  upperTr(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'I');

export function isCncDivision(divisions: DivisionLike[], divisionId?: string) {
  if (!divisionId || divisionId === ALL_DIVISIONS) return false;
  const division = divisions.find((item) => item.id === divisionId);
  return upperTr(division?.code) === 'CNC' || upperTr(division?.name) === 'CNC';
}

export function divisionCatalogGroupCode(divisions: DivisionLike[], divisionId?: string): 'CNC' | 'UNIVERSAL' | 'SAC_ISLEME' | undefined {
  if (!divisionId || divisionId === ALL_DIVISIONS) return undefined;
  const division = divisions.find((item) => item.id === divisionId);
  const text = asciiUpper(division?.code) || asciiUpper(division?.name);
  if (!text) return undefined;
  if (text.includes('CNC')) return 'CNC';
  if (text.includes('UNIVERSAL')) return 'UNIVERSAL';
  if (text.includes('SAC')) return 'SAC_ISLEME';
  return undefined;
}

/** Ayar bölümü seçenekleri: katalog grubuna eşlenebilen bölümler (web `resolveSettingsDivision`). */
export function settingsDivisions<T extends DivisionLike>(divisions: T[]) {
  return divisions.filter((division) => divisionCatalogGroupCode(divisions, division.id));
}

export function resolveSettingsDivision(divisions: DivisionLike[], wanted?: string | null, fallback?: string | null) {
  const allowed = settingsDivisions(divisions);
  return allowed.find((d) => d.id === wanted)?.id ?? allowed.find((d) => d.id === fallback)?.id ?? allowed[0]?.id ?? '';
}

/** Menü grupları + arama; bilinmeyen listeler "Diğer" altında alfabetik. */
export function lookupMenuGroups(available: string[], query: string) {
  const names = new Set(available.length ? available : Object.keys(lookupLabels));
  const grouped = new Set(LOOKUP_MENU_GROUPS.flatMap((group) => group.names));
  const rest = [...names].filter((name) => !grouped.has(name)).sort((a, b) => lookupLabel(a).localeCompare(lookupLabel(b), 'tr-TR'));
  const groups = LOOKUP_MENU_GROUPS.map((group) => ({ label: group.label, names: group.names.filter((name) => names.has(name)) }));
  if (rest.length) groups.push({ label: 'Diğer', names: rest });
  const term = query.trim().toLocaleLowerCase('tr-TR');
  return groups
    .map((group) => ({
      label: group.label,
      names: term ? group.names.filter((name) => lookupLabel(name).toLocaleLowerCase('tr-TR').includes(term)) : group.names,
    }))
    .filter((group) => group.names.length > 0);
}

export type LookupRowLike = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  province?: string | null;
  divisionId?: string | null;
  productGroupId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productTypeIds?: string[];
  companyName?: string | null;
  companyNo?: string | null;
};

export type LookupStatusFilter = 'active' | 'passive' | 'all';

export function filterLookupRows<T extends LookupRowLike>(
  rows: T[],
  opts: {
    query: string;
    status: LookupStatusFilter;
    scoped: boolean;
    includeShared: boolean;
    parentField?: LookupParentField;
    parentFilterId: string;
  }
) {
  const term = opts.query.trim().toLocaleLowerCase('tr-TR');
  return rows.filter((row) => {
    if (opts.scoped && !opts.includeShared && !row.divisionId) return false;
    if (opts.status === 'active' && row.isActive === false) return false;
    if (opts.status === 'passive' && row.isActive !== false) return false;
    if (opts.parentField && opts.parentFilterId !== 'all') {
      const parentId = row[opts.parentField] ?? null;
      if (parentId != null && parentId !== opts.parentFilterId) return false;
    }
    if (!term) return true;
    return [row.name, row.description ?? '', row.province ?? '', row.code, row.companyName ?? '', row.companyNo ?? ''].some((value) =>
      String(value).toLocaleLowerCase('tr-TR').includes(term)
    );
  });
}

/**
 * Görünen satırlar içinde `sourceId`'yi bir adım taşır; gizli satırlar yerinde kalır
 * ve tüm liste 10'ar artan `sortOrder` ile yeniden numaralanır (web `reorderLookupRows`).
 */
export function moveLookupRow<T extends LookupRowLike>(all: T[], visible: T[], sourceId: string, direction: -1 | 1): T[] | null {
  const sourceIndex = visible.findIndex((row) => row.id === sourceId);
  const targetIndex = sourceIndex + direction;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= visible.length) return null;
  const reorderedVisible = [...visible];
  const [moved] = reorderedVisible.splice(sourceIndex, 1);
  if (!moved) return null;
  reorderedVisible.splice(targetIndex, 0, moved);
  const visibleIds = new Set(reorderedVisible.map((row) => row.id));
  let cursor = 0;
  return all
    .map((row) => (visibleIds.has(row.id) ? reorderedVisible[cursor++] ?? row : row))
    .map((row, index): T => ({ ...row, sortOrder: (index + 1) * 10 }));
}

export function specGroupTypeSummary(ids: string[] | undefined, names: Map<string, string>) {
  const list = ids ?? [];
  if (!list.length) return 'Tüm tipler';
  const labels = list.map((id) => names.get(id) ?? '?');
  return labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ');
}

export const auditActionLabel = (action: string) =>
  ({
    'lookup.created': 'Eklendi',
    'lookup.updated': 'Güncellendi',
    'lookup.reordered': 'Sıralandı',
    'lookup.deleted': 'Silindi',
    'lookup.deactivated': 'Pasifleştirildi',
  })[action] ?? action;

export function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type LookupExportRow = LookupRowLike & { isOwned?: boolean; logoUrl?: string | null };

/** Web `exportLookupCsv` ile aynı sütunlar; BOM + `;` ayraç. */
export function buildLookupCsv(
  rows: LookupExportRow[],
  ctx: {
    isBrand: boolean;
    parent?: { label: string; field: LookupParentField };
    isSpecGroup: boolean;
    divisionLabel: (id?: string | null) => string;
    parentName: (id: string) => string | undefined;
    productTypeName: (id: string) => string | undefined;
  }
) {
  const headers = [
    'Ad',
    'Açıklama',
    ...(ctx.isBrand ? ['Bağlı Firma', 'Kendi Markamız', 'Logo'] : []),
    'Durum',
    'Sıra',
    'İl',
    'Bölüm',
    ...(ctx.parent ? [`Bağlı Olduğu ${ctx.parent.label}`] : []),
    ...(ctx.isSpecGroup ? ['Ürün Tipleri'] : []),
    'Sistem Kodu',
  ];
  const lines = rows.map((row) => {
    const parentId = ctx.parent ? row[ctx.parent.field] ?? null : null;
    return [
      row.name,
      row.description ?? '',
      ...(ctx.isBrand ? [row.isOwned ? 'Haksan Makina' : row.companyName ?? '', row.isOwned ? 'Evet' : 'Hayır', row.logoUrl ?? ''] : []),
      row.isActive === false ? 'Pasif' : 'Aktif',
      row.sortOrder ?? 0,
      row.province ?? '',
      row.divisionId ? ctx.divisionLabel(row.divisionId) : '',
      ...(ctx.parent ? [parentId ? ctx.parentName(parentId) ?? '' : 'Tümü'] : []),
      ...(ctx.isSpecGroup ? [(row.productTypeIds ?? []).map((id) => ctx.productTypeName(id) ?? id).join(', ') || 'Tüm tipler'] : []),
      row.code,
    ]
      .map(csvEscape)
      .join(';');
  });
  return '\uFEFF' + [headers.join(';'), ...lines].join('\n');
}

export function lookupTemplateCsv(parent: { label: string } | undefined, isSpecGroup: boolean) {
  const headers = ['Ad', 'Sistem Kodu', 'Açıklama', 'Durum', 'Sıra', 'Bölüm', ...(parent ? [`Bağlı Olduğu ${parent.label}`] : []), ...(isSpecGroup ? ['Ürün Tipleri'] : [])];
  return '\uFEFF' + headers.join(';') + '\n';
}

export type LookupAuditLike = {
  action: string;
  resourceId: string | null;
  oldValues: Record<string, unknown> | null;
};

/** Geçmiş kaydını geri almak için gereken işlem (web `revertHistory`). */
export function lookupRevertPlan(
  item: LookupAuditLike,
  ctx: { isTaxOffice: boolean; scoped: boolean; parentField?: LookupParentField; isSpecGroup: boolean }
): { kind: 'delete'; id: string } | { kind: 'update'; id: string; body: Record<string, unknown> } | null {
  if (item.action === 'lookup.created' && item.resourceId) return { kind: 'delete', id: item.resourceId };
  const old = (item.oldValues ?? {}) as Partial<LookupRowLike>;
  const id = old.id ?? item.resourceId;
  if (!id) return null;
  return {
    kind: 'update',
    id: String(id),
    body: {
      code: old.code || undefined,
      name: old.name,
      description: old.description ?? undefined,
      province: ctx.isTaxOffice ? old.province ?? undefined : undefined,
      divisionId: ctx.scoped ? old.divisionId ?? null : undefined,
      parentId: ctx.parentField ? old[ctx.parentField] ?? null : undefined,
      productTypeIds: ctx.isSpecGroup ? old.productTypeIds ?? [] : undefined,
      sortOrder: old.sortOrder ?? 0,
      isActive: old.isActive !== false,
    },
  };
}

export const canRevertLookupAudit = (item: LookupAuditLike) =>
  item.action === 'lookup.created' || Boolean((item.oldValues as { id?: unknown } | null)?.id || item.resourceId);
