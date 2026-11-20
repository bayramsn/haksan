import { describe, expect, it, vi } from 'vitest';
import { QuotesService } from '../src/modules/quotes/quotes.service';
import { OpportunitiesService } from '../src/modules/opportunities/opportunities.service';
import { OpportunitiesController } from '../src/modules/opportunities/opportunities.controller';
import { ValidationError } from '../src/shared/utils/errors';

const actor = (role = 'sales') => ({ tenantId: 'tenant', userId: 'user', roles: [role], divisionIds: [], departmentIds: [], accessScopes: [], primaryDivisionId: null, primaryDepartmentId: null, activeDivisionId: null, activeDepartmentId: null, canViewAllDivisions: true, permissions: new Set(['quotes.create']) }) as never;
const blocked = () => new ValidationError('Eksik bilgi', { reason: 'QUOTE_REQUIREMENTS_INCOMPLETE', opportunityId: 'opp', blockers: [{ key: 'contact', label: 'Kontak bağlı', actionKey: 'link_contact' }] });

function opportunityService() {
  const svc = new OpportunitiesService({} as never, {} as never, {} as never) as any;
  svc.findScopedOpp = vi.fn().mockResolvedValue({ id: 'opp', ownerUserId: 'user', title: 'Makine', companyId: 'company', primaryContactId: 'contact', requestedMachine: 'CNC', paymentMethod: 'cash', qualificationStage: 'lead' });
  svc.qualificationContexts = vi.fn().mockResolvedValue(new Map([['opp', { company: { sector: 'Metal' }, hasContact: true, hasLocation: true, hasAddress: true, hasEmail: true, hasPhone: true, hasCall: true, approvals: {} }]]));
  return svc;
}

