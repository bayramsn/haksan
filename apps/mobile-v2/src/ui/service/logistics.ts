/**
 * Web lojistik sayfalarının (ShipmentsPage, InstallationsPage, DeliveriesPage)
 * saf hesapları. Ekranlar yalnız bu fonksiyonları çağırır; node:test ile sınanır.
 */

export type ToneName = 'destructive' | 'warning' | 'success' | 'info' | 'stage' | 'neutral';

/* ------------------------------------------------------------ sevkiyat ---- */

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  preparing: 'Hazırlanıyor',
  in_transit: 'Yolda',
  at_customs: 'Gümrükte',
  cleared: 'Gümrükten Çıktı',
  delivered: 'Teslim Edildi',
};

export const SHIPMENT_STATUS_ORDER = ['preparing', 'in_transit', 'at_customs', 'cleared', 'delivered'] as const;

export const TRANSPORT_MODE_LABELS: Record<string, string> = {
  road: 'Karayolu',
  air: 'Havayolu',
  sea: 'Denizyolu',
  local_cargo: 'Yurtiçi Kargo',
};

export const PACKAGE_UNIT_LABELS: Record<string, string> = {
  package: 'Paket',
  pallet: 'Palet',
  crate: 'Sandık',
  box: 'Koli',
  piece: 'Adet',
};

/** Web CreateServiceRequestDialog/Installation: servis rolü veya "Servis" departmanı. */
export function isServiceStaff(user: { roles?: { code: string }[]; department?: { code?: string | null; name: string } | null }): boolean {
  return Boolean(user.roles?.some((role) => role.code === 'service')) || user.department?.name === 'Servis';
}

export const ROUTE_STEPS = ['Hazır', 'Yolda', 'Gümrük', 'Teslim'] as const;

/** Web routeStep; "Gümrükten Çıktı" gümrük adımını geçmiş sayılır. */
export function routeStep(code: string | null | undefined): number {
  if (code === 'delivered') return 3;
  if (code === 'at_customs' || code === 'cleared') return 2;
  if (code === 'in_transit') return 1;
  return 0;
}

const DAY_MS = 86_400_000;

