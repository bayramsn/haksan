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
    expect(preview).toMatchObject({
      cuttingModels: 101, cuttingVariants: 101, profiles: 1414, createProducts: 111,
      mergeVariantProducts: 0, linkedVariantProducts: 0,
    });

    const applied = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, true);
    expect(applied).toMatchObject({ createdProducts: 111, migratedBaseProducts: 0, mergedVariantProducts: 0, cuttingVariants: 101 });

    // Model başına TEK kart: kabin/güç kartı açılmaz.
    // "PG3015%" aynı zamanda PG3015+T6-230'u da yakalar; kabin/güç kartı arayan desen "PG3015-%".
    const pgVariants = await db.select().from(schema.productModels).where(and(
      eq(schema.productModels.tenantId, operator!.tenantId), like(schema.productModels.modelCode, 'PG3015-%'), isNull(schema.productModels.deletedAt),
    ));
    expect(pgVariants).toHaveLength(0);
    const pg = (await db.query.productModels.findFirst({ where: and(
      eq(schema.productModels.tenantId, operator!.tenantId), eq(schema.productModels.modelCode, 'PG3015'),
    ) }))!;
    expect(pg).toBeTruthy();
    expect(pg.fullName).toBe('PG3015 Sac Lazer Kesim');
    expect(pg.listPrice).toBeNull();
    expect(pg.technicalConfiguration?.selection).toMatchObject({ sourceModelCode: 'PG3015', cabinType: 'closed', powerKw: 1.5 });

    // Kabin ve güç kombinasyonları profil olarak saklanmaya devam eder; teklif satırındaki
    // güç seçicisi bunları çözer.
    const [storedProfiles] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.laserTechnicalProfiles).where(and(
      eq(schema.laserTechnicalProfiles.tenantId, operator!.tenantId), isNull(schema.laserTechnicalProfiles.deletedAt),
    ));
    expect(storedProfiles.count).toBe(1414);

    // Eski sürümün açtığı kabin/güç kartlarını taklit et: biri teklife bağlı, biri değil.
    await db.update(schema.productModels).set({ modelCode: 'PG3015-KAPALI-3KW', listPrice: '123' }).where(eq(schema.productModels.id, pg.id));
    const [spare] = await db.insert(schema.productModels).values({
      tenantId: operator!.tenantId, brandId: pg.brandId, series: pg.series,
      productGroupId: pg.productGroupId, categoryId: pg.categoryId, subcategoryId: pg.subcategoryId,
      productTypeId: pg.productTypeId, supplierCompanyId: pg.supplierCompanyId,
      modelCode: 'PG3015-ACIK-6KW', modelName: 'PG3015 Açık Kabin 6 kW',
      fullName: 'PG3015 Açık Kabin 6 kW Sac Lazer Kesim', currencyId: pg.currencyId, vatRate: '20',
    }).returning({ id: schema.productModels.id });

    const merge = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, false);
    expect(merge).toMatchObject({ mergeVariantProducts: 2 });

    const merged = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, true);
    expect(merged).toMatchObject({ createdProducts: 0, mergedVariantProducts: 1 });

    // Hayatta kalan kart modelin kodunu alır, kimliğini ve fiyatını korur.
    const survivor = await db.query.productModels.findFirst({ where: and(
      eq(schema.productModels.tenantId, operator!.tenantId), eq(schema.productModels.modelCode, 'PG3015'),
    ) });
    expect(survivor).toMatchObject({ id: pg.id, listPrice: '123.0000' });
    // Fazlalık kart SİLİNMEZ, soft-delete edilir: ona bağlı teklif/stok kayıtları kırılmaz.
    const removed = await db.query.productModels.findFirst({ where: eq(schema.productModels.id, spare!.id) });
    expect(removed?.deletedAt).toBeTruthy();

    const repeat = await importHexlaserCatalog(db, operator!.tenantId, operator!.id, false);
    expect(repeat).toMatchObject({ createProducts: 0, preserveProducts: 111, migrateBaseProducts: 0, mergeVariantProducts: 0 });
  }, 180_000);
});
