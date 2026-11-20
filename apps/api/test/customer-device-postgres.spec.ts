import 'reflect-metadata';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { SQL } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { upsertInventoryCustomerDevice, reportDuplicateInventoryDevices } from '../src/shared/utils/customer-device-upsert';
import type { AuthContext } from '../src/shared/security/auth.types';
import type { DbClient } from '../src/db/client';
const socket = process.env.HAKSAN_TAXONOMY_TEST_SOCKET;
const migration = readFileSync(new URL('../src/db/migrations/0162_customer_device_active_inventory.sql', import.meta.url), 'utf8');
describe.skipIf(!socket)('Customer device isolated PostgreSQL', () => {
  let pool: Pool; let db: DbClient;
  const tenantId = randomUUID(), companyId = randomUUID(), itemId = randomUUID();
  const actor = { tenantId, userId: randomUUID(), roles: ['super_admin'], accessScopes: [], canViewAllDivisions: true, divisionIds: [], permissions: new Set(), activeDivisionId: 'all' } as unknown as AuthContext;
  const input = { tenantId, companyId, inventoryItemId: itemId };
  beforeAll(async () => {
    if (!socket?.startsWith('/private/tmp/haksan-taxonomy-socket-')) throw new Error('Private isolated PostgreSQL socket required');
    const admin = new Pool({ host: socket, port: 55439, database: 'postgres' });
    const name = 'haksan_device_20261014_test';
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rows.length) await admin.query(`CREATE DATABASE ${name}`);
    await admin.end(); pool = new Pool({ host: socket, port: 55439, database: name }); db = drizzle(pool, { schema });
    await pool.query('DROP SCHEMA public CASCADE'); await pool.query('CREATE SCHEMA public');
    for (const table of [schema.companies, schema.contacts, schema.contactCompanies, schema.inventoryItems, schema.customerDevices, schema.warrantyStatuses, schema.inventoryStatuses, schema.installationStatuses, schema.inventoryMovements, schema.installationJobs]) {
      const config = getTableConfig(table);
      const columns = config.columns.map((c) => {
        const d = c.default instanceof SQL ? new PgDialect().sqlToQuery(c.default).sql : c.default === undefined ? '' : typeof c.default === 'boolean' || typeof c.default === 'number' ? String(c.default) : `'${String(c.default).replace(/'/g, "''")}'`;
        return `"${c.name}" ${c.getSQLType()}${c.name === 'id' ? ' PRIMARY KEY' : ''}${d ? ` DEFAULT ${d}` : ''}`;
      });
      await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    await db.insert(schema.companies).values({ id: companyId, tenantId, name: 'Test company' } as never);
    await db.insert(schema.inventoryItems).values({ id: itemId, tenantId, serialNumber: '00001', productModelId: randomUUID() });
    await pool.query(migration);
  });
  afterAll(async () => { await pool?.end(); });
  it('concurrent invoice/delivery/manual calls create one identity, with enrichment and unchanged serial', async () => {
    const rows = await Promise.all(Array.from({ length: 6 }, (_, i) => db.transaction((tx) => upsertInventoryCustomerDevice(tx, actor, { ...input, ...(i === 0 ? { deliveryDate: new Date('2026-10-14') } : {}) }))));
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    expect((await pool.query('SELECT count(*)::int n FROM customer_devices')).rows[0].n).toBe(1);
    expect((await pool.query('SELECT serial_number FROM inventory_items WHERE id=$1', [itemId])).rows[0].serial_number).toBe('00001');
  });
  it('manual replay returns the existing device, validates company changes and permits explicit contact removal', async () => {
    const contactId = randomUUID(), nextCompanyId = randomUUID();
    await db.insert(schema.contacts).values({ id: contactId, tenantId, companyId, firstName: 'Test' } as never);
    await db.insert(schema.companies).values({ id: nextCompanyId, tenantId, name: 'Next' } as never);
    const service = new InventoryService(db, {} as never);
    const first = await service.createCustomerDevice({ companyId, inventoryItemId: itemId, contactId }, actor);
    const replay = await service.createCustomerDevice({ companyId, inventoryItemId: itemId }, actor);
    expect(replay.id).toBe(first.id);
    await expect(service.updateCustomerDevice(first.id, { companyId: nextCompanyId }, actor)).rejects.toThrow('firmaya ait değil');
    const transferred = await service.updateCustomerDevice(first.id, { companyId: nextCompanyId, contactId: null }, actor);
    expect(transferred?.companyId).toBe(nextCompanyId);
    expect(transferred?.contactId).toBeNull();
    expect(transferred?.initialCompanyId).toBe(companyId);
    expect(transferred?.inventoryItemId).toBe(itemId);
  });
  it('replayed machine invoice keeps one installation and one customer device', async () => {
    const stockId = randomUUID(), availableId = randomUUID(), soldId = randomUUID();
    await db.insert(schema.inventoryStatuses).values([{ id: availableId, code: 'available', name: 'Available' }, { id: soldId, code: 'sold', name: 'Sold' }]);
    await db.insert(schema.inventoryItems).values({ id: stockId, tenantId, serialNumber: '00002', productModelId: randomUUID(), stockStatusId: availableId });
    const service = new InventoryService(db, { write: async () => {} } as never);
    vi.spyOn(service, 'get').mockImplementation(async (id) => (await db.query.inventoryItems.findFirst({ where: (table, { eq }) => eq(table.id, id) })) as never);
    const invoice = { invoiceId: randomUUID(), companyId, invoiceDate: new Date(), lines: [{ inventoryItemId: stockId, categoryCode: 'TEZGAH' }] };
    await service.sellFromSalesInvoice(invoice, actor);
    await service.sellFromSalesInvoice(invoice, actor);
    expect((await pool.query('SELECT count(*)::int n FROM customer_devices WHERE inventory_item_id=$1', [stockId])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int n FROM installation_jobs')).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM inventory_movements WHERE inventory_item_id=$1 AND movement_type='sell'", [stockId])).rows[0].n).toBe(1);
  });
  it('device-company conflicts roll back the entire invoice stock sale', async () => {
    const stockId = randomUUID(), otherCompanyId = randomUUID();
    const available = await db.query.inventoryStatuses.findFirst({ where: (table, { eq }) => eq(table.code, 'available') });
    await db.insert(schema.inventoryItems).values({ id: stockId, tenantId, serialNumber: '00003', productModelId: randomUUID(), stockStatusId: available!.id });
    await db.insert(schema.companies).values({ id: otherCompanyId, tenantId, name: 'Conflict' } as never);
    await db.insert(schema.customerDevices).values({ tenantId, companyId: otherCompanyId, inventoryItemId: stockId });
    const service = new InventoryService(db, { write: async () => {} } as never);
    vi.spyOn(service, 'get').mockImplementation(async (id) => (await db.query.inventoryItems.findFirst({ where: (table, { eq }) => eq(table.id, id) })) as never);
    await expect(service.sellFromSalesInvoice({ invoiceId: randomUUID(), companyId, invoiceDate: new Date(), lines: [{ inventoryItemId: stockId, categoryCode: 'TEZGAH' }] }, actor)).rejects.toThrow('başka bir müşteri');
    expect((await pool.query('SELECT stock_status_id FROM inventory_items WHERE id=$1', [stockId])).rows[0].stock_status_id).toBe(available!.id);
    expect((await pool.query('SELECT count(*)::int n FROM inventory_movements WHERE inventory_item_id=$1', [stockId])).rows[0].n).toBe(0);
  });
  it('database protects against bypassing the shared helper', async () => {
    await expect(db.insert(schema.customerDevices).values(input)).rejects.toThrow();
  });
  it('migration reports and refuses preexisting duplicates without deleting them', async () => {
    await pool.query('DROP INDEX customer_devices_active_inventory_unique');
    const duplicate = await db.insert(schema.customerDevices).values(input).returning();
    expect((await reportDuplicateInventoryDevices(db)).rows).toHaveLength(1);
    await expect(pool.query(migration)).rejects.toThrow('Duplicate active');
    expect((await pool.query('SELECT count(*)::int n FROM customer_devices WHERE inventory_item_id=$1', [itemId])).rows[0].n).toBe(2);
    await pool.query('DELETE FROM customer_devices WHERE id=$1', [duplicate[0].id]);
    await pool.query(migration);
  });
});
