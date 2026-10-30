import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setAccessToken } from './apiClient';

afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });

describe('Authenticated image response', () => {
  it('keeps image bytes and passes bearer credentials through the API client', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('test-token');
    const image = await api.get<Blob>('/files/photo/preview', { responseType: 'blob' });
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/files/photo/preview', expect.objectContaining({
      credentials: 'include', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }));
  });

  it('parses JSON access errors before attempting to display a blob', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Dosyaya erişim yetkiniz yok' } }), {
      status: 403, headers: { 'content-type': 'application/json' },
    })));
    await expect(api.get<Blob>('/files/photo/preview', { responseType: 'blob' })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
