import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { companyCreateSchema, companyUpdateSchema } from '../../../packages/shared/src/schemas/company';
import { CompaniesService } from '../src/modules/companies/companies.service';
import { companies } from '../src/db/schema/companies';
import { ConflictError } from '../src/shared/utils/errors';
import { companyNameKey } from '../src/shared/utils/text-normalization';
import type { AuthContext } from '../src/shared/security/auth.types';

vi.mock('../src/shared/utils/lookup.helper', () => ({ lookupIdByCode: vi.fn(async () => null) }));

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const actor = { tenantId, userId: 'actor' } as AuthContext;
const dialect = new PgDialect();
type Company = { id: string; tenantId: string; legalTitle: string; deletedAt: Date | null };
const row = (id: string, legalTitle: string, overrides: Partial<Company> = {}): Company => ({
  id, tenantId, legalTitle, deletedAt: null, ...overrides,
});

/** Evaluate only the name uniqueness predicate, failing if its isolation clauses are absent. */
function duplicateIn(rows: Company[], condition: SQL) {
  const query = dialect.sqlToQuery(condition);
  expect(query.sql).toContain('"companies"."tenant_id" = $1');
  expect(query.sql).toContain('"companies"."deleted_at" is null');
  expect(query.sql).toContain('"companies"."id" <> $2');
  expect(query.sql).toContain('translate("companies"."legal_title"');
  expect(query.params.slice(0, 2)).toEqual([tenantId, companyId]);
  const nameKey = query.params.at(-1);
  return rows.find((item) => item.tenantId === query.params[0] && !item.deletedAt
    && item.id !== query.params[1] && companyNameKey(item.legalTitle) === nameKey);
}

function fixture(preflightRows: Company[] = [], transactionRows = preflightRows) {
  const existing = { ...row(companyId, 'Haksan Makina'), relationTypeId: 'customer', shortName: null };
  const events: string[] = [];
  const tx = {
    execute: vi.fn(async (condition: SQL) => {
      events.push('lock');
      return dialect.sqlToQuery(condition);
    }),
    query: {
      companies: { findFirst: vi.fn(async ({ where }: { where: SQL }) => {
        events.push('check');
        return duplicateIn(transactionRows, where);
      }) },
      competitors: { findFirst: vi.fn(async () => undefined) },
    },
    update: vi.fn((table: unknown) => ({ set: (patch: Record<string, unknown>) => ({
      where: vi.fn(async () => {
        expect(table).toBe(companies);
        events.push('write');
        Object.assign(existing, patch);
      }),
    }) })),
  };
  const db = {
    query: { companies: { findFirst: vi.fn(async ({ where }: { where: SQL }) => duplicateIn(preflightRows, where)) } },
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
  };
  const audit = { write: vi.fn(async () => undefined) };
  const service = new CompaniesService(db as any, audit as any, {} as any);
  vi.spyOn(service, 'get').mockImplementation(async (id, context) => {
    expect(id).toBe(companyId);
    expect(context).toBe(actor);
    return { ...existing } as any;
  });
  return { service, db, tx, audit, existing, events };
}

describe('company update name uniqueness inside the transaction', () => {
  it('rejects a duplicate appearing after preflight and before the locked check without writing or auditing', async () => {
    const duplicate = row('other-company', 'ÖRNEK   MAKİNA');
    const f = fixture([], [duplicate]);
    await expect(f.service.update(companyId, { legalTitle: 'örnek makina' }, actor)).rejects.toMatchObject({
      code: 'CONFLICT', statusCode: 409, details: { duplicateCompanyId: duplicate.id },
    });
    expect(f.db.query.companies.findFirst).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(['lock', 'check']);
    expect(f.tx.update).not.toHaveBeenCalled();
    expect(f.audit.write).not.toHaveBeenCalled();
    const lock = dialect.sqlToQuery(f.tx.execute.mock.calls[0][0]);
    expect(lock.sql).toContain('pg_advisory_xact_lock(hashtextextended(');
    expect(lock.params).toEqual([`${tenantId}:${companyNameKey('örnek makina')}`]);
  });

  it('allows a case/space variant of its own name and ignores deleted companies and other tenants', async () => {
    const f = fixture([], [
      row(companyId, 'HAKSAN MAKİNA'),
      row('deleted', 'haksan makina', { deletedAt: new Date() }),
      row('foreign', 'haksan makina', { tenantId: 'another-tenant' }),
    ]);
    await f.service.update(companyId, { legalTitle: '  haksan   makına  ' }, actor);
    expect(f.existing.legalTitle).toBe('HAKSAN MAKINA');
    expect(f.events).toEqual(['lock', 'check', 'write']);
    expect(f.audit.write).toHaveBeenCalledTimes(1);
    expect(f.db.query.companies.findFirst).not.toHaveBeenCalled();
  });

  it('still checks another active company when the new spelling has the same key as the current name', async () => {
    const duplicate = row('legacy-duplicate', 'Haksan Makina');
    const f = fixture([], [duplicate]);
    await expect(f.service.update(companyId, { legalTitle: 'HAKSAN  MAKİNA' }, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(f.tx.update).not.toHaveBeenCalled();
    expect(f.audit.write).not.toHaveBeenCalled();
  });

  it('rejects a different company name variant in preflight', async () => {
    const duplicate = row('other-company', 'ÇINAR ŞİRKETİ');
    const f = fixture([duplicate]);
    await expect(f.service.update(companyId, { legalTitle: 'cınar sirketi' }, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(f.db.transaction).not.toHaveBeenCalled();
    expect(f.audit.write).not.toHaveBeenCalled();
  });

  it('does not require a name lock for an unrelated edit', async () => {
    const f = fixture();
    await f.service.update(companyId, { notes: 'Yeni not' }, actor);
    expect(f.tx.execute).not.toHaveBeenCalled();
    expect(f.tx.query.companies.findFirst).not.toHaveBeenCalled();
    expect(f.tx.update).toHaveBeenCalledTimes(1);
  });
});

describe('company name input validation', () => {
  it.each(['', ' ', '\t\n   '])('rejects blank title %j in both create and update', (legalTitle) => {
    expect(companyCreateSchema.safeParse({ legalTitle }).success).toBe(false);
    expect(companyUpdateSchema.safeParse({ legalTitle }).success).toBe(false);
  });
  it('trims an explicit title and permits omitted title on update', () => {
    expect(companyUpdateSchema.parse({ legalTitle: '  Haksan Makina  ' }).legalTitle).toBe('Haksan Makina');
    expect(companyUpdateSchema.safeParse({ notes: 'Not' }).success).toBe(true);
  });
});
