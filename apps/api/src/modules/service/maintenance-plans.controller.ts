import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { maintenancePlans } from '../../db/schema/service';
import { customerDevices, inventoryItems } from '../../db/schema/inventory';
import { brands, productModels } from '../../db/schema/products';
import { companies } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { paginationSchema } from '@haksan/shared';
import {
  maintenancePlanCreateSchema,
  maintenancePlanUpdateSchema,
  maintenancePlanCompleteSchema,
} from '@haksan/shared';
import { resourceDivisionFilter, resolveAssignedResourceDivision } from '../../shared/utils/division-scope';
import { companyVisibilityExistsFilter } from '../../shared/utils/company-visibility';

const DAY_MS = 24 * 60 * 60 * 1000;

const listQuery = paginationSchema.extend({
  customerDeviceId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  dueSoon: z.coerce.boolean().optional(),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('maintenance-plans')
export class MaintenancePlansController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private async assertScopedDevice(deviceId: string, actor: AuthContext) {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, customerDevices.companyId);
    const device = await this.db.query.customerDevices.findFirst({
      where: and(
        eq(customerDevices.id, deviceId),
        eq(customerDevices.tenantId, actor.tenantId),
        isNull(customerDevices.deletedAt),
        resourceDivisionFilter(actor, 'customer_devices', customerDevices.divisionId) ?? sql`true`,
        visibility ?? sql`true`,
      ),
    });
    if (!device) throw new NotFoundError('Makine');
    return device;
  }

  private async assertScopedPlan(id: string, actor: AuthContext) {
    const visibility = await companyVisibilityExistsFilter(this.db, actor, maintenancePlans.companyId);
    const plan = await this.db.query.maintenancePlans.findFirst({
      where: and(
        eq(maintenancePlans.id, id),
        eq(maintenancePlans.tenantId, actor.tenantId),
        isNull(maintenancePlans.deletedAt),
        resourceDivisionFilter(actor, 'service_tickets', maintenancePlans.divisionId) ?? sql`true`,
        visibility ?? sql`true`,
      ),
    });
    if (!plan) throw new NotFoundError('Bakım planı');
    return plan;
  }

  @RequirePermissions('service_tickets.read')
  @Get()
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(query);
    const filters = [
      eq(maintenancePlans.tenantId, user.tenantId),
      isNull(maintenancePlans.deletedAt),
      resourceDivisionFilter(user, 'service_tickets', maintenancePlans.divisionId) ?? sql`true`,
    ];
    const visibility = await companyVisibilityExistsFilter(this.db, user, maintenancePlans.companyId);
    if (visibility) filters.push(visibility);
    if (query.customerDeviceId) filters.push(eq(maintenancePlans.customerDeviceId, query.customerDeviceId));
    if (query.companyId) filters.push(eq(maintenancePlans.companyId, query.companyId));
    if (query.dueSoon) {
      filters.push(eq(maintenancePlans.isActive, true));
      filters.push(sql`${maintenancePlans.nextDueDate} <= now() + (${maintenancePlans.reminderLeadDays} || ' days')::interval`);
    }
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(maintenancePlans).where(where);
    const rows = await this.db
      .select({
        plan: maintenancePlans,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        serialNumber: inventoryItems.serialNumber,
        model: productModels.modelName,
        modelCode: productModels.modelCode,
        brand: brands.name,
      })
      .from(maintenancePlans)
      .leftJoin(companies, eq(maintenancePlans.companyId, companies.id))
      .leftJoin(customerDevices, eq(maintenancePlans.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .where(where)
      .orderBy(asc(maintenancePlans.nextDueDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((row) => ({
        ...row.plan,
        company: row.company?.id ? {
          id: row.company.id,
          legalTitle: row.company.legalTitle,
          shortName: row.company.shortName,
          name: row.company.shortName ?? row.company.legalTitle,
        } : null,
        machine: {
          serialNumber: row.serialNumber ?? null,
          model: row.model ?? row.modelCode ?? null,
          brand: row.brand ?? null,
        },
      })),
      count,
      query,
    );
  }

  @RequirePermissions('service_tickets.read')
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.assertScopedPlan(id, user);
    const [row] = await this.db
      .select({
        plan: maintenancePlans,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        serialNumber: inventoryItems.serialNumber,
        model: productModels.modelName,
        modelCode: productModels.modelCode,
        brand: brands.name,
      })
      .from(maintenancePlans)
      .leftJoin(companies, eq(maintenancePlans.companyId, companies.id))
      .leftJoin(customerDevices, eq(maintenancePlans.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .where(and(eq(maintenancePlans.id, id), eq(maintenancePlans.tenantId, user.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Bakım planı');
    return {
      ...row.plan,
      company: row.company?.id ? {
        id: row.company.id,
        legalTitle: row.company.legalTitle,
        shortName: row.company.shortName,
        name: row.company.shortName ?? row.company.legalTitle,
      } : null,
      machine: {
        serialNumber: row.serialNumber ?? null,
        model: row.model ?? row.modelCode ?? null,
        brand: row.brand ?? null,
      },
    };
  }

  @RequirePermissions('service_tickets.create')
  @Post()
  async create(@Body(new ZodValidationPipe(maintenancePlanCreateSchema)) body: z.infer<typeof maintenancePlanCreateSchema>, @CurrentUser() user: AuthContext) {
    const device = await this.assertScopedDevice(body.customerDeviceId, user);
    const nextDue = body.nextDueDate ? new Date(body.nextDueDate) : new Date(Date.now() + body.intervalDays * DAY_MS);
    const [row] = await this.db
      .insert(maintenancePlans)
      .values({
        tenantId: user.tenantId,
        divisionId: resolveAssignedResourceDivision(user, 'service_tickets', device.divisionId ?? null),
        customerDeviceId: device.id,
        companyId: device.companyId,
        title: body.title?.trim() || 'Periyodik bakım',
        intervalDays: body.intervalDays,
        nextDueDate: nextDue,
        reminderLeadDays: body.reminderLeadDays,
        autoCreateTicket: body.autoCreateTicket,
        notes: body.notes ?? null,
      })
      .returning();
    return row;
  }

  @RequirePermissions('service_tickets.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(maintenancePlanUpdateSchema)) body: z.infer<typeof maintenancePlanUpdateSchema>, @CurrentUser() user: AuthContext) {
    await this.assertScopedPlan(id, user);
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title.trim();
    if (body.intervalDays !== undefined) patch.intervalDays = body.intervalDays;
    if (body.nextDueDate !== undefined) patch.nextDueDate = new Date(body.nextDueDate);
    if (body.reminderLeadDays !== undefined) patch.reminderLeadDays = body.reminderLeadDays;
    if (body.autoCreateTicket !== undefined) patch.autoCreateTicket = body.autoCreateTicket;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (Object.keys(patch).length === 0) throw new ValidationError('Güncellenecek alan yok');
    const [row] = await this.db.update(maintenancePlans).set(patch).where(eq(maintenancePlans.id, id)).returning();
    return row;
  }

  /** Bakım yapıldı: son bakım tarihini işaretle, sonrakini interval kadar ileri al. */
  @RequirePermissions('service_tickets.update')
  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body(new ZodValidationPipe(maintenancePlanCompleteSchema)) body: z.infer<typeof maintenancePlanCompleteSchema>, @CurrentUser() user: AuthContext) {
    const plan = await this.assertScopedPlan(id, user);
    const servicedAt = body.servicedAt ? new Date(body.servicedAt) : new Date();
    const nextDue = new Date(servicedAt.getTime() + plan.intervalDays * DAY_MS);
    const [row] = await this.db
      .update(maintenancePlans)
      .set({ lastServiceDate: servicedAt, nextDueDate: nextDue, lastRemindedAt: null })
      .where(eq(maintenancePlans.id, id))
      .returning();
    return row;
  }

  @RequirePermissions('service_tickets.delete')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.assertScopedPlan(id, user);
    await this.db.update(maintenancePlans).set({ deletedAt: new Date() }).where(eq(maintenancePlans.id, id));
    return { ok: true };
  }
}
