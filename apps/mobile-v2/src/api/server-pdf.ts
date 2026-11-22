import { postPdfAndShare } from '@/src/native/files';

export type ServerPdfKind =
  | 'activity-report'
  | 'operational-report'
  | 'year-end-report'
  | 'target-report'
  | 'product-technical'
  | 'service-quote'
  | 'installation-form'
  | 'shipment-label'
  | 'shipment-dispatch';

/** The client supplies document markup. Only the server produces the PDF. */
export function shareServerPdf(kind: ServerPdfKind, html: string, filename: string): Promise<void> {
  return postPdfAndShare('/pdf/render', filename, { kind, html, filename });
}
