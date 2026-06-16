import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies, contacts } from '../../db/schema/companies';
import { opportunities } from '../../db/schema/crm';
import { users } from '../../db/schema/users';
import { inventoryItems, inventoryMovements } from '../../db/schema/inventory';
import { purchaseOrderItems, purchaseOrders, salesOrderItems, salesOrders } from '../../db/schema/orders';
import { shipments, shipmentItems } from '../../db/schema/service';
import { quoteItems, quotes } from '../../db/schema/quotes';
import { productModels } from '../../db/schema/products';
import { currencies, inventoryStatuses, purchaseOrderStatuses, salesOrderStatuses, shipmentStatuses, units } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  OrderStatusUpdateInput,
  Pagination,
  PurchaseOrderCreateInput,
  PurchaseOrderItemCreateInput,
  PurchaseOrderItemUpdateInput,
  PurchaseOrderUpdateInput,
  SalesOrderCreateInput,
  SalesOrderFromQuoteInput,
  SalesOrderItemCreateInput,
  SalesOrderItemUpdateInput,
  SalesOrderUpdateInput,
} from '@haksan/shared';

interface ItemTotals {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  lineTotal: number;
  vatAmount: number;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private calcItem(qty: number, unitPrice: number, discount: number, vatRate: number): ItemTotals {
    const gross = qty * unitPrice;
    const subtotal = gross - discount;
    const vat = subtotal * (vatRate / 100);
    return { subtotal: gross, discount, vat, total: subtotal + vat, lineTotal: subtotal, vatAmount: vat };
  }

  private async nextSalesOrderNo(actor: AuthContext): Promise<string> {
    const year = new Date().getUTCFullYear();
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(salesOrders)
      .where(and(eq(salesOrders.tenantId, actor.tenantId), sql`extract(year from ${salesOrders.orderDate}) = ${year}`));
    return `SO-${year}/${String((row?.c ?? 0) + 1).padStart(3, '0')}`;
  }

