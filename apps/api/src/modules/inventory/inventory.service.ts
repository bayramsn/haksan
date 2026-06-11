import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { inventoryItems, inventoryMovements, warehouses, customerDevices } from '../../db/schema/inventory';
import { productModels, brands } from '../../db/schema/products';
import { inventoryStatuses, productTypes } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { InventoryItemCreateInput, InventoryItemUpdateInput, InventoryReserveInput, InventorySellInput, WarehouseCreateInput, Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  // ────────── WAREHOUSES ──────────
  async listWarehouses(actor: AuthContext) {
    return this.db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, actor.tenantId), isNull(warehouses.deletedAt)));
  }

  async createWarehouse(input: WarehouseCreateInput, actor: AuthContext) {
    const [row] = await this.db
      .insert(warehouses)
      .values({
        tenantId: actor.tenantId,
        name: input.name,
        type: input.type ?? null,
        country: input.country ?? null,
        province: input.province ?? null,
        district: input.district ?? null,
        address: input.address ?? null,
      })
      .returning();
    return row;
  }

  // ────────── INVENTORY ──────────
  async list(actor: AuthContext, query: { search?: string; statusCode?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)];
    if (query.search) filters.push(ilike(inventoryItems.serialNumber, `%${query.search}%`));
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, inventoryStatuses, query.statusCode);
      if (sid) filters.push(eq(inventoryItems.stockStatusId, sid));
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(where);
    const rows = await this.db
      .select({
        item: inventoryItems,
        product: { id: productModels.id, modelCode: productModels.modelCode, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
        status: { id: inventoryStatuses.id, code: inventoryStatuses.code, name: inventoryStatuses.name },
        warehouse: { id: warehouses.id, name: warehouses.name },
      })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .where(where)
      .orderBy(desc(inventoryItems.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({ ...r.item, product: r.product, brand: r.brand, status: r.status, warehouse: r.warehouse })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)),
    });
    if (!row) throw new NotFoundError('Stok kalemi');
    return row;
  }

  async findBySerial(serial: string, actor: AuthContext) {
    const row = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.tenantId, actor.tenantId), eq(inventoryItems.serialNumber, serial)),
    });
    if (!row) throw new NotFoundError('Seri numarası');
    return row;
  }

  async create(input: InventoryItemCreateInput, actor: AuthContext) {
    const existing = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.tenantId, actor.tenantId), eq(inventoryItems.serialNumber, input.serialNumber)),
    });
    if (existing) throw new ConflictError('Bu seri numarası zaten kayıtlı');
    const statusId = await lookupIdByCode(this.db, inventoryStatuses, input.stockStatusCode);
    const [row] = await this.db
      .insert(inventoryItems)
      .values({
        tenantId: actor.tenantId,
        productModelId: input.productModelId,
        serialNumber: input.serialNumber,
        controlUnit: input.controlUnit ?? null,
        controlUnitSerialNumber: input.controlUnitSerialNumber ?? null,
        loadingDate: input.loadingDate ?? null,
        arrivalDate: input.arrivalDate ?? null,
        stockStatusId: statusId,
        warehouseId: input.warehouseId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'inventory.created',
      resourceType: 'inventory_item',
      resourceId: row.id,
      newValues: { serialNumber: row.serialNumber },
    });
    return row;
  }

  async update(id: string, input: InventoryItemUpdateInput, actor: AuthContext) {
    await this.get(id, actor);
    const patch: Record<string, unknown> = {};
    for (const k of ['productModelId', 'serialNumber', 'controlUnit', 'controlUnitSerialNumber', 'loadingDate', 'arrivalDate', 'warehouseId', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.stockStatusCode !== undefined) patch.stockStatusId = await lookupIdByCode(this.db, inventoryStatuses, input.stockStatusCode);
    await this.db.update(inventoryItems).set(patch).where(eq(inventoryItems.id, id));
    return this.get(id, actor);
  }

  async reserve(id: string, input: InventoryReserveInput, actor: AuthContext) {
    const item = await this.get(id, actor);
    const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
    if (available && item.stockStatusId !== available.id) {
      throw new ValidationError('Sadece stokta olan kalemler rezerve edilebilir');
    }
    await this.db.update(inventoryItems).set({ stockStatusId: reserved?.id ?? null }).where(eq(inventoryItems.id, id));
    await this.db.insert(inventoryMovements).values({
      tenantId: actor.tenantId,
      inventoryItemId: id,
      movementType: 'reserve',
      movementDate: new Date(),
      referenceType: input.opportunityId ? 'opportunity' : input.quoteId ? 'quote' : null,
      referenceId: input.opportunityId ?? input.quoteId ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    });
    return { ok: true };
  }

  async sell(id: string, input: InventorySellInput, actor: AuthContext) {
    const item = await this.get(id, actor);
    const sold = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'sold') });
    await this.db.update(inventoryItems).set({ stockStatusId: sold?.id ?? null }).where(eq(inventoryItems.id, id));
    await this.db.insert(inventoryMovements).values({
      tenantId: actor.tenantId,
      inventoryItemId: id,
      movementType: 'sell',
      movementDate: new Date(),
      referenceType: input.opportunityId ? 'opportunity' : input.quoteId ? 'quote' : null,
      referenceId: input.opportunityId ?? input.quoteId ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    });
    return { ok: true };
  }

  // ────────── CUSTOMER DEVICES ──────────
  async listCustomerDevices(actor: AuthContext, query: { companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)];
    if (query.companyId) filters.push(eq(customerDevices.companyId, query.companyId));
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(customerDevices).where(where);
    // Envanter + ürün join'i: kurulum tutanağı / servis formu çıktıları
    // tezgah marka-model-seri no ve CNC bilgilerini buradan doldurur.
    const rows = await this.db
      .select({
        device: customerDevices,
        serialNumber: inventoryItems.serialNumber,
        controlUnit: inventoryItems.controlUnit,
        controlUnitSerialNumber: inventoryItems.controlUnitSerialNumber,
        modelCode: productModels.modelCode,
        modelName: productModels.modelName,
        brandName: brands.name,
        productTypeName: productTypes.name,
      })
      .from(customerDevices)
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(where)
      .orderBy(desc(customerDevices.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({
        ...r.device,
        serialNumber: r.serialNumber,
        controlUnit: r.controlUnit,
        controlUnitSerialNumber: r.controlUnitSerialNumber,
        model: r.modelCode,
        productModelName: r.modelName,
        brandName: r.brandName,
        productTypeName: r.productTypeName,
      })),
      count,
      page
    );
  }
}
