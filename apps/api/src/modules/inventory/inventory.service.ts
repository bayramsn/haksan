import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { inventoryItems, inventoryMovements, warehouses, customerDevices } from '../../db/schema/inventory';
import { warrantyStatuses } from '../../db/schema/lookup';
import type { CustomerDeviceCreateInput } from '@haksan/shared';
import { productModels, brands } from '../../db/schema/products';
import { inventoryStatuses, productCategories, productTypes } from '../../db/schema/lookup';
import { companies } from '../../db/schema/companies';
import { installationJobs } from '../../db/schema/service';
import { installationStatuses } from '../../db/schema/lookup';
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
  async list(actor: AuthContext, query: { search?: string; statusCode?: string; categoryCode?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)];
    if (query.search) filters.push(ilike(inventoryItems.serialNumber, `%${query.search}%`));
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, inventoryStatuses, query.statusCode);
      if (sid) filters.push(eq(inventoryItems.stockStatusId, sid));
    }
    let categoryId: string | null | undefined;
    if (query.categoryCode) {
      categoryId = await lookupIdByCode(this.db, productCategories, query.categoryCode);
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .where(categoryId ? and(where, eq(productModels.categoryId, categoryId)) : where);
    const rows = await this.db
      .select({
        item: inventoryItems,
        product: { id: productModels.id, modelCode: productModels.modelCode, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
        category: { id: productCategories.id, code: productCategories.code, name: productCategories.name },
        status: { id: inventoryStatuses.id, code: inventoryStatuses.code, name: inventoryStatuses.name },
        warehouse: { id: warehouses.id, name: warehouses.name },
        reservedCompany: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
      })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
      .leftJoin(companies, eq(inventoryItems.reservedCompanyId, companies.id))
      .where(categoryId ? and(where, eq(productModels.categoryId, categoryId)) : where)
      .orderBy(desc(inventoryItems.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({
        ...r.item,
        product: r.product,
        brand: r.brand,
        category: r.category,
        status: r.status,
        warehouse: r.warehouse,
        reservedCompany: r.reservedCompany,
      })),
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
    const item = await this.get(id, actor);
    if (input.stockStatusCode === 'sold') {
      throw new ValidationError('Satıldı durumu yalnızca satış faturası ile işaretlenebilir (harici satış kapalı)');
    }
    const patch: Record<string, unknown> = {};
    for (const k of ['productModelId', 'serialNumber', 'controlUnit', 'controlUnitSerialNumber', 'loadingDate', 'arrivalDate', 'warehouseId', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.stockStatusCode !== undefined) {
      patch.stockStatusId = await lookupIdByCode(this.db, inventoryStatuses, input.stockStatusCode);
      if (input.stockStatusCode === 'available') {
        patch.reservedCompanyId = null;
        patch.reservedAt = null;
      }
    }
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
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, input.companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    const now = new Date();
    await this.db
      .update(inventoryItems)
      .set({ stockStatusId: reserved?.id ?? null, reservedCompanyId: input.companyId, reservedAt: now })
      .where(eq(inventoryItems.id, id));
    await this.db.insert(inventoryMovements).values({
      tenantId: actor.tenantId,
      inventoryItemId: id,
      movementType: 'reserve',
      movementDate: now,
      referenceType: input.opportunityId ? 'opportunity' : input.quoteId ? 'quote' : 'company',
      referenceId: input.opportunityId ?? input.quoteId ?? input.companyId,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    });
    return { ok: true };
  }

  /** Satış faturası üzerinden stok düşümü — tezgah satışında kurulum işi açar */
  async sellFromSalesInvoice(
    params: {
      invoiceId: string;
      companyId: string;
      invoiceDate: Date;
      lines: Array<{
        productModelId?: string;
        inventoryItemId?: string;
        categoryCode?: string;
        description?: string;
        quantity?: number;
        saleType?: 'tezgah' | 'product';
      }>;
    },
    actor: AuthContext
  ) {
    const sold = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'sold') });
    const scheduled = await this.db.query.installationStatuses.findFirst({ where: eq(installationStatuses.code, 'scheduled') });
    if (!sold) return;

    for (const line of params.lines) {
      const isTezgah = line.saleType === 'tezgah' || line.categoryCode === 'TEZGAH';
      if (isTezgah && !line.inventoryItemId) {
        throw new ValidationError('Tezgah satışı için seri numarası (stok kalemi) zorunludur');
      }
      if (!line.inventoryItemId) continue;

      const item = await this.get(line.inventoryItemId, actor);
      const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
      const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
      const canSell =
        (available && item.stockStatusId === available.id) ||
        (reserved && item.stockStatusId === reserved.id && item.reservedCompanyId === params.companyId);
      if (!canSell) {
        throw new ValidationError(`Stok kalemi satılamaz: ${item.serialNumber}`);
      }

      await this.db
        .update(inventoryItems)
        .set({ stockStatusId: sold.id, reservedCompanyId: null, reservedAt: null })
        .where(eq(inventoryItems.id, item.id));
      await this.db.insert(inventoryMovements).values({
        tenantId: actor.tenantId,
        inventoryItemId: item.id,
        movementType: 'sell',
        movementDate: params.invoiceDate,
        referenceType: 'accounting_invoice',
        referenceId: params.invoiceId,
        notes: line.description ?? 'Satış faturası',
        createdBy: actor.userId,
      });

      if (isTezgah) {
        const existingDevice = await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.inventoryItemId, item.id), eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)),
        });
        let deviceId = existingDevice?.id;
        if (!existingDevice) {
          const [device] = await this.db
            .insert(customerDevices)
            .values({
              tenantId: actor.tenantId,
              companyId: params.companyId,
              inventoryItemId: item.id,
              saleDate: params.invoiceDate,
            })
            .returning();
          deviceId = device.id;
        } else {
          await this.db
            .update(customerDevices)
            .set({ saleDate: params.invoiceDate, companyId: params.companyId })
            .where(eq(customerDevices.id, existingDevice.id));
        }
        await this.db.insert(installationJobs).values({
          tenantId: actor.tenantId,
          companyId: params.companyId,
          customerDeviceId: deviceId ?? null,
          scheduledDate: params.invoiceDate,
          statusId: scheduled?.id ?? null,
          notes: `Satış faturası kurulumu (${params.invoiceId.slice(0, 8)})`,
        });
      } else if (line.inventoryItemId) {
        const existingDevice = await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.inventoryItemId, item.id), eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)),
        });
        if (!existingDevice) {
          await this.db.insert(customerDevices).values({
            tenantId: actor.tenantId,
            companyId: params.companyId,
            inventoryItemId: item.id,
            saleDate: params.invoiceDate,
          });
        }
      }
    }
  }

  async sell(id: string, input: InventorySellInput, actor: AuthContext) {
    throw new ValidationError('Harici satış kapalı — tezgah satışı yalnızca satış faturası ile yapılabilir');
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

  async createCustomerDevice(input: CustomerDeviceCreateInput, actor: AuthContext) {
    const activeWarranty = await this.db.query.warrantyStatuses.findFirst({
      where: eq(warrantyStatuses.code, 'active'),
    });
    const [device] = await this.db
      .insert(customerDevices)
      .values({
        tenantId: actor.tenantId,
        companyId: input.companyId,
        inventoryItemId: input.inventoryItemId ?? null,
        opportunityId: input.opportunityId ?? null,
        quoteId: input.quoteId ?? null,
        installationDate: input.installationDate ?? null,
        warrantyStartDate: input.warrantyStartDate ?? null,
        warrantyEndDate: input.warrantyEndDate ?? null,
        deliveryDate: input.deliveryDate ?? null,
        statusId: activeWarranty?.id ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return device;
  }
}
