import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEW_ROLE_DEFAULT_CODES,
  applyRoleTemplate,
  buildPermissionRows,
  effectiveActionCounts,
  filterUsers,
  groupState,
  initialAccessScopes,
  isUserLocked,
  moduleCount,
  moveScopesToDepartment,
  normalizeDepartmentCode,
  roleCodeFromName,
  sameCodes,
  sortRoles,
  toggleGroup,
  toggleOrdered,
  toggleSorted,
  updateScopeRow,
  userKpis,
} from './admin-model.ts';

const NOW = Date.parse('2026-10-15T10:00:00Z');
const user = (patch) => ({
  fullName: 'Ayşe Yılmaz',
  email: 'ayse@haksan.com',
  username: 'ayse',
  status: 'active',
  lockedUntil: null,
  department: { name: 'Satış' },
  roles: [{ name: 'Satış' }],
  divisions: [{ name: 'CNC' }],
  ...patch,
});

test('kilit yalnız gelecekteki lockedUntil için geçerli', () => {
  assert.equal(isUserLocked({ lockedUntil: '2026-10-15T11:00:00Z' }, NOW), true);
  assert.equal(isUserLocked({ lockedUntil: '2026-10-15T09:00:00Z' }, NOW), false);
  assert.equal(isUserLocked({ lockedUntil: null }, NOW), false);
  assert.equal(isUserLocked({ lockedUntil: 'bozuk' }, NOW), false);
});

test('KPI ve durum filtresi webdeki tanımı izler', () => {
  const users = [
    user({}),
    user({ fullName: 'Kilitli', lockedUntil: '2026-10-16T00:00:00Z' }),
    user({ fullName: 'Pasif', status: 'passive' }),
  ];
  assert.deepEqual(userKpis(users, NOW), { total: 3, active: 1, locked: 1 });
  assert.equal(filterUsers(users, '', 'locked', NOW).length, 1);
  assert.equal(filterUsers(users, '', 'active', NOW).length, 1);
  assert.equal(filterUsers(users, '', 'passive', NOW)[0].fullName, 'Pasif');
  assert.equal(filterUsers(users, 'cnc', 'all', NOW).length, 3);
  assert.equal(filterUsers(users, 'KİLİTLİ', 'all', NOW).length, 1);
});

test('bölüm seçimi sırayı, rol seçimi alfabeyi korur', () => {
  assert.deepEqual(toggleOrdered(['b'], 'a', true), ['b', 'a']);
  assert.deepEqual(toggleOrdered(['b', 'a'], 'b', false), ['a']);
  assert.deepEqual(toggleSorted(['sales'], 'admin', true), ['admin', 'sales']);
  assert.deepEqual(toggleSorted(['admin', 'sales'], 'admin', false), ['sales']);
});

test('erişim kapsamı varsayılanları ve birincil tekilliği', () => {
  const rows = initialAccessScopes(['companies', 'quotes'], [], 'dep-1', ['div-1', 'div-2']);
  assert.deepEqual(rows[0], { resource: 'companies', departmentId: 'dep-1', divisionId: 'div-1', isPrimary: true });
  const moved = moveScopesToDepartment([...rows, { resource: 'quotes', departmentId: null, divisionId: null, isPrimary: false }], 'dep-1', 'dep-2');
  assert.equal(moved[0].departmentId, 'dep-2');
  assert.equal(moved[2].departmentId, null);
  const extra = [...rows, { resource: 'companies', departmentId: null, divisionId: null, isPrimary: false }];
  const updated = updateScopeRow(extra, 2, { isPrimary: true });
  assert.equal(updated[0].isPrimary, false);
  assert.equal(updated[1].isPrimary, true);
  assert.equal(updated[2].isPrimary, true);
});

test('rol kodu Türkçe karakterleri sadeleştirir', () => {
  assert.equal(roleCodeFromName('Bölge Müdürü'), 'bolge_muduru');
  assert.equal(roleCodeFromName('  İç Satış / Çağrı '), 'ic_satis_cagri');
  assert.ok(roleCodeFromName('x'.repeat(100)).length <= 64);
});

const permissions = [
  { code: 'companies.read', resource: 'companies', action: 'read' },
  { code: 'companies.create', resource: 'companies', action: 'create' },
  { code: 'companies.approve', resource: 'companies', action: 'approve' },
  { code: 'quotes.read', resource: 'quotes', action: 'read' },
  { code: 'quotes.export', resource: 'quotes', action: 'export' },
];

test('rol şablonu ve matris yardımcıları', () => {
  assert.deepEqual(applyRoleTemplate(permissions, 'readonly'), ['companies.read', 'quotes.export', 'quotes.read']);
  assert.deepEqual(applyRoleTemplate(permissions, 'approver'), ['companies.approve', 'companies.read', 'quotes.export', 'quotes.read']);
  const rows = buildPermissionRows(permissions);
  assert.deepEqual(rows.map((row) => row.resource), ['companies', 'quotes']);
  assert.equal(rows[0].actions.create.code, 'companies.create');

  const codes = ['companies.read'];
  assert.equal(groupState(new Set(codes), ['companies.read', 'companies.create']), 'some');
  const all = toggleGroup(codes, ['companies.read', 'companies.create']);
  assert.deepEqual(all, ['companies.create', 'companies.read']);
  assert.deepEqual(toggleGroup(all, ['companies.read', 'companies.create']), []);
  assert.equal(effectiveActionCounts(permissions, all).create, 1);
  assert.equal(moduleCount(permissions, ['companies.read', 'quotes.read', 'quotes.export']), 2);
  assert.equal(sameCodes(['a', 'b'], ['b', 'a']), true);
  assert.ok(NEW_ROLE_DEFAULT_CODES.includes('trade_fairs.read'));
});

test('sistem rolleri önce sıralanır', () => {
  const sorted = sortRoles([{ name: 'Zeta' }, { name: 'Admin', isSystemRole: true }, { name: 'Alfa' }]);
  assert.deepEqual(sorted.map((role) => role.name), ['Admin', 'Alfa', 'Zeta']);
});

test('departman kodu normalize edilir', () => {
  assert.equal(normalizeDepartmentCode('İç Satış'), 'ic_satis');
  assert.equal(normalizeDepartmentCode('__Servis-2__'), 'servis-2');
});
