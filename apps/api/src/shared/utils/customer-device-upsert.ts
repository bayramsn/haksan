import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies, contacts, contactCompanies } from '../../db/schema/companies';
import { customerDevices, inventoryItems } from '../../db/schema/inventory';
import type { AuthContext } from '../security/auth.types';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { resourceCompanyPortfolioFilter, resourceDivisionFilter } from './division-scope';

export type DeviceTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];
type DeviceInput = typeof customerDevices.$inferInsert;

export async function assertDeviceCompanyContact(
  tx: DeviceTransaction, actor: AuthContext, companyId: string, contactId?: string | null,
) {
  const company = await tx.query.companies.findFirst({ where: and(
    eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt),
    resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
  ) });
  if (!company) throw new NotFoundError('Firma bulunamadı');
  if (!contactId) return;
  const contact = await tx.query.contacts.findFirst({ where: and(
    eq(contacts.id, contactId), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt),
  ) });
  if (!contact) throw new NotFoundError('Kontak bulunamadı');
  if (contact.companyId === companyId) return;
  const link = await tx.query.contactCompanies.findFirst({ where: and(
    eq(contactCompanies.contactId, contactId), eq(contactCompanies.companyId, companyId),
  ) });
  if (!link) throw new ValidationError('Kontak seçilen firmaya ait değil');
}

export async function lockDeviceInventory(tx: DeviceTransaction, actor: AuthContext, inventoryItemId: string) {
  // The same lock is shared by invoice, delivery and manual-device paths.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`device:${actor.tenantId}:${inventoryItemId}`}, 0))`);
  const item = await tx.query.inventoryItems.findFirst({ where: and(
    eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, actor.tenantId),
    isNull(inventoryItems.deletedAt), resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`,
  ) });
  if (!item) throw new NotFoundError('Stok kalemi bulunamadı');
  return item;
}

/** Caller must use a transaction; an existing device is enriched, never transferred silently. */
export async function upsertInventoryCustomerDevice(tx: DeviceTransaction, actor: AuthContext, input: DeviceInput) {
  if (input.tenantId !== actor.tenantId || !input.inventoryItemId) throw new ValidationError('Geçersiz cihaz stok bağlantısı');
  await assertDeviceCompanyContact(tx, actor, input.companyId, input.contactId);
  const item = await lockDeviceInventory(tx, actor, input.inventoryItemId);
  if (item.reservedCompanyId && item.reservedCompanyId !== input.companyId) throw new ConflictError('Stok kalemi başka bir firmaya rezerve edilmiş');
  if (input.divisionId && item.divisionId && input.divisionId !== item.divisionId) throw new ValidationError('Stok kalemi cihaz bölümüne ait değil');
  const existing = await tx.query.customerDevices.findMany({ where: and(
    eq(customerDevices.tenantId, actor.tenantId), eq(customerDevices.inventoryItemId, input.inventoryItemId), isNull(customerDevices.deletedAt),
  ) });
  if (existing.length > 1) throw new ConflictError('Bu stok kaleminin birden fazla aktif cihazı var; önce kayıtları inceleyin');
  const current = existing[0];
  if (current) {
    if (current.companyId !== input.companyId || (current.opportunityId && input.opportunityId && current.opportunityId !== input.opportunityId)) {
      throw new ConflictError('Seçilen seri no başka bir müşteri satışına bağlı');
    }
    const patch: Partial<DeviceInput> = {};
    for (const key of ['opportunityId', 'quoteId', 'saleDate', 'deliveryDate', 'warrantyStartDate', 'warrantyEndDate', 'statusId', 'contactId'] as const) {
      if (current[key] == null && input[key] != null) (patch as Record<string, unknown>)[key] = input[key];
    }
    if (!Object.keys(patch).length) return current;
    const [updated] = await tx.update(customerDevices).set(patch).where(and(eq(customerDevices.id, current.id), eq(customerDevices.tenantId, actor.tenantId))).returning();
    return updated;
  }
  const [created] = await tx.insert(customerDevices).values({ ...input, divisionId: input.divisionId ?? item.divisionId, initialCompanyId: input.initialCompanyId ?? input.companyId }).returning();
  return created;
}

/** Read-only report; migration deliberately does not choose or delete duplicates. */
export async function reportDuplicateInventoryDevices(db: DbClient) {
  return db.execute(sql`select tenant_id, inventory_item_id, count(*)::int as count, array_agg(id order by created_at, id) as device_ids
    from customer_devices where inventory_item_id is not null and deleted_at is null
    group by tenant_id, inventory_item_id having count(*) > 1 order by tenant_id, inventory_item_id`);
}
