import { describe, expect, it, vi } from 'vitest';
import { buildMutationDedupeKey, resolveMediaUrlAgainstBase, SingleFlightRequestStore } from './apiClient';

describe('resolveMediaUrlAgainstBase', () => {
  it('adds the API base to canonical product media paths', () => {
    expect(resolveMediaUrlAgainstBase('/products/media/file-id', '/api/v1')).toBe('/api/v1/products/media/file-id');
  });

  it('does not duplicate an already-versioned API path', () => {
    expect(resolveMediaUrlAgainstBase('/api/v1/products/media/file-id', '/api/v1')).toBe('/api/v1/products/media/file-id');
  });

  it('resolves both path formats when the API base is absolute', () => {
    const base = 'https://crm.example.com/api/v1/';
    expect(resolveMediaUrlAgainstBase('/products/media/file-id', base)).toBe(
      'https://crm.example.com/api/v1/products/media/file-id'
    );
    expect(resolveMediaUrlAgainstBase('/api/v1/products/media/file-id', base)).toBe(
      'https://crm.example.com/api/v1/products/media/file-id'
    );
  });

  it('leaves browser-native and absolute media references unchanged', () => {
    expect(resolveMediaUrlAgainstBase('https://storage.example.com/image.jpg', '/api/v1')).toBe(
      'https://storage.example.com/image.jpg'
    );
    expect(resolveMediaUrlAgainstBase('data:image/png;base64,abc', '/api/v1')).toBe('data:image/png;base64,abc');
    expect(resolveMediaUrlAgainstBase('blob:https://crm.example.com/id', '/api/v1')).toBe(
      'blob:https://crm.example.com/id'
    );
  });
});

describe('mutation request deduplication', () => {
  it('builds the same key for semantically identical JSON bodies', () => {
    const first = buildMutationDedupeKey({
      method: 'POST',
      url: '/api/v1/companies',
      body: { legalTitle: 'Haksan', address: { city: 'İstanbul', district: 'Ümraniye' } },
      scope: 'session:division:department',
    });
    const second = buildMutationDedupeKey({
      method: 'post',
      url: '/api/v1/companies',
      body: { address: { district: 'Ümraniye', city: 'İstanbul' }, legalTitle: 'Haksan' },
      scope: 'session:division:department',
    });

    expect(first).toBe(second);
  });

  it('does not deduplicate read requests', () => {
    expect(buildMutationDedupeKey({
      method: 'GET',
      url: '/api/v1/companies',
      scope: 'session:division:department',
    })).toBeNull();
  });

  it('runs concurrent duplicate mutations only once', async () => {
    const store = new SingleFlightRequestStore();
    let calls = 0;
    let release!: (value: { id: string }) => void;
    const task = () => {
      calls += 1;
      return new Promise<{ id: string }>((resolve) => {
        release = resolve;
      });
    };

    const first = store.run('company-create', task);
    const second = store.run('company-create', task);
    expect(calls).toBe(1);

    release({ id: 'company-1' });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 'company-1' },
      { id: 'company-1' },
    ]);
  });

  it('retains a successful mutation briefly to catch fast double clicks', async () => {
    vi.useFakeTimers();
    try {
      const store = new SingleFlightRequestStore(1_000);
      const task = vi.fn(async () => ({ id: 'company-1' }));

      await store.run('company-create', task);
      await store.run('company-create', task);
      expect(task).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_001);
      await store.run('company-create', task);
      expect(task).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows an immediate retry after a failed mutation', async () => {
    const store = new SingleFlightRequestStore();
    const failed = store.run('company-create', async () => {
      throw new Error('network');
    });
    await expect(failed).rejects.toThrow('network');

    await expect(store.run('company-create', async () => ({ id: 'company-2' }))).resolves.toEqual({
      id: 'company-2',
    });
  });
});
