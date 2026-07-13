/**
 * PRODUCTION bootstrap — demo veri OLMADAN sistemi giriş yapılabilir hale getirir.
 *
 * Oluşturur (idempotent):
 *   - Lookup tabloları + izin kataloğu (seedLookups)
 *   - Tek tenant (TENANT_NAME / TENANT_SLUG)
 *   - Tüm roller + rol-izin matrisi
 *   - 4 standart departman
 *   - TEK admin kullanıcı (super_admin) — ADMIN_EMAIL / ADMIN_PASSWORD
 *
 * Demo şirket/teklif/kullanıcı OLUŞTURMAZ. Production'da `db:seed` (lookups) sonrası
 * bunu kullanın:
 *   ADMIN_EMAIL=admin@firma.com ADMIN_PASSWORD='GucluParola1!' npm run db:bootstrap
 */
import { hashPassword } from '../../shared/security/password';
import { and, eq } from 'drizzle-orm';
import { getDb, closeDb, schema } from '../client';
import { allRoles, rolePermissionMatrix } from './_data';
import { seedLookups } from './lookups';
import { PERMISSION_RESOURCES } from '@haksan/shared';

const DEFAULT_SCOPE_RESOURCES = PERMISSION_RESOURCES.filter(
  (resource) => !['tenants', 'users', 'roles', 'departments', 'divisions', 'audit', 'files'].includes(resource)
);

async function main(): Promise<void> {
  const tenantName = process.env.TENANT_NAME ?? 'Haksan';
  const tenantSlug = process.env.TENANT_SLUG ?? 'haksan';
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME ?? 'Sistem Yöneticisi';

  if (!adminEmail || !adminPassword) {
    console.error('[bootstrap] ADMIN_EMAIL ve ADMIN_PASSWORD zorunludur.');
    console.error("  Örnek: ADMIN_EMAIL=admin@firma.com ADMIN_PASSWORD='GucluParola1!' npm run db:bootstrap");
    process.exit(1);
  }
  if (adminPassword.length < 8) {
    console.error('[bootstrap] ADMIN_PASSWORD en az 8 karakter olmalı.');
    process.exit(1);
  }

  // 0) Lookuplar + izin kataloğu (idempotent; rol-izin eşlemesi buna bağlı)
  console.log('[bootstrap] lookuplar + izin kataloğu …');
  await seedLookups();

  const db = getDb();

  // 1) Tenant
  const [created] = await db
    .insert(schema.tenants)
    .values({ name: tenantName, slug: tenantSlug })
    .onConflictDoNothing({ target: schema.tenants.slug })
    .returning();
  const tenant = created ?? (await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, tenantSlug) }))!;
  console.log(`[bootstrap] tenant: ${tenant.id} (${tenant.slug})`);

  // 2) Roller + rol-izin matrisi
  const allPerms = await db.query.permissions.findMany();
  const permsByCode = new Map(allPerms.map((p) => [p.code, p]));
  for (const roleCode of allRoles) {
    const existingRole = await db.query.roles.findFirst({
      where: and(eq(schema.roles.tenantId, tenant.id), eq(schema.roles.code, roleCode)),
    });
    const role =
      existingRole ??
      (
        await db
          .insert(schema.roles)
          .values({
            tenantId: tenant.id,
            code: roleCode,
            name: roleCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            isSystemRole: true,
          })
          .returning()
      )[0];

    const matrix = rolePermissionMatrix[roleCode] ?? {};
    const permCodes: string[] = [];
    for (const [resource, actions] of Object.entries(matrix)) {
      const resourceList = resource === '*' ? Array.from(new Set(allPerms.map((p) => p.resource))) : [resource];
      for (const r of resourceList) {
        const actionList =
          actions === '*'
            ? Array.from(new Set(allPerms.filter((p) => p.resource === r).map((p) => p.action)))
            : (actions as string[]);
        for (const a of actionList) permCodes.push(`${r}.${a}`);
      }
    }
    const rows = permCodes
      .map((code) => permsByCode.get(code))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ roleId: role.id, permissionId: p.id }));
    if (rows.length) await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
  }
  const rolesByCode = new Map(
    (await db.query.roles.findMany({ where: eq(schema.roles.tenantId, tenant.id) })).map((r) => [r.code, r])
  );
  console.log(`[bootstrap] ${rolesByCode.size} rol + izinleri hazır`);

  // 3) Departmanlar (işlevsel birimler)
  const deptDefs = [
    { code: 'sales', name: 'Satış' },
    { code: 'service', name: 'Servis' },
    { code: 'finance', name: 'Finans' },
    { code: 'stock', name: 'Stok' },
  ];
  for (const d of deptDefs) {
    const existing = await db.query.departments.findFirst({
      where: and(eq(schema.departments.tenantId, tenant.id), eq(schema.departments.code, d.code)),
    });
    if (!existing) await db.insert(schema.departments).values({ tenantId: tenant.id, ...d });
  }

  // 3b) Bölümler (satış grupları: CNC / Üniversal / Sac İşleme) — izolasyon ekseni
  const divisionDefs = [
    { code: 'cnc', name: 'CNC', sortOrder: 1 },
    { code: 'universal', name: 'Üniversal', sortOrder: 2 },
    { code: 'sac_isleme', name: 'Sac İşleme', sortOrder: 3 },
  ];
  for (const d of divisionDefs) {
    const existing = await db.query.divisions.findFirst({
      where: and(eq(schema.divisions.tenantId, tenant.id), eq(schema.divisions.code, d.code)),
    });
    if (!existing) await db.insert(schema.divisions).values({ tenantId: tenant.id, ...d });
  }

  // 4) Tek admin kullanıcı (super_admin)
  const existingUser = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenant.id), eq(schema.users.email, adminEmail)),
  });
  let adminUser = existingUser;
  if (existingUser) {
    console.log(`[bootstrap] kullanıcı zaten mevcut, atlandı: ${adminEmail}`);
  } else {
    const passwordHash = await hashPassword(adminPassword);
    const [user] = await db
      .insert(schema.users)
      .values({ tenantId: tenant.id, fullName: adminName, email: adminEmail, passwordHash })
      .returning();
    const superRole = rolesByCode.get('super_admin');
    if (superRole) {
      await db.insert(schema.userRoles).values({ userId: user.id, roleId: superRole.id }).onConflictDoNothing();
    }
    adminUser = user;
    console.log(`[bootstrap] admin oluşturuldu: ${adminEmail} (super_admin)`);
  }
  if (adminUser) {
    await db
      .insert(schema.userAccessScopes)
      .values(
        DEFAULT_SCOPE_RESOURCES.map((resource) => ({
          tenantId: tenant.id,
          userId: adminUser.id,
          resource,
          departmentId: null,
          divisionId: null,
          isPrimary: true,
        }))
      )
      .onConflictDoNothing();
  }

  await closeDb();
  console.log('[bootstrap] tamamlandı — demo veri OLUŞTURULMADI.');
}

main().catch((err) => {
  console.error('[bootstrap] hata:', err);
  process.exit(1);
});
