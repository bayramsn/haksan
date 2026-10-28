import type { Paginated } from '../../../lib/services';

/** Never silently treat malformed pagination as a complete option list. */
export function remoteOptionHasNext<T>(response: Paginated<T>, requestedPage: number): boolean {
  const { meta, data } = response;
  if (!Array.isArray(data) || !meta || meta.page !== requestedPage
    || !Number.isSafeInteger(meta.totalPages) || meta.totalPages < 0
    || !Number.isSafeInteger(meta.total) || meta.total < 0
    || (meta.totalPages === 0 && (requestedPage !== 1 || data.length > 0))
    || (meta.totalPages > 0 && requestedPage > meta.totalPages)
    || (requestedPage < meta.totalPages && data.length === 0)) {
    throw new Error('Seçenek sayfaları doğrulanamadı. Lütfen yeniden deneyin.');
  }
  return requestedPage < meta.totalPages;
}

export function canCreateRemoteOption(input: {
  query: string; debouncedQuery: string; success: boolean; fetching: boolean;
  error: boolean; hasNext: boolean; labels: string[];
}): boolean {
  const query = input.query.trim();
  return Boolean(query && query === input.debouncedQuery && input.success && !input.fetching
    && !input.error && !input.hasNext
    && !input.labels.some((label) => label.toLocaleLowerCase('tr-TR') === query.toLocaleLowerCase('tr-TR')));
}
