import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { receivables, payments } from '../../db/schema/finance';
import { companies } from '../../db/schema/companies';
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
import { NotFoundError, ValidationError } from '../../shared/utils/errors';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class FinanceController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  /**
   * İstemciden gelen companyId'nin gerçekten aktör tenant'ına ait olduğunu
   * doğrular. Çapraz-tenant FK referansını (IDOR) engeller.
   */
  private async assertCompanyInTenant(companyId: string, tenantId: string): Promise<void> {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma bulunamadı');
  }

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
    await this.assertCompanyInTenant(body.companyId, user.tenantId);
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
    const rows = await this.db
      .select({
        p: payments,
        status: { id: paymentStatuses.id, code: paymentStatuses.code, name: paymentStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(payments)
      .leftJoin(paymentStatuses, eq(payments.statusId, paymentStatuses.id))
      .leftJoin(currencies, eq(payments.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(payments.paymentDate))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((x) => ({ ...x.p, status: x.status, currency: x.currency })), count, p);
  }

  @RequirePermissions('payments.create')
  @Post('payments')
  async createPayment(@Body(new ZodValidationPipe(paymentCreateSchema)) body: PaymentCreateInput, @CurrentUser() user: AuthContext) {
    const currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    const paid = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, 'paid') });
    // Giriş ödemesi alacağa bağlanabilir; çıkış ödemesinin alacağı olmaz.
    const receivable = body.receivableId
      ? await this.db.query.receivables.findFirst({ where: and(eq(receivables.id, body.receivableId), eq(receivables.tenantId, user.tenantId)) })
      : null;
    if (body.receivableId && !receivable) throw new NotFoundError('Receivable not found');
    const companyId = receivable?.companyId ?? body.companyId;
    if (!companyId) throw new NotFoundError('Company not found for payment');
    // Alacaktan gelen companyId zaten tenant-kapsamlı; doğrudan body.companyId
    // verilmişse tenant'a ait olduğunu doğrula (çapraz-tenant referansı engelle).
    if (!receivable) await this.assertCompanyInTenant(companyId, user.tenantId);
    const [row] = await this.db
      .insert(payments)
      .values({
        tenantId: user.tenantId,
        direction: body.direction,
        receivableId: body.receivableId ?? null,
        companyId,
        amount: body.amount.toString(),
        currencyId,
        paymentDate: body.paymentDate,
        paymentMethod: body.paymentMethod,
        statusId: paid?.id ?? null,
        notes: body.notes ?? null,
        createdBy: user.userId,
      })
      .returning();
    // Tahsilat tutarı alacağı karşılıyorsa alacağı 'ödendi' işaretle.
    if (receivable && Number(receivable.amount) <= body.amount) {
      await this.db.update(receivables).set({ statusId: paid?.id ?? null }).where(eq(receivables.id, receivable.id));
    }
    return row;
  }

  /** Geçerli ödeme durum kodları (paymentStatuses lookup ile eşleşir). */
  private async resolveStatusId(code?: string): Promise<string> {
    const allowed = ['pending', 'paid', 'overdue', 'cancelled'];
    if (!code || !allowed.includes(code)) throw new ValidationError('Geçersiz ödeme durumu');
    const st = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, code) });
    if (!st) throw new NotFoundError('Ödeme durumu bulunamadı');
    return st.id;
  }

  @RequirePermissions('payments.create')
  @Patch('payments/:id/status')
  async updatePaymentStatus(@Param('id') id: string, @Body() body: { status?: string }, @CurrentUser() user: AuthContext) {
    const statusId = await this.resolveStatusId(body?.status);
    const [row] = await this.db
      .update(payments)
      .set({ statusId })
      .where(and(eq(payments.id, id), eq(payments.tenantId, user.tenantId), isNull(payments.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError('Ödeme kaydı bulunamadı');
    return row;
  }

  @RequirePermissions('receivables.create')
  @Patch('receivables/:id/status')
  async updateReceivableStatus(@Param('id') id: string, @Body() body: { status?: string }, @CurrentUser() user: AuthContext) {
    const statusId = await this.resolveStatusId(body?.status);
    const [row] = await this.db
      .update(receivables)
      .set({ statusId })
      .where(and(eq(receivables.id, id), eq(receivables.tenantId, user.tenantId), isNull(receivables.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError('Alacak kaydı bulunamadı');
    return row;
  }
}
