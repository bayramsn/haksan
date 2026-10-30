import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTACT_FILTERS,
  activeContactFilterCount,
  buildContactExportParams,
  buildContactQuery,
  contactSort,
} from './contact-list-logic.ts';

test('sıralama: varsayılan en yeni kayıt', () => {
  assert.deepEqual(contactSort('all'), { sortBy: 'createdAt', sortDir: 'desc' });
  assert.deepEqual(contactSort('name-desc'), { sortBy: 'name', sortDir: 'desc' });
});

test('sorgu: yalnız dolu filtreler gönderilir', () => {
  assert.deepEqual(buildContactQuery(DEFAULT_CONTACT_FILTERS), { sortBy: 'createdAt', sortDir: 'desc' });
  assert.deepEqual(
    buildContactQuery({
      ...DEFAULT_CONTACT_FILTERS,
      search: ' ali ',
      tab: 'primary',
      divisionId: 'd1',
      department: 'Satın Alma',
      companyId: 'c1',
      sort: 'name-asc',
    }),
    { search: 'ali', companyId: 'c1', department: 'Satın Alma', isPrimary: true, divisionId: 'd1', sortBy: 'name', sortDir: 'asc' },
  );
});

test('dışa aktarma: boolean metne çevrilir', () => {
  assert.deepEqual(buildContactExportParams({ ...DEFAULT_CONTACT_FILTERS, tab: 'primary' }), {
    isPrimary: 'true',
    sortBy: 'createdAt',
    sortDir: 'desc',
  });
});

test('aktif filtre sayısı', () => {
  assert.equal(activeContactFilterCount(DEFAULT_CONTACT_FILTERS), 0);
  assert.equal(activeContactFilterCount({ ...DEFAULT_CONTACT_FILTERS, department: 'x', sort: 'name-asc', blacklistOnly: true }), 3);
});
