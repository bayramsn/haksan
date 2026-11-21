import type { CommercialPdfKind, CommercialPdfStatus } from '@haksan/shared';
import { api, API_BASE_URL, getAccessToken, getActiveDivision, getActiveDepartment, refreshSession } from './apiClient';
const collections = { quote: 'quotes', proforma: 'proformas', contract: 'contracts' } as const;
const path = (kind: CommercialPdfKind, id: string) => `/${collections[kind]}/${encodeURIComponent(id)}/pdf`;

export const commercialPdfService = {
  status: (kind: CommercialPdfKind, id: string) => api.get<CommercialPdfStatus>(`${path(kind, id)}/status`),
  prepare: (kind: CommercialPdfKind, id: string, options?: { headerLogoMode?: 'haksan' | 'company' | 'none' }) => api.post<CommercialPdfStatus>(path(kind, id), options),
  async requireReady(kind: CommercialPdfKind, id: string): Promise<CommercialPdfStatus> {
    const status = await commercialPdfService.status(kind, id);
    if (status.status !== 'ready') {
      throw new Error(status.status === 'missing'
        ? 'PDF henüz hazırlanmadı. Belgeyi güncelleme yetkisi olan bir kullanıcı webde “PDF Hazırla / Yenile” işlemini kullanmalıdır.'
        : 'Belge değişti; PDF güncel değil. Belgeyi güncelleme yetkisi olan bir kullanıcı webde “PDF Hazırla / Yenile” işlemini kullanmalıdır.');
    }
    return status;
  },
  async present(kind: CommercialPdfKind, id: string, mode: 'download' | 'open', prepare = false, options?: { headerLogoMode?: 'haksan' | 'company' | 'none' }): Promise<void> {
    // Tablet tarayıcıları (iPad Safari, Android Chrome) dokunuştan sonra beklemeyle açılan
    // sekmeyi engeller; sekme dokunuş anında boş açılır, PDF gelince içine yüklenir.
    const tab = mode === 'open' ? window.open('', '_blank') : null;
    if (tab) {
      tab.opener = null;
      tab.document.title = 'PDF hazırlanıyor…';
      if (tab.document.body) tab.document.body.textContent = 'PDF hazırlanıyor…';
    }
    try {
      await commercialPdfService.fetchAndShow(kind, id, mode, prepare, options, tab);
    } catch (error) {
      tab?.close();
      throw error;
    }
  },
  async fetchAndShow(kind: CommercialPdfKind, id: string, mode: 'download' | 'open', prepare: boolean, options: { headerLogoMode?: 'haksan' | 'company' | 'none' } | undefined, tab: Window | null): Promise<void> {
    if (prepare) await commercialPdfService.prepare(kind, id, options);
    else await commercialPdfService.requireReady(kind, id);
    const download = () => {
      const token = getAccessToken();
      return fetch(`${API_BASE_URL}${path(kind, id)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Active-Division': getActiveDivision() ?? 'all',
          'X-Active-Department': getActiveDepartment() ?? 'all' },
        credentials: 'include',
      });
    };
    let response = await download();
    if (response.status === 401 && await refreshSession()) response = await download();
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message ?? body?.message ?? `PDF alınamadı (HTTP ${response.status}).`);
    }
    if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Sunucu geçerli bir PDF döndürmedi.');
    const url = URL.createObjectURL(await response.blob());
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (tab) {
      tab.location.href = url;
      return;
    }
    const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `${kind}-${id}.pdf`;
    const link = document.createElement('a');
    link.href = url;
    if (mode === 'open') { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    else link.download = filename;
    link.click();
  },
};
