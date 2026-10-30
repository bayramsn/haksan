import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unacceptedAdvisories } from './audit-production-deps.mjs';

const advisory = (name, id, severity = 'high') => ({ name, severity, title: 't', url: `https://github.com/advisories/${id}` });
const report = (...via) => ({ vulnerabilities: { x: { via } } });

test('listedeki advisory süresi içinde geçer, transit (string) via yok sayılır', () => {
  assert.deepEqual(unacceptedAdvisories(report(advisory('zod', 'GHSA-mrhx-c7xc-m3w5'), 'zod'), '2026-10-30'), []);
});

test('aynı paketteki yeni advisory, süresi geçmiş istisna ve başka paket kırar', () => {
  assert.equal(unacceptedAdvisories(report(advisory('zod', 'GHSA-new0-0000-0000')), '2026-10-30').length, 1);
  assert.equal(unacceptedAdvisories(report(advisory('zod', 'GHSA-mrhx-c7xc-m3w5')), '2027-02-01').length, 1);
  assert.equal(unacceptedAdvisories(report(advisory('lodash', 'GHSA-mrhx-c7xc-m3w5')), '2026-10-30').length, 1);
});

test('moderate bulgular engellemez', () => {
  assert.deepEqual(unacceptedAdvisories(report(advisory('x', 'GHSA-aaaa-bbbb-cccc', 'moderate'))), []);
});
