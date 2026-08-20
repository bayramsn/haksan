import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  companyListRequestQuerySchema,
  companySummaryQuerySchema,
} from '@haksan/shared';
import {
  contactListRequestQuerySchema,
  contactSummaryQuerySchema,
} from '../src/modules/contacts/contacts.controller';

const divisionId = '00000000-0000-4000-8000-000000000001';

describe('firma ve kontak server-side liste sözleşmesi', () => {
  it('firma filtrelerini ve sıralama allowlistini doğrular', () => {
    expect(companyListRequestQuerySchema.parse({
      search: '  torna  ',
      relationTypeCode: 'supplier',
      customerStatusCode: 'active',
      divisionId,
      city: '  İstanbul ',
      sector: ' Makine ',
      supplierCategoryCode: 'logistics',
      sortBy: 'name',
      sortDir: 'asc',
    })).toMatchObject({
      search: 'torna',
      city: 'İstanbul',
      sector: 'Makine',
      sortBy: 'name',
      sortDir: 'asc',
    });
    expect(companyListRequestQuerySchema.safeParse({ sortBy: 'taxNumber' }).success).toBe(false);
    expect(companyListRequestQuerySchema.safeParse({ supplierCategoryCode: 'carrier' }).success).toBe(false);
    expect(companySummaryQuerySchema.safeParse({ divisionId: 'not-a-uuid' }).success).toBe(false);
  });

  it('kontak filtrelerini, boolean query dönüşümünü ve sıralama allowlistini doğrular', () => {
    expect(contactListRequestQuerySchema.parse({
      divisionId,
      companyId: divisionId,
      department: '  Satış ',
      isPrimary: 'false',
      isBlacklisted: 'true',
      sortBy: 'createdAt',
      sortDir: 'desc',
    })).toMatchObject({
      department: 'Satış',
      isPrimary: false,
      isBlacklisted: true,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
    expect(contactListRequestQuerySchema.safeParse({ isPrimary: 'yes' }).success).toBe(false);
    expect(contactListRequestQuerySchema.safeParse({ sortBy: 'department' }).success).toBe(false);
    expect(contactSummaryQuerySchema.safeParse({ divisionId: 'not-a-uuid' }).success).toBe(false);
  });

  it('aynı sıralama değerindeki kayıtları id ile kararlı tutar', () => {
    const companiesSource = readFileSync(
      new URL('../src/modules/companies/companies.service.ts', import.meta.url),
      'utf8',
    );
    const contactsSource = readFileSync(
      new URL('../src/modules/contacts/contacts.service.ts', import.meta.url),
      'utf8',
    );

    expect(companiesSource).toContain('[asc(sortColumn), asc(companies.id)]');
    expect(companiesSource).toContain('[desc(sortColumn), desc(companies.id)]');
    expect(contactsSource).toContain('[asc(sortColumn), asc(contacts.id)]');
    expect(contactsSource).toContain('[desc(sortColumn), desc(contacts.id)]');
  });

  it('summary route' + "'" + 'larını dinamik :id route' + "'" + 'larından önce tanımlar', () => {
    const companiesController = readFileSync(
      new URL('../src/modules/companies/companies.controller.ts', import.meta.url),
      'utf8',
    );
    const contactsController = readFileSync(
      new URL('../src/modules/contacts/contacts.controller.ts', import.meta.url),
      'utf8',
    );

    expect(companiesController.indexOf("@Get('summary')")).toBeLessThan(
      companiesController.indexOf("@Get(':id')"),
    );
    expect(contactsController.indexOf("@Get('summary')")).toBeLessThan(
      contactsController.indexOf("@Get(':id')"),
    );
  });
});
