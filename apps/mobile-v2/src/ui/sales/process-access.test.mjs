import assert from 'node:assert/strict';
import test from 'node:test';
import { canPerformOpportunityAction } from './process-access.ts';

const allow = (codes) => (permission) => codes.includes(permission);

test('süreç görevleri web izin eşlemesini kullanır', () => {
  const base = { hasPermission: allow(['quotes.approve', 'opportunities.update']), isSuperAdmin: false, hiddenNavigationKeys: [] };
  assert.equal(canPerformOpportunityAction('approve_quote', base), true);
  assert.equal(canPerformOpportunityAction('approve_win', base), false);
  assert.equal(canPerformOpportunityAction('approve_win', { ...base, isSuperAdmin: true }), true);
  assert.equal(canPerformOpportunityAction('approve_payment', base), false);
  assert.equal(canPerformOpportunityAction('create_quote', { ...base, hasPermission: allow(['quotes.create']) }), true);
  assert.equal(canPerformOpportunityAction('reserve_stock', { ...base, hasPermission: allow(['inventory.update']) }), true);
  assert.equal(
    canPerformOpportunityAction('complete_shipment', { ...base, hasPermission: allow(['shipments.update']) }),
    true,
  );
  assert.equal(canPerformOpportunityAction('record_visit', { ...base, hasPermission: allow(['activities.create']) }), true);
  assert.equal(canPerformOpportunityAction('edit_machine', base), true);
});

test('gizli menü alanı süper yönetici dahil görevi kapatır', () => {
  const hidden = {
    hasPermission: () => true,
    isSuperAdmin: true,
    hiddenNavigationKeys: ['offers', 'stock'],
  };
  assert.equal(canPerformOpportunityAction('approve_quote', hidden), false);
  assert.equal(canPerformOpportunityAction('reserve_stock', hidden), false);
  assert.equal(canPerformOpportunityAction('approve_win', hidden), true);
});