  private async nextPurchaseOrderNo(actor: AuthContext): Promise<string> {
    const year = new Date().getUTCFullYear();
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, actor.tenantId), sql`extract(year from ${purchaseOrders.orderDate}) = ${year}`));
    return `PO-${year}/${String((row?.c ?? 0) + 1).padStart(3, '0')}`;
  }

  private async recalcSalesOrderTotals(orderId: string) {
    const items = await this.db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.salesOrderId, orderId), isNull(salesOrderItems.deletedAt)));
    const totals = this.sumItems(items);
    await this.db.update(salesOrders).set(totals).where(eq(salesOrders.id, orderId));
  }

  private async recalcPurchaseOrderTotals(orderId: string) {
    const items = await this.db
      .select()
      .from(purchaseOrderItems)
      .where(and(eq(purchaseOrderItems.purchaseOrderId, orderId), isNull(purchaseOrderItems.deletedAt)));
    const totals = this.sumItems(items);
    await this.db.update(purchaseOrders).set(totals).where(eq(purchaseOrders.id, orderId));
  }

  private sumItems(items: Array<{ quantity: unknown; unitPrice: unknown; discountAmount: unknown; vatRate: unknown }>) {
    let subtotal = 0;
    let discount = 0;
    let vat = 0;
    for (const item of items) {
      const t = this.calcItem(Number(item.quantity), Number(item.unitPrice), Number(item.discountAmount), Number(item.vatRate));
      subtotal += t.subtotal;
      discount += t.discount;
      vat += t.vat;
    }
    return {
      subtotal: (subtotal - discount).toFixed(4),
      discountTotal: discount.toFixed(4),
      vatAmount: vat.toFixed(4),
      grandTotal: (subtotal - discount + vat).toFixed(4),
    };
  }

  async listSalesOrders(actor: AuthContext, query: { search?: string; statusCode?: string; companyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(salesOrders.tenantId, actor.tenantId), isNull(salesOrders.deletedAt)];
    if (query.search) filters.push(ilike(salesOrders.orderNo, `%${query.search}%`));
    if (query.companyId) filters.push(eq(salesOrders.companyId, query.companyId));
    if (query.statusCode) {
      const statusId = await lookupIdByCode(this.db, salesOrderStatuses, query.statusCode);
      if (statusId) filters.push(eq(salesOrders.statusId, statusId));
    }
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(salesOrders).where(where);
    const rows = await this.db
      .select({
        order: salesOrders,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        status: { id: salesOrderStatuses.id, code: salesOrderStatuses.code, name: salesOrderStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(salesOrders)
      .leftJoin(companies, eq(salesOrders.companyId, companies.id))
      .leftJoin(salesOrderStatuses, eq(salesOrders.statusId, salesOrderStatuses.id))
      .leftJoin(currencies, eq(salesOrders.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(salesOrders.orderDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.order, company: r.company, status: r.status, currency: r.currency })), count, page);
  }

  async getSalesOrder(id: string, actor: AuthContext) {
    const order = await this.db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.id, id), eq(salesOrders.tenantId, actor.tenantId), isNull(salesOrders.deletedAt)),
    });
    if (!order) throw new NotFoundError('Satış siparişi');
    const items = await this.db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.salesOrderId, id), isNull(salesOrderItems.deletedAt)))
      .orderBy(salesOrderItems.sortOrder);
    return { ...order, items };
  }

  async createSalesOrder(input: SalesOrderCreateInput, actor: AuthContext) {
    await this.assertCompany(input.companyId, actor);
    if (input.contactId) await this.assertContact(input.contactId, actor, input.companyId);
    if (input.opportunityId) await this.assertOpportunity(input.opportunityId, actor, input.companyId);
    if (input.quoteId) await this.assertQuote(input.quoteId, actor, input.companyId, input.opportunityId);
    const orderNo = input.orderNo?.trim() || (await this.nextSalesOrderNo(actor));
    await this.assertSalesOrderNoAvailable(orderNo, actor);
    const draft = await lookupIdByCode(this.db, salesOrderStatuses, 'draft');
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const [row] = await this.db
      .insert(salesOrders)
      .values({
        tenantId: actor.tenantId,
        quoteId: input.quoteId ?? null,
        opportunityId: input.opportunityId ?? null,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        orderNo,
        orderDate: input.orderDate,
        statusId: draft,
        currencyId,
        notes: input.notes ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'sales_order.created',
      resourceType: 'sales_order',
      resourceId: row.id,
      newValues: { orderNo: row.orderNo, companyId: row.companyId, quoteId: row.quoteId },
    });
    return this.getSalesOrder(row.id, actor);
  }

  async createSalesOrderFromQuote(quoteId: string, input: SalesOrderFromQuoteInput, actor: AuthContext) {
    const quote = await this.assertQuote(quoteId, actor);
    const existing = await this.db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.tenantId, actor.tenantId), eq(salesOrders.quoteId, quoteId), isNull(salesOrders.deletedAt)),
    });
    if (existing) throw new ConflictError('Bu teklif için satış siparişi zaten oluşturulmuş');

    const order = await this.createSalesOrder(
      {
        quoteId,
        opportunityId: quote.opportunityId ?? undefined,
        companyId: quote.companyId,
        contactId: quote.contactId ?? undefined,
        orderNo: input.orderNo,
        orderDate: input.orderDate ?? new Date(),
        currencyCode: 'USD',
        notes: input.notes ?? quote.deliveryTerms ?? undefined,
      },
      actor
    );

    if (input.copyItems) {
      const items = await this.db
        .select()
        .from(quoteItems)
        .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.tenantId, actor.tenantId), isNull(quoteItems.deletedAt)))
        .orderBy(quoteItems.sortOrder);
      for (const item of items) {
        await this.addSalesOrderItem(
          order.id,
          {
            quoteItemId: item.id,
            productModelId: item.productModelId ?? undefined,
            inventoryItemId: item.inventoryItemId ?? undefined,
            description: item.description,
            quantity: Number(item.quantity),
            unitCode: 'adet',
            unitPrice: Number(item.unitPrice),
            discountAmount: Number(item.discountAmount),
            vatRate: Number(item.vatRate),
            sortOrder: item.sortOrder,
          },
          actor
        );
      }
    }

    if (input.reserveStock) await this.reserveSalesOrder(order.id, actor);
    return this.getSalesOrder(order.id, actor);
  }

  async updateSalesOrder(id: string, input: SalesOrderUpdateInput, actor: AuthContext) {
    const existing = await this.getSalesOrder(id, actor);
    const patch: Record<string, unknown> = {};
    const companyId = input.companyId ?? existing.companyId;
    if (input.companyId !== undefined) {
      await this.assertCompany(input.companyId, actor);
      patch.companyId = input.companyId;
    }
    if (input.contactId !== undefined) {
      if (input.contactId) await this.assertContact(input.contactId, actor, companyId);
    } else if (input.companyId !== undefined && existing.contactId) {
      await this.assertContact(existing.contactId, actor, companyId);
    }
    if (input.opportunityId !== undefined) {
      if (input.opportunityId) await this.assertOpportunity(input.opportunityId, actor, companyId);
    } else if (input.companyId !== undefined && existing.opportunityId) {
      await this.assertOpportunity(existing.opportunityId, actor, companyId);
    }
    if (input.quoteId !== undefined) {
      if (input.quoteId) await this.assertQuote(input.quoteId, actor, companyId, input.opportunityId ?? existing.opportunityId);
      patch.quoteId = input.quoteId ?? null;
    } else if (input.companyId !== undefined && existing.quoteId) {
      await this.assertQuote(existing.quoteId, actor, companyId, input.opportunityId ?? existing.opportunityId);
    }
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    for (const k of ['opportunityId', 'contactId', 'orderNo', 'orderDate', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(salesOrders).set(patch).where(eq(salesOrders.id, id));
    return this.getSalesOrder(id, actor);
  }

  async deleteSalesOrder(id: string, actor: AuthContext) {
    await this.getSalesOrder(id, actor);
    await this.db.update(salesOrders).set({ deletedAt: new Date() }).where(eq(salesOrders.id, id));
    return { ok: true };
  }

  async addSalesOrderItem(orderId: string, input: SalesOrderItemCreateInput, actor: AuthContext) {
    await this.getSalesOrder(orderId, actor);
    if (input.quoteItemId) await this.assertQuoteItem(input.quoteItemId, actor);
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor);
    if (input.inventoryItemId) await this.assertInventoryItem(input.inventoryItemId, actor);
    const t = this.calcItem(input.quantity, input.unitPrice, input.discountAmount, input.vatRate);
    const unitId = await lookupIdByCode(this.db, units, input.unitCode);
    const [row] = await this.db
      .insert(salesOrderItems)
      .values({
        tenantId: actor.tenantId,
        salesOrderId: orderId,
        quoteItemId: input.quoteItemId ?? null,
        productModelId: input.productModelId ?? null,
        inventoryItemId: input.inventoryItemId ?? null,
        description: input.description,
        quantity: input.quantity.toString(),
        unitId,
        unitPrice: input.unitPrice.toString(),
        discountAmount: input.discountAmount.toString(),
        vatRate: input.vatRate.toString(),
        vatAmount: t.vatAmount.toFixed(4),
        lineTotal: t.lineTotal.toFixed(4),
        sortOrder: input.sortOrder,
      })
      .returning();
    await this.recalcSalesOrderTotals(orderId);
    return row;
  }

  async updateSalesOrderItem(orderId: string, itemId: string, input: SalesOrderItemUpdateInput, actor: AuthContext) {
    await this.getSalesOrder(orderId, actor);
    const existing = await this.db.query.salesOrderItems.findFirst({
      where: and(eq(salesOrderItems.id, itemId), eq(salesOrderItems.salesOrderId, orderId), eq(salesOrderItems.tenantId, actor.tenantId), isNull(salesOrderItems.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Satış siparişi kalemi');
    if (input.quoteItemId) await this.assertQuoteItem(input.quoteItemId, actor);
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor);
    if (input.inventoryItemId) await this.assertInventoryItem(input.inventoryItemId, actor);
    const patch: Record<string, unknown> = {};
    for (const k of ['quoteItemId', 'productModelId', 'inventoryItemId', 'description', 'sortOrder'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    for (const k of ['quantity', 'unitPrice', 'discountAmount', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number).toString();
    }
    if (input.unitCode !== undefined) patch.unitId = await lookupIdByCode(this.db, units, input.unitCode);
    const quantity = Number(patch.quantity ?? existing.quantity);
    const unitPrice = Number(patch.unitPrice ?? existing.unitPrice);
    const discountAmount = Number(patch.discountAmount ?? existing.discountAmount);
    const vatRate = Number(patch.vatRate ?? existing.vatRate);
    const t = this.calcItem(quantity, unitPrice, discountAmount, vatRate);
    patch.vatAmount = t.vatAmount.toFixed(4);
    patch.lineTotal = t.lineTotal.toFixed(4);
    await this.db.update(salesOrderItems).set(patch).where(eq(salesOrderItems.id, itemId));
    await this.recalcSalesOrderTotals(orderId);
    return { ok: true };
  }

  async deleteSalesOrderItem(orderId: string, itemId: string, actor: AuthContext) {
    await this.getSalesOrder(orderId, actor);
    await this.db.update(salesOrderItems).set({ deletedAt: new Date() }).where(eq(salesOrderItems.id, itemId));
    await this.recalcSalesOrderTotals(orderId);
    return { ok: true };
  }

  async setSalesOrderStatus(id: string, input: OrderStatusUpdateInput, actor: AuthContext) {
    await this.getSalesOrder(id, actor);
    if (input.statusCode === 'reserved') return this.reserveSalesOrder(id, actor);
    const statusId = await lookupIdByCode(this.db, salesOrderStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz satış siparişi durumu');
    const now = new Date();
    const patch: Record<string, unknown> = { statusId };
    if (input.statusCode === 'confirmed') {
      patch.confirmedAt = now;
      patch.approvedBy = actor.userId;
    }
    if (input.statusCode === 'fulfilled') patch.fulfilledAt = now;
    if (input.statusCode === 'cancelled') patch.cancelledAt = now;
    await this.db.update(salesOrders).set(patch).where(eq(salesOrders.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `sales_order.${input.statusCode}`,
      resourceType: 'sales_order',
      resourceId: id,
      newValues: { statusCode: input.statusCode, notes: input.notes },
    });
    // Sipariş tamamlandığında, rezerve seri-numaralı kalemlerden bir sevkiyat taslağı
    // (paketleme listesi) otomatik üret. Stok hareketleri sevkiyat "Yolda" olunca yazılır.
    if (input.statusCode === 'fulfilled') await this.createShipmentFromOrder(id, actor);
    return { ok: true };
  }

  /**
   * "fulfilled" satış siparişinden bir sevkiyat taslağı (`preparing`) + sevkiyat
   * satır kalemleri üretir. Sipariş kalemlerini, seri numarasını anlık kopyalayarak
   * `shipment_items`'a taşır. Aynı sipariş için tek sevkiyat (idempotent).
   */
  private async createShipmentFromOrder(orderId: string, actor: AuthContext) {
    const order = await this.db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.id, orderId), eq(salesOrders.tenantId, actor.tenantId), isNull(salesOrders.deletedAt)),
    });
    if (!order) return;
    const existing = await this.db.query.shipments.findFirst({
      where: and(eq(shipments.tenantId, actor.tenantId), eq(shipments.salesOrderId, orderId), isNull(shipments.deletedAt)),
    });
    if (existing) return existing;

    const items = await this.db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.salesOrderId, orderId), eq(salesOrderItems.tenantId, actor.tenantId), isNull(salesOrderItems.deletedAt)))
      .orderBy(salesOrderItems.sortOrder);
    const preparing = await lookupIdByCode(this.db, shipmentStatuses, 'preparing');
    const [shipment] = await this.db
      .insert(shipments)
      .values({
        tenantId: actor.tenantId,
        salesOrderId: order.id,
        companyId: order.companyId,
        opportunityId: order.opportunityId ?? null,
        quoteId: order.quoteId ?? null,
        shipmentNo: order.orderNo ? `SEV-${order.orderNo}` : null,
        statusId: preparing,
      })
      .returning();

    for (const item of items) {
      let serialNumber: string | null = null;
      if (item.inventoryItemId) {
        const inv = await this.db.query.inventoryItems.findFirst({
          where: and(eq(inventoryItems.id, item.inventoryItemId), eq(inventoryItems.tenantId, actor.tenantId)),
        });
        serialNumber = inv?.serialNumber ?? null;
      }
      await this.db.insert(shipmentItems).values({
        tenantId: actor.tenantId,
        shipmentId: shipment.id,
        inventoryItemId: item.inventoryItemId ?? null,
        salesOrderItemId: item.id,
        productModelId: item.productModelId ?? null,
        description: item.description,
        serialNumber,
        quantity: item.quantity,
        unitId: item.unitId ?? null,
        sortOrder: item.sortOrder,
      });
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'shipment.created_from_order',
      resourceType: 'shipment',
      resourceId: shipment.id,
      newValues: { salesOrderId: order.id, itemCount: items.length },
    });
    return shipment;
  }

  async reserveSalesOrder(id: string, actor: AuthContext) {
    await this.getSalesOrder(id, actor);
    const items = await this.db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.salesOrderId, id), eq(salesOrderItems.tenantId, actor.tenantId), isNull(salesOrderItems.deletedAt)));
    const inventoryLines = items.filter((item) => item.inventoryItemId);
    if (!inventoryLines.length) throw new ValidationError('Rezerve edilecek seri numaralı stok kalemi yok');

    const available = await lookupIdByCode(this.db, inventoryStatuses, 'available');
    const reserved = await lookupIdByCode(this.db, inventoryStatuses, 'reserved');
    for (const line of inventoryLines) {
      const item = await this.db.query.inventoryItems.findFirst({
        where: and(eq(inventoryItems.id, line.inventoryItemId!), eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)),
      });
      if (!item) throw new NotFoundError('Stok kalemi');
      if (available && reserved && item.stockStatusId !== available && item.stockStatusId !== reserved) {
        throw new ValidationError(`${item.serialNumber} seri numarası rezerve edilemez`);
      }
      await this.db.update(inventoryItems).set({ stockStatusId: reserved }).where(eq(inventoryItems.id, item.id));
      await this.db.insert(inventoryMovements).values({
        tenantId: actor.tenantId,
        inventoryItemId: item.id,
        movementType: 'reserve',
        movementDate: new Date(),
        referenceType: 'sales_order',
        referenceId: id,
        notes: 'Satış siparişi rezervasyonu',
        createdBy: actor.userId,
      });
    }
    const statusId = await lookupIdByCode(this.db, salesOrderStatuses, 'reserved');
    await this.db.update(salesOrders).set({ statusId, reservedAt: new Date() }).where(eq(salesOrders.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'sales_order.reserved',
      resourceType: 'sales_order',
      resourceId: id,
      newValues: { reservedLines: inventoryLines.length },
    });
    return { ok: true };
  }

  async listPurchaseOrders(actor: AuthContext, query: { search?: string; statusCode?: string; supplierCompanyId?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(purchaseOrders.tenantId, actor.tenantId), isNull(purchaseOrders.deletedAt)];
    if (query.search) filters.push(ilike(purchaseOrders.orderNo, `%${query.search}%`));
    if (query.supplierCompanyId) filters.push(eq(purchaseOrders.supplierCompanyId, query.supplierCompanyId));
    if (query.statusCode) {
      const statusId = await lookupIdByCode(this.db, purchaseOrderStatuses, query.statusCode);
      if (statusId) filters.push(eq(purchaseOrders.statusId, statusId));
    }
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrders).where(where);
    const rows = await this.db
      .select({
        order: purchaseOrders,
        supplier: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        status: { id: purchaseOrderStatuses.id, code: purchaseOrderStatuses.code, name: purchaseOrderStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(purchaseOrders)
      .leftJoin(companies, eq(purchaseOrders.supplierCompanyId, companies.id))
      .leftJoin(purchaseOrderStatuses, eq(purchaseOrders.statusId, purchaseOrderStatuses.id))
      .leftJoin(currencies, eq(purchaseOrders.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(purchaseOrders.orderDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.order, supplier: r.supplier, status: r.status, currency: r.currency })), count, page);
  }

  async getPurchaseOrder(id: string, actor: AuthContext) {
    const order = await this.db.query.purchaseOrders.findFirst({
      where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, actor.tenantId), isNull(purchaseOrders.deletedAt)),
    });
    if (!order) throw new NotFoundError('Satın alma siparişi');
    const items = await this.db
      .select()
      .from(purchaseOrderItems)
      .where(and(eq(purchaseOrderItems.purchaseOrderId, id), isNull(purchaseOrderItems.deletedAt)))
      .orderBy(purchaseOrderItems.sortOrder);
    return { ...order, items };
  }

  async createPurchaseOrder(input: PurchaseOrderCreateInput, actor: AuthContext) {
    // İdari satın almada firma opsiyonel; sadece seçildiyse doğrula.
    if (input.supplierCompanyId) await this.assertCompany(input.supplierCompanyId, actor);
    const orderNo = input.orderNo?.trim() || (await this.nextPurchaseOrderNo(actor));
    await this.assertPurchaseOrderNoAvailable(orderNo, actor);
    const draft = await lookupIdByCode(this.db, purchaseOrderStatuses, 'draft');
    const currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    const [row] = await this.db
      .insert(purchaseOrders)
      .values({
        tenantId: actor.tenantId,
        supplierCompanyId: input.supplierCompanyId ?? null,
        purchaseType: input.purchaseType,
        invoiceNo: input.invoiceNo ?? null,
        orderNo,
        orderDate: input.orderDate,
        expectedDate: input.expectedDate ?? null,
        statusId: draft,
        currencyId,
        incoterm: input.incoterm ?? null,
        shipmentReference: input.shipmentReference ?? null,
        notes: input.notes ?? null,
        createdBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'purchase_order.created',
      resourceType: 'purchase_order',
      resourceId: row.id,
      newValues: { orderNo: row.orderNo, supplierCompanyId: row.supplierCompanyId },
    });
    return this.getPurchaseOrder(row.id, actor);
  }

  async updatePurchaseOrder(id: string, input: PurchaseOrderUpdateInput, actor: AuthContext) {
    await this.getPurchaseOrder(id, actor);
    const patch: Record<string, unknown> = {};
    if (input.supplierCompanyId !== undefined) {
      if (input.supplierCompanyId) await this.assertCompany(input.supplierCompanyId, actor);
      patch.supplierCompanyId = input.supplierCompanyId;
    }
    if (input.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, input.currencyCode);
    for (const k of ['purchaseType', 'invoiceNo', 'orderNo', 'orderDate', 'expectedDate', 'incoterm', 'shipmentReference', 'notes'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    await this.db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, id));
    return this.getPurchaseOrder(id, actor);
  }

  async deletePurchaseOrder(id: string, actor: AuthContext) {
    await this.getPurchaseOrder(id, actor);
    await this.db.update(purchaseOrders).set({ deletedAt: new Date() }).where(eq(purchaseOrders.id, id));
    return { ok: true };
  }

  async addPurchaseOrderItem(orderId: string, input: PurchaseOrderItemCreateInput, actor: AuthContext) {
    await this.getPurchaseOrder(orderId, actor);
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor);
    const t = this.calcItem(input.quantity, input.unitPrice, input.discountAmount, input.vatRate);
    const unitId = await lookupIdByCode(this.db, units, input.unitCode);
    const [row] = await this.db
      .insert(purchaseOrderItems)
      .values({
        tenantId: actor.tenantId,
        purchaseOrderId: orderId,
        productModelId: input.productModelId ?? null,
        description: input.description,
        quantity: input.quantity.toString(),
        unitId,
        unitPrice: input.unitPrice.toString(),
        discountAmount: input.discountAmount.toString(),
        vatRate: input.vatRate.toString(),
        vatAmount: t.vatAmount.toFixed(4),
        lineTotal: t.lineTotal.toFixed(4),
        expectedDate: input.expectedDate ?? null,
        sortOrder: input.sortOrder,
      })
      .returning();
    await this.recalcPurchaseOrderTotals(orderId);
    return row;
  }

  async updatePurchaseOrderItem(orderId: string, itemId: string, input: PurchaseOrderItemUpdateInput, actor: AuthContext) {
    await this.getPurchaseOrder(orderId, actor);
    const existing = await this.db.query.purchaseOrderItems.findFirst({
      where: and(eq(purchaseOrderItems.id, itemId), eq(purchaseOrderItems.purchaseOrderId, orderId), eq(purchaseOrderItems.tenantId, actor.tenantId), isNull(purchaseOrderItems.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Satın alma siparişi kalemi');
    if (input.productModelId) await this.assertProductModel(input.productModelId, actor);
    const patch: Record<string, unknown> = {};
    for (const k of ['productModelId', 'description', 'expectedDate', 'sortOrder'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = (input as any)[k] ?? null;
    }
    for (const k of ['quantity', 'unitPrice', 'discountAmount', 'vatRate'] as const) {
      if ((input as any)[k] !== undefined) patch[k] = ((input as any)[k] as number).toString();
    }
    if (input.unitCode !== undefined) patch.unitId = await lookupIdByCode(this.db, units, input.unitCode);
    const quantity = Number(patch.quantity ?? existing.quantity);
    const unitPrice = Number(patch.unitPrice ?? existing.unitPrice);
    const discountAmount = Number(patch.discountAmount ?? existing.discountAmount);
    const vatRate = Number(patch.vatRate ?? existing.vatRate);
    const t = this.calcItem(quantity, unitPrice, discountAmount, vatRate);
    patch.vatAmount = t.vatAmount.toFixed(4);
    patch.lineTotal = t.lineTotal.toFixed(4);
    await this.db.update(purchaseOrderItems).set(patch).where(eq(purchaseOrderItems.id, itemId));
    await this.recalcPurchaseOrderTotals(orderId);
    return { ok: true };
  }

  async deletePurchaseOrderItem(orderId: string, itemId: string, actor: AuthContext) {
    await this.getPurchaseOrder(orderId, actor);
    await this.db.update(purchaseOrderItems).set({ deletedAt: new Date() }).where(eq(purchaseOrderItems.id, itemId));
    await this.recalcPurchaseOrderTotals(orderId);
    return { ok: true };
  }

  async setPurchaseOrderStatus(id: string, input: OrderStatusUpdateInput, actor: AuthContext) {
    const po = await this.getPurchaseOrder(id, actor);

    if (input.statusCode === 'approved') {
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, actor.userId),
      });
      if (user && user.purchaseApprovalLimit) {
        if (Number(po.grandTotal) > user.purchaseApprovalLimit) {
           input.statusCode = 'pending_manager_approval';
           input.notes = (input.notes ? input.notes + '\n' : '') + 'Sipariş tutarı kullanıcının onay limitini aştığı için yönetici onayına sunuldu.';
        }
      }
    }

    const statusId = await lookupIdByCode(this.db, purchaseOrderStatuses, input.statusCode);
    if (!statusId) throw new ValidationError('Geçersiz satın alma siparişi durumu');
    const now = new Date();
    const patch: Record<string, unknown> = { statusId };
    if (input.statusCode === 'sent') patch.sentAt = now;
    if (input.statusCode === 'approved') {
      patch.approvedAt = now;
      patch.approvedBy = actor.userId;
    }
    if (input.statusCode === 'received') patch.closedAt = now;
    if (input.statusCode === 'cancelled') patch.cancelledAt = now;
    await this.db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `purchase_order.${input.statusCode}`,
      resourceType: 'purchase_order',
      resourceId: id,
      newValues: { statusCode: input.statusCode, notes: input.notes },
    });
    return { ok: true };
  }

  private async assertCompany(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertContact(contactId: string, actor: AuthContext, companyId: string) {
    const contact = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)),
    });
    if (!contact) throw new NotFoundError('Kontak');
    if (contact.companyId !== companyId) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private async assertOpportunity(opportunityId: string, actor: AuthContext, companyId: string) {
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt)),
    });
    if (!opportunity) throw new NotFoundError('Fırsat');
    if (opportunity.companyId !== companyId) throw new ValidationError('Fırsat seçilen firmaya ait değil');
    return opportunity;
  }

  private async assertQuote(quoteId: string, actor: AuthContext, companyId?: string, opportunityId?: string | null) {
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt)),
    });
    if (!quote) throw new NotFoundError('Teklif');
    if (companyId && quote.companyId !== companyId) throw new ValidationError('Teklif seçilen firmaya ait değil');
    if (opportunityId && quote.opportunityId !== opportunityId) {
      throw new ValidationError('Teklif seçilen fırsata ait değil');
    }
    return quote;
  }

  private async assertQuoteItem(quoteItemId: string, actor: AuthContext) {
    const item = await this.db.query.quoteItems.findFirst({
      where: and(eq(quoteItems.id, quoteItemId), eq(quoteItems.tenantId, actor.tenantId), isNull(quoteItems.deletedAt)),
    });
    if (!item) throw new NotFoundError('Teklif kalemi');
    return item;
  }

  private async assertProductModel(productModelId: string, actor: AuthContext) {
    const product = await this.db.query.productModels.findFirst({
      where: and(eq(productModels.id, productModelId), eq(productModels.tenantId, actor.tenantId), isNull(productModels.deletedAt)),
    });
    if (!product) throw new NotFoundError('Ürün');
    return product;
  }

  private async assertInventoryItem(inventoryItemId: string, actor: AuthContext) {
    const item = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)),
    });
    if (!item) throw new NotFoundError('Stok kalemi');
    return item;
  }

  private async assertSalesOrderNoAvailable(orderNo: string, actor: AuthContext) {
    const existing = await this.db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.tenantId, actor.tenantId), eq(salesOrders.orderNo, orderNo)),
    });
    if (existing) throw new ConflictError('Bu satış siparişi numarası zaten kullanılıyor');
  }

  private async assertPurchaseOrderNoAvailable(orderNo: string, actor: AuthContext) {
    const existing = await this.db.query.purchaseOrders.findFirst({
      where: and(eq(purchaseOrders.tenantId, actor.tenantId), eq(purchaseOrders.orderNo, orderNo)),
    });
    if (existing) throw new ConflictError('Bu satın alma siparişi numarası zaten kullanılıyor');
  }
}
