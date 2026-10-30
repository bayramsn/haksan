import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { normalizePhoneNumber, manualCallEventSchema, mobileCallEventSchema, callAssistantDraftCommitSchema } from '@haksan/shared';
import { CallAssistantService, callAssistantExpired } from './call-assistant.service';
import { NotFoundError } from '../../shared/utils/errors';
import { createContextualDatabase } from '../../db/transaction-context';
import { callAssistantDrafts, callAssistantSuggestions } from '../../db/schema/call-assistant';

const companyId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
const actor = { tenantId: companyId, userId: contactId, permissions: new Set(['companies.read', 'contacts.read']) } as any;
function service() {
  const svc = Object.create(CallAssistantService.prototype) as CallAssistantService;
  vi.spyOn(svc, 'capabilities').mockReturnValue({ enabled: true });
  (svc as any).companyService = { get: vi.fn().mockResolvedValue({ id: companyId, legalTitle: 'Haksan' }) };
  (svc as any).contactService = { get: vi.fn().mockResolvedValue({ id: contactId, fullName: 'İlgili', companyId, companyLinks: [{ id: companyId }] }) };
  return svc;
}

describe('call assistant safe matching and explicit inputs', () => {
  it('normalizes Turkish/international numbers and rejects command/extension inputs', () => {
    expect(normalizePhoneNumber('0532 123 45 67')).toBe('+905321234567');
    expect(normalizePhoneNumber('+90 (532) 123-45-67')).toBe('+905321234567');
    expect(normalizePhoneNumber('0044 7700 900123')).toBe('+447700900123');
    expect(normalizePhoneNumber('tel:05321234567;ext=1')).toBeNull();
    expect(normalizePhoneNumber('123')).toBeNull();
  });

  it('fails closed when feature is disabled before reading CRM', async () => {
    const svc = service();
    vi.spyOn(svc, 'capabilities').mockReturnValue({ enabled: false });
    await expect(svc.match(actor, { companyId })).rejects.toBeInstanceOf(NotFoundError);
    expect((svc as any).companyService.get).not.toHaveBeenCalled();
  });

  it('rechecks caller-provided company/contact IDs through existing scoped services', async () => {
    const svc = service();
    expect(await svc.match(actor, { companyId, contactId })).toMatchObject({ status: 'matched', matches: [{ companyId, contactId }] });
    expect((svc as any).companyService.get).toHaveBeenCalledWith(companyId, actor);
    expect((svc as any).contactService.get).toHaveBeenCalledWith(contactId, actor);
    (svc as any).companyService.get.mockRejectedValueOnce(new NotFoundError('Firma'));
    await expect(svc.match(actor, { companyId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a contact belonging to another company', async () => {
    const svc = service();
    (svc as any).contactService.get.mockResolvedValue({ id: contactId, companyId: contactId, companyLinks: [] });
    await expect(svc.match(actor, { companyId, contactId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps shared contact phone numbers ambiguous instead of selecting the first match', async () => {
    const svc = service();
    vi.spyOn(svc, 'phoneIndex').mockResolvedValue({ items: [
      { normalizedPhone: '+905321234567', companyId, companyName: 'Haksan', contactId, contactName: 'A' },
      { normalizedPhone: '+905321234567', companyId, companyName: 'Haksan', contactId: companyId, contactName: 'B' },
    ], truncated: false });
    (svc as any).contactService.get.mockImplementation(async (id: string) => ({ id, fullName: id, companyId, companyLinks: [{ id: companyId }] }));
    expect(await svc.match(actor, { phoneNumber: '05321234567' })).toMatchObject({ status: 'ambiguous' });
  });

  it('requires event identities and never invents a duration for iOS return', () => {
    const event = manualCallEventSchema.parse({ eventId: companyId, deviceId: contactId, companyId, source: 'ios_return' });
    expect(event.eventType).toBe('unknown');
    expect(event.durationSeconds).toBeUndefined();
    expect(mobileCallEventSchema.safeParse({ phoneNumber: '05321234567' }).success).toBe(false);
    expect(callAssistantDraftCommitSchema.safeParse({ operationId: companyId, kind: 'admin', payload: {} }).success).toBe(false);
  });

  it('never persists unmatched caller events', async () => {
    const svc = service();
    vi.spyOn(svc, 'match').mockResolvedValue({ status: 'unmatched', matches: [] });
    const transaction = vi.fn(); (svc as any).db = { transaction };
    const result = await svc.ingest(actor, mobileCallEventSchema.parse({ eventId: companyId, deviceId: contactId, phoneNumber: '05321234567' }), 'android');
    expect(result.status).toBe('unmatched'); expect(transaction).not.toHaveBeenCalled();
  });

  it('enforces TTL boundaries without relying on the cleanup scheduler', () => {
    const now = Date.now();
    expect(callAssistantExpired(new Date(now - 30 * 60_000), 30 * 60_000, now)).toBe(true);
    expect(callAssistantExpired(new Date(now - 30 * 60_000 + 1), 30 * 60_000, now)).toBe(false);
    expect(callAssistantExpired(new Date('invalid'), 30 * 60_000, now)).toBe(true);
    expect(callAssistantExpired(new Date(now + 3600_000), 30 * 60_000, now)).toBe(true);
  });

  it('rechecks ownership and expiry before returning a draft', async () => {
    const svc = service();
    (svc as any).db = { query: { callAssistantDrafts: { findFirst: vi.fn().mockResolvedValue({ id: companyId, status: 'pending', createdAt: new Date(Date.now() - 31 * 60_000) }) } } };
    await expect(svc.draft(actor, companyId)).rejects.toBeInstanceOf(NotFoundError);
    (svc as any).db.query.callAssistantDrafts.findFirst.mockResolvedValue(null);
    await expect(svc.draft(actor, companyId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the authoritative thirty-minute expiry with a visible draft', async () => {
    const svc = service();
    const createdAt = new Date();
    const user = { ...actor, permissions: new Set([...actor.permissions, 'tasks.create']) };
    (svc as any).db = { query: { callAssistantDrafts: { findFirst: vi.fn().mockResolvedValue({ id: companyId, kind: 'task', status: 'pending', createdAt, suggestionId: contactId }) } } };
    vi.spyOn(svc, 'suggestion').mockResolvedValue({ company: { id: companyId, name: 'Haksan' }, contact: null, title: 'Takip' } as any);
    expect(await svc.draft(user, companyId)).toMatchObject({ expiresAt: new Date(createdAt.getTime() + 30 * 60_000).toISOString() });
  });

  it('retention continues with the feature disabled and removes only dedicated assistant tables', async () => {
    const svc = service(); const where = vi.fn().mockResolvedValue(undefined); const remove = vi.fn(() => ({ where }));
    (svc as any).db = { delete: remove };
    vi.spyOn(svc, 'capabilities').mockReturnValue({ enabled: false });
    await svc.cleanupRetention(); expect(remove).toHaveBeenCalledTimes(4);
    vi.spyOn(svc, 'capabilities').mockReturnValue({ enabled: true });
    await svc.cleanupRetention(); expect(remove).toHaveBeenCalledTimes(8);
  });
});

describe('call assistant atomic draft commits', () => {
  function fixture() {
    let state: any = { draft: { id: companyId, tenantId: actor.tenantId, userId: actor.userId, suggestionId: contactId, kind: 'task', status: 'pending' }, suggestion: { id: contactId, status: 'pending' }, resources: [], failFinalize: false };
    const makeDb = (read: () => any, replace: (value: any) => void): any => ({
      select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => table === callAssistantSuggestions ? (read().suggestion ? [{ ...read().suggestion }] : []) : [{ ...read().draft }] }) }) }),
      update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => {
        if (table === callAssistantDrafts) { if (read().failFinalize) throw new Error('finalize rejected'); Object.assign(read().draft, values); }
        if (table === callAssistantSuggestions) Object.assign(read().suggestion, values);
      } }) }),
      writeResource: () => { const resource = { id: contactId }; read().resources.push(resource); return resource; },
      transaction: async (work: Function) => { let pending = structuredClone(read()); const tx = makeDb(() => pending, (value) => { pending = value; }); const result = await work(tx); replace(pending); return result; },
    });
    const raw = makeDb(() => state, (value) => { state = value; });
    const svc = service();
    const proxy = createContextualDatabase(raw);
    (svc as any).db = proxy;
    (svc as any).tasks = { create: vi.fn(async () => (proxy as any).transaction(async (tx: any) => tx.writeResource())) };
    vi.spyOn(svc, 'draft').mockResolvedValue({ companyId, contactId: null, kind: 'task' } as any);
    return { svc, state: () => state, input: { operationId: contactId, kind: 'task' as const, payload: { title: 'Takip', companyId } }, user: { ...actor, permissions: new Set([...actor.permissions, 'tasks.create']) } };
  }

  it('creates exactly one resource on repeated save and returns the persisted resource ID', async () => {
    const f = fixture();
    const first = await f.svc.commit(f.user, companyId, f.input);
    const second = await f.svc.commit(f.user, companyId, f.input);
    expect(second).toEqual(first);
    expect(first).toEqual({ resourceId: contactId, resourceType: 'task', status: 'committed' });
    expect(f.state().resources).toHaveLength(1);
    expect((f.svc as any).tasks.create).toHaveBeenCalledTimes(1);
  });

  it('rolls back the existing service resource when draft finalization fails', async () => {
    const f = fixture(); f.state().failFinalize = true;
    await expect(f.svc.commit(f.user, companyId, f.input)).rejects.toThrow('finalize rejected');
    expect(f.state().resources).toHaveLength(0);
    expect(f.state().draft.status).toBe('pending');
  });

  it('rejects a pending draft after the suggestion is dismissed or consumed', async () => {
    for (const status of ['dismissed', 'actioned']) {
      const f = fixture(); f.state().suggestion.status = status;
      await expect(f.svc.commit(f.user, companyId, f.input)).rejects.toThrow('artık açık değil');
      expect(f.state().resources).toHaveLength(0);
      expect(f.state().draft.status).toBe('pending');
    }
  });

  it('rejects a second draft after the first consumes their shared suggestion', async () => {
    const f = fixture();
    await f.svc.commit(f.user, companyId, f.input);
    f.state().draft = { ...f.state().draft, id: contactId, status: 'pending', commitOperationId: null, commitFingerprint: null };
    await expect(f.svc.commit(f.user, contactId, f.input)).rejects.toThrow('artık açık değil');
    expect(f.state().resources).toHaveLength(1);
  });

  it('rejects a deleted suggestion before creating any CRM record', async () => {
    const f = fixture(); f.state().suggestion = null;
    await expect(f.svc.commit(f.user, companyId, f.input)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.state().resources).toHaveLength(0);
  });

  it('rejects changed replay payloads, mismatched companies and missing create permission', async () => {
    const f = fixture();
    await expect(f.svc.commit(actor, companyId, f.input)).rejects.toThrow('yetkiniz yok');
    await expect(f.svc.commit(f.user, companyId, { ...f.input, payload: { title: 'Takip', companyId: contactId } })).rejects.toThrow('firması değiştirilemez');
    await f.svc.commit(f.user, companyId, f.input);
    await expect(f.svc.commit(f.user, companyId, { ...f.input, payload: { title: 'Changed', companyId } })).rejects.toThrow('başka içerikle');
    expect(f.state().resources).toHaveLength(1);
  });
});