export function etaState(eta: string | null | undefined, now: number): { label: string; tone: ToneName } {
  if (!eta) return { label: 'ETA yok', tone: 'neutral' };
  const parsed = new Date(eta).getTime();
  if (Number.isNaN(parsed)) return { label: eta, tone: 'neutral' };
  const days = Math.ceil((parsed - now) / DAY_MS);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikmiş`, tone: 'destructive' };
  if (days <= 3) return { label: days === 0 ? 'Bugün' : `${days} gün kaldı`, tone: 'warning' };
  return { label: `${days} gün kaldı`, tone: 'success' };
}

type ShipmentLike = {
  direction: string;
  carrier: string | null;
  status: { code: string } | null;
  company?: { legalTitle: string; shortName: string | null } | null;
  senderCompany?: { legalTitle: string } | null;
  senderName?: string | null;
};

export type ShipmentKpis = { total: number; inTransit: number; customs: number; delivered: number };

export function shipmentKpis(rows: ShipmentLike[]): ShipmentKpis {
  return {
    total: rows.length,
    inTransit: rows.filter((row) => row.status?.code === 'in_transit').length,
    customs: rows.filter((row) => row.status?.code === 'at_customs').length,
    delivered: rows.filter((row) => row.status?.code === 'delivered').length,
  };
}

export function filterShipments<T extends ShipmentLike>(
  rows: T[],
  filters: { status?: string | null; direction?: 'incoming' | 'outgoing' | null },
): T[] {
  return rows.filter(
    (row) =>
      (!filters.status || row.status?.code === filters.status) &&
      (!filters.direction || row.direction === filters.direction),
  );
}

/** "Lojistik Ağı": taşıyıcı başına kayıt sayısı ve yüzde payı. */
export function carrierShare(rows: ShipmentLike[]): { name: string; count: number; share: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.carrier?.trim() || '';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({
    name,
    count,
    share: rows.length ? Math.round((count / rows.length) * 100) : 0,
  }));
}

export function shipmentPartyName(row: ShipmentLike): string | null {
  const customer = row.company?.shortName || row.company?.legalTitle;
  if (customer) return customer;
  if (row.direction === 'incoming') return row.senderCompany?.legalTitle || row.senderName || null;
  return null;
}

export type ShipmentLineDraft = {
  productModelId: string;
  productLabel: string;
  inventoryItemId: string;
  serialNumber: string;
  description: string;
  quantity: string;
  packageQuantity: string;
  packageUnitCode: string;
  packageLengthCm: string;
  packageWidthCm: string;
  packageHeightCm: string;
  grossWeightKg: string;
  packageNotes: string;
};

export type ShipmentDraft = {
  direction: 'incoming' | 'outgoing';
  companyId: string;
  opportunityId?: string;
  deliveryAddressId?: string;
  senderCompanyId: string;
  senderName: string;
  transportMode: 'road' | 'air' | 'sea' | 'local_cargo';
  carrierCompanyId: string;
  carrier: string;
  productCategoryCode: string;
  destinationWarehouseId: string;
  destination: string;
  deliveryAddressSnapshot: string;
  trackingNo: string;
  origin: string;
  loadingDate: string;
  eta: string;
  statusCode: string;
  notes: string;
  lines: ShipmentLineDraft[];
};

export function emptyShipmentLine(): ShipmentLineDraft {
  return {
    productModelId: '',
    productLabel: '',
    inventoryItemId: '',
    serialNumber: '',
    description: '',
    quantity: '1',
    packageQuantity: '',
    packageUnitCode: 'package',
    packageLengthCm: '',
    packageWidthCm: '',
    packageHeightCm: '',
    grossWeightKg: '',
    packageNotes: '',
  };
}

/** Web varsayılan takip numarası: TRK- + 6 hane. */
export function defaultTrackingNo(random: number): string {
  return `TRK-${String(Math.floor(random * 1_000_000)).padStart(6, '0')}`;
}

const trimmed = (value: string) => value.trim() || undefined;
const decimal = (value: string): number | undefined => {
  const text = value.trim().replace(',', '.');
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
const integer = (value: string): number | undefined => {
  const parsed = decimal(value);
  return parsed === undefined ? undefined : Math.floor(parsed);
};

/** YYYY-AA-GG → ISO (öğlen); geçersizse null. */
export function parseDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const date = new Date(`${value.trim()}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const roundTrip = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return roundTrip === value.trim() ? date.toISOString() : null;
}

export function dayInput(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Web CreateShipmentDialog doğrulaması + shipmentCreateSchema gövdesi. */
export function buildShipmentPayload(draft: ShipmentDraft): { error: string } | { body: Record<string, unknown> } {
  if (!draft.trackingNo.trim()) return { error: 'Takip no giriniz' };
  if (!draft.senderCompanyId && !draft.senderName.trim()) return { error: 'Gönderici firma seçin veya yazın' };
  if (!draft.carrierCompanyId && !draft.carrier.trim()) return { error: 'Taşıyıcı firma seçin veya yazın' };
  if (!draft.destinationWarehouseId && !draft.destination.trim() && !draft.deliveryAddressSnapshot.trim()) {
    return { error: 'Varış yeri veya firma adresi seçin' };
  }
  if (!draft.lines.length || draft.lines.some((line) => !line.description.trim() || !(decimal(line.quantity) ?? 0))) {
    return { error: 'Ürün satırlarını tamamlayınız' };
  }
  for (const [label, value] of [['Yüklenme tarihi', draft.loadingDate], ['Tahmini varış', draft.eta]] as const) {
    if (value.trim() && !parseDay(value)) return { error: `${label} YYYY-AA-GG biçiminde olmalı` };
  }
  const body: Record<string, unknown> = {
    direction: draft.direction,
    companyId: draft.companyId || undefined,
    opportunityId: draft.opportunityId || undefined,
    deliveryAddressId: draft.deliveryAddressId || undefined,
    senderCompanyId: draft.senderCompanyId || undefined,
    senderName: draft.senderCompanyId ? undefined : trimmed(draft.senderName),
    transportMode: draft.transportMode,
    carrierCompanyId: draft.carrierCompanyId || undefined,
    carrier: trimmed(draft.carrier),
    productCategoryCode: trimmed(draft.productCategoryCode),
    destinationWarehouseId: draft.destinationWarehouseId || undefined,
    destination: trimmed(draft.destination),
    deliveryAddressSnapshot: trimmed(draft.deliveryAddressSnapshot),
    trackingNo: draft.trackingNo.trim(),
    origin: trimmed(draft.origin),
    loadingDate: draft.loadingDate.trim() ? parseDay(draft.loadingDate) : undefined,
    eta: draft.eta.trim() ? parseDay(draft.eta) : undefined,
    statusCode: draft.statusCode || 'preparing',
    notes: trimmed(draft.notes),
    items: draft.lines.map((line, index) => ({
      inventoryItemId: line.inventoryItemId || undefined,
      productModelId: line.productModelId || undefined,
      description: line.description.trim(),
      serialNumber: trimmed(line.serialNumber),
      quantity: decimal(line.quantity) ?? 1,
      sortOrder: index,
      packageQuantity: integer(line.packageQuantity),
      packageUnitCode: line.packageQuantity.trim() ? line.packageUnitCode || undefined : undefined,
      packageLengthCm: decimal(line.packageLengthCm),
      packageWidthCm: decimal(line.packageWidthCm),
      packageHeightCm: decimal(line.packageHeightCm),
      grossWeightKg: decimal(line.grossWeightKg),
      packageNotes: trimmed(line.packageNotes),
    })),
  };
  return { body: stripUndefined(body) };
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const clean = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(clean)
      : item && typeof item === 'object' && !(item instanceof Date)
        ? stripUndefined(item as Record<string, unknown>)
        : item;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = clean(item);
  }
  return out;
}

