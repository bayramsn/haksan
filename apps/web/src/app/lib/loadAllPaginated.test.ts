import { describe, expect, it, vi } from 'vitest';
import { loadAllPaginated } from './loadAllPaginated';
import type { Paginated } from '../../lib/services';

const product = (id: string) => ({ id, name: 'Aynı model adı' });
const page = (pageNumber: number, ids: string[], totalPages = 3): Paginated<ReturnType<typeof product>> => ({
  data: ids.map(product),
  meta: { page: pageNumber, pageSize: 2, total: 4, totalPages },
});

describe('product pagination aggregation', () => {
  it('keeps each product once when page boundaries overlap, without merging names', async () => {
    const pages = [page(1, ['a', 'b']), page(2, ['b', 'c']), page(3, ['c', 'd'])];
    const fetchPage = vi.fn(async (number: number) => pages[number - 1]);

    const result = await loadAllPaginated(fetchPage, 2, (item) => item.id);

    expect(result.data.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.meta).toEqual({ page: 1, pageSize: 4, total: 4, totalPages: 1 });
    expect(fetchPage.mock.calls.map(([number]) => number)).toEqual([1, 2, 3]);
  });

  it('removes repeated IDs even when the server sends only one page', async () => {
    const result = await loadAllPaginated(async () => page(1, ['a', 'a'], 1), 2, (item) => item.id);
    expect(result.data.map((item) => item.id)).toEqual(['a']);
  });

  it('preserves fetched order when later pages finish out of order', async () => {
    let resolveSecond!: (value: Paginated<ReturnType<typeof product>>) => void;
    let resolveThird!: (value: Paginated<ReturnType<typeof product>>) => void;
    const second = new Promise<Paginated<ReturnType<typeof product>>>((resolve) => { resolveSecond = resolve; });
    const third = new Promise<Paginated<ReturnType<typeof product>>>((resolve) => { resolveThird = resolve; });
    const fetchPage = vi.fn((number: number) => {
      if (number === 1) return Promise.resolve(page(1, ['a', 'b']));
      if (number === 2) return second;
      return third;
    });

    const pending = loadAllPaginated(fetchPage, 2, (item) => item.id);
    await Promise.resolve();
    resolveThird(page(3, ['c', 'd']));
    await Promise.resolve();
    resolveSecond(page(2, ['b', 'c']));
    const result = await pending;
    expect(result.data.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves other paginated resource aggregation unchanged without an identity key', async () => {
    const result = await loadAllPaginated(async (number) => page(number, ['a', 'a'], 2), 2);
    expect(result.data).toHaveLength(4);
  });
});
