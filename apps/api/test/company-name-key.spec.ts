import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { companyNameKey, companyNameKeySql } from '../src/shared/utils/text-normalization';
import { companies } from '../src/db/schema/companies';

describe('companyNameKey', () => {
  it('aynı firmanın farklı yazımlarını tek anahtara indirir', () => {
    const key = companyNameKey('Haksan Makina');
    expect(companyNameKey('HAKSAN  MAKİNA')).toBe(key);
    expect(companyNameKey('haksan makina.')).toBe(key);
    expect(companyNameKey('Haksan-Makına')).toBe(key);
  });

  it('ayrı tüzel kişileri birleştirmez', () => {
    expect(companyNameKey('Örnek Sanayi')).not.toBe(companyNameKey('Örnek Ticaret'));
    expect(companyNameKey('Haksan Makina')).not.toBe(companyNameKey('Haksan Makina A.Ş.'));
  });

  // Postgres tarafındaki katlama JS ile birebir aynı olmalı; aksi halde mükerrer
  // kontrolü sessizce hiçbir şey bulamaz. Katlama tabloları tek yerde tanımlıdır,
  // bu test ikisinin ayrışmadığını (ve translate() uzunluklarının eşit kaldığını) tutar.
  it('SQL karşılığı aynı katlama tablosunu parametre olarak geçirir', () => {
    const query = new PgDialect().sqlToQuery(sql`${companyNameKeySql(companies.legalTitle)}`);
    const [from, to] = query.params as string[];
    expect(query.sql).toContain('translate("companies"."legal_title"');
    expect(from).toHaveLength(to.length);
    expect(companyNameKey(from)).toBe(to.toLowerCase());
  });
});
