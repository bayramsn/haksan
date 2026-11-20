import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { SQL } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import type { DbClient } from '../src/db/client';
import { up, down } from '../src/db/data-migrations/024_laser_series_base_models';
import { resolveLaserProfile } from '@haksan/shared';

const socket = process.env.HAKSAN_TAXONOMY_TEST_SOCKET;
const tables = [schema.productModels, schema.productOptionSets, schema.productOptionValues];
const ancillary = [schema.brands, schema.productTypes];
describe.skipIf(!socket)('laser bases isolated PostgreSQL migration', () => {
  let pool: Pool; let db: DbClient;
  const tenantId = randomUUID(); const brandId = randomUUID();
  beforeAll(async () => {
    if (!socket?.startsWith('/private/tmp/haksan-taxonomy-socket-')) throw new Error('Only private isolated socket allowed');
    pool = new Pool({ host: socket, port: Number(process.env.HAKSAN_TAXONOMY_TEST_PORT ?? 55439), database: 'postgres' });
    db = drizzle(pool, { schema });
    for (const table of [...tables, ...ancillary]) {
      const config = getTableConfig(table);
      await pool.query(`DROP TABLE IF EXISTS "${config.name}" CASCADE`);
      const columns = config.columns.map(c => {
        let d = '';
        if (c.default instanceof SQL) d = new PgDialect().sqlToQuery(c.default).sql;
        else if (c.default !== undefined) d = typeof c.default === 'boolean' || typeof c.default === 'number' ? String(c.default) : `'${(typeof c.default === 'object' ? JSON.stringify(c.default) : String(c.default)).replace(/'/g, "''")}'`;
        return `"${c.name}" ${c.getSQLType()}${c.name === 'id' ? ' PRIMARY KEY' : ''}${d ? ` DEFAULT ${d}` : ''}`;
      });
      await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    await pool.query('ALTER TABLE product_option_sets ADD FOREIGN KEY (product_model_id) REFERENCES product_models(id) ON DELETE CASCADE');
    await pool.query('ALTER TABLE product_option_values ADD FOREIGN KEY (option_set_id) REFERENCES product_option_sets(id) ON DELETE CASCADE');
    await pool.query('DROP TABLE IF EXISTS quote_items CASCADE');
    await pool.query('DROP TABLE IF EXISTS inventory_items CASCADE');
    await pool.query('CREATE TABLE quote_items (id uuid PRIMARY KEY, product_model_id uuid REFERENCES product_models(id), compatibility jsonb)');
    await pool.query('CREATE TABLE inventory_items (id uuid PRIMARY KEY, product_model_id uuid REFERENCES product_models(id))');
    await pool.query('CREATE TABLE IF NOT EXISTS public.__data_migrations (id text PRIMARY KEY)');
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE product_models, product_option_sets, product_option_values, quote_items, inventory_items CASCADE');
    await pool.query('DROP TABLE IF EXISTS public.__laser_base_snapshots');
    await pool.query('TRUNCATE brands, product_types CASCADE');
    for (const sourceModelCode of ['F3015', 'F4020']) {
      await db.insert(schema.productModels).values({ tenantId, brandId, modelCode: sourceModelCode, fullName: sourceModelCode, listPrice: '12345', technicalConfiguration: resolveLaserProfile({ series:'F', sourceModelCode, productTypeCode:'FIBER_LAZER_KESIM', powerKw:3, cabinType:'open' }) });
    }
    const [source] = await db.select().from(schema.productModels);
    await pool.query('INSERT INTO quote_items VALUES ($1,$2,$3)', [randomUUID(), source.id, JSON.stringify({ technicalConfiguration: source.technicalConfiguration })]);
  });
  afterAll(async () => { await pool?.end(); });
  const snapshot = async () => Promise.all(tables.map(table => db.select().from(table).orderBy(table.id)));
  const migrate = () => db.transaction(tx => up(tx as unknown as DbClient));
  const restore = () => db.transaction(tx => down(tx as unknown as DbClient));
  it('creates one family, archives sources, preserves historical snapshots, repeats and rolls back exactly', async () => {
    await pool.query("UPDATE product_models SET updated_at='2026-10-10 08:00:00.123456+00'");
    const precise = async () => (await pool.query('SELECT id, updated_at::text FROM product_models WHERE laser_base_configuration IS NULL ORDER BY id')).rows;
    const originalPrecise = await precise();
    const before = await snapshot(); const quotes = (await pool.query('SELECT * FROM quote_items')).rows;
    await migrate(); const after = await snapshot();
    expect(after[0].filter(p => !p.catalogHidden)).toHaveLength(1);
    expect(after[0].filter(p => p.catalogHidden)).toHaveLength(2);
    expect(after[0].find(p => p.laserBaseConfiguration)?.listPrice).toBeNull();
    expect(after[0].find(p => p.laserBaseConfiguration)?.technicalConfiguration).toBeNull();
    expect(after[2].every(v => v.priceDelta === null)).toBe(true);
    expect((await pool.query('SELECT * FROM quote_items')).rows).toEqual(quotes);
    await migrate(); expect(await snapshot()).toEqual(after);
    await restore(); expect(await snapshot()).toEqual(before);
    expect(await precise()).toEqual(originalPrecise);
    expect((await pool.query('SELECT * FROM quote_items')).rows).toEqual(quotes);
  });
  it('attaches options to an existing AORE series card without changing its ID or price', async () => {
    const aoreBrand = randomUUID(); const typeId = randomUUID();
    await db.insert(schema.brands).values({ id:aoreBrand, tenantId, name:'AORE' });
    await db.insert(schema.productTypes).values({ id:typeId, code:'fiber_lazer_kesim',name:'Lazer' });
    const [series] = await db.insert(schema.productModels).values({ tenantId,brandId:aoreBrand, productTypeId:typeId, modelCode:'HM-1337',modelName:'F Serisi',fullName:'AORE F Serisi',listPrice:'22222' }).returning();
    const before = await snapshot(); await migrate();
    const current = (await snapshot())[0].find(p => p.id===series.id)!;
    expect(current.laserBaseConfiguration?.familyCode).toBe('F');
    expect(current.listPrice).toBe(series.listPrice); expect(current.catalogHidden).toBe(false);
    const sets = (await snapshot())[1].filter(s => s.productModelId === series.id); expect(sets).toHaveLength(3);
    await restore(); expect(await snapshot()).toEqual(before);
  });
  it('refuses rollback after option edits and keeps the transaction untouched', async () => {
    await migrate(); await pool.query("UPDATE product_option_values SET price_delta=10 WHERE id=(SELECT id FROM product_option_values LIMIT 1)");
    const before = await snapshot(); await expect(restore()).rejects.toThrow('subsequent edit'); expect(await snapshot()).toEqual(before);
  });
  it('refuses rollback for a new quote reference', async () => {
    await migrate(); const base = (await snapshot())[0].find(p => p.laserBaseConfiguration)!;
    await pool.query('INSERT INTO quote_items VALUES ($1,$2,NULL)', [randomUUID(),base.id]);
    await expect(restore()).rejects.toThrow('new reference');
  });
  it('rejects unknown models atomically', async () => {
    await pool.query("UPDATE product_models SET technical_configuration=jsonb_set(technical_configuration,'{selection,sourceModelCode}','\"F9999\"')");
    const before = await snapshot(); await expect(migrate()).rejects.toThrow('Unmapped'); expect(await snapshot()).toEqual(before);
  });
  it('tenant-scoped import consolidation leaves other tenants completely untouched', async () => {
    const otherTenant = randomUUID();
    const [other] = await db.insert(schema.productModels).values({ tenantId: otherTenant, brandId,
      modelCode: 'F3015-OTHER', fullName: 'Other tenant source', listPrice: '89000',
      technicalConfiguration: resolveLaserProfile({ series: 'F', sourceModelCode: 'F3015', productTypeCode: 'FIBER_LAZER_KESIM', powerKw: 3, cabinType: 'open' }),
    }).returning();
    await db.transaction(tx => up(tx as unknown as DbClient, tenantId));
    const models = (await snapshot())[0];
    expect(models.filter(model => model.tenantId === otherTenant)).toEqual([other]);
    expect(models.filter(model => model.tenantId === tenantId && model.laserBaseConfiguration)).toHaveLength(1);
  });
});
