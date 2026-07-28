import { API_BASE_URL, getAccessToken } from './apiClient';

/** Query string oluşturur; undefined/null değerleri atlar. */
function buildQs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/**
 * Backend .xlsx export uçlarından dosya indirir.
 * path: `/exports/companies` veya `/reports/export/year-end` gibi API yolu (prefix hariç).
 */
export async function downloadExport(
  path: string,
  filename: string,
  params?: Record<string, string | number | undefined | null>
): Promise<void> {
  const token = getAccessToken();
  const qs = buildQs(params);
  const res = await fetch(`${API_BASE_URL}${path}${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    let message = `İndirme başarısız (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // binary response
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Gövde gerektiren export uçları için POST varyantı: indirilen dosya istemcideki
 * duruma (ör. ekrandaki alan listesi) göre üretiliyorsa query string yetmez.
 */
export async function downloadExportPost(path: string, filename: string, body: unknown): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `İndirme başarısız (HTTP ${res.status})`;
    try {
      const payload = await res.json();
      if (payload?.error?.message) message = payload.error.message;
      else if (payload?.message) message = payload.message;
    } catch {
      // binary response
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type TechnicalTemplateField = {
  key: string;
  groupCode?: string;
  unit?: string;
  section?: string;
  value?: string;
};

export const exportService = {
  companies: (params?: Record<string, string | undefined>) =>
    downloadExport('/exports/companies', 'firmalar.xlsx', params),
  contacts: (params?: Record<string, string | undefined>) =>
    downloadExport('/exports/contacts', 'kontaklar.xlsx', params),
  opportunities: (params?: Record<string, string | undefined>) =>
    downloadExport('/exports/opportunities', 'satis-kartlari.xlsx', params),
  quotes: (params?: Record<string, string | undefined>) =>
    downloadExport('/exports/quotes', 'teklifler.xlsx', params),
  finance: () => downloadExport('/exports/finance', 'kasa-hareketleri.xlsx'),
  customerStatement: (companyId: string, filename?: string, params?: Record<string, string | number | undefined | null>) =>
    downloadExport('/exports/customer-statement/' + companyId, filename ?? `cari-ekstre-${companyId}.xlsx`, params),
  customerStatementPdf: (companyId: string, filename?: string, params?: Record<string, string | number | undefined | null>) =>
    downloadExport('/exports/customer-statement/' + companyId, filename ?? `cari-ekstre-${companyId}.pdf`, { format: 'pdf', ...params }),
  customerBalances: () => downloadExport('/exports/customer-balances', 'cari-rapor.xlsx'),
  serviceTickets: () => downloadExport('/exports/service-tickets', 'servis-talepleri.xlsx'),
  serviceComplaints: () => downloadExport('/exports/service-complaints', 'sikayet-kutusu.xlsx'),
  inventory: (params?: Record<string, string | undefined>) =>
    downloadExport('/exports/inventory', 'stok.xlsx', params),
  shipments: () => downloadExport('/exports/shipments', 'sevkiyatlar.xlsx'),
  deliveries: () => downloadExport('/exports/deliveries', 'teslimatlar.xlsx'),
  purchaseOrders: (params?: Record<string, string | undefined>) =>
    downloadExport('/exports/purchase-orders', 'satinalma-siparisleri.xlsx', params),
  documents: () => downloadExport('/exports/documents', 'dokumanlar.xlsx'),
  operational: (year: number, period: 'monthly' | 'yearly') =>
    downloadExport('/exports/operational', period === 'monthly' ? `rapor-${year}.xlsx` : 'rapor-yillik.xlsx', {
      year,
      period,
    }),
  yearEnd: (year: number) => downloadExport('/reports/export/year-end', `karlilik-raporu-${year}.xlsx`, { year }),
  departmentPerformance: (period: string, departmentId?: string) =>
    downloadExport(
      '/reports/export/department-performance',
      `departman-raporu-${period}.xlsx`,
      { period, ...(departmentId ? { departmentId } : {}) }
    ),
  pipelineSummary: () => downloadExport('/reports/export/pipeline-summary', 'pipeline-summary.xlsx'),
  stockSummary: () => downloadExport('/reports/export/stock-summary', 'stock-summary.xlsx'),
  productImportTemplate: () => downloadExport('/products/import/template', 'urun-import-sablonu.xlsx'),
  technicalImportTemplate: (options: {
    productTypeCode: string;
    productTypeLabel?: string;
    format?: 'xlsx' | 'csv';
    includeValues?: boolean;
    fields?: TechnicalTemplateField[];
  }) => {
    const format = options.format ?? 'xlsx';
    const slug = (options.productTypeLabel || options.productTypeCode)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'teknik-bilgi';
    return downloadExportPost('/admin/technical-import/template', `${slug}-teknik-sablon.${format}`, {
      productTypeCode: options.productTypeCode,
      productTypeLabel: options.productTypeLabel,
      format,
      includeValues: options.includeValues ?? true,
      fields: options.fields ?? [],
    });
  },
};
