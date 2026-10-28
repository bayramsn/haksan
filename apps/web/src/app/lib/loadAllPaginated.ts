import type { Paginated } from '../../lib/services';

export const loadAllPaginated = async <T,>(
  fetchPage: (page: number, pageSize: number) => Promise<Paginated<T>>,
  pageSize = 200,
  itemKey?: (item: T) => string | undefined
): Promise<Paginated<T>> => {
  const first = await fetchPage(1, pageSize);
  const totalPages = Math.max(1, Number(first.meta?.totalPages ?? 1));
  const rest = totalPages <= 1 ? [] : await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2, pageSize))
  );
  const seen = new Set<string>();
  const data = [first, ...rest].flatMap((page) => page.data).filter((item) => {
    const key = itemKey?.(item);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (totalPages <= 1) return { ...first, data };
  return {
    data,
    meta: {
      ...first.meta,
      page: 1,
      pageSize: data.length,
      total: first.meta?.total ?? data.length,
      totalPages: 1,
    },
  };
};
