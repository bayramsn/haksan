import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { receivables, payments } from '../../db/schema/finance';
import { paymentStatuses, currencies } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { receivableCreateSchema, paymentCreateSchema, paginationSchema, type ReceivableCreateInput, type PaymentCreateInput, type Pagination } from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class FinanceController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  // ────── RECEIVABLES ──────
  @RequirePermissions('receivables.read')
  @Get('receivables')
  async listReceivables(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(eq(receivables.tenantId, user.tenantId), isNull(receivables.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(receivables).where(where);
    const rows = await this.db
      .select({
        r: receivables,
        status: { id: paymentStatuses.id, code: paymentStatuses.code, name: paymentStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(receivables)
      .leftJoin(paymentStatuses, eq(receivables.statusId, paymentStatuses.id))
      .leftJoin(currencies, eq(receivables.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(receivables.dueDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((x) => ({ ...x.r, status: x.status, currency: x.currency })), count, p);
  }

  @RequirePermissions('receivables.create')
  @Post('receivables')
  async createReceivable(@Body(new ZodValidationPipe(receivableCreateSchema)) body: ReceivableCreateInput, @CurrentUser() user: AuthContext) {
    const currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    const pending = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, 'pending') });
    const [row] = await this.db
      .insert(receivables)
      .values({
        tenantId: user.tenantId,
        companyId: body.companyId,
        quoteId: body.quoteId ?? null,
        amount: body.amount.toString(),
        currencyId,
        dueDate: body.dueDate,
        statusId: pending?.id ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return row;
  }

  // ────── PAYMENTS ──────
  @RequirePermissions('payments.read')
  @Get('payments')
  async listPayments(@Query(new ZodValidationPipe(paginationSchema)) p: Pagination, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(p);
    const where = and(eq(payments.tenantId, user.tenantId), isNull(payments.deletedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(where);
    const rows = await this.db.select().from(payments).where(where).orderBy(desc(payments.paymentDate)).limit(limit).offset(offset);
    return buildPaginated(rows, count, p);
  }

  @RequirePermissions('payments.create')
  @Post('payments')
  async createPayment(@Body(new ZodValidationPipe(paymentCreateSchema)) body: PaymentCreateInput, @CurrentUser() user: AuthContext) {
    const currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    const paid = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, 'paid') });
    const receivable = await this.db.query.receivables.findFirst({ where: and(eq(receivables.id, body.receivableId), eq(receivables.tenantId, user.tenantId)) });
    if (!receivable) throw new Error('Receivable not found');
    const [row] = await this.db
      .insert(payments)
      .values({
        tenantId: user.tenantId,
        receivableId: body.receivableId,
        companyId: receivable.companyId,
        amount: body.amount.toString(),
        currencyId,
        paymentDate: body.paymentDate,
        paymentMethod: body.paymentMethod,
        statusId: paid?.id ?? null,
        notes: body.notes ?? null,
        createdBy: user.userId,
      })
      .returning();
    // Mark receivable as paid if amount matches
    if (Number(receivable.amount) <= body.amount) {
      await this.db.update(receivables).set({ statusId: paid?.id ?? null }).where(eq(receivables.id, receivable.id));
    }
    return row;
  }
}
