const argon2 = require('argon2');
const { and, eq, sql } = require('drizzle-orm');
const { PERMISSION_ACTIONS, PERMISSION_RESOURCES } = require('@haksan/shared');
const { closeDb, getDb, schema } = require('/app/apps/api/dist/db/client.js');
const { allRoles, lookupRows, rolePermissionMatrix } = require('/app/apps/api/dist/db/seed/_data.js');

const TABLE_MAP = {
  pipeline_stages: schema.pipelineStages,
  quote_statuses: schema.quoteStatuses,
  sales_order_statuses: schema.salesOrderStatuses,
  purchase_order_statuses: schema.purchaseOrderStatuses,
  opportunity_statuses: schema.opportunityStatuses,
  activity_types: schema.activityTypes,
  company_relation_types: schema.companyRelationTypes,
  company_statuses: schema.companyStatuses,
  company_groups: schema.companyGroups,
  contact_sources: schema.contactSources,
  decision_roles: schema.decisionRoles,
  product_groups: schema.productGroups,
  product_categories: schema.productCategories,
  product_subcategories: schema.productSubcategories,
  product_types: schema.productTypes,
  product_spec_groups: schema.productSpecGroups,
  equipment_types: schema.equipmentTypes,
  inventory_statuses: schema.inventoryStatuses,
  stock_location_statuses: schema.stockLocationStatuses,
  file_document_types: schema.fileDocumentTypes,
  storage_providers: schema.storageProviders,
  payment_statuses: schema.paymentStatuses,
  service_ticket_statuses: schema.serviceTicketStatuses,
  installation_statuses: schema.installationStatuses,
  currencies: schema.currencies,
  units: schema.units,
  warranty_statuses: schema.warrantyStatuses,
  shipment_statuses: schema.shipmentStatuses,
  invoice_statuses: schema.invoiceStatuses,
  proforma_statuses: schema.proformaStatuses,
  contract_statuses: schema.contractStatuses,
};

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

async function seedLookups(db) {
  for (const [tableName, rows] of Object.entries(lookupRows)) {
    const table = TABLE_MAP[tableName];
    if (!table || rows.length === 0) continue;
    await db.insert(table).values(rows).onConflictDoUpdate({
      target: table.code,
      set: {
        name: sql`EXCLUDED.name`,
        sortOrder: sql`EXCLUDED.sort_order`,
      },
    });
  }

  const permRows = [];
  for (const resource of PERMISSION_RESOURCES) {
    for (const action of PERMISSION_ACTIONS) {
      permRows.push({
        code: `${resource}.${action}`,
        name: `${resource} - ${action}`,
        resource,
        action,
      });
    }
  }
  permRows.push({
    code: 'divisions.view_all',
    name: 'Divisions - view all',
    resource: 'divisions',
    action: 'view_all',
  });

  await db.insert(schema.permissions).values(permRows).onConflictDoNothing({
    target: schema.permissions.code,
  });
}

async function main() {
  const tenantName = process.env.TENANT_NAME || 'Haksan';
  const tenantSlug = process.env.TENANT_SLUG || 'haksan';
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'Admin';

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  }

  const db = getDb();
  await seedLookups(db);

  const [createdTenant] = await db
    .insert(schema.tenants)
    .values({ name: tenantName, slug: tenantSlug })
    .onConflictDoNothing({ target: schema.tenants.slug })
    .returning();
  const tenant =
    createdTenant ||
    (await db.query.tenants.findFirst({
      where: eq(schema.tenants.slug, tenantSlug),
    }));
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const allPerms = await db.query.permissions.findMany();
  const permsByCode = new Map(allPerms.map((p) => [p.code, p]));

  for (const roleCode of allRoles) {
    const existingRole = await db.query.roles.findFirst({
      where: and(eq(schema.roles.tenantId, tenant.id), eq(schema.roles.code, roleCode)),
    });
    const role =
      existingRole ||
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

    const matrix = rolePermissionMatrix[roleCode] || {};
    const permCodes = [];
    for (const [resource, actions] of Object.entries(matrix)) {
      const resourceList = resource === '*' ? Array.from(new Set(allPerms.map((p) => p.resource))) : [resource];
      for (const r of resourceList) {
        const actionList =
          actions === '*'
            ? Array.from(new Set(allPerms.filter((p) => p.resource === r).map((p) => p.action)))
            : actions;
        for (const a of actionList) permCodes.push(`${r}.${a}`);
      }
    }
    const rows = permCodes
      .map((code) => permsByCode.get(code))
      .filter(Boolean)
      .map((p) => ({ roleId: role.id, permissionId: p.id }));
    if (rows.length) await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
  }

  for (const dept of [
    { code: 'sales', name: 'Satis' },
    { code: 'service', name: 'Servis' },
    { code: 'finance', name: 'Finans' },
    { code: 'stock', name: 'Stok' },
  ]) {
    const existing = await db.query.departments.findFirst({
      where: and(eq(schema.departments.tenantId, tenant.id), eq(schema.departments.code, dept.code)),
    });
    if (!existing) await db.insert(schema.departments).values({ tenantId: tenant.id, ...dept });
  }

  for (const division of [
    { code: 'cnc', name: 'CNC', sortOrder: 1 },
    { code: 'universal', name: 'Universal', sortOrder: 2 },
    { code: 'sac_isleme', name: 'Sac Isleme', sortOrder: 3 },
  ]) {
    const existing = await db.query.divisions.findFirst({
      where: and(eq(schema.divisions.tenantId, tenant.id), eq(schema.divisions.code, division.code)),
    });
    if (!existing) await db.insert(schema.divisions).values({ tenantId: tenant.id, ...division });
  }

  const existingUser = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenant.id), eq(schema.users.email, adminEmail)),
  });
  if (existingUser) {
    console.log(`[bootstrap] admin already exists: ${adminEmail}`);
  } else {
    const passwordHash = await argon2.hash(adminPassword, ARGON2_OPTIONS);
    const [user] = await db
      .insert(schema.users)
      .values({ tenantId: tenant.id, fullName: adminName, email: adminEmail, passwordHash })
      .returning();
    const superRole = await db.query.roles.findFirst({
      where: and(eq(schema.roles.tenantId, tenant.id), eq(schema.roles.code, 'super_admin')),
    });
    if (superRole) {
      await db.insert(schema.userRoles).values({ userId: user.id, roleId: superRole.id }).onConflictDoNothing();
    }
    console.log(`[bootstrap] admin created: ${adminEmail}`);
  }

  await closeDb();
  console.log('[bootstrap] done');
}

main().catch(async (err) => {
  await closeDb().catch(() => undefined);
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
