import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('./dashboard.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function dashboard(ticketSummary) {
  const calls = [];
  const endpoints = {
    companies: { summary: async () => ({ byStatus: { active: 4 }, total: 5 }) },
    finance: { receivableSummary: async () => ({ total: 8, overdueCount: 2, byCurrency: [] }) },
    inventory: { customerDevices: async () => ({ meta: { total: 12 } }) },
    reports: {
      pipelineSummary: async () => [],
      serviceSummary: async () => { calls.push('complaints'); return { total: 99, new: 90, reviewing: 1 }; },
    },
    service: { ticketSummary: async () => { calls.push('tickets'); return ticketSummary(); } },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => name === './endpoints' ? endpoints : { useQuery: (options) => options },
  });
  return { query: exports.useDashboard(), calls };
}

test('open service KPI uses the service ticket summary, never complaint intake counts', async () => {
  const { query, calls } = dashboard(() => ({ open: 7, total: 11 }));
  const data = await query.queryFn();
  assert.equal(data.openServices, 7);
  assert.equal(data.serviceTotal, 11);
  assert.deepEqual(calls, ['tickets']);
});

test('zero service tickets remains zero even when complaint intakes exist', async () => {
  const { query } = dashboard(() => ({ open: 0, total: 0 }));
  const data = await query.queryFn();
  assert.equal(data.openServices, 0);
  assert.equal(data.serviceTotal, 0);
});

test('unavailable ticket summary stays unknown and preserves other KPIs', async () => {
  const { query, calls } = dashboard(() => { throw new Error('forbidden'); });
  const data = await query.queryFn();
  assert.equal(data.openServices, null);
  assert.equal(data.serviceTotal, null);
  assert.equal(data.totalCustomers, 5);
  assert.deepEqual(calls, ['tickets']);
});