describe('quote requirements gate 20261021', () => {
  it('uses the twelve canonical pre-quote requirements without requiring an existing quote or B transition', async () => {
    const svc = opportunityService();
    const readiness = await svc.quoteReadiness('opp', actor());
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.map((check: any) => check.key)).toEqual(['owner', 'subject', 'company', 'contact', 'location', 'address', 'email', 'sector', 'phone', 'call', 'machine', 'payment_method']);
    await expect(svc.assertQuoteReady('opp', actor('super_admin'))).resolves.toMatchObject({ ready: true });
  });

  it('returns actionable missing checks for every role including super admin', async () => {
    const svc = opportunityService();
    svc.findScopedOpp.mockResolvedValue({ id: 'opp', title: 'Makine', paymentMethod: 'undecided' });
    for (const role of ['sales', 'admin', 'super_admin']) {
      await expect(svc.assertQuoteReady('opp', actor(role))).rejects.toMatchObject({ details: { reason: 'QUOTE_REQUIREMENTS_INCOMPLETE', opportunityId: 'opp', blockers: expect.arrayContaining([{ key: 'payment_method', label: 'Ödeme biçimi belirlendi', actionKey: 'edit_payment_method' }]) } });
    }
  });

  it.each([{ closedAt: new Date(), qualificationStage: 'win' }, { closedAt: null, qualificationStage: 'lost' }])('blocks closed or lost opportunities even when all information is complete', async (patch) => {
    const svc = opportunityService();
    const opp = await svc.findScopedOpp();
    svc.findScopedOpp.mockResolvedValue({ ...opp, ...patch });
    await expect(svc.assertQuoteReady('opp', actor('super_admin'))).rejects.toMatchObject({ details: { blockers: [{ key: 'active_opportunity', label: 'Fırsat açık ve aktif olmalı', actionKey: 'open_opportunity' }] } });
  });

  it.each([
    { contactRows: [{ id: 'contact', companyId: 'company', linkedCompanyId: null }], expected: true },
    { contactRows: [{ id: 'contact', companyId: 'other', linkedCompanyId: 'company' }], expected: true },
    { contactRows: [{ id: 'contact', companyId: 'other', linkedCompanyId: 'other' }], expected: false },
    { contactRows: [], expected: false },
  ])('bulk contact evidence requires a live contact attached to the same company: $expected', async ({ contactRows, expected }) => {
    const results = [[{ id: 'company', sector: 'Metal' }], [], [], [], [], [], [], [], contactRows];
    const db = { select: vi.fn().mockImplementation(() => {
      const result = results.shift();
      const query = { from: () => query, leftJoin: () => query, innerJoin: () => query, where: () => Promise.resolve(result) };
      return query;
    }) };
    const svc = new OpportunitiesService(db as never, {} as never, {} as never) as any;
    const contexts = await svc.qualificationContexts([{ id: 'opp', tenantId: 'tenant', companyId: 'company', primaryContactId: 'contact' }]);
    expect(contexts.get('opp').hasContact).toBe(expected);
  });

  it('does not count a stale contact id as valid contact evidence in either readiness list', async () => {
    const svc = opportunityService();
    const contexts = await svc.qualificationContexts();
    contexts.get('opp').hasContact = false;
    const opp = await svc.findScopedOpp();
    expect((await svc.quoteReadiness('opp', actor())).blockers).toEqual([{ key: 'contact', label: 'Kontak bağlı', actionKey: 'link_contact' }]);
    expect(svc.qualificationReadiness({ ...opp, qualificationStage: 'c' }, contexts.get('opp')).checks.find((item: any) => item.key === 'contact').complete).toBe(false);
  });

  it('requires a valid opportunity even for standalone creates', async () => {
    const svc = opportunityService();
    await expect(svc.assertQuoteReady(undefined, actor())).rejects.toMatchObject({ details: { opportunityId: null, reason: 'QUOTE_REQUIREMENTS_INCOMPLETE' } });
    expect(svc.findScopedOpp).not.toHaveBeenCalled();
    const quote = new QuotesService({} as never, {} as never, {} as never, {} as never, svc);
    await expect(quote.createStandaloneQuote({ items: [] } as never, actor())).rejects.toMatchObject({ details: { reason: 'QUOTE_REQUIREMENTS_INCOMPLETE' } });
  });

  it.each(['create', 'update', 'addItem', 'updateItem', 'upsertTerms', 'approve', 'approvePrice', 'assertCanSend', 'send', 'changeStatus'])('blocks %s before database writes for super admin', async (method) => {
    const db = { insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
    const gate = { assertQuoteReady: vi.fn().mockRejectedValue(blocked()) };
    const svc = new QuotesService(db as never, {} as never, {} as never, {} as never, gate as never) as any;
    svc.get = vi.fn().mockResolvedValue({ id: 'quote', opportunityId: 'opp', companyId: 'company', approvedAt: null, finalizedAt: null });
    const args: Record<string, unknown[]> = { create: [{ opportunityId: 'opp' }, actor('super_admin')], update: ['quote', {}, actor('super_admin')], addItem: ['quote', {}, actor('super_admin')], updateItem: ['quote', 'item', {}, actor('super_admin')], upsertTerms: ['quote', {}, actor('super_admin')], approve: ['quote', actor('super_admin')], approvePrice: ['quote', { ...actor('super_admin') as any, permissions: new Set(['quotes.approve']) }], assertCanSend: ['quote', actor('super_admin')], send: ['quote', actor('super_admin')], changeStatus: ['quote', { statusCode: 'on_hold' }, actor('super_admin')] };
    await expect(svc[method](...args[method])).rejects.toMatchObject({ details: { reason: 'QUOTE_REQUIREMENTS_INCOMPLETE' } });
    expect(db.insert).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled(); expect(db.delete).not.toHaveBeenCalled();
  });

  it('does not allow clearing the opportunity link on a quote with completed requirements', async () => {
    const gate = { assertQuoteReady: vi.fn().mockImplementation(async (id) => { if (!id) throw blocked(); }) };
    const svc = new QuotesService({} as never, {} as never, {} as never, {} as never, gate as never) as any;
    svc.get = vi.fn().mockResolvedValue({ opportunityId: 'opp', approvedAt: null, finalizedAt: null });
    await expect(svc.update('quote', { opportunityId: null }, actor())).rejects.toThrow('Eksik bilgi');
    expect(gate.assertQuoteReady.mock.calls.map((call) => call[0])).toEqual(['opp', null]);
  });

  it.each(['sales', 'admin', 'super_admin'])('enforces cumulative qualification and operation gates for %s', async (role) => {
    const writes = vi.fn();
    const opp = { id: 'opp', companyId: 'company', qualificationStage: 'lead', currentStageId: 'lead-stage' };
    const db = { query: { opportunities: { findFirst: vi.fn().mockResolvedValue(opp) }, pipelineStages: { findFirst: vi.fn().mockResolvedValue({ code: 'lead' }) } }, update: writes, insert: writes };
    const svc = new OpportunitiesService(db as never, {} as never, {} as never) as any;
    svc.findScopedOpp = vi.fn().mockResolvedValue(opp);
    svc.stageRowByCode = vi.fn().mockResolvedValue({ id: 'a-stage', code: 'quote' });
    svc.qualificationContexts = vi.fn().mockResolvedValue(new Map([['opp', {}]]));
    const blocker = { key: 'owner', label: 'Sorumlu atandı', complete: false };
    svc.opportunityProcessReadiness = vi.fn().mockResolvedValue({ targets: [
      { axis: 'qualification', code: 'a', canTransition: false, blockers: [blocker] },
      { axis: 'qualification', code: 'c', canTransition: false, blockers: [blocker] },
      { axis: 'operation', code: 'quote', canTransition: false, blockers: [blocker] },
    ] });
    await expect(svc.changeQualificationStage('opp', { toStage: 'a' }, actor(role))).rejects.toMatchObject({ details: { blockers: [blocker] } });
    await expect(svc.changeStage('opp', { toStage: 'quote' }, actor(role))).rejects.toMatchObject({ details: { blockers: [blocker] } });
    svc.leadActivityContexts = vi.fn().mockResolvedValue(new Map());
    await expect(svc.convertLead('opp', { overrideReason: 'admin override' }, actor(role))).rejects.toMatchObject({ details: { blockers: [blocker] } });
    expect(writes).not.toHaveBeenCalled();
  });

  it('does not treat a manual done mark as missing evidence', () => {
    const svc = opportunityService();
    const check = { key: 'shipment', qualificationStage: 'a_plus', complete: false };
    expect(svc.applyManualProcessCheck(check, { status: 'done', note: 'done' }).complete).toBe(false);
    expect(svc.applyManualProcessCheck({ ...check, complete: true }, { status: 'done' }).complete).toBe(true);
  });

  it('allows readiness access with create OR update permission and denies read-only callers', async () => {
    const svc = { quoteReadiness: vi.fn().mockResolvedValue({ ready: true }) };
    const controller = new OpportunitiesController(svc as never);
    for (const permission of ['quotes.create', 'quotes.update']) {
      await expect(controller.quoteReadiness('opp', { permissions: new Set([permission]) } as never)).resolves.toEqual({ ready: true });
    }
    expect(() => controller.quoteReadiness('opp', { permissions: new Set(['opportunities.read']) } as never)).toThrow('yetkisi gerekli');
  });
});
