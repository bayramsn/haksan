import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { SQL, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import type { DbClient } from '../src/db/client';
import { up, down } from '../src/db/data-migrations/023_consolidate_machine_taxonomy';
import { importHaksanmakinaCatalog } from '../src/db/import-haksanmakina-catalog';

// Explicit opt-in private socket: never read DATABASE_URL or a production env file.
const socket = process.env.HAKSAN_TAXONOMY_TEST_SOCKET;
const tables = [schema.divisions, schema.productGroups, schema.productCategories,
  schema.productSubcategories, schema.productTypes, schema.productModels, schema.productOptionalEquipmentCompatibilities];
const importTables = [schema.tenants, schema.users, schema.roles, schema.userRoles, schema.brands,
  schema.productSpecGroups, schema.productSpecTemplates, schema.productSpecs, schema.auditLogs];
describe.skipIf(!socket)('machine taxonomy PostgreSQL transaction and rollback', () => {
  let pool: Pool; let db: DbClient;
  const id = { division: randomUUID(), group: randomUUID(), category: randomUUID(), old: randomUUID(),
    type: randomUUID(), model: randomUUID(), tenant: randomUUID(), equipment: randomUUID(), rule: randomUUID() };
  beforeAll(async () => {
    if (!socket?.startsWith('/private/tmp/haksan-taxonomy-socket-')) throw new Error('Only an isolated taxonomy test socket is accepted');
    pool = new Pool({ host: socket, port: Number(process.env.HAKSAN_TAXONOMY_TEST_PORT ?? 55439), database: 'postgres' });
    db = drizzle(pool, { schema });
    // A small schema made from the real columns; production FK actions relevant
    // to this migration are reproduced below. The isolated cluster owns it.
    for (const table of [...tables, ...importTables]) {
      const config = getTableConfig(table);
      await pool.query(`DROP TABLE IF EXISTS "${config.name}" CASCADE`);
      const columns = config.columns.map(c => {
        let defaultSql = '';
        if (c.default instanceof SQL) defaultSql = new PgDialect().sqlToQuery(c.default).sql;
        else if (c.default !== undefined) defaultSql = typeof c.default === 'boolean' || typeof c.default === 'number'
          ? String(c.default) : `'${(typeof c.default === 'object' ? JSON.stringify(c.default) : String(c.default)).replace(/'/g, "''")}'`;
        return `"${c.name}" ${c.getSQLType()}${c.name === 'id' ? ' PRIMARY KEY' : ''}${defaultSql ? ` DEFAULT ${defaultSql}` : ''}`;
      });
      await pool.query(`CREATE TABLE "${config.name}" (${columns.join(', ')})`);
    }
    await pool.query('DROP TABLE IF EXISTS public.__data_migrations');
    await pool.query('CREATE TABLE public.__data_migrations (id text PRIMARY KEY)');
    await pool.query('ALTER TABLE product_types ADD FOREIGN KEY (subcategory_id) REFERENCES product_subcategories(id)');
    await pool.query('ALTER TABLE product_models ADD FOREIGN KEY (subcategory_id) REFERENCES product_subcategories(id)');
    await pool.query('ALTER TABLE product_optional_equipment_compatibilities ADD FOREIGN KEY (subcategory_id) REFERENCES product_subcategories(id) ON DELETE CASCADE');
    await pool.query('ALTER TABLE product_optional_equipment_compatibilities ADD FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE CASCADE');
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE product_optional_equipment_compatibilities, product_models, product_types, product_subcategories, product_categories, product_groups, divisions, public.__data_migrations CASCADE');
    for (const table of importTables) await pool.query(`TRUNCATE "${getTableConfig(table).name}" CASCADE`);
    await pool.query('DROP TABLE IF EXISTS public.__machine_taxonomy_snapshots');
    await db.insert(schema.divisions).values({ id: id.division, tenantId: id.tenant, code: 'universal', name: 'Üniversal', isActive: true });
    await db.insert(schema.productGroups).values({ id: id.group, divisionId: id.division, code: 'UNIVERSAL', name: 'Üniversal' });
    await db.insert(schema.productCategories).values({ id: id.category, divisionId: id.division, productGroupId: id.group, code: 'TEZGAH', name: 'Tezgah' });
    await db.insert(schema.productSubcategories).values({ id: id.old, divisionId: id.division, categoryId: id.category, code: 'OLD_RADIAL', name: 'Radyal Matkap' });
    await db.insert(schema.productTypes).values({ id: id.type, divisionId: id.division, subcategoryId: id.old, code: 'RADYAL_MATKAP', name: 'Radyal Matkap' });
    await db.insert(schema.productModels).values({ id: id.model, tenantId: id.tenant, productGroupId: id.group, categoryId: id.category, subcategoryId: id.old, productTypeId: id.type, modelCode: 'RADIAL-1', fullName: 'Radyal 1', listPrice: '1234.50' });
    await db.insert(schema.productOptionalEquipmentCompatibilities).values({ id: id.rule, tenantId: id.tenant, productModelId: id.equipment, subcategoryId: id.old });
  });
  afterAll(async () => { await pool?.end(); });
  const snapshot = async () => Promise.all(tables.map(table => db.select().from(table).orderBy(table.id)));
  const migrate = () => db.transaction(async tx => up(tx as unknown as DbClient));
  const restore = () => db.transaction(async tx => down(tx as unknown as DbClient));

  it('persists consolidation once, preserves details and restores the exact original rows', async () => {
    await pool.query("UPDATE product_models SET updated_at='2026-10-10 08:00:00.123456+00' WHERE id=$1", [id.model]);
    const preciseTimestamp = async () => (await pool.query('SELECT updated_at::text AS value FROM product_models WHERE id=$1', [id.model])).rows[0].value;
    const originalTimestamp = await preciseTimestamp();
    const before = await snapshot();
    await migrate();
    expect(await preciseTimestamp()).toBe(originalTimestamp);
    const after = await snapshot();
    expect(after[3].filter(row => row.isActive)).toHaveLength(8);
    expect(after[5][0]).toMatchObject({ id: id.model, listPrice: before[5][0].listPrice, fullName: 'Radyal 1' });
    expect(after[5][0].subcategoryId).not.toBe(id.old);
    await migrate();
    expect(await snapshot()).toEqual(after);
    await restore();
    expect(await preciseTimestamp()).toBe(originalTimestamp);
    expect(await snapshot()).toEqual(before);
    await restore();
    expect(await snapshot()).toEqual(before);
    await migrate();
    expect((await snapshot())[3].filter(row => row.isActive)).toHaveLength(8);
  });
  it('rolls back every write on an unknown type and leaves no snapshot', async () => {
    await pool.query('UPDATE product_types SET code=$1 WHERE id=$2', ['UNKNOWN_TYPE', id.type]);
    const before = await snapshot();
    await expect(migrate()).rejects.toThrow('Unknown machine type');
    expect(await snapshot()).toEqual(before);
    const result = await db.execute(sql`SELECT to_regclass('public.__machine_taxonomy_snapshots') AS table_name`);
    expect(result.rows[0].table_name).toBeNull();
  });
  it('refuses rollback after a new reference instead of cascading away a rule', async () => {
    await migrate();
    const after = await snapshot();
    const family = after[3].find(row => row.code === 'MATKAP')!;
    await db.insert(schema.productOptionalEquipmentCompatibilities).values({ tenantId: id.tenant, productModelId: id.equipment, subcategoryId: family.id });
    const withNewRule = await snapshot();
    await expect(restore()).rejects.toThrow('Rollback');
    expect(await snapshot()).toEqual(withNewRule);
  });
  it('refuses rollback after editing the description of an inserted family', async () => {
    await migrate();
    await pool.query("UPDATE product_subcategories SET description='Admin changed description' WHERE code='MATKAP'");
    const edited = await snapshot();
    await expect(restore()).rejects.toThrow('Rollback blocked');
    expect(await snapshot()).toEqual(edited);
  });
  it('reimports both catalogs after consolidation into a preserved legacy category without duplicates', async () => {
    await pool.query("UPDATE product_categories SET code='universal_machine' WHERE id=$1", [id.category]);
    await migrate();
    const userId = randomUUID(); const roleId = randomUUID();
    await db.insert(schema.tenants).values({ id: id.tenant, slug: 'taxonomy-test', name: 'Taxonomy Test' });
    await db.insert(schema.users).values({ id: userId, tenantId: id.tenant, email: 'taxonomy@example.test', fullName: 'Test Operator', passwordHash: 'unused-in-isolated-test', status: 'active' });
    await db.insert(schema.roles).values({ id: roleId, tenantId: id.tenant, code: 'super_admin', name: 'Test Admin' });
    await db.insert(schema.userRoles).values({ userId, roleId });
    await db.insert(schema.divisions).values({ tenantId: id.tenant, code: 'sac_isleme', name: 'Sac İşleme', isActive: true });
    expect(await importHaksanmakinaCatalog(db, id.tenant, userId, true)).toMatchObject({ created: 512 });
    expect(await importHaksanmakinaCatalog(db, id.tenant, userId, true, true)).toMatchObject({ created: 13 });
    const after = await snapshot();
    expect(after[5].filter(row => row.productGroupId === id.group).every(row => row.categoryId === id.category)).toBe(true);
    expect(await importHaksanmakinaCatalog(db, id.tenant, userId, true)).toMatchObject({ created: 0, skipped: 512 });
    expect(await importHaksanmakinaCatalog(db, id.tenant, userId, true, true)).toMatchObject({ created: 0, skipped: 13 });
    expect(await snapshot()).toEqual(after);
  });
});
