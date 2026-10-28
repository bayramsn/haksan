type Page<T> = { data: T[]; meta: { page: number; totalPages: number; total: number; pageSize?: number } };
export type CollectedPage<T> = { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };

/** Load complete datasets for existing non-paginated screens and aggregate KPIs.
 * Invalid pagination fails visibly instead of returning a plausible partial list. */
export async function collectPaginated<T>(fetchPage: (page: number) => Promise<Page<T>>): Promise<CollectedPage<T>> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page);
    const meta = result.meta;
    if (!Array.isArray(result.data) || meta.page !== page || !Number.isSafeInteger(meta.totalPages)
      || meta.totalPages < 0 || !Number.isSafeInteger(meta.total) || meta.total < 0
      || (meta.totalPages === 0 && (page !== 1 || result.data.length > 0))
      || (meta.totalPages > 0 && page > meta.totalPages)) {
      throw new Error('Liste sayfaları doğrulanamadı. Lütfen yeniden deneyin.');
    }
    rows.push(...result.data);
    total = meta.total;
    if (page >= meta.totalPages) break;
    if (result.data.length === 0 || page >= 10_000) throw new Error('Liste tamamlanamadı. Lütfen filtreleri daraltıp yeniden deneyin.');
  }
  return { data: rows, meta: { page: 1, pageSize: rows.length, total, totalPages: rows.length ? 1 : 0 } };
}

/** Some read endpoints return arrays without a total. A full page signals that
 * another page must be requested; never present the first page as full history. */
export async function collectArrayPages<T>(fetchPage: (page: number, pageSize: number) => Promise<T[]>, pageSize = 100): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new Error('Geçersiz sayfa boyutu.');
  const rows: T[] = [];
  let previous: string | undefined;
  for (let page = 1; page <= 10_000; page++) {
    const result = await fetchPage(page, pageSize);
    if (!Array.isArray(result) || result.length > pageSize) throw new Error('Liste sayfaları doğrulanamadı. Lütfen yeniden deneyin.');
    if (result.length === 0) return rows;
    const fingerprint = JSON.stringify(result);
    if (fingerprint === previous) throw new Error('Liste sayfası tekrarlandı. Lütfen yeniden deneyin.');
    rows.push(...result);
    if (result.length < pageSize) return rows;
    previous = fingerprint;
  }
  throw new Error('Liste tamamlanamadı. Lütfen filtreleri daraltıp yeniden deneyin.');
}