/* ------------------------------------------------------------ kurulum ---- */

type InstallationLike = {
  status: { code: string } | null;
  scheduledDate: string | null;
  formData?: Record<string, unknown> | null;
  assignedTo?: { fullName: string } | null;
};

export type InstallationTab = 'open' | 'delivered' | 'forms';

export function installationKpis(rows: InstallationLike[], deliveryCount: number) {
  return {
    total: rows.length,
    planned: rows.filter((row) => row.status?.code === 'scheduled').length,
    completed: rows.filter((row) => row.status?.code === 'completed').length,
    forms: rows.filter((row) => Boolean(row.formData)).length + deliveryCount,
  };
}

export function installationsForTab<T extends InstallationLike>(rows: T[], tab: InstallationTab): T[] {
  if (tab === 'delivered') return rows.filter((row) => row.status?.code === 'completed');
  if (tab === 'forms') return rows.filter((row) => Boolean(row.formData));
  return rows.filter((row) => row.status?.code !== 'completed');
}

/** "Yaklaşan Ziyaretler": planlı kayıtlar tarihe göre. */
export function upcomingInstallations<T extends InstallationLike>(rows: T[]): T[] {
  return rows
    .filter((row) => row.status?.code === 'scheduled')
    .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
}

export const INSTALLATION_JOURNEY = ['Plan', 'Atama', 'Kurulum', 'Teslim', 'Tutanak'] as const;

export function installationStep(row: InstallationLike): number {
  const code = row.status?.code ?? '';
  if (code === 'completed') return row.formData ? 4 : 3;
  if (['in_progress', 'started', 'installation'].includes(code)) return 2;
  return row.assignedTo?.fullName ? 1 : 0;
}

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  istanbul_ici: 'İstanbul içi',
  istanbul_disi: 'İstanbul dışı',
};

export function durationMinutes(hours: string, minutes: string): number {
  return (Number.parseInt(hours || '0', 10) || 0) * 60 + (Number.parseInt(minutes || '0', 10) || 0);
}

