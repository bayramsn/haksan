import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { serviceTickets, installationJobs, shipments, shipmentItems, deliveries } from '../../db/schema/service';
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

const ticketCreate = z.object({
  ticketNo: z.string().min(1).max(64).optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  customerDeviceId: z.string().optional(),
  subject: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});
const ticketStatus = z.object({ statusCode: z.string() });
const ticketUpdate = z.object({
  description: z.string().max(4000).optional(),
  resolutionNote: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const installCreate = z.object({
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

  private async assertShipment(shipmentId: string, tenantId: string) {
    const shipment = await this.db.query.shipments.findFirst({
      where: and(eq(shipments.id, shipmentId), eq(shipments.tenantId, tenantId), isNull(shipments.deletedAt)),
    });
    if (!shipment) throw new NotFoundError('Sevkiyat');
    return shipment;
  }

  /** Sevkiyata çıkan seri-numaralı kalemleri `in_transit` yapar + `ship` hareketi yazar (idempotent). */
  private async markInventoryInTransit(shipmentId: string, tenantId: string, actorUserId: string) {
    const inTransitId = await lookupIdByCode(this.db, inventoryStatuses, 'in_transit');
    if (!inTransitId) return;
    const soldId = await lookupIdByCode(this.db, inventoryStatuses, 'sold');
    const lines = await this.db
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.tenantId, tenantId), isNull(shipmentItems.deletedAt)));
    for (const line of lines) {
      if (!line.inventoryItemId) continue;
      const item = await this.db.query.inventoryItems.findFirst({
        where: and(eq(inventoryItems.id, line.inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
      });
      if (!item || item.stockStatusId === inTransitId || (soldId && item.stockStatusId === soldId)) continue;
      await this.db.update(inventoryItems).set({ stockStatusId: inTransitId, loadingDate: new Date() }).where(eq(inventoryItems.id, item.id));
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
  }

  /** Sevkiyat satır kalemlerini ekler; seri no verilmemişse stok kaleminden anlık kopyalar. */
  private async insertShipmentItems(shipmentId: string, tenantId: string, items: ShipmentItemInput[]) {
    for (const item of items) {
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
    const lines = await this.db
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, shipmentId), eq(shipmentItems.tenantId, tenantId), isNull(shipmentItems.deletedAt)));
    for (const line of lines) {
      if (!line.inventoryItemId) continue;
      const item = await this.db.query.inventoryItems.findFirst({
        where: and(eq(inventoryItems.id, line.inventoryItemId), eq(inventoryItems.tenantId, tenantId), isNull(inventoryItems.deletedAt)),
      });
      if (!item || item.stockStatusId === soldStatusId) continue;
      await this.db.update(inventoryItems).set({ stockStatusId: soldStatusId, arrivalDate: deliveryDate }).where(eq(inventoryItems.id, item.id));
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
      if (companyId) {
        const existingDevice = await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.inventoryItemId, item.id), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
        });
        if (existingDevice) {
          await this.db.update(customerDevices).set({ deliveryDate }).where(eq(customerDevices.id, existingDevice.id));
        } else {
          await this.db.insert(customerDevices).values({
            tenantId,
            companyId,
            inventoryItemId: item.id,
            saleDate: deliveryDate,
            deliveryDate,
          });
        }
      }
    }
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
    const where = and(eq(serviceTickets.tenantId, user.tenantId), isNull(serviceTickets.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(serviceTickets).where(where);
    const rows = await this.db
      .select({ ticket: serviceTickets, status: { id: serviceTicketStatuses.id, code: serviceTicketStatuses.code, name: serviceTicketStatuses.name } })
      .from(serviceTickets)
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .where(where)
      .orderBy(desc(serviceTickets.reportedAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.ticket, status: r.status })), count, p);
  }

  @RequirePermissions('service_tickets.create')
  @Post('service-tickets')
  async createTicket(@Body(new ZodValidationPipe(ticketCreate)) body: z.infer<typeof ticketCreate>, @CurrentUser() user: AuthContext) {
    await this.assertCompany(body.companyId, user.tenantId);
    if (body.contactId) await this.assertContact(body.contactId, user.tenantId, body.companyId);
    if (body.customerDeviceId) await this.assertCustomerDevice(body.customerDeviceId, user.tenantId, body.companyId);
    const openStatus = await this.db.query.serviceTicketStatuses.findFirst({ where: eq(serviceTicketStatuses.code, 'open') });
    let ticketNo = body.ticketNo;
    if (!ticketNo) {
      const [{ c }] = await this.db.select({ c: sql<number>`count(*)::int` }).from(serviceTickets).where(eq(serviceTickets.tenantId, user.tenantId));
      const year = new Date().getUTCFullYear();
      ticketNo = `SVC-${year}-${String(c + 1).padStart(4, '0')}`;
    }
    const [row] = await this.db
      .insert(serviceTickets)
      .values({
        tenantId: user.tenantId,
        ticketNo,
        companyId: body.companyId,
        contactId: body.contactId ?? null,
        customerDeviceId: body.customerDeviceId ?? null,
        subject: body.subject,
        description: body.description ?? null,
        severity: body.severity,
        statusId: openStatus?.id ?? null,
      })
      .returning();
    return row;
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-tickets/:id')
  async updateTicket(@Param('id') id: string, @Body(new ZodValidationPipe(ticketUpdate)) body: z.infer<typeof ticketUpdate>, @CurrentUser() user: AuthContext) {
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(eq(serviceTickets.id, id), eq(serviceTickets.tenantId, user.tenantId)),
    });
    if (!ticket) throw new NotFoundError('Servis kaydı');
    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch.description = body.description;
    if (body.resolutionNote !== undefined) patch.resolutionNote = body.resolutionNote;
    if (body.severity !== undefined) patch.severity = body.severity;
    if (body.assignedToUserId !== undefined) patch.assignedToUserId = body.assignedToUserId;
    if (body.metadata !== undefined) patch.metadata = body.metadata;
    if (!Object.keys(patch).length) return ticket;
    const [row] = await this.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, id)).returning();
    return row;
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-tickets/:id/status')
  async updateTicketStatus(@Param('id') id: string, @Body(new ZodValidationPipe(ticketStatus)) body: z.infer<typeof ticketStatus>, @CurrentUser() user: AuthContext) {
    const ticket = await this.db.query.serviceTickets.findFirst({
      where: and(eq(serviceTickets.id, id), eq(serviceTickets.tenantId, user.tenantId)),
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
    const where = and(eq(installationJobs.tenantId, user.tenantId), isNull(installationJobs.deletedAt));
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
    const where = and(eq(shipments.tenantId, user.tenantId), isNull(shipments.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(where);
    const rows = await this.db.select().from(shipments).where(where).orderBy(desc(shipments.createdAt)).limit(limit).offset(offset);
    const enriched = await Promise.all(rows.map((s) => this.enrichShipment(s)));
    return buildPaginated(enriched, count, p);
  }

  @RequirePermissions('shipments.read')
  @Get('shipments/:id')
  async getShipment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const shipment = await this.assertShipment(id, user.tenantId);
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
    const [row] = await this.db
      .insert(shipments)
      .values({
        tenantId: user.tenantId,
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
    if (body.items?.length) await this.insertShipmentItems(row.id, user.tenantId, body.items);
    return this.enrichShipment(row);
  }

  @RequirePermissions('shipments.update')
  @Patch('shipments/:id/status')
  async updateShipmentStatus(@Param('id') id: string, @Body(new ZodValidationPipe(shipmentStatusUpdateSchema)) body: z.infer<typeof shipmentStatusUpdateSchema>, @CurrentUser() user: AuthContext) {
    const shipment = await this.assertShipment(id, user.tenantId);
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
    const where = and(eq(deliveries.tenantId, user.tenantId), isNull(deliveries.deletedAt));
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
    if (body.shipmentId) await this.assertShipment(body.shipmentId, user.tenantId);
    const [row] = await this.db
      .insert(deliveries)
      .values({
        tenantId: user.tenantId,
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
      where: and(eq(deliveries.id, id), eq(deliveries.tenantId, user.tenantId), isNull(deliveries.deletedAt)),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    if (body.companyId) await this.assertCompany(body.companyId, user.tenantId);
    if (body.opportunityId) await this.assertOpportunity(body.opportunityId, user.tenantId, body.companyId ?? delivery.companyId);
    if (body.salesOrderId) await this.assertSalesOrder(body.salesOrderId, user.tenantId, body.companyId ?? delivery.companyId);
    if (body.shipmentId) await this.assertShipment(body.shipmentId, user.tenantId);

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
      where: and(eq(deliveries.id, id), eq(deliveries.tenantId, user.tenantId), isNull(deliveries.deletedAt)),
    });
    if (!delivery) throw new NotFoundError('Teslimat');
    await this.db.update(deliveries).set({ status: body.status }).where(eq(deliveries.id, id));
    if (body.status === 'completed' && delivery.shipmentId) {
      await this.markInventoryDelivered(delivery.shipmentId, user.tenantId, delivery.companyId, delivery.deliveryDate, 'delivery', delivery.id, user.userId);
    }
    return { ok: true };
  }
}
