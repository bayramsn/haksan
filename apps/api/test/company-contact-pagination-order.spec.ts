import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('firma ve kontak liste sıralaması', () => {
  it('aynı oluşturulma zamanındaki Excel kayıtlarını sayfalar arasında kararlı tutar', () => {
    const companiesSource = readFileSync(
      new URL('../src/modules/companies/companies.service.ts', import.meta.url),
      'utf8',
    );
    const contactsSource = readFileSync(
      new URL('../src/modules/contacts/contacts.service.ts', import.meta.url),
      'utf8',
    );

    expect(companiesSource).toContain(
      '.orderBy(desc(companies.createdAt), desc(companies.id))',
    );
    expect(contactsSource).toContain(
      '.orderBy(desc(contacts.createdAt), desc(contacts.id))',
    );
  });
});