/** Web suggestedServiceFormNo: DR- + kimliğin ilk 6 alfanümerik karakteri. */
export function suggestedFormNo(seed: string | null | undefined): string {
  const clean = (seed ?? '').trim();
  if (!clean) return '';
  return `DR-${clean.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
}

/* --------------------------------------------------- kurulum tutanağı ---- */

export type CheckDraft = { id: string; label: string; status: '' | 'done' | 'not_done'; note: string };

export type InstallationFormDraft = {
  formNo: string;
  teslimTarihi: string;
  kurulumTarihi: string;
  machineId: string;
  tezgahMarka: string;
  tezgahTip: string;
  tezgahModel: string;
  tezgahSeriNo: string;
  cncMarka: string;
  cncModel: string;
  cncSeriNo: string;
  cncMainSw: string;
  firma: string;
  ilgili: string;
  adres: string;
  telefon: string;
  faks: string;
  gsm: string;
  eposta: string;
  checks: CheckDraft[];
  problemHasProblem: '' | 'yes' | 'no';
  problemNote: string;
  problemActionNote: string;
  kurulumuYapan: string;
  teslimAlan: string;
  technicalSpecs: { key: string; value: string; unit?: string }[];
};

type InstallationSource = {
  customerDeviceId?: string | null;
  company?: { legalTitle: string; shortName: string | null } | null;
  contact?: { fullName: string } | null;
  customerDevice?: {
    serialNumber: string | null;
    controlUnit?: string | null;
    controlUnitSerialNumber?: string | null;
    model: string | null;
    productModelName: string | null;
    brandName?: string | null;
    productTypeName?: string | null;
    technicalSpecs?: { key: string; value: string; unit?: string | null }[];
  } | null;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Kayıtlı formData + makine/firma bilgisinden düzenlenebilir taslak. Varsayılan
 * kontrol satırları her zaman bulunur; özel satırlar korunur.
 */
export function installationDraft(
  row: InstallationSource,
  formData: Record<string, unknown> | null | undefined,
  defaults: readonly { id: string; label: string }[],
): InstallationFormDraft {
  const data = record(formData);
  const tezgah = record(data.tezgah);
  const cnc = record(data.cnc);
  const user = record(data.kullanici);
  const problem = record(data.problem);
  const device = row.customerDevice;
  const saved = (Array.isArray(data.checks) ? data.checks : []).map(record);
  const toCheck = (item: Record<string, unknown>, fallback: { id: string; label: string }): CheckDraft => ({
    id: text(item.id) || fallback.id,
    label: text(item.label) || fallback.label,
    status: item.status === 'done' || item.status === 'not_done' ? item.status : '',
    note: text(item.note),
  });
  const checks = defaults.map((check) =>
    toCheck(saved.find((item) => item.id === check.id || item.label === check.label) ?? {}, check),
  );
  for (const item of saved) {
    if (!defaults.some((check) => item.id === check.id || item.label === check.label) && text(item.label)) {
      checks.push(toCheck(item, { id: text(item.id) || `custom-${checks.length}`, label: text(item.label) }));
    }
  }
  const specs = Array.isArray(data.technicalSpecs) ? data.technicalSpecs.map(record) : [];
  return {
    formNo: text(data.formNo) || suggestedFormNo(row.customerDeviceId),
    teslimTarihi: dayInput(data.teslimTarihi),
    kurulumTarihi: dayInput(data.kurulumTarihi),
    machineId: text(data.machineId) || row.customerDeviceId || '',
    tezgahMarka: text(tezgah.marka) || device?.brandName || '',
    tezgahTip: text(tezgah.tip) || device?.productTypeName || '',
    tezgahModel: text(tezgah.model) || device?.productModelName || device?.model || '',
    tezgahSeriNo: text(tezgah.seriNo) || device?.serialNumber || '',
    cncMarka: text(cnc.marka),
    cncModel: text(cnc.model) || device?.controlUnit || '',
    cncSeriNo: text(cnc.seriNo) || device?.controlUnitSerialNumber || '',
    cncMainSw: text(cnc.mainSw),
    firma: text(user.firma) || row.company?.legalTitle || '',
    ilgili: text(user.ilgili) || row.contact?.fullName || '',
    adres: text(user.adres),
    telefon: text(user.telefon),
    faks: text(user.faks),
    gsm: text(user.gsm),
    eposta: text(user.eposta),
    checks,
    problemHasProblem: problem.hasProblem === true ? 'yes' : problem.hasProblem === false ? 'no' : '',
    problemNote: text(problem.note),
    problemActionNote: text(problem.actionNote),
    kurulumuYapan: text(data.kurulumuYapan),
    teslimAlan: text(data.teslimAlan),
    technicalSpecs: specs.length
      ? specs.map((spec) => ({ key: text(spec.key), value: text(spec.value), unit: text(spec.unit) || text(spec.specUnit) || undefined }))
      : (device?.technicalSpecs ?? []).map((spec) => ({ key: spec.key, value: spec.value, unit: spec.unit ?? undefined })),
  };
}

/** Web formToPayload ile birebir: boş metinler gönderilmez. */
export function installationPayload(form: InstallationFormDraft): Record<string, unknown> {
  const clean = (value: string) => value.trim() || undefined;
  const day = (value: string) => (value.trim() ? parseDay(value) ?? undefined : undefined);
  return {
    formNo: clean(form.formNo),
    teslimTarihi: day(form.teslimTarihi),
    kurulumTarihi: day(form.kurulumTarihi),
    machineId: form.machineId || undefined,
    tezgah: { marka: clean(form.tezgahMarka), tip: clean(form.tezgahTip), model: clean(form.tezgahModel), seriNo: clean(form.tezgahSeriNo) },
    cnc: { marka: clean(form.cncMarka), model: clean(form.cncModel), seriNo: clean(form.cncSeriNo), mainSw: clean(form.cncMainSw) },
    kullanici: {
      firma: clean(form.firma),
      ilgili: clean(form.ilgili),
      adres: clean(form.adres),
      telefon: clean(form.telefon),
      faks: clean(form.faks),
      gsm: clean(form.gsm),
      eposta: clean(form.eposta),
    },
    checks: form.checks.map((check) => ({ id: check.id, label: check.label, status: check.status || undefined, note: clean(check.note) })),
    problem: {
      hasProblem: form.problemHasProblem ? form.problemHasProblem === 'yes' : undefined,
      note: clean(form.problemNote),
      actionNote: clean(form.problemActionNote),
    },
    kurulumuYapan: clean(form.kurulumuYapan),
    teslimAlan: clean(form.teslimAlan),
    technicalSpecs: form.technicalSpecs
      .filter((spec) => spec.key.trim() && spec.value.trim())
      .map((spec) => ({ key: spec.key.trim(), value: spec.value.trim(), unit: spec.unit?.trim() || undefined })),
  };
}

type CompanyContactSource = {
  addresses?: {
    fullAddress: string | null;
    street: string | null;
    buildingNumber: string | null;
    locality: string | null;
    district: string | null;
    province: string | null;
    isDefault?: boolean;
  }[];
  phones?: { phone: string; phoneType: string; isDefault?: boolean }[];
  emails?: { email: string; isDefault?: boolean }[];
};

export type InstallationUserInfo = { adres: string; telefon: string; faks: string; gsm: string; eposta: string };

/** Web tutanak varsayılanları: firma adresi, telefon/faks/gsm ve e-posta. */
export function companyUserInfo(company: CompanyContactSource | null | undefined): InstallationUserInfo {
  const address = company?.addresses?.find((row) => row.isDefault) ?? company?.addresses?.[0];
  const phones = company?.phones ?? [];
  const type = (row: { phoneType: string }) => row.phoneType.toLocaleLowerCase('tr-TR');
  const fax = phones.find((row) => ['fax', 'faks'].includes(type(row)));
  const gsm = phones.find((row) => ['mobile', 'gsm', 'cep'].includes(type(row)));
  const main = phones.find((row) => row !== fax && row !== gsm && row.isDefault) ?? phones.find((row) => row !== fax && row !== gsm);
  const email = company?.emails?.find((row) => row.isDefault) ?? company?.emails?.[0];
  return {
    adres: address
      ? address.fullAddress?.trim() ||
        [address.street, address.buildingNumber, address.locality, address.district, address.province].filter(Boolean).join(' ')
      : '',
    telefon: main?.phone ?? '',
    faks: fax?.phone ?? '',
    gsm: gsm?.phone ?? '',
    eposta: email?.email ?? '',
  };
}

/** Web cargoLabelDoc alanları: açık adres, ilçe / şehir ve alıcı telefonu. */
export function cargoLabelInfo(company: CompanyContactSource | null | undefined): { adres: string; ilceSehir: string; tel: string } {
  const address = company?.addresses?.find((row) => row.isDefault) ?? company?.addresses?.[0];
  const info = companyUserInfo(company);
  return {
    adres: address
      ? address.fullAddress?.trim() || [address.street, address.buildingNumber, address.locality].filter(Boolean).join(' ')
      : '',
    ilceSehir: address ? [address.district, address.province].filter(Boolean).join(' / ') : '',
    tel: info.telefon || info.gsm,
  };
}

/** Kayıtlı tutanakta boş bırakılmış kullanıcı alanlarını firma bilgisiyle doldurur. */
export function fillUserInfo(form: InstallationFormDraft, info: InstallationUserInfo): InstallationFormDraft {
  return {
    ...form,
    adres: form.adres || info.adres,
    telefon: form.telefon || info.telefon,
    faks: form.faks || info.faks,
    gsm: form.gsm || info.gsm,
    eposta: form.eposta || info.eposta,
  };
}

/** Tamamlama için zorunlu alanlar (mobil tamamlama kuralı + sunucu şeması). */
export function completionError(form: InstallationFormDraft): string | null {
  if (!parseDay(form.kurulumTarihi)) return 'Kurulum tarihi YYYY-AA-GG biçiminde geçerli bir tarih olmalı.';
  if (form.teslimTarihi.trim() && !parseDay(form.teslimTarihi)) return 'Teslim tarihi YYYY-AA-GG biçiminde olmalı.';
  if (form.checks.some((check) => !check.status)) {
    return 'Kontrol çizelgesindeki tüm satırlar Tamamlandı veya Tamamlanmadı olarak işaretlenmeli.';
  }
  if (!form.problemHasProblem) return 'Problem var mı sorusunu yanıtlayın.';
  if (form.problemHasProblem === 'yes' && !form.problemNote.trim()) return 'Problem varsa açıklama girin.';
  return null;
}

/* ------------------------------------------------------------ teslimat ---- */

export const DELIVERY_STATUS_LABELS: Record<string, string> = { pending: 'Bekliyor', completed: 'Tamamlandı' };

type DeliveryLike = { status: string; signedBy: string | null; formData: Record<string, unknown> | null; deliveryDate?: string | null };

export const DELIVERY_JOURNEY = ['Form', 'İmza', 'Teslim'] as const;

export function deliveryKpis(rows: DeliveryLike[]) {
  const completed = rows.filter((row) => row.status === 'completed').length;
  return { total: rows.length, completed, pending: rows.length - completed };
}

export function isDeliveryFormReady(row: DeliveryLike): boolean {
  const data = record(row.formData);
  return Boolean(text(data.formNo).trim() || text(record(data.tezgah).model).trim());
}

/** Web boş imzayı "—" olarak saklar. */
export function isSigned(signedBy: string | null | undefined): boolean {
  const value = signedBy?.trim() ?? '';
  return Boolean(value) && value !== '—';
}

/** Web DeliveriesPage adımı: form hazır → imzalı → tamamlandı. */
export function deliveryStep(row: DeliveryLike): number {
  if (row.status === 'completed') return 3;
  if (isSigned(row.signedBy)) return 2;
  return isDeliveryFormReady(row) ? 1 : 0;
}

/** "Yaklaşan teslim rotası": bekleyen ilk dört kayıt. */
export function upcomingDeliveries<T extends DeliveryLike>(rows: T[]): T[] {
  return rows
    .filter((row) => row.status !== 'completed')
    .sort((a, b) => String(a.deliveryDate ?? '').localeCompare(String(b.deliveryDate ?? '')))
    .slice(0, 4);
}

export type DeliveryDraft = {
  companyId: string;
  opportunityId: string;
  shipmentId: string;
  deliveryDate: string;
  signedBy: string;
  status: 'pending' | 'completed';
  notes: string;
  formNo: string;
  kurulumTarihi: string;
  machineId: string;
  tezgahMarka: string;
  tezgahTip: string;
  tezgahModel: string;
  tezgahSeriNo: string;
  cncMarka: string;
  cncModel: string;
  cncSeriNo: string;
  cncMainSw: string;
  ilgili: string;
  kurulumuYapan: string;
  technicalSpecs: { key: string; value: string; unit?: string }[];
};

export function deliveryDraft(row: {
  companyId: string;
  opportunityId?: string | null;
  shipmentId: string | null;
  deliveryDate: string | null;
  signedBy: string | null;
  status: string;
  notes: string | null;
  formData: Record<string, unknown> | null;
} | null): DeliveryDraft {
  const data = record(row?.formData);
  const tezgah = record(data.tezgah);
  const cnc = record(data.cnc);
  return {
    companyId: row?.companyId ?? '',
    opportunityId: row?.opportunityId ?? '',
    shipmentId: row?.shipmentId ?? '',
    deliveryDate: dayInput(row?.deliveryDate) || dayInput(new Date()),
    signedBy: isSigned(row?.signedBy) ? row?.signedBy ?? '' : '',
    status: row?.status === 'completed' ? 'completed' : 'pending',
    notes: row?.notes ?? '',
    formNo: text(data.formNo),
    kurulumTarihi: dayInput(data.kurulumTarihi),
    machineId: text(data.machineId),
    tezgahMarka: text(tezgah.marka),
    tezgahTip: text(tezgah.tip),
    tezgahModel: text(tezgah.model),
    tezgahSeriNo: text(tezgah.seriNo),
    cncMarka: text(cnc.marka),
    cncModel: text(cnc.model),
    cncSeriNo: text(cnc.seriNo),
    cncMainSw: text(cnc.mainSw),
    ilgili: text(data.ilgili),
    kurulumuYapan: text(data.kurulumuYapan),
    technicalSpecs: (Array.isArray(data.technicalSpecs) ? data.technicalSpecs : [])
      .map(record)
      .map((spec) => ({ key: text(spec.key), value: text(spec.value), unit: text(spec.unit) || undefined }))
      .filter((spec) => spec.key && spec.value),
  };
}

/** Teslimat formunu kurulum tutanağı belge düzenine çevirir (web DeliveryDetailDialog printForm). */
export function deliveryDocument(
  draft: DeliveryDraft,
  firma: string,
  info: InstallationUserInfo,
  fallbackId: string,
): InstallationFormDraft {
  return {
    formNo: draft.formNo || suggestedFormNo(draft.machineId || fallbackId),
    teslimTarihi: draft.deliveryDate,
    kurulumTarihi: draft.kurulumTarihi,
    machineId: draft.machineId,
    tezgahMarka: draft.tezgahMarka,
    tezgahTip: draft.tezgahTip,
    tezgahModel: draft.tezgahModel,
    tezgahSeriNo: draft.tezgahSeriNo,
    cncMarka: draft.cncMarka,
    cncModel: draft.cncModel,
    cncSeriNo: draft.cncSeriNo,
    cncMainSw: draft.cncMainSw,
    firma,
    ilgili: draft.ilgili,
    ...info,
    checks: [],
    problemHasProblem: '',
    problemNote: '',
    problemActionNote: '',
    kurulumuYapan: draft.kurulumuYapan,
    teslimAlan: draft.signedBy && draft.signedBy !== '—' ? draft.signedBy : '',
    technicalSpecs: draft.technicalSpecs,
  };
}

export function buildDeliveryPayload(draft: DeliveryDraft): { error: string } | { body: Record<string, unknown> } {
  if (!draft.companyId) return { error: 'Firma seçiniz' };
  const deliveryDate = parseDay(draft.deliveryDate);
  if (!deliveryDate) return { error: 'Teslim tarihi YYYY-AA-GG biçiminde olmalı' };
  if (draft.kurulumTarihi.trim() && !parseDay(draft.kurulumTarihi)) return { error: 'Kurulum tarihi YYYY-AA-GG biçiminde olmalı' };
  const clean = (value: string) => value.trim() || undefined;
  return {
    body: stripUndefined({
      companyId: draft.companyId,
      opportunityId: draft.opportunityId || undefined,
      shipmentId: draft.shipmentId || undefined,
      deliveryDate,
      signedBy: draft.signedBy.trim() || '—',
      status: draft.status,
      notes: clean(draft.notes),
      formData: {
        formNo: clean(draft.formNo),
        kurulumTarihi: draft.kurulumTarihi.trim() ? parseDay(draft.kurulumTarihi) ?? undefined : undefined,
        machineId: clean(draft.machineId),
        tezgah: { marka: clean(draft.tezgahMarka), tip: clean(draft.tezgahTip), model: clean(draft.tezgahModel), seriNo: clean(draft.tezgahSeriNo) },
        cnc: { marka: clean(draft.cncMarka), model: clean(draft.cncModel), seriNo: clean(draft.cncSeriNo), mainSw: clean(draft.cncMainSw) },
        ilgili: clean(draft.ilgili),
        kurulumuYapan: clean(draft.kurulumuYapan),
        technicalSpecs: draft.technicalSpecs.length ? draft.technicalSpecs : undefined,
      },
    }),
  };
}
