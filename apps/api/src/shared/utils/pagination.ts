import type { Pagination } from '@haksan/shared';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function pageOffset(p: Pagination): { limit: number; offset: number } {
  const limit = Math.min(Math.max(p.pageSize, 1), 200);
  const offset = (Math.max(p.page, 1) - 1) * limit;
  return { limit, offset };
}

export function buildPaginated<T>(data: T[], total: number, p: Pagination): PaginatedResult<T> {
  const totalPages = Math.ceil(total / Math.max(p.pageSize, 1));
  return { data, meta: { page: p.page, pageSize: p.pageSize, total, totalPages } };
}
