/** A known successful create survives a failed details request within this form. */
export type ProductSaveProgress = { createdId?: string; savedBody?: string; busy: boolean };
export function productPartsReady(...parts: { isPending: boolean; isError: boolean }[]): boolean {
  return parts.every(part => !part.isPending && !part.isError);
}
export async function saveProductWithDetails<B, D>(progress: ProductSaveProgress, options: {
  existingId?: string; body: B; createBody?: B; details: D; writeDetails: boolean;
  create: (body: B) => Promise<{ id: string }>;
  update: (id: string, body: B) => Promise<unknown>;
  replaceDetails: (id: string, details: D) => Promise<unknown>;
}): Promise<string> {
  if (progress.busy) throw new Error('Ürün kaydı devam ediyor.');
  progress.busy = true;
  try {
    let id = options.existingId ?? progress.createdId;
    const fingerprint = JSON.stringify(options.body);
    if (!id) {
      id = (await options.create(options.createBody ?? options.body)).id;
      progress.createdId = id;
      progress.savedBody = JSON.stringify(options.createBody ?? options.body);
      if (progress.savedBody !== fingerprint) {
        await options.update(id, options.body);
        progress.savedBody = fingerprint;
      }
    } else if (options.existingId || progress.savedBody !== fingerprint) {
      await options.update(id, options.body);
      progress.savedBody = fingerprint;
    }
    if (options.writeDetails) await options.replaceDetails(id, options.details);
    return id;
  } finally { progress.busy = false; }
}
