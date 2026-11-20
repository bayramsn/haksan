export type CommercialPdfKind = 'quote' | 'proforma' | 'contract';
export type CommercialPdfStatus = {
  status: 'missing' | 'ready' | 'outdated';
  fileId: string | null;
  revision: string | null;
  /** Compatibility name for existing clients; identical to revision. */
  documentRevision: string | null;
  generatedAt: string | null;
};
