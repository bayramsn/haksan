export type PdfDocumentKind = 'quote' | 'proforma' | 'contract';
export function documentPdfRequest(kind: PdfDocumentKind, id: string, documentNo?: string | null) {
  if (!id.trim() || /[/?#\\\u0000-\u001f]/.test(id)) throw new Error('Belge kimliği geçersiz.');
  const resource = { quote: 'quotes', proforma: 'proformas', contract: 'contracts' }[kind];
  return { path: `/${resource}/${encodeURIComponent(id)}/generate-pdf`, filename: `${documentNo?.trim() || kind}-${id.slice(0, 8)}.pdf` };
}

/** Save succeeded before this runs. A PDF failure must never repeat the create mutation. */
export async function shareSavedDocument(
  kind: PdfDocumentKind, savedId: string, no: string | undefined,
  share: (path: string, filename: string) => Promise<void>,
): Promise<void> {
  const request = documentPdfRequest(kind, savedId, no);
  await share(request.path, request.filename);
}
