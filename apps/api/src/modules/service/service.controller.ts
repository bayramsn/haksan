import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { serviceTickets, installationJobs, shipments } from '../../db/schema/service';
import { serviceTicketStatuses, installationStatuses, shipmentStatuses } from '../../db/schema/lookup';
import { companies, contacts } from '../../db/schema/companies';
import { users as usersTable } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { paginationSchema, type Pagination } from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError } from '../../shared/utils/errors';
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

const installCreate = z.object({
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  customerDeviceId: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  scheduledDate: z.coerce.date().optional(),
  assignedToUserId: z.string().optional(),
  location: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

const shipmentCreate = z.object({
  opportunityId: z.string().optional(),
  quoteId: z.string().optional(),
  shipmentNo: z.string().max(64).optional(),
  carrier: z.string().max(255).optional(),
  trackingNo: z.string().max(128).optional(),
  notes: z.string().max(2000).optional(),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ServiceController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

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
    const scheduled = await this.db.query.installationStatuses.findFirst({ where: eq(installationStatuses.code, 'scheduled') });
    const [row] = await this.db
      .insert(installationJobs)
      .values({
        tenantId: user.tenantId,
        opportunityId: body.opportunityId ?? null,
        quoteId: body.quoteId ?? null,
        customerDeviceId: body.customerDeviceId ?? null,
        companyId: body.companyId ?? null,
        contactId: body.contactId ?? null,
        scheduledDate: body.scheduledDate ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        statusId: scheduled?.id ?? null,
        location: body.location ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return row;
  }

  // ─────── SHIPMENTS ───────
  @RequirePermissions('shipments.read')
  @Get('shipments')
  async listShipments(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(eq(shipments.tenantId, user.tenantId), isNull(shipments.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(where);
    const rows = await this.db.select().from(shipments).where(where).orderBy(desc(shipments.createdAt)).limit(limit).offset(offset);
    return buildPaginated(rows, count, p);
  }

  @RequirePermissions('shipments.create')
  @Post('shipments')
  async createShipment(@Body(new ZodValidationPipe(shipmentCreate)) body: z.infer<typeof shipmentCreate>, @CurrentUser() user: AuthContext) {
    const preparing = await this.db.query.shipmentStatuses.findFirst({ where: eq(shipmentStatuses.code, 'preparing') });
    const [row] = await this.db
      .insert(shipments)
      .values({
        tenantId: user.tenantId,
        opportunityId: body.opportunityId ?? null,
        quoteId: body.quoteId ?? null,
        shipmentNo: body.shipmentNo ?? null,
        carrier: body.carrier ?? null,
        trackingNo: body.trackingNo ?? null,
        statusId: preparing?.id ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return row;
  }
}
