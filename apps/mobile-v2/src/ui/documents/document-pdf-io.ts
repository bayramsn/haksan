import { request } from '@/src/api/client';
import { getPdfAndShare, postPdfAndShare } from '@/src/native/files';
import type { PdfIo } from './document-pdf';

export const pdfIo: PdfIo = {
  post: (path, filename) => postPdfAndShare(path, filename),
  get: getPdfAndShare,
  prepare: (path) => request(path, { method: 'POST', body: {} }),
};
