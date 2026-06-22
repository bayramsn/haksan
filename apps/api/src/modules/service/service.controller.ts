import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  serviceTickets,
  serviceComplaintIntakes,
  serviceWarrantyClaims,
  serviceWarrantyParts,
  installationJobs,
  shipments,
  shipmentItems,
  deliveries,
} from '../../db/schema/service';
import { serviceTicketStatuses, installationStatuses, shipmentStatuses, inventoryStatuses, units } from '../../db/schema/lookup';
import { companies, contacts } from '../../db/schema/companies';
import { opportunities } from '../../db/schema/crm';
import { customerDevices, inventoryItems, inventoryMovements } from '../../db/schema/inventory';
import { salesOrders, salesOrderItems } from '../../db/schema/orders';
import { productModels } from '../../db/schema/products';
import { quotes } from '../../db/schema/quotes';
import { users as usersTable } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import {
  paginationSchema,
  type Pagination,
  computeInstallationFee,
  type InstallationLocationType,
  shipmentCreateSchema,
  shipmentStatusUpdateSchema,
  deliveryCreateSchema,
  deliveryUpdateSchema,
  deliveryStatusUpdateSchema,
  type ShipmentItemInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { divisionFilter, resolveActorDivisionScope, resolveAssignedDivision } from '../../shared/utils/division-scope';

const ticketCreate = z.object({
  ticketNo: z.string().min(1).max(64).optional(),
  divisionId: z.string().uuid().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  customerDeviceId: z.string().optional(),
  subject: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  ticketType: z.enum(['complaint', 'request', 'warranty_claim', 'question']).default('complaint'),
  source: z.enum(['manual', 'phone', 'email', 'whatsapp', 'portal', 'web', 'qr']).default('manual'),
  assignedToUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const ticketStatus = z.object({ statusCode: z.string() });
const ticketUpdate = z.object({
  description: z.string().max(4000).optional(),
  resolutionNote: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  // Kaynak (source) değiştirilmez; tip sonradan yeniden sınıflandırılabilir.
  ticketType: z.enum(['complaint', 'request', 'warranty_claim', 'question']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const currencySchema = z.enum(['USD', 'EUR', 'TRY']);
const warrantyStatusSchema = z.enum(['draft', 'submitted', 'approved', 'rejected', 'rma_in_progress', 'closed']);
const warrantyUpdate = z.object({
  failureCategory: z.string().max(128).optional().nullable(),
  technicianAssessment: z.string().max(4000).optional().nullable(),
  rmaNo: z.string().max(128).optional().nullable(),
  supplierName: z.string().max(255).optional().nullable(),
  supplierRmaStatus: z.string().max(64).optional().nullable(),
  costAmount: z.coerce.number().min(0).optional().nullable(),
  costCurrency: currencySchema.optional(),
  customerChargeAmount: z.coerce.number().min(0).optional().nullable(),
  customerChargeCurrency: currencySchema.optional(),
  status: warrantyStatusSchema.optional(),
});
const warrantyPartsUpdate = z.object({
  parts: z.array(z.object({
    id: z.string().uuid().optional(),
    productModelId: z.string().uuid().optional().nullable(),
    inventoryItemId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(1000),
    quantity: z.coerce.number().int().min(1).max(100000),
    actionType: z.enum(['replace', 'repair', 'return', 'investigate']).default('replace'),
    source: z.enum(['stock', 'supplier', 'customer', 'service']).default('stock'),
    supplierRmaStatus: z.string().max(64).optional().nullable(),
    chargeToCustomer: z.coerce.boolean().default(false),
    unitCost: z.coerce.number().min(0).optional().nullable(),
    currency: currencySchema.default('USD'),
    notes: z.string().max(2000).optional().nullable(),
  })).max(100),
});
const warrantyDecision = z.object({
  decisionNote: z.string().max(4000).optional(),
});
const warrantySubmit = z.object({
  note: z.string().max(4000).optional(),
});

const installCreate = z.object({
  divisionId: z.string().uuid().optional(),
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  customerDeviceId: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  scheduledDate: z.coerce.date().optional(),
  assignedToUserId: z.string().optional(),
  location: z.string().max(255).optional(),
  locationType: z.enum(['istanbul_ici', 'istanbul_disi']).optional(),
  durationMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  notes: z.string().max(2000).optional(),
});
const installStatusUpdate = z.object({
  statusCode: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  installationDate: z.coerce.date().optional(),
});

// Sevkiyat/teslimat doğrulama şemaları @haksan/shared'a taşındı (shipment.ts).
// Eski kayıtlarda origin/destination/eta `notes` içine JSON gömülüydü; aşağıdaki
// tip + decode helper yalnızca o legacy satırları okurken kullanılır.
type ShipmentMeta = { origin?: string; destination?: string; eta?: string; notes?: string };

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ServiceController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private async assertCompany(companyId: string, tenantId: string) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertContact(contactId: string, tenantId: string, companyId?: string | null) {
    const contact = await this.db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)),
    });
    if (!contact) throw new NotFoundError('Kontak');
    if (companyId && contact.companyId !== companyId) throw new ValidationError('Kontak seçilen firmaya ait değil');
    return contact;
  }

  private async assertOpportunity(opportunityId: string, tenantId: string, companyId?: string | null) {
    const opportunity = await this.db.query.opportunities.findFirst({
      where: and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, tenantId), isNull(opportunities.deletedAt)),
    });
    if (!opportunity) throw new NotFoundError('Fırsat');
    if (companyId && opportunity.companyId !== companyId) throw new ValidationError('Fırsat seçilen firmaya ait değil');
    return opportunity;
  }

  private async assertQuote(quoteId: string, tenantId: string, companyId?: string | null, opportunityId?: string | null) {
    const quote = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId), isNull(quotes.deletedAt)),
    });
    if (!quote) throw new NotFoundError('Teklif');
    if (companyId && quote.companyId !== companyId) throw new ValidationError('Teklif seçilen firmaya ait değil');
    if (opportunityId && quote.opportunityId !== opportunityId) {
      throw new ValidationError('Teklif seçilen fırsata ait değil');
    }
    return quote;
  }

  private async assertCustomerDevice(deviceId: string, tenantId: string, companyId?: string | null) {
    const device = await this.db.query.customerDevices.findFirst({
      where: and(eq(customerDevices.id, deviceId), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
    });
    if (!device) throw new NotFoundError('Müşteri cihazı');
    if (companyId && device.companyId !== companyId) throw new ValidationError('Müşteri cihazı seçilen firmaya ait değil');
    return device;
  }

  private cleanNullableText(value: string | null | undefined) {
    const text = value?.trim();
    return text ? text : null;
  }

  private moneyValue(value: number | null | undefined) {
    return value === null || value === undefined ? null : value.toString();
  }

  private coverageSuggestion(device?: { warrantyStartDate: Date | null; warrantyEndDate: Date | null } | null) {
    if (!device?.warrantyEndDate) return 'unknown';
    const now = Date.now();
    const start = device.warrantyStartDate?.getTime();
    const end = device.warrantyEndDate.getTime();
    if (start && start > now) return 'unknown';
    return end >= now ? 'in_warranty' : 'out_of_warranty';
  }

  private async getScopedTicket(id: string, user: AuthContext) {
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.tenantId, user.tenantId),
        isNull(serviceTickets.deletedAt),
        divisionFilter(resolveActorDivisionScope(user), serviceTickets.divisionId) ?? sql`true`
      ),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    return ticket;
  }

  private async findWarrantyClaim(serviceTicketId: string, tenantId: string) {
    return this.db.query.serviceWarrantyClaims.findFirst({
      where: and(
        eq(serviceWarrantyClaims.serviceTicketId, serviceTicketId),
        eq(serviceWarrantyClaims.tenantId, tenantId),
        isNull(serviceWarrantyClaims.deletedAt)
      ),
    });
  }

  private async ensureWarrantyClaim(ticket: typeof serviceTickets.$inferSelect) {
    const existing = await this.findWarrantyClaim(ticket.id, ticket.tenantId);
    if (existing) return existing;
    const device = ticket.customerDeviceId
      ? await this.db.query.customerDevices.findFirst({
          where: and(
            eq(customerDevices.id, ticket.customerDeviceId),
            eq(customerDevices.tenantId, ticket.tenantId),
            isNull(customerDevices.deletedAt)
          ),
        })
      : null;
    const [claim] = await this.db
      .insert(serviceWarrantyClaims)
      .values({
        tenantId: ticket.tenantId,
        divisionId: ticket.divisionId ?? null,
        serviceTicketId: ticket.id,
        companyId: ticket.companyId,
        customerDeviceId: ticket.customerDeviceId ?? null,
        warrantyStartSnapshot: device?.warrantyStartDate ?? null,
        warrantyEndSnapshot: device?.warrantyEndDate ?? null,
        coverageSuggestion: this.coverageSuggestion(device),
      })
      .returning();
    return claim;
  }

  private async warrantyResponse(claim: typeof serviceWarrantyClaims.$inferSelect) {
    const parts = await this.db
      .select({
        part: serviceWarrantyParts,
        product: { id: productModels.id, model: productModels.modelCode, modelName: productModels.modelName },
        inventory: { id: inventoryItems.id, serialNumber: inventoryItems.serialNumber },
      })
      .from(serviceWarrantyParts)
      .leftJoin(productModels, eq(serviceWarrantyParts.productModelId, productModels.id))
      .leftJoin(inventoryItems, eq(serviceWarrantyParts.inventoryItemId, inventoryItems.id))
      .where(and(eq(serviceWarrantyParts.warrantyClaimId, claim.id), eq(serviceWarrantyParts.tenantId, claim.tenantId), isNull(serviceWarrantyParts.deletedAt)))
      .orderBy(asc(serviceWarrantyParts.createdAt));
    return {
      ...claim,
      parts: parts.map((row) => ({
        ...row.part,
        product: row.product?.id ? row.product : null,
        inventory: row.inventory?.id ? row.inventory : null,
      })),
    };
  }

  private async assertUser(userId: string, tenantId: string) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId), isNull(usersTable.deletedAt)),
    });
    if (!user) throw new NotFoundError('Kullanıcı');
    return user;
  }

  private async assertSalesOrder(salesOrderId: string, tenantId: string, companyId?: string | null) {
    const order = await this.db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.id, salesOrderId), eq(salesOrders.tenantId, tenantId), isNull(salesOrders.deletedAt)),
    });
    if (!order) throw new NotFoundError('Satış siparişi');
    if (companyId && order.companyId !== companyId) throw new ValidationError('Satış siparişi seçilen firmaya ait değil');
    return order;
  }

  private async assertInventoryItem(inventoryItemId: string, tenantId: string) {
    const item = await this.db.query.inventoryItems.findFirst({
      where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
    });
    if (!item) throw new NotFoundError('Stok kalemi');
    return item;
  }

  private async assertShipment(shipmentId: string, tenantId: string, actor?: AuthContext) {
    const filters = [eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId), isNull(shipments.deletedAt)];
    if (actor) filters.push(divisionFilter(resolveActorDivisionScope(actor), shipments.divisionId) ?? sql`true`);
    const shipment = await this.db.query.shipments.findFirst({
      where: and(...filters),
    });
    if (!shipment) throw new NotFoundError('Sevkiyat');
    return shipment;
  }

  /** Sevkiyata çıkan seri-numaralı kalemleri `in_transit` yapar + `ship` hareketi yazar (idempotent). */
  private async markInventoryInTransit(shipmentId: string, tenantId: string, actorUserId: string) {
    const inTransitId = await lookupIdByCode(this.db, inventoryStatuses, 'in_transit');
    if (!inTransitId) return;
    const soldId = await lookupIdByCode(this.db, inventoryStatuses, 'sold');
    const availableId = await lookupIdByCode(this.db, inventoryStatuses, 'available');
    const reservedId = await lookupIdByCode(this.db, inventoryStatuses, 'reserved');
    const shipment = await this.db.query.shipments.findFirst({
      where: and(eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId), isNull(shipments.deletedAt)),
    });
    const companyId = shipment?.companyId ?? null;
    const lines = await this.db
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.tenantId, tenantId), isNull(shipmentItems.deletedAt)));
    for (const line of lines) {
      const itemIds = await this.pickShipmentInventoryItems({
        tenantId,
        companyId,
        inventoryItemId: line.inventoryItemId ?? null,
        productModelId: line.productModelId ?? null,
        quantity: line.quantity,
        reservedId,
        availableId,
      });
      const needsExpansion = !line.inventoryItemId && !!line.productModelId;
      const existingInventoryItemIds = new Set<string>();
      if (needsExpansion && itemIds.length) {
        const existingMappings = await this.db
          .select({ inventoryItemId: shipmentItems.inventoryItemId })
          .from(shipmentItems)
          .where(
            and(
              eq(shipmentItems.shipmentId, shipmentId),
              eq(shipmentItems.tenantId, tenantId),
              inArray(shipmentItems.inventoryItemId, itemIds),
              isNull(shipmentItems.deletedAt),
            ),
          );
        for (const m of existingMappings) {
          if (m.inventoryItemId) existingInventoryItemIds.add(m.inventoryItemId);
        }
      }

      for (const [i, inventoryItemId] of itemIds.entries()) {
        const item = await this.db.query.inventoryItems.findFirst({
          where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
        });
        if (!item) continue;

        // When the original shipment_items line had no inventoryItemId (productModelId + quantity),
        // create explicit per-inventoryItem shipment_items rows for later serial-level auditing.
        if (needsExpansion && !existingInventoryItemIds.has(item.id)) {
          const unitId = line.unitId ?? null;
          await this.db.insert(shipmentItems).values({
            tenantId,
            shipmentId,
            inventoryItemId: item.id,
            salesOrderItemId: line.salesOrderItemId ?? null,
            productModelId: line.productModelId ?? null,
            description: line.description,
            serialNumber: item.serialNumber,
            quantity: '1',
            unitId,
            sortOrder: line.sortOrder + i,
          });
          existingInventoryItemIds.add(item.id);
        }

        if (item.stockStatusId === inTransitId) continue;

        // Satış faturasıyla "sold" olmuş kalemlerde de sevkiyat/tasima bilgilerini yaz.
        const shouldChangeStatus = !(soldId && item.stockStatusId === soldId);
        if (shouldChangeStatus) {
          await this.db.update(inventoryItems).set({ stockStatusId: inTransitId, loadingDate: new Date() }).where(eq(inventoryItems.id, item.id));
        } else if (!item.loadingDate) {
          await this.db.update(inventoryItems).set({ loadingDate: new Date() }).where(eq(inventoryItems.id, item.id));
        }

        const existingMove = await this.db.query.inventoryMovements.findFirst({
          where: and(
            eq(inventoryMovements.tenantId, tenantId),
            eq(inventoryMovements.inventoryItemId, item.id),
            eq(inventoryMovements.movementType, 'ship'),
            eq(inventoryMovements.referenceType, 'shipment'),
            eq(inventoryMovements.referenceId, shipmentId),
          ),
        });
        if (existingMove) continue;
        await this.db.insert(inventoryMovements).values({
          tenantId,
          inventoryItemId: item.id,
          movementType: 'ship',
          movementDate: new Date(),
          referenceType: 'shipment',
          referenceId: shipmentId,
          notes: 'Sevkiyata çıkış',
          createdBy: actorUserId,
        });
      }

      // Hide the original quantity summary line once we have explicit per-serial rows.
      // (Prevents duplicated lines in print dispatch notes / UI.)
      if (needsExpansion && existingInventoryItemIds.size > 0 && line.inventoryItemId === null) {
        await this.db.update(shipmentItems).set({ deletedAt: new Date() }).where(eq(shipmentItems.id, line.id));
      }
    }
  }

  /** Sevkiyat satır kalemlerini ekler; seri no verilmemişse stok kaleminden anlık kopyalar. */
  private async insertShipmentItems(shipmentId: string, tenantId: string, companyId: string | null, items: ShipmentItemInput[]) {
    const availableId = await lookupIdByCode(this.db, inventoryStatuses, 'available');
    const reservedId = await lookupIdByCode(this.db, inventoryStatuses, 'reserved');

    for (const item of items) {
      // Quantity bazlı kalemleri (yedek parça, aksesuar) gerçek inventory_item'lara bağla.
      // Böylece satış faturası daha sonra "sold" yapsa bile sevkiyat/teslimat hareketleri item bazında çalışır.
      if (!item.inventoryItemId && item.productModelId) {
        const qtyRaw = item.quantity ?? 1;
        const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) throw new ValidationError('Geçersiz adet');
        const qtyInt = Math.trunc(qty);
        if (qtyInt !== qty) throw new ValidationError('Adet tam sayı olmalı');

        const reservedItems =
          reservedId && companyId
            ? await this.db
                .select({ id: inventoryItems.id })
                .from(inventoryItems)
                .where(
                  and(
                    eq(inventoryItems.tenantId, tenantId),
                    eq(inventoryItems.productModelId, item.productModelId),
                    isNull(inventoryItems.deletedAt),
                    eq(inventoryItems.stockStatusId, reservedId),
                    eq(inventoryItems.reservedCompanyId, companyId),
                  ),
                )
                .orderBy(asc(inventoryItems.createdAt))
                .limit(qtyInt)
            : [];

        const remaining = qtyInt - reservedItems.length;
        const availableItems =
          remaining > 0 && availableId
            ? await this.db
                .select({ id: inventoryItems.id })
                .from(inventoryItems)
                .where(
                  and(
                    eq(inventoryItems.tenantId, tenantId),
                    eq(inventoryItems.productModelId, item.productModelId),
                    isNull(inventoryItems.deletedAt),
                    eq(inventoryItems.stockStatusId, availableId),
                  ),
                )
                .orderBy(asc(inventoryItems.createdAt))
                .limit(remaining)
            : [];

        const itemsToAttach = [...reservedItems, ...availableItems];
        if (itemsToAttach.length < qtyInt) {
          throw new ValidationError(`Yetersiz stok: ${item.description} (istenen: ${qtyInt}, hazır: ${itemsToAttach.length})`);
        }

        // Tek satırı N adet inventoryItemId'li satıra genişlet.
        for (let i = 0; i < itemsToAttach.length; i++) {
          const inv = await this.db.query.inventoryItems.findFirst({
            where: and(eq(inventoryItems.id, itemsToAttach[i]!.id), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
          });
          const unitId = await lookupIdByCode(this.db, units, item.unitCode);
          await this.db.insert(shipmentItems).values({
            tenantId,
            shipmentId,
            inventoryItemId: inv?.id ?? null,
            salesOrderItemId: item.salesOrderItemId ?? null,
            productModelId: item.productModelId ?? null,
            description: item.description,
            serialNumber: item.serialNumber ?? inv?.serialNumber ?? null,
            quantity: '1',
            unitId,
            sortOrder: item.sortOrder + i,
          });
        }
        continue;
      }

      let serialNumber = item.serialNumber ?? null;
      if (item.inventoryItemId) {
        const inv = await this.assertInventoryItem(item.inventoryItemId, tenantId);
        serialNumber = serialNumber ?? inv.serialNumber;
      }
      const unitId = await lookupIdByCode(this.db, units, item.unitCode);
      await this.db.insert(shipmentItems).values({
        tenantId,
        shipmentId,
        inventoryItemId: item.inventoryItemId ?? null,
        salesOrderItemId: item.salesOrderItemId ?? null,
        productModelId: item.productModelId ?? null,
        description: item.description,
        serialNumber,
        quantity: item.quantity.toString(),
        unitId,
        sortOrder: item.sortOrder,
      });
    }
  }

  /**
   * Seri-numaralı kalemleri "teslim edildi" durumuna geçirir: stok durumunu `sold`
   * yapar, bir `deliver` envanter hareketi yazar ve müşteri cihaz kaydını (garanti
   * için) oluşturur/günceller. Zaten `sold` olan kalemleri atlar (idempotent).
   */
  private async markInventoryDelivered(
    shipmentId: string,
    tenantId: string,
    companyId: string | null,
    deliveryDate: Date,
    referenceType: string,
    referenceId: string,
    actorUserId: string
  ) {
    const soldStatusId = await lookupIdByCode(this.db, inventoryStatuses, 'sold');
    if (!soldStatusId) return;
    const shipment = await this.db.query.shipments.findFirst({
      where: and(eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId), isNull(shipments.deletedAt)),
    });
    const availableId = await lookupIdByCode(this.db, inventoryStatuses, 'available');
    const reservedId = await lookupIdByCode(this.db, inventoryStatuses, 'reserved');
    const companyFromShipment = shipment?.companyId ?? null;
    const lines = await this.db
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.tenantId, tenantId), isNull(shipmentItems.deletedAt)));
    for (const line of lines) {
      const itemIds = await this.pickShipmentInventoryItems({
        tenantId,
        companyId: companyId ?? companyFromShipment,
        inventoryItemId: line.inventoryItemId ?? null,
        productModelId: line.productModelId ?? null,
        quantity: line.quantity,
        reservedId,
        availableId,
      });
      const needsExpansion = !line.inventoryItemId && !!line.productModelId;
      const existingInventoryItemIds = new Set<string>();
      if (needsExpansion && itemIds.length) {
        const existingMappings = await this.db
          .select({ inventoryItemId: shipmentItems.inventoryItemId })
          .from(shipmentItems)
          .where(
            and(
              eq(shipmentItems.shipmentId, shipmentId),
              eq(shipmentItems.tenantId, tenantId),
              inArray(shipmentItems.inventoryItemId, itemIds),
              isNull(shipmentItems.deletedAt),
            ),
          );
        for (const m of existingMappings) {
          if (m.inventoryItemId) existingInventoryItemIds.add(m.inventoryItemId);
        }
      }

      for (const [i, inventoryItemId] of itemIds.entries()) {
        const item = await this.db.query.inventoryItems.findFirst({
          where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
        });
        if (!item) continue;

        // Persist per-inventory-item shipment_items mapping for quantity lines too.
        if (needsExpansion && !existingInventoryItemIds.has(item.id)) {
          const unitId = line.unitId ?? null;
          await this.db.insert(shipmentItems).values({
            tenantId,
            shipmentId,
            inventoryItemId: item.id,
            salesOrderItemId: line.salesOrderItemId ?? null,
            productModelId: line.productModelId ?? null,
            description: line.description,
            serialNumber: item.serialNumber,
            quantity: '1',
            unitId,
            sortOrder: line.sortOrder + i,
          });
          existingInventoryItemIds.add(item.id);
        }

        // Satılmış kalemde tekrar "sell" yok; sadece teslimat alanlarını senkronla.
        if (item.stockStatusId !== soldStatusId) {
          await this.db
            .update(inventoryItems)
            .set({ stockStatusId: soldStatusId, arrivalDate: deliveryDate })
            .where(eq(inventoryItems.id, item.id));
        } else if (!item.arrivalDate) {
          await this.db.update(inventoryItems).set({ arrivalDate: deliveryDate }).where(eq(inventoryItems.id, item.id));
        }

        const existingMove = await this.db.query.inventoryMovements.findFirst({
          where: and(
            eq(inventoryMovements.tenantId, tenantId),
            eq(inventoryMovements.inventoryItemId, item.id),
            eq(inventoryMovements.movementType, 'deliver'),
            eq(inventoryMovements.referenceType, referenceType),
            eq(inventoryMovements.referenceId, referenceId),
          ),
        });
        if (!existingMove) {
          await this.db.insert(inventoryMovements).values({
            tenantId,
            inventoryItemId: item.id,
            movementType: 'deliver',
            movementDate: deliveryDate,
            referenceType,
            referenceId,
            notes: 'Teslimat tamamlandı',
            createdBy: actorUserId,
          });
        }

        const deliveryCompanyId = companyId ?? companyFromShipment;
        if (deliveryCompanyId) {
          const existingDevice = await this.db.query.customerDevices.findFirst({
            where: and(eq(customerDevices.inventoryItemId, item.id), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
          });
          if (existingDevice) {
            await this.db.update(customerDevices).set({ deliveryDate }).where(eq(customerDevices.id, existingDevice.id));
          } else {
            await this.db.insert(customerDevices).values({
              tenantId,
              companyId: deliveryCompanyId,
              inventoryItemId: item.id,
              saleDate: deliveryDate,
              deliveryDate,
            });
          }
        }
      }

      // Hide the original quantity summary line once we have explicit per-serial rows.
      if (needsExpansion && existingInventoryItemIds.size > 0 && line.inventoryItemId === null) {
        await this.db.update(shipmentItems).set({ deletedAt: new Date() }).where(eq(shipmentItems.id, line.id));
      }
    }
  }

  private async pickShipmentInventoryItems(params: {
    tenantId: string;
    companyId: string | null;
    inventoryItemId: string | null;
    productModelId: string | null;
    quantity: string | null;
    reservedId: string | null;
    availableId: string | null;
  }): Promise<string[]> {
    if (params.inventoryItemId) return [params.inventoryItemId];
    if (!params.productModelId) return [];

    const qtyRaw = params.quantity ? Number(params.quantity) : 1;
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) return [];
    const qty = Math.trunc(qtyRaw);
    if (qty !== qtyRaw) throw new ValidationError('Adet tam sayı olmalı');
    if (qty <= 0) return [];

    const reserved =
      params.reservedId && params.companyId
        ? await this.db
            .select({ id: inventoryItems.id })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.tenantId, params.tenantId),
                eq(inventoryItems.productModelId, params.productModelId),
                isNull(inventoryItems.deletedAt),
                eq(inventoryItems.stockStatusId, params.reservedId),
                eq(inventoryItems.reservedCompanyId, params.companyId),
              ),
            )
            .orderBy(asc(inventoryItems.createdAt))
            .limit(qty)
        : [];

    const remaining = qty - reserved.length;
    const available =
      remaining > 0 && params.availableId
        ? await this.db
            .select({ id: inventoryItems.id })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.tenantId, params.tenantId),
                eq(inventoryItems.productModelId, params.productModelId),
                isNull(inventoryItems.deletedAt),
                eq(inventoryItems.stockStatusId, params.availableId),
              ),
            )
            .orderBy(asc(inventoryItems.createdAt))
            .limit(remaining)
        : [];

    return [...reserved, ...available].map((x) => x.id);
  }

  private decodeShipmentNotes(notes: string | null): ShipmentMeta {
    if (!notes) return {};
    try {
      const parsed = JSON.parse(notes);
      if (parsed?.kind === 'shipment_meta') {
        return {
          origin: parsed.origin ?? undefined,
          destination: parsed.destination ?? undefined,
          eta: parsed.eta ?? undefined,
          notes: parsed.notes ?? undefined,
        };
      }
    } catch {
      // Legacy plain-text notes stay as notes.
    }
    return { notes };
  }

  // ─────── SERVICE TICKETS ───────
  @RequirePermissions('service_tickets.read')
  @Get('service-tickets')
  async listTickets(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(serviceTickets.tenantId, user.tenantId),
      isNull(serviceTickets.deletedAt),
      divisionFilter(resolveActorDivisionScope(user), serviceTickets.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(serviceTickets).where(where);
    const rows = await this.db
      .select({
        ticket: serviceTickets,
        status: { id: serviceTicketStatuses.id, code: serviceTicketStatuses.code, name: serviceTicketStatuses.name },
        warrantyClaim: {
          id: serviceWarrantyClaims.id,
          status: serviceWarrantyClaims.status,
          coverageSuggestion: serviceWarrantyClaims.coverageSuggestion,
          coverageDecision: serviceWarrantyClaims.coverageDecision,
          rmaNo: serviceWarrantyClaims.rmaNo,
          supplierRmaStatus: serviceWarrantyClaims.supplierRmaStatus,
          decidedAt: serviceWarrantyClaims.decidedAt,
        },
        sourceComplaint: {
          id: serviceComplaintIntakes.id,
          complaintNo: serviceComplaintIntakes.complaintNo,
          source: serviceComplaintIntakes.source,
          contactName: serviceComplaintIntakes.contactName,
          contactPhone: serviceComplaintIntakes.contactPhone,
          contactEmail: serviceComplaintIntakes.contactEmail,
        },
      })
      .from(serviceTickets)
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .leftJoin(serviceWarrantyClaims, and(eq(serviceWarrantyClaims.serviceTicketId, serviceTickets.id), isNull(serviceWarrantyClaims.deletedAt)))
      .leftJoin(serviceComplaintIntakes, and(eq(serviceComplaintIntakes.serviceTicketId, serviceTickets.id), isNull(serviceComplaintIntakes.deletedAt)))
      .where(where)
      .orderBy(desc(serviceTickets.reportedAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((r) => ({
        ...r.ticket,
        status: r.status,
        warrantyClaim: r.warrantyClaim?.id ? r.warrantyClaim : null,
        sourceComplaint: r.sourceComplaint?.id ? r.sourceComplaint : null,
      })),
      count,
      p
    );
  }

  @RequirePermissions('service_tickets.create')
  @Post('service-tickets')
  async createTicket(@Body(new ZodValidationPipe(ticketCreate)) body: z.infer<typeof ticketCreate>, @CurrentUser() user: AuthContext) {
    await this.assertCompany(body.companyId, user.tenantId);
    if (body.contactId) await this.assertContact(body.contactId, user.tenantId, body.companyId);
    if (body.customerDeviceId) await this.assertCustomerDevice(body.customerDeviceId, user.tenantId, body.companyId);
    if (body.assignedToUserId) await this.assertUser(body.assignedToUserId, user.tenantId);
    const openStatus = await this.db.query.serviceTicketStatuses.findFirst({ where: eq(serviceTicketStatuses.code, 'open') });
    let ticketNo = body.ticketNo;
    if (!ticketNo) {
      const [{ c }] = await this.db.select({ c: sql<number>`count(*)::int` }).from(serviceTickets).where(eq(serviceTickets.tenantId, user.tenantId));
      const year = new Date().getUTCFullYear();
      ticketNo = `SVC-${year}-${String(c + 1).padStart(4, '0')}`;
    }
    const divisionId = resolveAssignedDivision(user, body.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Servis kaydı için bölüm ataması zorunludur', { field: 'divisionId' });
    const [row] = await this.db
      .insert(serviceTickets)
      .values({
        tenantId: user.tenantId,
        divisionId,
        ticketNo,
        companyId: body.companyId,
        contactId: body.contactId ?? null,
        customerDeviceId: body.customerDeviceId ?? null,
        subject: body.subject,
        description: body.description ?? null,
        severity: body.severity,
        ticketType: body.ticketType,
        source: body.source,
        statusId: openStatus?.id ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        metadata: body.metadata ?? null,
      })
      .returning();
    if (row.ticketType === 'warranty_claim') {
      await this.ensureWarrantyClaim(row);
    }
    return row;
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-tickets/:id')
  async updateTicket(@Param('id') id: string, @Body(new ZodValidationPipe(ticketUpdate)) body: z.infer<typeof ticketUpdate>, @CurrentUser() user: AuthContext) {
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.tenantId, user.tenantId),
        divisionFilter(resolveActorDivisionScope(user), serviceTickets.divisionId) ?? sql`true`
      ),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch.description = body.description;
    if (body.resolutionNote !== undefined) patch.resolutionNote = body.resolutionNote;
    if (body.severity !== undefined) patch.severity = body.severity;
    if (body.ticketType !== undefined) patch.ticketType = body.ticketType;
    if (body.assignedToUserId !== undefined) patch.assignedToUserId = body.assignedToUserId;
    if (body.metadata !== undefined) patch.metadata = body.metadata;
    if (!Object.keys(patch).length) return ticket;
    const [row] = await this.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, id)).returning();
    if (row.ticketType === 'warranty_claim') {
      await this.ensureWarrantyClaim(row);
    }
    return row;
  }

  @RequirePermissions('service_tickets.read')
  @Get('service-tickets/:id/warranty')
  async getWarranty(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const ticket = await this.getScopedTicket(id, user);
    const existing = await this.findWarrantyClaim(ticket.id, user.tenantId);
    if (!existing && ticket.ticketType !== 'warranty_claim') return null;
    const claim = existing ?? await this.ensureWarrantyClaim(ticket);
    return this.warrantyResponse(claim);
  }

  @RequirePermissions('service_tickets.update')
  @Put('service-tickets/:id/warranty')
  async upsertWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyUpdate)) body: z.infer<typeof warrantyUpdate>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    if (ticket.ticketType !== 'warranty_claim') {
      await this.db.update(serviceTickets).set({ ticketType: 'warranty_claim' }).where(eq(serviceTickets.id, ticket.id));
      ticket.ticketType = 'warranty_claim';
    }
    const claim = await this.ensureWarrantyClaim(ticket);
    const patch: Partial<typeof serviceWarrantyClaims.$inferInsert> = {};
    if (body.failureCategory !== undefined) patch.failureCategory = this.cleanNullableText(body.failureCategory);
    if (body.technicianAssessment !== undefined) patch.technicianAssessment = this.cleanNullableText(body.technicianAssessment);
    if (body.rmaNo !== undefined) patch.rmaNo = this.cleanNullableText(body.rmaNo);
    if (body.supplierName !== undefined) patch.supplierName = this.cleanNullableText(body.supplierName);
    if (body.supplierRmaStatus !== undefined) patch.supplierRmaStatus = this.cleanNullableText(body.supplierRmaStatus);
    if (body.costAmount !== undefined) patch.costAmount = this.moneyValue(body.costAmount);
    if (body.costCurrency !== undefined) patch.costCurrency = body.costCurrency;
    if (body.customerChargeAmount !== undefined) patch.customerChargeAmount = this.moneyValue(body.customerChargeAmount);
    if (body.customerChargeCurrency !== undefined) patch.customerChargeCurrency = body.customerChargeCurrency;
    if (body.status !== undefined) patch.status = body.status;
    if (Object.keys(patch).length) {
      const [updated] = await this.db
        .update(serviceWarrantyClaims)
        .set(patch)
        .where(eq(serviceWarrantyClaims.id, claim.id))
        .returning();
      return this.warrantyResponse(updated);
    }
    return this.warrantyResponse(claim);
  }

  @RequirePermissions('service_tickets.update')
  @Put('service-tickets/:id/warranty/parts')
  async replaceWarrantyParts(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyPartsUpdate)) body: z.infer<typeof warrantyPartsUpdate>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    if (ticket.ticketType !== 'warranty_claim') {
      await this.db.update(serviceTickets).set({ ticketType: 'warranty_claim' }).where(eq(serviceTickets.id, ticket.id));
      ticket.ticketType = 'warranty_claim';
    }
    const claim = await this.ensureWarrantyClaim(ticket);
    for (const part of body.parts) {
      if (part.productModelId) {
        const product = await this.db.query.productModels.findFirst({
          where: and(eq(productModels.id, part.productModelId), eq(productModels.tenantId, user.tenantId), isNull(productModels.deletedAt)),
        });
        if (!product) throw new NotFoundError('Ürün');
      }
      if (part.inventoryItemId) await this.assertInventoryItem(part.inventoryItemId, user.tenantId);
    }
    await this.db
      .update(serviceWarrantyParts)
      .set({ deletedAt: new Date() })
      .where(and(eq(serviceWarrantyParts.warrantyClaimId, claim.id), eq(serviceWarrantyParts.tenantId, user.tenantId), isNull(serviceWarrantyParts.deletedAt)));
    if (body.parts.length) {
      await this.db.insert(serviceWarrantyParts).values(
        body.parts.map((part) => ({
          tenantId: user.tenantId,
          warrantyClaimId: claim.id,
          productModelId: part.productModelId ?? null,
          inventoryItemId: part.inventoryItemId ?? null,
          description: part.description.trim(),
          quantity: part.quantity,
          actionType: part.actionType,
          source: part.source,
          supplierRmaStatus: this.cleanNullableText(part.supplierRmaStatus),
          chargeToCustomer: part.chargeToCustomer,
          unitCost: this.moneyValue(part.unitCost),
          currency: part.currency,
          notes: this.cleanNullableText(part.notes),
        }))
      );
    }
    const refreshed = await this.findWarrantyClaim(ticket.id, user.tenantId);
    return this.warrantyResponse(refreshed ?? claim);
  }

  @RequirePermissions('service_tickets.update')
  @Post('service-tickets/:id/warranty/submit')
  async submitWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantySubmit)) _body: z.infer<typeof warrantySubmit>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    if (!ticket.customerDeviceId) throw new ValidationError('Garanti onayına göndermek için servis kaydı bir makineyle eşleşmeli');
    if (ticket.ticketType !== 'warranty_claim') {
      await this.db.update(serviceTickets).set({ ticketType: 'warranty_claim' }).where(eq(serviceTickets.id, ticket.id));
      ticket.ticketType = 'warranty_claim';
    }
    const claim = await this.ensureWarrantyClaim(ticket);
    const [updated] = await this.db
      .update(serviceWarrantyClaims)
      .set({ status: 'submitted' })
      .where(eq(serviceWarrantyClaims.id, claim.id))
      .returning();
    return this.warrantyResponse(updated);
  }

  @RequirePermissions('service_tickets.approve')
  @Post('service-tickets/:id/warranty/approve')
  async approveWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyDecision)) body: z.infer<typeof warrantyDecision>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    const claim = await this.ensureWarrantyClaim(ticket);
    const [updated] = await this.db
      .update(serviceWarrantyClaims)
      .set({
        status: 'approved',
        coverageDecision: 'approved',
        managerDecisionNote: this.cleanNullableText(body.decisionNote),
        decidedByUserId: user.userId,
        decidedAt: new Date(),
      })
      .where(eq(serviceWarrantyClaims.id, claim.id))
      .returning();
    return this.warrantyResponse(updated);
  }

  @RequirePermissions('service_tickets.reject')
  @Post('service-tickets/:id/warranty/reject')
  async rejectWarranty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warrantyDecision)) body: z.infer<typeof warrantyDecision>,
    @CurrentUser() user: AuthContext
  ) {
    const ticket = await this.getScopedTicket(id, user);
    const claim = await this.ensureWarrantyClaim(ticket);
    const [updated] = await this.db
      .update(serviceWarrantyClaims)
      .set({
        status: 'rejected',
        coverageDecision: 'rejected',
        managerDecisionNote: this.cleanNullableText(body.decisionNote),
        decidedByUserId: user.userId,
        decidedAt: new Date(),
      })
      .where(eq(serviceWarrantyClaims.id, claim.id))
      .returning();
    return this.warrantyResponse(updated);
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-tickets/:id/status')
  async updateTicketStatus(@Param('id') id: string, @Body(new ZodValidationPipe(ticketStatus)) body: z.infer<typeof ticketStatus>, @CurrentUser() user: AuthContext) {
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.tenantId, user.tenantId),
        divisionFilter(resolveActorDivisionScope(user), serviceTickets.divisionId) ?? sql`true`
      ),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    const statusId = await lookupIdByCode(this.db, serviceTicketStatuses, body.statusCode);
    const patch: Record<string, unknown> = { statusId };
    if (body.statusCode === 'resolved' || body.statusCode === 'closed') patch.resolvedAt = new Date();
    await this.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, id));
    return { ok: true };
  }

  // ─────── INSTALLATIONS ───────
  @RequirePermissions('installations.read')
  @Get('installations')
  async listInstallations(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(installationJobs.tenantId, user.tenantId),
      isNull(installationJobs.deletedAt),
      divisionFilter(resolveActorDivisionScope(user), installationJobs.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(installationJobs).where(where);
    const rows = await this.db
      .select({
        installation: installationJobs,
        status: { id: installationStatuses.id, code: installationStatuses.code, name: installationStatuses.name },
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        contact: { id: contacts.id, fullName: contacts.fullName },
        assignedTo: { id: usersTable.id, fullName: usersTable.fullName },
      })
      .from(installationJobs)
      .leftJoin(installationStatuses, eq(installationJobs.statusId, installationStatuses.id))
      .leftJoin(companies, eq(installationJobs.companyId, companies.id))
      .leftJoin(contacts, eq(installationJobs.contactId, contacts.id))
      .leftJoin(usersTable, eq(installationJobs.assignedToUserId, usersTable.id))
      .where(where)
      .orderBy(desc(installationJobs.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.installation, status: r.status, company: r.company, contact: r.contact, assignedTo: r.assignedTo })), count, p);
  }

  @RequirePermissions('installations.create')
  @Post('installations')
  async createInstallation(@Body(new ZodValidationPipe(installCreate)) body: z.infer<typeof installCreate>, @CurrentUser() user: AuthContext) {
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    const opportunity = body.opportunityId ? await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId) : null;
    const quote = body.quoteId ? await this.assertQuote(body.quoteId, user.tenantId, body.companyId, body.opportunityId) : null;
    if (opportunity && quote && quote.companyId !== opportunity.companyId) throw new ValidationError('Teklif seçilen fırsatın firmasına ait değil');
    const companyId = body.companyId ?? opportunity?.companyId ?? quote?.companyId ?? null;
    if (body.contactId) await this.assertContact(body.contactId, user.tenantId, companyId);
    if (body.customerDeviceId) await this.assertCustomerDevice(body.customerDeviceId, user.tenantId, companyId);
    if (body.assignedToUserId) await this.assertUser(body.assignedToUserId, user.tenantId);
    const scheduled = await this.db.query.installationStatuses.findFirst({ where: eq(installationStatuses.code, 'scheduled') });
    const divisionId = resolveAssignedDivision(user, body.divisionId ?? opportunity?.divisionId ?? quote?.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Kurulum için bölüm ataması zorunludur', { field: 'divisionId' });
    // Konum tipi + süre verildiyse saha ücretini @haksan/shared ile hesapla
    // (İstanbul içi 70$/saat, dışı 100$/saat; 15/45 dk eşikli yuvarlama).
    const fee =
      body.locationType && body.durationMinutes != null
        ? computeInstallationFee(body.durationMinutes, body.locationType as InstallationLocationType)
        : null;
    const [row] = await this.db
      .insert(installationJobs)
      .values({
        tenantId: user.tenantId,
        divisionId,
        opportunityId: body.opportunityId ?? null,
        quoteId: body.quoteId ?? null,
        customerDeviceId: body.customerDeviceId ?? null,
        companyId,
        contactId: body.contactId ?? null,
        scheduledDate: body.scheduledDate ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        statusId: scheduled?.id ?? null,
        location: body.location ?? null,
        locationType: body.locationType ?? null,
        durationMinutes: body.durationMinutes ?? null,
        feeAmount: fee ? fee.amount.toString() : null,
        notes: body.notes ?? null,
      })
      .returning();
    return row;
  }

  @RequirePermissions('installations.update')
  @Patch('installations/:id/status')
  async updateInstallationStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(installStatusUpdate)) body: z.infer<typeof installStatusUpdate>,
    @CurrentUser() user: AuthContext,
  ) {
    const job = await this.db.query.installationJobs.findFirst({
      where: and(
        eq(installationJobs.id, id),
        eq(installationJobs.tenantId, user.tenantId),
        isNull(installationJobs.deletedAt),
        divisionFilter(resolveActorDivisionScope(user), installationJobs.divisionId) ?? sql`true`
      ),
    });
    if (!job) throw new NotFoundError('Kurulum');
    const statusId = await lookupIdByCode(this.db, installationStatuses, body.statusCode);
    const patch: Record<string, unknown> = { statusId };
    if (body.statusCode === 'in_progress' && !job.startedAt) patch.startedAt = new Date();
    if (body.statusCode === 'completed') {
      const completedAt = body.installationDate ?? new Date();
      patch.completedAt = completedAt;
      if (job.customerDeviceId) {
        await this.db
          .update(customerDevices)
          .set({
            installationDate: completedAt,
            warrantyStartDate: completedAt,
            warrantyEndDate: new Date(completedAt.getTime() + 365 * 24 * 60 * 60 * 1000),
          })
          .where(and(eq(customerDevices.id, job.customerDeviceId), eq(customerDevices.tenantId, user.tenantId)));
      }
    }
    const [row] = await this.db.update(installationJobs).set(patch).where(eq(installationJobs.id, id)).returning();
    return row;
  }

  // ─────── SHIPMENTS ───────
  /** Sevkiyatı durum + firma + satır kalemleri (paketleme listesi) ile zenginleştirir; eski JSON-notes satırlarını da çözer. */
  private async enrichShipment(shipment: typeof shipments.$inferSelect) {
    const status = shipment.statusId
      ? await this.db.query.shipmentStatuses.findFirst({ where: eq(shipmentStatuses.id, shipment.statusId) })
      : null;
    const company = shipment.companyId
      ? await this.db.query.companies.findFirst({ where: eq(companies.id, shipment.companyId) })
      : null;
    const items = await this.db
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, shipment.id), isNull(shipmentItems.deletedAt)))
      .orderBy(shipmentItems.sortOrder);
    const legacy = this.decodeShipmentNotes(shipment.notes);
    const isLegacyMeta = !shipment.origin && !shipment.destination && !shipment.eta && !!(legacy.origin || legacy.destination || legacy.eta);
    return {
      ...shipment,
      origin: shipment.origin ?? legacy.origin ?? null,
      destination: shipment.destination ?? legacy.destination ?? null,
      eta: shipment.eta ?? (legacy.eta ? new Date(legacy.eta) : null),
      notes: isLegacyMeta ? legacy.notes ?? null : shipment.notes,
      status,
      company: company ? { id: company.id, legalTitle: company.legalTitle, shortName: company.shortName } : null,
      items,
    };
  }

  @RequirePermissions('shipments.read')
  @Get('shipments')
  async listShipments(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(shipments.tenantId, user.tenantId),
      isNull(shipments.deletedAt),
      divisionFilter(resolveActorDivisionScope(user), shipments.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(where);
    const rows = await this.db.select().from(shipments).where(where).orderBy(desc(shipments.createdAt)).limit(limit).offset(offset);
    const enriched = await Promise.all(rows.map((s) => this.enrichShipment(s)));
    return buildPaginated(enriched, count, p);
  }

  @RequirePermissions('shipments.read')
  @Get('shipments/:id')
  async getShipment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const shipment = await this.assertShipment(id, user.tenantId, user);
    return this.enrichShipment(shipment);
  }

  @RequirePermissions('shipments.create')
  @Post('shipments')
  async createShipment(@Body(new ZodValidationPipe(shipmentCreateSchema)) body: z.infer<typeof shipmentCreateSchema>, @CurrentUser() user: AuthContext) {
    const opportunity = body.opportunityId ? await this.assertOpportunity(body.opportunityId, user.tenantId) : null;
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    const companyId = body.companyId ?? opportunity?.companyId ?? null;
    if (body.quoteId) await this.assertQuote(body.quoteId, user.tenantId, companyId, body.opportunityId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, companyId);
    const statusId = await lookupIdByCode(this.db, shipmentStatuses, body.statusCode);
    const divisionId = resolveAssignedDivision(
      user,
      body.divisionId ?? opportunity?.divisionId ?? null
    );
    if (!divisionId) throw new ValidationError('Sevkiyat için bölüm ataması zorunludur', { field: 'divisionId' });
    const [row] = await this.db
      .insert(shipments)
      .values({
        tenantId: user.tenantId,
        divisionId,
        opportunityId: body.opportunityId ?? null,
        quoteId: body.quoteId ?? null,
        salesOrderId: body.salesOrderId ?? null,
        companyId,
        shipmentNo: body.shipmentNo ?? null,
        carrier: body.carrier ?? null,
        trackingNo: body.trackingNo ?? null,
        statusId,
        origin: body.origin ?? null,
        destination: body.destination ?? null,
        eta: body.eta ?? null,
        incoterm: body.incoterm ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    if (body.items?.length) await this.insertShipmentItems(row.id, user.tenantId, companyId, body.items);
    return this.enrichShipment(row);
  }

  @RequirePermissions('shipments.update')
  @Patch('shipments/:id/status')
  async updateShipmentStatus(@Param('id') id: string, @Body(new ZodValidationPipe(shipmentStatusUpdateSchema)) body: z.infer<typeof shipmentStatusUpdateSchema>, @CurrentUser() user: AuthContext) {
    const shipment = await this.assertShipment(id, user.tenantId, user);
    const statusId = await lookupIdByCode(this.db, shipmentStatuses, body.statusCode);
    const now = new Date();
    const patch: Record<string, unknown> = { statusId };
    if (body.statusCode === 'in_transit' && !shipment.shippedAt) patch.shippedAt = now;
    if (body.statusCode === 'cleared' && !shipment.customsClearedAt) patch.customsClearedAt = now;
    if (body.statusCode === 'delivered' && !shipment.arrivedAt) patch.arrivedAt = now;
    await this.db.update(shipments).set(patch).where(eq(shipments.id, id));

    // Durum geçişlerinde seri-numaralı stoğu senkronla.
    if (body.statusCode === 'in_transit') {
      await this.markInventoryInTransit(shipment.id, user.tenantId, user.userId);
    } else if (body.statusCode === 'delivered') {
      await this.markInventoryDelivered(shipment.id, user.tenantId, shipment.companyId, shipment.arrivedAt ?? now, 'shipment', shipment.id, user.userId);
    }
    return { ok: true };
  }

  // ───── DELIVERIES ─────
  @RequirePermissions('shipments.read')
  @Get('deliveries')
  async listDeliveries(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(
      eq(deliveries.tenantId, user.tenantId),
      isNull(deliveries.deletedAt),
      divisionFilter(resolveActorDivisionScope(user), deliveries.divisionId) ?? sql`true`
    );
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(deliveries).where(where);
    const rows = await this.db
      .select()
      .from(deliveries)
      .where(where)
      .orderBy(desc(deliveries.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows, count, p);
  }

  @RequirePermissions('shipments.create')
  @Post('deliveries')
  async createDelivery(@Body(new ZodValidationPipe(deliveryCreateSchema)) body: z.infer<typeof deliveryCreateSchema>, @CurrentUser() user: AuthContext) {
    await this.assertCompany(body.companyId, user.tenantId);
    if (body.opportunityId) await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, body.companyId);
    if (body.shipmentId) await this.assertShipment(body.shipmentId, user.tenantId, user);
    const divisionId = resolveAssignedDivision(user, body.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Teslimat için bölüm ataması zorunludur', { field: 'divisionId' });
    const [row] = await this.db
      .insert(deliveries)
      .values({
        tenantId: user.tenantId,
        divisionId,
        opportunityId: body.opportunityId ?? null,
        companyId: body.companyId,
        shipmentId: body.shipmentId ?? null,
        salesOrderId: body.salesOrderId ?? null,
        deliveryDate: body.deliveryDate,
        signedBy: body.signedBy ?? null,
        status: body.status,
        notes: body.notes ?? null,
        formData: body.formData ?? null,
      })
      .returning();
    if (body.status === 'completed' && body.shipmentId) {
      await this.markInventoryDelivered(body.shipmentId, user.tenantId, body.companyId, body.deliveryDate, 'delivery', row.id, user.userId);
    }
    return row;
  }

  @RequirePermissions('shipments.update')
  @Patch('deliveries/:id')
  async updateDelivery(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deliveryUpdateSchema)) body: z.infer<typeof deliveryUpdateSchema>,
    @CurrentUser() user: AuthContext,
  ) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(deliveries.id, id),
        eq(deliveries.tenantId, user.tenantId),
        isNull(deliveries.deletedAt),
        divisionFilter(resolveActorDivisionScope(user), deliveries.divisionId) ?? sql`true`
      ),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    if (body.opportunityId) await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId ?? delivery.companyId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, body.companyId ?? delivery.companyId);
    if (body.shipmentId) await this.assertShipment(body.shipmentId, user.tenantId, user);

    const patch: Partial<typeof deliveries.$inferInsert> = {};
    if (body.opportunityId !== undefined) patch.opportunityId = body.opportunityId ?? null;
    if (body.companyId !== undefined) patch.companyId = body.companyId;
    if (body.shipmentId !== undefined) patch.shipmentId = body.shipmentId ?? null;
    if (body.salesOrderId !== undefined) patch.salesOrderId = body.salesOrderId ?? null;
    if (body.deliveryDate !== undefined) patch.deliveryDate = body.deliveryDate;
    if (body.signedBy !== undefined) patch.signedBy = body.signedBy ?? null;
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.formData !== undefined) patch.formData = body.formData ?? null;

    const [row] = await this.db.update(deliveries).set(patch).where(eq(deliveries.id, id)).returning();
    if (body.status === 'completed' && row.shipmentId) {
      await this.markInventoryDelivered(row.shipmentId, user.tenantId, row.companyId, row.deliveryDate, 'delivery', row.id, user.userId);
    }
    return row;
  }

  @RequirePermissions('shipments.update')
  @Patch('deliveries/:id/status')
  async updateDeliveryStatus(@Param('id') id: string, @Body(new ZodValidationPipe(deliveryStatusUpdateSchema)) body: z.infer<typeof deliveryStatusUpdateSchema>, @CurrentUser() user: AuthContext) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(deliveries.id, id),
        eq(deliveries.tenantId, user.tenantId),
        isNull(deliveries.deletedAt),
        divisionFilter(resolveActorDivisionScope(user), deliveries.divisionId) ?? sql`true`
      ),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    await this.db.update(deliveries).set({ status: body.status }).where(eq(deliveries.id, id));
    if (body.status === 'completed' && delivery.shipmentId) {
      await this.markInventoryDelivered(delivery.shipmentId, user.tenantId, delivery.companyId, delivery.deliveryDate, 'delivery', delivery.id, user.userId);
    }
    return { ok: true };
  }
}
