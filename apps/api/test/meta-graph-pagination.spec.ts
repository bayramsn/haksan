import { describe, expect, it, vi } from 'vitest';
import { MetaService } from '../src/modules/meta/meta.service';
import type { AuthContext } from '../src/shared/security/auth.types';
const actor = {} as AuthContext;
function fixture() {
  const get = vi.fn();
  const service = new MetaService({} as never, {} as never, { get } as never, {} as never);
  vi.spyOn(service as any, 'authorizedConnection').mockResolvedValue({ row: { adAccountId: '123', pageId: '456' }, token: 'test-token' });
  return { service, get };
}
describe('bounded Meta Graph cursor traversal', () => {
  it('traverses campaigns using the original path and cursor, never untrusted next URLs', async () => {
    const { service, get } = fixture();
    get.mockResolvedValueOnce({ data: [{ id: 'a' }], paging: { next: 'https://attacker.test/secret', cursors: { after: 'page-2' } } }).mockResolvedValueOnce({ data: [{ id: 'b' }] });
    expect(await service.listCampaigns(actor, 'c')).toEqual({ data: [{ id: 'a' }, { id: 'b' }] });
    expect(get.mock.calls[1]).toEqual(['test-token', 'act_123/campaigns', expect.objectContaining({ after: 'page-2' })]);
  });
  it('loads subsequent feed pages and nested comment pages on fixed validated post paths', async () => {
    const { service, get } = fixture();
    get.mockResolvedValueOnce({ data: [{ id: '456_1', comments: { data: [{ id: 'first' }], paging: { next: 'ignored', cursors: { after: 'comment-2' } } } }], paging: { next: 'ignored', cursors: { after: 'post-2' } } })
      .mockResolvedValueOnce({ data: [{ id: '456_2', comments: { data: [] } }] })
      .mockResolvedValueOnce({ data: [{ id: 'last' }] });
    const response = await service.listComments(actor, 'c');
    expect((response.data[0].comments as any).data).toEqual([{ id: 'first' }, { id: 'last' }]);
    expect(get.mock.calls.map((call) => call[1])).toEqual(['456/feed', '456/feed', '456_1/comments']);
    expect(get.mock.calls[2][2].after).toBe('comment-2');
  });
  it.each([{ next: 'ignored' }, { next: 'ignored', cursors: { after: '' } }])('rejects missing cursors visibly rather than returning a truncated list', async (paging) => {
    const { service, get } = fixture(); get.mockResolvedValue({ data: [], paging });
    await expect(service.listCampaigns(actor, 'c')).rejects.toThrow('imleci');
  });
  it('rejects repeated cursors and propagates later-page failures', async () => {
    const { service, get } = fixture(); get.mockResolvedValue({ data: [{ id: 1 }], paging: { next: 'ignored', cursors: { after: 'same' } } });
    await expect(service.listCampaigns(actor, 'c')).rejects.toThrow('imleci');
    expect(get).toHaveBeenCalledTimes(2);
    get.mockReset().mockResolvedValueOnce({ data: [], paging: { next: 'ignored', cursors: { after: '2' } } }).mockRejectedValueOnce(new Error('upstream failure'));
    await expect(service.listCampaigns(actor, 'c')).rejects.toThrow('upstream failure');
  });
  it('caps the shared request budget and rejects unsafe nested post ids', async () => {
    const { service, get } = fixture(); let n = 0;
    get.mockImplementation(async () => ({ data: [{ id: n++ }], paging: { next: 'ignored', cursors: { after: String(n) } } }));
    await expect(service.listCampaigns(actor, 'c')).rejects.toThrow('tamamlanamadı');
    expect(get).toHaveBeenCalledTimes(50);
    get.mockReset().mockResolvedValue({ data: [{ id: 'https://attacker.test', comments: { data: [], paging: { next: 'ignored', cursors: { after: '2' } } } }] });
    await expect(service.listComments(actor, 'c')).rejects.toThrow('kimliği');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
