export type PdfDocumentKind = 'quote' | 'proforma' | 'contract' | 'invoice';

/**
 * Canlı API ile uyumlu PDF uçları: teklif `POST quotes/:id/generate-pdf`;
 * proforma/sözleşme sunucuda hazırlanır (`POST :id/pdf`) ve indirilir (`GET :id/pdf`).
 * Ticari faturanın sunucu PDF'i yok; yüklü nüsha belge detayından açılır.
 */
export function documentPdfRequest(kind: PdfDocumentKind, id: string, documentNo?: string | null) {
  if (!id.trim() || /[/?#\\\u0000-\u001f]/.test(id)) throw new Error('Belge kimliği geçersiz.');
  if (kind === 'invoice') throw new Error('Fatura PDF’i mobilde hazırlanamıyor; yüklü nüshayı açın.');
  const filename = `${documentNo?.trim() || kind}-${id.slice(0, 8)}.pdf`;
  const safeId = encodeURIComponent(id);
  if (kind === 'quote') return { method: 'POST' as const, path: `/quotes/${safeId}/generate-pdf`, filename };
  const path = `/${kind === 'proforma' ? 'proformas' : 'contracts'}/${safeId}/pdf`;
  return { method: 'GET' as const, prepare: path, path, filename };
}

export type PdfIo = {
  post: (path: string, filename: string) => Promise<void>;
  get: (path: string, filename: string) => Promise<void>;
  prepare: (path: string) => Promise<unknown>;
};

/** Save succeeded before this runs. A PDF failure must never repeat the create mutation. */
export async function shareSavedDocument(kind: PdfDocumentKind, savedId: string, no: string | undefined, io: PdfIo): Promise<void> {
  const request = documentPdfRequest(kind, savedId, no);
  if (request.method === 'POST') return io.post(request.path, request.filename);
  // Hazırlamak düzenleme yetkisi ister; yalnız okuyabilen kullanıcı webde hazırlanmış PDF'i yine indirebilir.
  try { await io.prepare(request.prepare); }
  catch (error) { if ((error as { status?: number } | null)?.status !== 403) throw error; }
  await io.get(request.path, request.filename);
}
