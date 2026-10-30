import type { ReferenceInput, ReferenceRecord } from '../../api/references.api';

export type ReferenceRow = {
  id: string;
  /** Elle girilen kayıt; kazanılan fırsat makinesinden türeyen satırda null (salt okunur). */
  record: ReferenceRecord | null;
  firm: string;
  contact: string;
  district: string;
  city: string;
  brand: string;
  model: string;
  deliveryDate: string | undefined;
};

export type AutoDevice = {
  id: string;
  opportunityId?: string | null;
  deliveryDate: string | null;
  installationDate: string | null;
  company: { legalTitle: string; shortName: string | null } | null;
  brandName: string | null;
  model: string | null;
  productModelName: string | null;
};

const dash = (value: string | null | undefined) => (value && value.trim() ? value : '—');

export function manualRows(records: ReferenceRecord[]): ReferenceRow[] {
  return records.map((record) => ({
    id: `ref-${record.id}`,
    record,
    firm: dash(record.firm),
    contact: dash(record.contact),
    district: dash(record.district),
    city: dash(record.city),
    brand: dash(record.brand),
    model: dash(record.model),
    deliveryDate: record.deliveryDate ?? undefined,
  }));
}

/** Web: kazanılan (qualificationStage = win) fırsatlara bağlı makineler otomatik referanstır. */
export function autoRows(devices: AutoDevice[], wonOpportunityIds: ReadonlySet<string>): ReferenceRow[] {
  return devices
    .filter((device) => device.opportunityId && wonOpportunityIds.has(device.opportunityId))
    .map((device) => ({
      id: `device-${device.id}`,
      record: null,
      firm: dash(device.company?.shortName ?? device.company?.legalTitle),
      contact: '—',
      district: '—',
      city: '—',
      brand: dash(device.brandName),
      model: dash(device.model ?? device.productModelName),
      deliveryDate: device.deliveryDate ?? device.installationDate ?? undefined,
    }));
}

const lower = (value: string) => value.toLocaleLowerCase('tr-TR');

export function filterReferenceRows(rows: ReferenceRow[], q: string): ReferenceRow[] {
  const needle = lower(q.trim());
  if (!needle) return rows;
  return rows.filter((row) => [row.firm, row.contact, row.district, row.city, row.brand, row.model].some((v) => lower(v).includes(needle)));
}

export function referenceStats(rows: ReferenceRow[]) {
  return {
    delivered: rows.length,
    firms: new Set(rows.map((r) => r.firm)).size,
    cities: new Set(rows.map((r) => r.city).filter((c) => c !== '—')).size,
    brands: new Set(rows.map((r) => r.brand).filter((b) => b !== '—')).size,
  };
}

export function referenceLocation(row: Pick<ReferenceRow, 'district' | 'city'>, fallback = 'Konum belirtilmedi'): string {
  return [row.district, row.city].filter((v) => v !== '—').join(' / ') || fallback;
}

export function formatReferenceDate(value: string | undefined, style: 'long' | 'short' = 'long'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return style === 'short'
    ? date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export type ReferenceForm = {
  firm: string;
  contact: string;
  district: string;
  city: string;
  brand: string;
  model: string;
  deliveryDate: string;
  notes: string;
};

export const emptyReferenceForm = (): ReferenceForm => ({
  firm: '',
  contact: '',
  district: '',
  city: '',
  brand: '',
  model: '',
  deliveryDate: '',
  notes: '',
});

export function referenceFormFromRecord(record: ReferenceRecord): ReferenceForm {
  return {
    firm: record.firm ?? '',
    contact: record.contact ?? '',
    district: record.district ?? '',
    city: record.city ?? '',
    brand: record.brand ?? '',
    model: record.model ?? '',
    deliveryDate: record.deliveryDate?.slice(0, 10) ?? '',
    notes: record.notes ?? '',
  };
}

/** Web `submit` gövdesi: boş alanlar gönderilmez; firma zorunlu, tarih YYYY-AA-GG. */
export function referencePayload(form: ReferenceForm): { ok: true; body: ReferenceInput } | { ok: false; error: string } {
  const firm = form.firm.trim();
  if (!firm) return { ok: false, error: 'Firma adı zorunludur' };
  const deliveryDate = form.deliveryDate.trim();
  if (deliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(new Date(`${deliveryDate}T00:00:00Z`).getTime()))) {
    return { ok: false, error: 'Teslim tarihini YYYY-AA-GG biçiminde girin' };
  }
  const opt = (value: string) => value.trim() || undefined;
  return {
    ok: true,
    body: {
      firm,
      contact: opt(form.contact),
      district: opt(form.district),
      city: opt(form.city),
      brand: opt(form.brand),
      model: opt(form.model),
      deliveryDate: deliveryDate || undefined,
      notes: opt(form.notes),
    },
  };
}

export const TEMPLATE_HEADERS = ['Firma', 'İlgili', 'İlçe', 'İl', 'Tezgah Markası', 'Tezgah Modeli', 'Teslim Tarihi', 'Not'];
export const TEMPLATE_ROW = ['Örnek Makina San. Ltd. Şti.', 'Ahmet Yılmaz', 'Nilüfer', 'Bursa', 'AORE', 'PG3015', '11.09.2026', ''];

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Web şablonu: `;` ayraçlı, Excel'in Türkçe karakterleri doğru açması için BOM'lu CSV. */
export function referenceTemplateCsv(): string {
  return '\uFEFF' + [TEMPLATE_HEADERS, TEMPLATE_ROW].map((row) => row.map(csvEscape).join(';')).join('\n');
}

/** API sınırı 12.000.000 base64 karakter ≈ 9 MB ham dosya. */
export const IMPORT_MAX_BYTES = Math.floor((12_000_000 * 3) / 4);

export function importFileProblem(file: { name: string; size: number | null | undefined }): string | null {
  const ext = file.name.split('.').pop()?.toLocaleLowerCase('tr-TR') ?? '';
  if (ext !== 'xlsx' && ext !== 'csv') return 'Önce bir .xlsx veya .csv dosyası seçin';
  if (file.size != null && file.size > IMPORT_MAX_BYTES) return 'Dosya en fazla 9 MB olabilir.';
  return null;
}

export const formatKb = (bytes: number) => `${(bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
