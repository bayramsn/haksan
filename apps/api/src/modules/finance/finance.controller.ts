import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { receivables, payments } from '../../db/schema/finance';
import { companies } from '../../db/schema/companies';
import { paymentStatuses, currencies } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import {
  receivableCreateSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  paginationSchema,
  financeListQuerySchema,
  statementQuerySchema,
  accountingInvoiceCreateSchema,
  accountingInvoiceUpdateSchema,
  accountingInvoiceListQuerySchema,
  dueDatesQuerySchema,
  financeStatusUpdateSchema,
  paymentTermSuggestionQuerySchema,
  type ReceivableCreateInput,
  type PaymentCreateInput,
  type PaymentUpdateInput,
  type Pagination,
  type FinanceListQuery,
  type StatementQuery,
  type AccountingInvoiceCreateInput,
  type AccountingInvoiceUpdateInput,
  type AccountingInvoiceListQuery,
  type DueDatesQuery,
  type FinanceStatusUpdate,
  type PaymentTermSuggestionQuery,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { NotFoundError } from '../../shared/utils/errors';
import { companyVisibilityExistsFilter } from '../../shared/utils/company-visibility';
import { resourceDivisionFilter } from '../../shared/utils/division-scope';
import { FinanceService } from './finance.service';
import { z } from 'zod';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class FinanceController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly finance: FinanceService
  ) {}

  @RequirePermissions('receivables.read')
  @Get('companies/:companyId/finance-summary')
  companyFinanceSummary(@Param('companyId') companyId: string, @CurrentUser() user: AuthContext) {
    return this.finance.getCompanyFinanceSummary(companyId, user);
  }

  @RequirePermissions('receivables.read')
  @Get('companies/:companyId/statement')
  companyStatement(
    @Param('companyId') companyId: string,
    @Query(new ZodValidationPipe(statementQuerySchema)) range: StatementQuery,
    @CurrentUser() user: AuthContext
  ) {
    return this.finance.getCompanyStatement(companyId, user, range);
  }

  @RequirePermissions('receivables.read')
  @Get('receivables')
  async listReceivables(
    @Query(new ZodValidationPipe(paginationSchema.merge(financeListQuerySchema))) qp: Pagination & FinanceListQuery,
    @CurrentUser() user: AuthContext
  ) {
    const { limit, offset } = pageOffset(qp);
    const companyVisibility = await companyVisibilityExistsFilter(this.db, user, receivables.companyId);
    const filters = [
      eq(receivables.tenantId, user.tenantId),
      isNull(receivables.deletedAt),
      resourceDivisionFilter(user, 'receivables', receivables.divisionId) ?? sql`true`,
      companyVisibility ?? sql`true`,
    ];
    if (qp.companyId) filters.push(eq(receivables.companyId, qp.companyId));
    const where = and(...filters);
    const companyJoin = and(
      eq(receivables.companyId, companies.id),
      eq(companies.tenantId, user.tenantId),
      isNull(companies.deletedAt),
    );
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(receivables)
      .innerJoin(companies, companyJoin)
      .where(where);
    const rows = await this.db
      .select({
        r: receivables,
        company: {
          id: companies.id,
          externalCompanyNo: companies.externalCompanyNo,
          legalTitle: companies.legalTitle,
          shortName: companies.shortName,
        },
        status: { id: paymentStatuses.id, code: paymentStatuses.code, name: paymentStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(receivables)
      .innerJoin(companies, companyJoin)
      .leftJoin(paymentStatuses, eq(receivables.statusId, paymentStatuses.id))
      .leftJoin(currencies, eq(receivables.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(receivables.dueDate), desc(receivables.id))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((x) => ({ ...x.r, company: x.company, status: x.status, currency: x.currency })),
      count,
      qp,
    );
  }

  @RequirePermissions('receivables.create')
  @Post('receivables')
  createReceivable(@Body(new ZodValidationPipe(receivableCreateSchema)) body: ReceivableCreateInput, @CurrentUser() user: AuthContext) {
    return this.finance.createReceivable(body, user);
  }

  @RequirePermissions('payments.read')
  @Get('payments')
  async listPayments(
    @Query(new ZodValidationPipe(paginationSchema.merge(financeListQuerySchema))) qp: Pagination & FinanceListQuery,
    @CurrentUser() user: AuthContext
  ) {
    const { limit, offset } = pageOffset(qp);
    const companyVisibility = await companyVisibilityExistsFilter(this.db, user, payments.companyId);
    const filters = [
      eq(payments.tenantId, user.tenantId),
      isNull(payments.deletedAt),
      resourceDivisionFilter(user, 'payments', payments.divisionId) ?? sql`true`,
      companyVisibility ?? sql`true`,
    ];
    if (qp.companyId) filters.push(eq(payments.companyId, qp.companyId));
    const where = and(...filters);
    const companyJoin = and(
      eq(payments.companyId, companies.id),
      eq(companies.tenantId, user.tenantId),
      isNull(companies.deletedAt),
    );
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .innerJoin(companies, companyJoin)
      .where(where);
    const rows = await this.db
      .select({
        p: payments,
        company: {
          id: companies.id,
          externalCompanyNo: companies.externalCompanyNo,
          legalTitle: companies.legalTitle,
          shortName: companies.shortName,
        },
        status: { id: paymentStatuses.id, code: paymentStatuses.code, name: paymentStatuses.name },
        currency: { id: currencies.id, code: currencies.code },
      })
      .from(payments)
      .innerJoin(companies, companyJoin)
      .leftJoin(paymentStatuses, eq(payments.statusId, paymentStatuses.id))
      .leftJoin(currencies, eq(payments.currencyId, currencies.id))
      .where(where)
      .orderBy(desc(payments.paymentDate), desc(payments.id))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((x) => ({ ...x.p, company: x.company, status: x.status, currency: x.currency })),
      count,
      qp,
    );
  }

  @RequirePermissions('payments.create')
  @Post('payments')
  createPayment(@Body(new ZodValidationPipe(paymentCreateSchema)) body: PaymentCreateInput, @CurrentUser() user: AuthContext) {
    return this.finance.createPayment(body, user);
  }

  @RequirePermissions('payments.update')
  @Patch('payments/:id')
  updatePayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(paymentUpdateSchema)) body: PaymentUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.finance.updatePayment(id, body, user);
  }

  @RequirePermissions('payments.delete')
  @Delete('payments/:id')
  deletePayment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.finance.deletePayment(id, user);
  }

  @RequirePermissions('payments.update')
  @Patch('payments/:id/status')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(financeStatusUpdateSchema)) body: FinanceStatusUpdate,
    @CurrentUser() user: AuthContext
  ) {
    const statusId = await this.finance.resolveStatusId(body?.status);
    const [row] = await this.db
      .update(payments)
      .set({ statusId })
      .where(and(eq(payments.id, id), eq(payments.tenantId, user.tenantId), isNull(payments.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError('Ödeme kaydı bulunamadı');
    return row;
  }

  @RequirePermissions('receivables.update')
  @Patch('receivables/:id/status')
  async updateReceivableStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(financeStatusUpdateSchema)) body: FinanceStatusUpdate,
    @CurrentUser() user: AuthContext
  ) {
    const statusId = await this.finance.resolveStatusId(body?.status);
    const [row] = await this.db
      .update(receivables)
      .set({ statusId })
      .where(and(eq(receivables.id, id), eq(receivables.tenantId, user.tenantId), isNull(receivables.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError('Alacak kaydı bulunamadı');
    return row;
  }

  @RequirePermissions('accounting_invoices.read')
  @Get('accounting-invoices')
  listAccountingInvoices(
    @Query(new ZodValidationPipe(accountingInvoiceListQuerySchema)) query: AccountingInvoiceListQuery,
    @CurrentUser() user: AuthContext
  ) {
    return this.finance.listAccountingInvoices(user, query);
  }

  @RequirePermissions('accounting_invoices.read')
  @Get('accounting-invoices/payment-term-suggestion')
  async paymentTermSuggestion(
    @Query(new ZodValidationPipe(paymentTermSuggestionQuerySchema)) query: PaymentTermSuggestionQuery,
    @CurrentUser() user: AuthContext
  ) {
    const term = await this.finance.resolveContractPaymentTerm(query.companyId, user, query.quoteId ?? null);
    return {
      paymentTermDays: term?.paymentTermDays ?? null,
      contractNo: term?.contractNo ?? null,
      source: term ? ('contract' as const) : ('none' as const),
    };
  }

  @RequirePermissions('accounting_invoices.read')
  @Get('accounting-invoices/:id')
  getAccountingInvoice(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.finance.getAccountingInvoice(id, user);
  }

  @RequirePermissions('accounting_invoices.create')
  @Post('accounting-invoices')
  createAccountingInvoice(
    @Body(new ZodValidationPipe(accountingInvoiceCreateSchema)) body: AccountingInvoiceCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.finance.createAccountingInvoice(body, user);
  }

  @RequirePermissions('accounting_invoices.update')
  @Patch('accounting-invoices/:id')
  updateAccountingInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountingInvoiceUpdateSchema)) body: AccountingInvoiceUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.finance.updateAccountingInvoice(id, body, user);
  }

  @RequirePermissions('accounting_invoices.update')
  @Patch('accounting-invoices/:id/cancel')
  cancelAccountingInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().max(500).optional() }))) _body: { reason?: string },
    @CurrentUser() user: AuthContext
  ) {
    return this.finance.cancelAccountingInvoice(id, user);
  }

  @RequirePermissions('accounting_invoices.delete')
  @Delete('accounting-invoices/:id')
  deleteAccountingInvoice(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.finance.deleteAccountingInvoice(id, user);
  }

  @RequirePermissions('receivables.read')
  @Get('reports/customer-balances')
  customerBalances(@CurrentUser() user: AuthContext) {
    return this.finance.getCustomerBalances(user);
  }

  @RequirePermissions('receivables.read')
  @Get('reports/due-dates')
  dueDates(@Query(new ZodValidationPipe(dueDatesQuerySchema)) range: DueDatesQuery, @CurrentUser() user: AuthContext) {
    return this.finance.getDueDates(user, range);
  }
}
