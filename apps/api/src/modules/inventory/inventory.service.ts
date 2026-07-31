import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { inventoryItems, inventoryMovements, warehouses, customerDevices } from '../../db/schema/inventory';
import { warrantyStatuses } from '../../db/schema/lookup';
import type { CustomerDeviceCreateInput, CustomerDeviceUpdateInput } from '@haksan/shared';
import { productModels, productSpecs, brands } from '../../db/schema/products';
import { currencies, inventoryStatuses, productCategories, productTypes, stockLocationStatuses } from '../../db/schema/lookup';
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
import {
  resourceCompanyPortfolioFilter,
  resourceDivisionFilter,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';

function addWarrantyYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function parseManualDeviceNotes(notes: string | null): { model: string | null; serialNumber: string | null } {
  const parts = (notes ?? '').split('·').map((part) => part.trim()).filter(Boolean);
  return {
    model: parts[0] ?? null,
    serialNumber: parts[1] ?? null,
  };
}

const DEFAULT_WAREHOUSES = [
  { name: 'Antrepo', type: 'antrepo' },
  { name: 'Küçükköy Depo', type: 'depo' },
  { name: 'Akel Depo', type: 'depo' },
  { name: 'İkitelli Depo', type: 'depo' },
  { name: 'Servis Stok', type: 'servis_stok' },
  { name: 'Mağaza', type: 'magaza' },
] as const;

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private inventoryScopeFilters(actor: AuthContext, divisionId?: string | null) {
    const filters = [resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`];
    if (divisionId) filters.push(or(eq(inventoryItems.divisionId, divisionId), isNull(inventoryItems.divisionId)) ?? sql`true`);
    return filters;
  }

  private async markInventoryItemsSold(
    candidates: Array<{ id: string; expectedStatusId: string; expectedReservedCompanyId?: string }>,
    input: {
      actor: AuthContext;
      soldStatusId: string;
      divisionId: string | null;
      movementDate: Date;
      referenceId: string;
      referenceType: 'accounting_invoice' | 'service_ticket';
      notes: string;
    }
  ) {
    return this.db.transaction(async (tx) => {
      const claimedItems: Array<typeof inventoryItems.$inferSelect> = [];
      for (const candidate of candidates) {
        const filters = [
          eq(inventoryItems.id, candidate.id),
          eq(inventoryItems.tenantId, input.actor.tenantId),
          isNull(inventoryItems.deletedAt),
          eq(inventoryItems.stockStatusId, candidate.expectedStatusId),
          resourceDivisionFilter(input.actor, 'inventory', inventoryItems.divisionId) ?? sql`true`,
        ];
        if (candidate.expectedReservedCompanyId) {
          filters.push(eq(inventoryItems.reservedCompanyId, candidate.expectedReservedCompanyId));
        }
        const [claimed] = await tx
          .update(inventoryItems)
          .set({
            divisionId: input.divisionId,
            stockStatusId: input.soldStatusId,
            reservedCompanyId: null,
            reservedAt: null,
          })
          .where(and(...filters))
          .returning();
        if (!claimed) {
          throw new ValidationError('Stok kalemi başka bir işlem tarafından güncellendi; işlemi yeniden deneyin');
        }
        await tx.insert(inventoryMovements).values({
          tenantId: input.actor.tenantId,
          divisionId: input.divisionId,
          inventoryItemId: claimed.id,
          movementType: input.referenceType === 'service_ticket' ? 'consume' : 'sell',
          movementDate: input.movementDate,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          notes: input.notes,
          createdBy: input.actor.userId,
        });
        claimedItems.push(claimed);
      }
      return claimedItems;
    });
  }

  // ────────── WAREHOUSES ──────────
  async listWarehouses(actor: AuthContext) {
    await this.ensureDefaultWarehouses(actor.tenantId);
    return this.db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, actor.tenantId), isNull(warehouses.deletedAt)));
  }

  private async ensureDefaultWarehouses(tenantId: string) {
    for (const warehouse of DEFAULT_WAREHOUSES) {
      await this.db
        .insert(warehouses)
        .values({
          tenantId,
          name: warehouse.name,
          type: warehouse.type,
          country: 'Türkiye',
        })
        .onConflictDoNothing({ target: [warehouses.tenantId, warehouses.name] });
    }
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
    if (query.search) {
      const term = `%${query.search}%`;
      filters.push(
        or(
          ilike(inventoryItems.serialNumber, term),
          ilike(inventoryItems.controlUnit, term),
          ilike(productModels.fullName, term),
          ilike(productModels.modelCode, term),
          ilike(productModels.stockCode, term),
          ilike(brands.name, term),
        ) ?? sql`false`,
      );
    }
    if (query.statusCode) {
      const sid = await lookupIdByCode(this.db, inventoryStatuses, query.statusCode);
      if (sid) filters.push(eq(inventoryItems.stockStatusId, sid));
    }
    const scoped = resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId);
    if (scoped) filters.push(scoped);
    let categoryId: string | null | undefined;
    if (query.categoryCode) {
      categoryId = await lookupIdByCode(this.db, productCategories, query.categoryCode);
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .where(categoryId ? and(where, eq(productModels.categoryId, categoryId)) : where);
    const rows = await this.db
      .select({
        item: inventoryItems,
        product: {
          id: productModels.id,
          modelCode: productModels.modelCode,
          fullName: productModels.fullName,
          stockCode: productModels.stockCode,
        },
        brand: { id: brands.id, name: brands.name },
        category: { id: productCategories.id, code: productCategories.code, name: productCategories.name },
        status: { id: inventoryStatuses.id, code: inventoryStatuses.code, name: inventoryStatuses.name },
        locationStatus: { id: stockLocationStatuses.id, code: stockLocationStatuses.code, name: stockLocationStatuses.name },
        warehouse: { id: warehouses.id, name: warehouses.name },
        reservedCompany: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
      })
      .from(inventoryItems)
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .leftJoin(stockLocationStatuses, eq(inventoryItems.locationStatusId, stockLocationStatuses.id))
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
        locationStatus: r.locationStatus,
        warehouse: r.warehouse,
        reservedCompany: r.reservedCompany,
      })),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.id, id),
        eq(inventoryItems.tenantId, actor.tenantId),
        isNull(inventoryItems.deletedAt),
        resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`,
      ),
    });
    if (!row) throw new NotFoundError('Stok kalemi');
    return row;
  }

  async findBySerial(serial: string, actor: AuthContext) {
    const row = await this.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.tenantId, actor.tenantId),
        eq(inventoryItems.serialNumber, serial),
        resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`,
      ),
    });
    if (!row) throw new NotFoundError('Seri numarası');
    return row;
  }

  async create(input: InventoryItemCreateInput, actor: AuthContext) {
    if (input.stockStatusCode === 'sold') {
      throw new ValidationError('Satıldı durumu yalnızca satış faturası ile işaretlenebilir');
    }
    const existing = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.tenantId, actor.tenantId), eq(inventoryItems.serialNumber, input.serialNumber)),
    });
    if (existing) throw new ConflictError('Bu seri numarası zaten kayıtlı');
    const statusId = await lookupIdByCode(this.db, inventoryStatuses, input.stockStatusCode);
    const divisionId = resolveAssignedResourceDivision(actor, 'inventory', input.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Stok kalemi için bölüm ataması zorunludur', { field: 'divisionId' });
    if (input.parentInventoryItemId) {
      await this.assertParentInventoryItem(input.parentInventoryItemId, actor);
    }
    const locationStatusId = input.locationStatusCode
      ? await lookupIdByCode(this.db, stockLocationStatuses, input.locationStatusCode)
      : input.warehouseId
        ? await lookupIdByCode(this.db, stockLocationStatuses, 'at_warehouse')
        : null;
    const [row] = await this.db
      .insert(inventoryItems)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        productModelId: input.productModelId,
        parentInventoryItemId: input.parentInventoryItemId ?? null,
        serialNumber: input.serialNumber,
        itemCondition: input.itemCondition,
        controlUnit: input.controlUnit ?? null,
        controlUnitSerialNumber: input.controlUnitSerialNumber ?? null,
        loadingDate: input.loadingDate ?? null,
        receivedDate: input.receivedDate ?? null,
        arrivalDate: input.arrivalDate ?? null,
        locationStatusId,
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
    if (input.stockStatusCode === 'sold') {
      throw new ValidationError('Satıldı durumu yalnızca satış faturası ile işaretlenebilir (harici satış kapalı)');
    }
    const patch: Record<string, unknown> = {};
    for (const k of ['productModelId', 'parentInventoryItemId', 'serialNumber', 'itemCondition', 'controlUnit', 'controlUnitSerialNumber', 'loadingDate', 'receivedDate', 'arrivalDate', 'warehouseId', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    if (input.parentInventoryItemId) {
      if (input.parentInventoryItemId === id) throw new ValidationError('Stok kalemi kendisine bağlanamaz', { field: 'parentInventoryItemId' });
      await this.assertParentInventoryItem(input.parentInventoryItemId, actor);
    }
    if (input.locationStatusCode !== undefined) {
      patch.locationStatusId = input.locationStatusCode ? await lookupIdByCode(this.db, stockLocationStatuses, input.locationStatusCode) : null;
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

  private async assertParentInventoryItem(parentInventoryItemId: string, actor: AuthContext) {
    const parent = await this.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.id, parentInventoryItemId),
        eq(inventoryItems.tenantId, actor.tenantId),
        isNull(inventoryItems.deletedAt),
        resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`,
      ),
    });
    if (!parent) throw new NotFoundError('Bağlanacak tezgah stok kalemi');
    return parent;
  }

  async reserve(id: string, input: InventoryReserveInput, actor: AuthContext) {
    const item = await this.get(id, actor);
    const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
    if (!reserved || !available) throw new ValidationError('Rezervasyon stok durumları yapılandırılmamış');
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, input.companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
      ),
    });
    if (!company) throw new NotFoundError('Firma');
    const now = new Date();
    const divisionId = item.divisionId ?? resolveAssignedResourceDivision(actor, 'inventory', input.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Rezervasyon için bölüm ataması zorunludur', { field: 'divisionId' });
    const reservableStatusIds = item.stockStatusId === reserved.id
      ? [reserved.id]
      : item.stockStatusId === available.id
        ? [available.id]
        : [];
    if (!reservableStatusIds.length) {
      throw new ValidationError('Sadece hazır veya rezerve stok kalemleri firmaya ayrılabilir');
    }
    await this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(inventoryItems)
        .set({ divisionId, stockStatusId: reserved.id, reservedCompanyId: input.companyId, reservedAt: now })
        .where(
          and(
            eq(inventoryItems.id, id),
            eq(inventoryItems.tenantId, actor.tenantId),
            isNull(inventoryItems.deletedAt),
            inArray(inventoryItems.stockStatusId, reservableStatusIds),
            resourceDivisionFilter(actor, 'inventory', inventoryItems.divisionId) ?? sql`true`
          )
        )
        .returning({ id: inventoryItems.id });
      if (!claimed) {
        throw new ValidationError('Stok kalemi başka bir işlem tarafından güncellendi; yeniden deneyin');
      }
      await tx.insert(inventoryMovements).values({
        tenantId: actor.tenantId,
        divisionId,
        inventoryItemId: id,
        movementType: 'reserve',
        movementDate: now,
        referenceType: input.opportunityId ? 'opportunity' : input.quoteId ? 'quote' : 'company',
        referenceId: input.opportunityId ?? input.quoteId ?? input.companyId,
        notes: input.notes ?? null,
        createdBy: actor.userId,
      });
    });
    return { ok: true };
  }

  /** Satış faturası üzerinden stok düşümü — tezgah satışında kurulum işi açar */
  async sellFromSalesInvoice(
    params: {
      invoiceId: string;
      divisionId?: string | null;
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
    const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
    const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    const scheduled = await this.db.query.installationStatuses.findFirst({ where: eq(installationStatuses.code, 'scheduled') });
    if (!sold) return;
    const invoiceDivisionId = params.divisionId ?? resolveAssignedResourceDivision(actor, 'inventory', null);

    for (const line of params.lines) {
      const isTezgah = line.saleType === 'tezgah' || line.categoryCode === 'TEZGAH';
      if (isTezgah && !line.inventoryItemId) {
        throw new ValidationError('Tezgah satışı için seri numarası (stok kalemi) zorunludur');
      }
      if (!line.inventoryItemId) {
        const isQuantityProduct =
          line.saleType === 'product' ||
          line.categoryCode === 'YEDEK_PARCA' ||
          line.categoryCode === 'AKSESUAR';

        if (!isQuantityProduct) continue;
        if (!line.productModelId) throw new ValidationError('Ürün kalemi için ürün modeli zorunludur');

        const qtyRaw = line.quantity ?? 1;
        const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) throw new ValidationError('Geçersiz adet');
        const qtyInt = Math.trunc(qty);
        if (qtyInt !== qty) throw new ValidationError('Adet tam sayı olmalı');

        if (!available) throw new ValidationError('Stok durumu bulunamadı (available)');

        const reservedItems =
          reserved
            ? await this.db
                .select({ id: inventoryItems.id })
                .from(inventoryItems)
                .where(
                  and(
                    eq(inventoryItems.tenantId, actor.tenantId),
                    eq(inventoryItems.productModelId, line.productModelId),
                    isNull(inventoryItems.deletedAt),
                    eq(inventoryItems.stockStatusId, reserved.id),
                    eq(inventoryItems.reservedCompanyId, params.companyId),
                    ...this.inventoryScopeFilters(actor, invoiceDivisionId)
                  ),
                )
                .orderBy(asc(inventoryItems.createdAt))
                .limit(qtyInt)
            : [];

        const remaining = qtyInt - reservedItems.length;
        const availableItems =
          remaining > 0
            ? await this.db
                .select({ id: inventoryItems.id })
                .from(inventoryItems)
                .where(
                  and(
                    eq(inventoryItems.tenantId, actor.tenantId),
                    eq(inventoryItems.productModelId, line.productModelId),
                    isNull(inventoryItems.deletedAt),
                    eq(inventoryItems.stockStatusId, available.id),
                    ...this.inventoryScopeFilters(actor, invoiceDivisionId)
                  ),
                )
                .orderBy(asc(inventoryItems.createdAt))
                .limit(remaining)
            : [];

        const itemsToSell = [...reservedItems, ...availableItems];
        if (itemsToSell.length < qtyInt) {
          throw new ValidationError(`Yetersiz stok: ${line.description ?? 'ürün'} (istenen: ${qtyInt}, hazır: ${itemsToSell.length})`);
        }

        const soldItems = await this.markInventoryItemsSold(
          [
            ...reservedItems.map((item) => ({
              id: item.id,
              expectedStatusId: reserved!.id,
              expectedReservedCompanyId: params.companyId,
            })),
            ...availableItems.map((item) => ({ id: item.id, expectedStatusId: available.id })),
          ],
          {
            actor,
            soldStatusId: sold.id,
            divisionId: invoiceDivisionId ?? null,
            movementDate: params.invoiceDate,
            referenceType: 'accounting_invoice',
            referenceId: params.invoiceId,
            notes: line.description ?? 'Satış faturası',
          }
        );
        for (const it of soldItems) {
          await this.audit.write({
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: 'inventory.sold',
            resourceType: 'inventory_item',
            resourceId: it.id,
            newValues: { stockStatusCode: 'sold', referenceType: 'accounting_invoice', referenceId: params.invoiceId },
          });
        }

        await this.audit.write({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'inventory.sold_from_invoice',
          resourceType: 'accounting_invoice',
          resourceId: params.invoiceId,
          newValues: {
            companyId: params.companyId,
            productModelId: line.productModelId,
            quantity: qtyInt,
            description: line.description ?? null,
            saleType: line.saleType ?? null,
          },
        });

        continue;
      }

      const item = await this.get(line.inventoryItemId, actor);
      if (invoiceDivisionId && item.divisionId && item.divisionId !== invoiceDivisionId) {
        throw new ValidationError(`Stok kalemi fatura bölümüne ait değil: ${item.serialNumber}`);
      }
      const canSell =
        (available && item.stockStatusId === available.id) ||
        (reserved && item.stockStatusId === reserved.id && item.reservedCompanyId === params.companyId);
      if (!canSell) {
        throw new ValidationError(`Stok kalemi satılamaz: ${item.serialNumber}`);
      }

      const [soldItem] = await this.markInventoryItemsSold(
        [
          available && item.stockStatusId === available.id
            ? { id: item.id, expectedStatusId: available.id }
            : { id: item.id, expectedStatusId: reserved!.id, expectedReservedCompanyId: params.companyId },
        ],
        {
          actor,
          soldStatusId: sold.id,
          divisionId: invoiceDivisionId ?? item.divisionId,
          movementDate: params.invoiceDate,
          referenceType: 'accounting_invoice',
          referenceId: params.invoiceId,
          notes: line.description ?? 'Satış faturası',
        }
      );
      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'inventory.sold',
        resourceType: 'inventory_item',
        resourceId: soldItem.id,
        newValues: { stockStatusCode: 'sold', referenceType: 'accounting_invoice', referenceId: params.invoiceId },
      });

      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'inventory.sold_from_invoice',
        resourceType: 'accounting_invoice',
        resourceId: params.invoiceId,
        newValues: {
          companyId: params.companyId,
          inventoryItemId: soldItem.id,
          serialNumber: soldItem.serialNumber,
          productModelId: line.productModelId ?? soldItem.productModelId,
          quantity: 1,
          description: line.description ?? null,
          saleType: line.saleType ?? null,
        },
      });

      if (isTezgah) {
        const existingDevice = await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.inventoryItemId, soldItem.id), eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)),
        });
        let deviceId = existingDevice?.id;
        if (!existingDevice) {
          const [device] = await this.db
            .insert(customerDevices)
            .values({
              tenantId: actor.tenantId,
              divisionId: invoiceDivisionId ?? soldItem.divisionId,
              companyId: params.companyId,
              initialCompanyId: params.companyId,
              inventoryItemId: soldItem.id,
              saleDate: params.invoiceDate,
            })
            .returning();
          deviceId = device.id;
        } else {
          await this.db
            .update(customerDevices)
            .set({ divisionId: invoiceDivisionId ?? soldItem.divisionId, saleDate: params.invoiceDate, companyId: params.companyId })
            .where(eq(customerDevices.id, existingDevice.id));
        }
        await this.db.insert(installationJobs).values({
          tenantId: actor.tenantId,
          divisionId: invoiceDivisionId ?? soldItem.divisionId,
          companyId: params.companyId,
          customerDeviceId: deviceId ?? null,
          scheduledDate: params.invoiceDate,
          statusId: scheduled?.id ?? null,
          notes: `Satış faturası kurulumu (${params.invoiceId.slice(0, 8)})`,
        });
      } else if (line.inventoryItemId) {
        const existingDevice = await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.inventoryItemId, soldItem.id), eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)),
        });
        if (!existingDevice) {
          await this.db.insert(customerDevices).values({
            tenantId: actor.tenantId,
            divisionId: invoiceDivisionId ?? soldItem.divisionId,
            companyId: params.companyId,
            initialCompanyId: params.companyId,
            inventoryItemId: soldItem.id,
            saleDate: params.invoiceDate,
          });
        }
      }
    }
  }

  /**
   * Satış faturası iptalinde stok geri alma (minimal).
   * Yalnızca "sell" hareketi olan ve henüz "deliver" hareketi yazılmamış kalemler geri alınır.
   */
  async reverseSalesInvoice(invoiceId: string, actor: AuthContext) {
    const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
    if (!available) return;

    const soldMoves = await this.db
      .select({ inventoryItemId: inventoryMovements.inventoryItemId })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.tenantId, actor.tenantId),
          eq(inventoryMovements.referenceType, 'accounting_invoice'),
          eq(inventoryMovements.referenceId, invoiceId),
          eq(inventoryMovements.movementType, 'sell'),
        ),
      );

    for (const mv of soldMoves) {
      const delivered = await this.db.query.inventoryMovements.findFirst({
        where: and(
          eq(inventoryMovements.tenantId, actor.tenantId),
          eq(inventoryMovements.inventoryItemId, mv.inventoryItemId),
          eq(inventoryMovements.movementType, 'deliver'),
        ),
      });
      if (delivered) continue;

      await this.db
        .update(inventoryItems)
        .set({ stockStatusId: available.id, reservedCompanyId: null, reservedAt: null })
        .where(and(eq(inventoryItems.id, mv.inventoryItemId), eq(inventoryItems.tenantId, actor.tenantId)));
      await this.db.insert(inventoryMovements).values({
        tenantId: actor.tenantId,
        divisionId: null,
        inventoryItemId: mv.inventoryItemId,
        movementType: 'cancel_sell',
        movementDate: new Date(),
        referenceType: 'accounting_invoice',
        referenceId: invoiceId,
        notes: 'Satış faturası iptali',
        createdBy: actor.userId,
      });
      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'inventory.sale_reversed',
        resourceType: 'inventory_item',
        resourceId: mv.inventoryItemId,
        newValues: { stockStatusCode: 'available', referenceType: 'accounting_invoice', referenceId: invoiceId },
      });
    }
  }

  /** Serviste kullanılan yedek parça/aksesuar stok düşümü (minimal). */
  async consumeServiceParts(
    params: { serviceTicketId: string; companyId?: string | null; usedAt?: Date; lines: Array<{ productModelId: string; quantity: number; notes?: string }> },
    actor: AuthContext
  ) {
    const sold = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'sold') });
    const available = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'available') });
    const reserved = await this.db.query.inventoryStatuses.findFirst({ where: eq(inventoryStatuses.code, 'reserved') });
    if (!sold || !available) return;

    const usedAt = params.usedAt ?? new Date();
    for (const line of params.lines) {
      const qty = Math.trunc(line.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const reservedItems =
        reserved && params.companyId
          ? await this.db
              .select({ id: inventoryItems.id })
              .from(inventoryItems)
              .where(
                and(
                  eq(inventoryItems.tenantId, actor.tenantId),
                  eq(inventoryItems.productModelId, line.productModelId),
                  isNull(inventoryItems.deletedAt),
                  eq(inventoryItems.stockStatusId, reserved.id),
                  eq(inventoryItems.reservedCompanyId, params.companyId),
                ),
              )
              .orderBy(asc(inventoryItems.createdAt))
              .limit(qty)
          : [];
      const remaining = qty - reservedItems.length;
      const availableItems =
        remaining > 0
          ? await this.db
              .select({ id: inventoryItems.id })
              .from(inventoryItems)
              .where(
                and(
                  eq(inventoryItems.tenantId, actor.tenantId),
                  eq(inventoryItems.productModelId, line.productModelId),
                  isNull(inventoryItems.deletedAt),
                  eq(inventoryItems.stockStatusId, available.id),
                ),
              )
              .orderBy(asc(inventoryItems.createdAt))
              .limit(remaining)
          : [];

      const itemsToConsume = [...reservedItems, ...availableItems];
      if (itemsToConsume.length < qty) {
        throw new ValidationError(`Yetersiz stok (servis parçası): istenen ${qty}, hazır ${itemsToConsume.length}`);
      }

      const consumedItems = await this.markInventoryItemsSold(
        [
          ...reservedItems.map((item) => ({
            id: item.id,
            expectedStatusId: reserved!.id,
            expectedReservedCompanyId: params.companyId ?? undefined,
          })),
          ...availableItems.map((item) => ({ id: item.id, expectedStatusId: available.id })),
        ],
        {
          actor,
          soldStatusId: sold.id,
          divisionId: resolveAssignedResourceDivision(actor, 'inventory', null),
          movementDate: usedAt,
          referenceType: 'service_ticket',
          referenceId: params.serviceTicketId,
          notes: line.notes ?? 'Servis parça kullanımı',
        }
      );
      for (const it of consumedItems) {
        await this.audit.write({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'inventory.consumed_in_service',
          resourceType: 'inventory_item',
          resourceId: it.id,
          newValues: { stockStatusCode: 'sold', referenceType: 'service_ticket', referenceId: params.serviceTicketId },
        });
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
    const deviceScoped = resourceDivisionFilter(actor, 'customer_devices', customerDevices.divisionId);
    if (deviceScoped) filters.push(deviceScoped);
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(customerDevices).where(where);
    // Envanter + ürün join'i: kurulum tutanağı / servis formu çıktıları
    // tezgah marka-model-seri no ve CNC bilgilerini buradan doldurur.
    const rows = await this.db
      .select({
        device: customerDevices,
        productModelId: inventoryItems.productModelId,
        serialNumber: inventoryItems.serialNumber,
        controlUnit: inventoryItems.controlUnit,
        controlUnitSerialNumber: inventoryItems.controlUnitSerialNumber,
        modelCode: productModels.modelCode,
        modelName: productModels.modelName,
        cashPrice: productModels.cashPrice,
        currencyCode: currencies.code,
        brandName: brands.name,
        productTypeName: productTypes.name,
      })
      .from(customerDevices)
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(where)
      .orderBy(desc(customerDevices.createdAt))
      .limit(limit)
      .offset(offset);
    const productModelIds = [
      ...new Set(rows.map((row) => row.productModelId).filter((id): id is string => Boolean(id))),
    ];
    const specRows = productModelIds.length
      ? await this.db
          .select({
            productModelId: productSpecs.productModelId,
            key: productSpecs.specKey,
            value: productSpecs.specValue,
            unit: productSpecs.specUnit,
          })
          .from(productSpecs)
          .where(
            and(
              eq(productSpecs.tenantId, actor.tenantId),
              isNull(productSpecs.deletedAt),
              inArray(productSpecs.productModelId, productModelIds)
            )
          )
          .orderBy(asc(productSpecs.sortOrder))
      : [];
    const specsByProduct = new Map<string, Array<{ key: string; value: string; unit?: string | null }>>();
    for (const spec of specRows) {
      const list = specsByProduct.get(spec.productModelId) ?? [];
      list.push({ key: spec.key, value: spec.value, unit: spec.unit });
      specsByProduct.set(spec.productModelId, list);
    }
    return buildPaginated(
      rows.map((r) => {
        const manual = parseManualDeviceNotes(r.device.notes);
        return {
          ...r.device,
          productModelId: r.productModelId,
          serialNumber: r.serialNumber ?? manual.serialNumber,
          controlUnit: r.controlUnit,
          controlUnitSerialNumber: r.controlUnitSerialNumber,
          model: r.modelCode ?? manual.model,
          productModelName: r.modelName,
          cashPrice: r.cashPrice,
          currencyCode: r.currencyCode,
          brandName: r.brandName,
          productTypeName: r.productTypeName,
          technicalSpecs: r.productModelId ? specsByProduct.get(r.productModelId) ?? [] : [],
        };
      }),
      count,
      page
    );
  }

  async createCustomerDevice(input: CustomerDeviceCreateInput, actor: AuthContext) {
    const activeWarranty = await this.db.query.warrantyStatuses.findFirst({
      where: eq(warrantyStatuses.code, 'active'),
    });
    const installationDate = input.installationDate ?? null;
    const warrantyStartDate = input.warrantyStartDate ?? installationDate;
    const warrantyEndDate =
      input.warrantyEndDate ??
      (installationDate
        ? addWarrantyYears(installationDate, 2)
        : warrantyStartDate
          ? addWarrantyYears(warrantyStartDate, 2)
          : null);
    // Aktif bölüm daraltmasıyla çalışan view_all kullanıcı makine eklerse cihaz o
    // aktif bölüme atanmalı; aksi halde birincil bölüme düşer ve aynı liste
    // görünümünde (servis talebi makine seçici dahil) filtrelenip kaybolur.
    const activeDivisionId =
      actor.activeDivisionId && actor.activeDivisionId !== 'all' ? actor.activeDivisionId : null;
    const [device] = await this.db
      .insert(customerDevices)
      .values({
        tenantId: actor.tenantId,
        divisionId: resolveAssignedResourceDivision(actor, 'customer_devices', input.divisionId ?? activeDivisionId),
        companyId: input.companyId,
        initialCompanyId: input.initialCompanyId ?? input.companyId,
        inventoryItemId: input.inventoryItemId ?? null,
        opportunityId: input.opportunityId ?? null,
        quoteId: input.quoteId ?? null,
        installationDate,
        warrantyStartDate,
        warrantyEndDate,
        deliveryDate: input.deliveryDate ?? null,
        statusId: activeWarranty?.id ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return device;
  }

  async updateCustomerDevice(id: string, input: CustomerDeviceUpdateInput, actor: AuthContext) {
    const device = await this.db.query.customerDevices.findFirst({
      where: and(
        eq(customerDevices.id, id),
        eq(customerDevices.tenantId, actor.tenantId),
        isNull(customerDevices.deletedAt),
        resourceDivisionFilter(actor, 'customer_devices', customerDevices.divisionId) ?? sql`true`,
      ),
    });
    if (!device) throw new NotFoundError('Makine kaydı bulunamadı');

    const patch: Record<string, unknown> = {};
    if (input.companyId !== undefined) patch.companyId = input.companyId;
    if (input.initialCompanyId !== undefined) patch.initialCompanyId = input.initialCompanyId ?? null;
    if (input.divisionId !== undefined) patch.divisionId = resolveAssignedResourceDivision(actor, 'customer_devices', input.divisionId ?? null);
    if (input.inventoryItemId !== undefined) patch.inventoryItemId = input.inventoryItemId ?? null;
    if (input.opportunityId !== undefined) patch.opportunityId = input.opportunityId ?? null;
    if (input.quoteId !== undefined) patch.quoteId = input.quoteId ?? null;
    if (input.installationDate !== undefined) patch.installationDate = input.installationDate ?? null;
    if (input.warrantyStartDate !== undefined) patch.warrantyStartDate = input.warrantyStartDate ?? null;
    if (input.warrantyEndDate !== undefined) patch.warrantyEndDate = input.warrantyEndDate ?? null;
    if (input.deliveryDate !== undefined) patch.deliveryDate = input.deliveryDate ?? null;
    if (input.notes !== undefined) patch.notes = input.notes ?? null;

    if (Object.keys(patch).length === 0) return device;
    await this.db.update(customerDevices).set(patch).where(eq(customerDevices.id, id));
    return this.db.query.customerDevices.findFirst({
      where: and(eq(customerDevices.id, id), eq(customerDevices.tenantId, actor.tenantId)),
    });
  }

  async deleteCustomerDevice(id: string, actor: AuthContext) {
    const device = await this.db.query.customerDevices.findFirst({
      where: and(
        eq(customerDevices.id, id),
        eq(customerDevices.tenantId, actor.tenantId),
        isNull(customerDevices.deletedAt),
        resourceDivisionFilter(actor, 'customer_devices', customerDevices.divisionId) ?? sql`true`,
      ),
    });
    if (!device) throw new NotFoundError('Makine kaydı bulunamadı');
    await this.db
      .update(customerDevices)
      .set({ deletedAt: new Date() })
      .where(and(eq(customerDevices.id, id), eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'customer_device.deleted',
      resourceType: 'customer_device',
      resourceId: id,
      oldValues: { companyId: device.companyId, inventoryItemId: device.inventoryItemId },
    });
    return { ok: true };
  }
}
