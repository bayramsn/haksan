import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, isNull, like, sql } from 'drizzle-orm';

const runIntegration = process.env.RUN_HEXLASER_IMPORT_INTEGRATION === 'true';
let close: (() => Promise<void>) | undefined;

describe.skipIf(!runIntegration)('HEXLASER catalog product import', () => {
  afterAll(async () => close?.());

  it('creates separate product cards with one resolved profile per cabin and power', async () => {
    const [{ closeDb, getDb, schema }, { importHexlaserCatalog }] = await Promise.all([
      import('../src/db/client'), import('../src/db/import-hexlaser-catalog'),
    ]);
    close = closeDb;
    const db = getDb();
    const operator = await db.query.users.findFirst({ where: eq(schema.users.email, 'superadmin@haksan.local') });
    expect(operator).toBeTruthy();

    const preview = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, false);
    expect(preview).toMatchObject({ cuttingModels: 101, cuttingVariants: 1414, profiles: 1414, createProducts: 1424 });

    const applied = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, true);
    expect(applied).toMatchObject({ createdProducts: 1424, migratedBaseProducts: 0, cuttingVariants: 1414 });

    const pgProducts = await db.select().from(schema.productModels).where(and(
      eq(schema.productModels.tenantId, operator!.tenantId), like(schema.productModels.modelCode, 'PG3015-%'), isNull(schema.productModels.deletedAt),
    ));
    expect(pgProducts).toHaveLength(14);
    expect(pgProducts.some((product) => product.modelCode === 'PG3015')).toBe(false);
    const pgThree = pgProducts.find((product) => product.modelCode === 'PG3015-KAPALI-3KW')!;
    expect(pgThree.fullName).toBe('PG3015 Kapalı Kabin 3 kW Sac Lazer Kesim');
    expect(pgThree.listPrice).toBeNull();
    expect(pgThree.technicalConfiguration?.selection).toMatchObject({
      sourceModelCode: 'PG3015', cabinType: 'closed', powerKw: 3,
    });
    expect(pgThree.technicalConfiguration?.specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')).toMatchObject({ value: '25', unit: 'kW' });
    expect(pgThree.technicalConfiguration?.specs.find((spec) => spec.key === 'Trafo Kapasitesi')).toMatchObject({ value: '40', unit: 'kVA' });

    const [storedSpecs] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.productSpecs).where(and(
      eq(schema.productSpecs.productModelId, pgThree.id), isNull(schema.productSpecs.deletedAt),
    ));
    expect(storedSpecs.count).toBe(0);

    // Recreate the former model-level row shape and verify that the production
    // transition keeps its ID and commercial fields while removing aggregates.
    const pgOne = pgProducts.find((product) => product.modelCode === 'PG3015-KAPALI-1.5KW')!;
    await db.update(schema.productModels).set({
      modelCode: 'PG3015', modelName: null, fullName: 'PG3015 Sac Lazer Kesim',
      listPrice: '123', technicalConfiguration: null,
    }).where(eq(schema.productModels.id, pgOne.id));
    await db.insert(schema.productSpecs).values({
      tenantId: operator!.tenantId, productModelId: pgOne.id,
      specKey: 'Toplam Güç Gereksinimi', specValue: '1.5 kW: 17.5\n3 kW: 25', specUnit: 'kW',
    });
    const migrated = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, true);
    expect(migrated).toMatchObject({ createdProducts: 0, migratedBaseProducts: 1 });
    const restored = await db.query.productModels.findFirst({ where: and(
      eq(schema.productModels.tenantId, operator!.tenantId), eq(schema.productModels.modelCode, 'PG3015-KAPALI-1.5KW'),
    ) });
    expect(restored).toMatchObject({ id: pgOne.id, listPrice: '123.0000' });
    expect(restored?.technicalConfiguration?.selection).toMatchObject({ sourceModelCode: 'PG3015', cabinType: 'closed', powerKw: 1.5 });
    const [remainingAggregates] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.productSpecs).where(and(
      eq(schema.productSpecs.productModelId, pgOne.id), isNull(schema.productSpecs.deletedAt),
    ));
    expect(remainingAggregates.count).toBe(0);

    const repeat = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, false);
    expect(repeat).toMatchObject({ createProducts: 0, preserveProducts: 1424, migrateBaseProducts: 0 });
  }, 180_000);
});
