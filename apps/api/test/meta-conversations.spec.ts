import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { metaConversationListQuerySchema } from '@haksan/shared';
import { MetaService } from '../src/modules/meta/meta.service';
import type { AuthContext } from '../src/shared/security/auth.types';

describe('Meta conversation search', () => {
  it('retains and validates trimmed search without accepting oversized input', () => {
    expect(metaConversationListQuerySchema.parse({ search: '  message  ' }).search).toBe('message');
    expect(metaConversationListQuerySchema.safeParse({ search: 'a'.repeat(256) }).success).toBe(false);
  });

  it('searches full conversation text after grouping, preserving tenant, connection and pagination', async () => {
    const transport = vi.fn(async (_request: { text: string }, _params: unknown[]) => ({ rows: [] }));
    const service = new MetaService(drizzle({ query: transport } as never) as never, {} as never, {} as never, {} as never);
    const actor = { tenantId: 'tenant' } as AuthContext;
    await service.listConversations(actor, { search: "100%_'", connectionId: 'connection', page: 2, pageSize: 25 });
    const [{ text }, params] = transport.mock.calls[0];
    expect(text).toContain('"meta_messages"."tenant_id" = $1');
    expect(text).toContain('"meta_messages"."connection_id" = $2');
    expect(text).toContain('having bool_or(');
    expect(text).toContain('"meta_messages"."conversation_external_id" ilike $3 or "meta_messages"."text" ilike $4');
    expect(text.indexOf('group by')).toBeLessThan(text.indexOf('having'));
    expect(text.indexOf('having')).toBeLessThan(text.indexOf('limit'));
    expect(text).toContain('count(*)::int');
    expect(text).not.toContain("100%_'");
    expect(params).toEqual(['tenant', 'connection', "%100\\%\\_'%", "%100\\%\\_'%", 25, 25]);
  });
});
