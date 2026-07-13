import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, ilike, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  accountingInvoices,
  accountingInvoiceLines,
  invoiceInstallments,
  payables,
  payments,
  receivables,
} from '../../db/schema/finance';
import { installationJobs } from '../../db/schema/service';
import { contracts, quotes } from '../../db/schema/quotes';
import { companies } from '../../db/schema/companies';
import { currencies, invoiceStatuses, paymentStatuses } from '../../db/schema/lookup';
import { installationStatuses, warrantyStatuses } from '../../db/schema/lookup';
import { customerDevices } from '../../db/schema/inventory';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  AccountingInvoiceCreateInput,
  AccountingInvoiceListQuery,
  AccountingInvoiceUpdateInput,
  DateRange,
  PaymentCreateInput,
  PaymentUpdateInput,
  ReceivableCreateInput,
} from '@haksan/shared';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { InventoryService } from '../inventory/inventory.service';
import {
  resourceCompanyPortfolioFilter,
  resourceDivisionFilter,
  resolveAssignedResourceDivision,
} from '../../shared/utils/division-scope';

export type CurrencyBalance = {
  currencyCode: string;
  salesTotal: number;
  collections: number;
  purchases: number;
  payouts: number;
  borc: number;
  alacak: number;
  net: number;
  totalBalance: number;
};

export type FinanceSummary = {
  byCurrency: CurrencyBalance[];
  nearestDueDate: string | null;
  nearestDueAmount: number | null;
  nearestDueCurrency: string | null;
  nearestDueType: 'borc' | 'alacak' | null;
};

export type StatementLine = {
  id: string;
  date: string;
  type: 'sales' | 'purchase' | 'collection' | 'payment' | 'receivable' | 'payable';
  description: string;
  invoiceNo: string | null;
  debit: number;
  credit: number;
  balance: number;
  currencyCode: string;
};

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly inventory: InventoryService,
  ) {}

  isFinanceAdmin(actor: AuthContext): boolean {
    return actor.roles.includes('super_admin') || actor.roles.includes('admin');
  }

  async assertCompanyInTenant(companyId: string, tenantId: string): Promise<void> {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma bulunamadı');
  }

  async assertCompanyVisible(companyId: string, actor: AuthContext): Promise<void> {
    const company = await this.db.query.companies.findFirst({
      where: and(
        eq(companies.id, companyId),
        eq(companies.tenantId, actor.tenantId),
        isNull(companies.deletedAt),
        resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
      ),
    });
    if (!company) throw new NotFoundError('Firma bulunamadı');
  }

  private async statusIds() {
    const rows = await this.db.select({ id: paymentStatuses.id, code: paymentStatuses.code }).from(paymentStatuses);
    const map = new Map(rows.map((r) => [r.code, r.id]));
    return {
      cancelled: map.get('cancelled'),
      paid: map.get('paid'),
      partial: map.get('partial'),
      pending: map.get('pending'),
      overdue: map.get('overdue'),
    };
  }

  private async currencyCodeMap(tenantId: string) {
    const rows = await this.db.select({ id: currencies.id, code: currencies.code }).from(currencies);
    return new Map(rows.map((r) => [r.id, r.code ?? 'USD']));
  }

  private num(v: string | number | null | undefined): number {
    return Number(v ?? 0);
  }

  private roundMoney(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 10_000) / 10_000;
  }

  private normalizeAccountingInvoiceTotals(body: AccountingInvoiceCreateInput) {
    const amount = this.roundMoney(body.amount);
    const vatRate = this.roundMoney(body.vatRate ?? 20);
    const providedVat = this.roundMoney(body.vatAmount ?? 0);
    const computedVat = this.roundMoney(amount * (vatRate / 100));
    const vatAmount = providedVat > 0 || vatRate === 0 ? providedVat : computedVat;
    const expectedGrandTotal = this.roundMoney(amount + vatAmount);
    const providedGrandTotal = this.roundMoney(body.grandTotal);
    const grandTotal =
      vatAmount > 0 && Math.abs(providedGrandTotal - amount) <= 0.0001
        ? expectedGrandTotal
        : providedGrandTotal || expectedGrandTotal;

    return { amount, vatRate, vatAmount, grandTotal: this.roundMoney(grandTotal) };
  }

  async getCompanyFinanceSummary(companyId: string, actor: AuthContext): Promise<FinanceSummary> {
    await this.assertCompanyVisible(companyId, actor);
    const st = await this.statusIds();
    const curMap = await this.currencyCodeMap(actor.tenantId);
    const showAlacak = this.isFinanceAdmin(actor);

    const cancelledFilter = st.cancelled ? ne(receivables.statusId, st.cancelled) : sql`true`;
    const recDivision = resourceDivisionFilter(actor, 'receivables', receivables.divisionId) ?? sql`true`;
    const paymentDivision = resourceDivisionFilter(actor, 'payments', payments.divisionId) ?? sql`true`;
    const payableDivision = resourceDivisionFilter(actor, 'payments', payables.divisionId) ?? sql`true`;
    const recRows = await this.db
      .select({ amount: receivables.amount, currencyId: receivables.currencyId, dueDate: receivables.dueDate, statusId: receivables.statusId })
      .from(receivables)
      .where(and(eq(receivables.tenantId, actor.tenantId), eq(receivables.companyId, companyId), isNull(receivables.deletedAt), cancelledFilter, recDivision));

    const payInRows = await this.db
      .select({ amount: payments.amount, currencyId: payments.currencyId })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, actor.tenantId),
          eq(payments.companyId, companyId),
          eq(payments.direction, 'in'),
          isNull(payments.deletedAt),
          paymentDivision,
          st.paid ? eq(payments.statusId, st.paid) : sql`true`
        )
      );

    const payOutRows = showAlacak
      ? await this.db
          .select({ amount: payments.amount, currencyId: payments.currencyId })
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, actor.tenantId),
              eq(payments.companyId, companyId),
              eq(payments.direction, 'out'),
              isNull(payments.deletedAt),
              paymentDivision,
              st.paid ? eq(payments.statusId, st.paid) : sql`true`
            )
          )
      : [];

    const payableRows = showAlacak
      ? await this.db
          .select({ amount: payables.amount, currencyId: payables.currencyId, dueDate: payables.dueDate, statusId: payables.statusId })
          .from(payables)
          .where(
            and(
              eq(payables.tenantId, actor.tenantId),
              eq(payables.companyId, companyId),
              isNull(payables.deletedAt),
              payableDivision,
              st.cancelled ? ne(payables.statusId, st.cancelled) : sql`true`
            )
          )
      : [];

    const bucket = new Map<string, { sales: number; collections: number; purchases: number; payouts: number }>();
    const touch = (code: string) => {
      if (!bucket.has(code)) bucket.set(code, { sales: 0, collections: 0, purchases: 0, payouts: 0 });
      return bucket.get(code)!;
    };

    for (const r of recRows) {
      const code = curMap.get(r.currencyId ?? '') ?? 'USD';
      touch(code).sales += this.num(r.amount);
    }
    for (const p of payInRows) {
      const code = curMap.get(p.currencyId ?? '') ?? 'USD';
      touch(code).collections += this.num(p.amount);
    }
    for (const py of payableRows) {
      const code = curMap.get(py.currencyId ?? '') ?? 'USD';
      touch(code).purchases += this.num(py.amount);
    }
    for (const p of payOutRows) {
      const code = curMap.get(p.currencyId ?? '') ?? 'USD';
      touch(code).payouts += this.num(p.amount);
    }

    const byCurrency: CurrencyBalance[] = [...bucket.entries()].map(([currencyCode, v]) => {
      const borc = Math.max(0, v.sales - v.collections);
      const alacak = showAlacak ? Math.max(0, v.purchases - v.payouts) : 0;
      const net = borc - alacak;
      return {
        currencyCode,
        salesTotal: v.sales,
        collections: v.collections,
        purchases: v.purchases,
        payouts: v.payouts,
        borc,
        alacak,
        net,
        totalBalance: net,
      };
    });

    const openStatuses = [st.pending, st.partial, st.overdue].filter(Boolean) as string[];
    const dueCandidates: { date: Date; amount: number; currency: string; type: 'borc' | 'alacak' }[] = [];

    for (const r of recRows) {
      if (r.statusId && openStatuses.length && !openStatuses.includes(r.statusId)) continue;
      dueCandidates.push({
        date: new Date(r.dueDate),
        amount: this.num(r.amount),
        currency: curMap.get(r.currencyId ?? '') ?? 'USD',
        type: 'borc',
      });
    }
    if (showAlacak) {
      for (const py of payableRows) {
        if (py.statusId && openStatuses.length && !openStatuses.includes(py.statusId)) continue;
        dueCandidates.push({
          date: new Date(py.dueDate),
          amount: this.num(py.amount),
          currency: curMap.get(py.currencyId ?? '') ?? 'USD',
          type: 'alacak',
        });
      }
    }

    const now = new Date();
    dueCandidates.sort((a, b) => a.date.getTime() - b.date.getTime());
    const nearest = dueCandidates.find((d) => d.date >= now) ?? dueCandidates[0] ?? null;

    return {
      byCurrency,
      nearestDueDate: nearest ? nearest.date.toISOString() : null,
      nearestDueAmount: nearest?.amount ?? null,
      nearestDueCurrency: nearest?.currency ?? null,
      nearestDueType: nearest?.type ?? null,
    };
  }

  async getCompanyStatement(companyId: string, actor: AuthContext, range: DateRange): Promise<StatementLine[]> {
    await this.assertCompanyVisible(companyId, actor);
    const showAlacak = this.isFinanceAdmin(actor);
    const curMap = await this.currencyCodeMap(actor.tenantId);
    const st = await this.statusIds();

    const recFilters = [
      eq(receivables.tenantId, actor.tenantId),
      eq(receivables.companyId, companyId),
      isNull(receivables.deletedAt),
      resourceDivisionFilter(actor, 'receivables', receivables.divisionId) ?? sql`true`,
      st.cancelled ? ne(receivables.statusId, st.cancelled) : sql`true`,
    ];
    if (range.from) recFilters.push(gte(receivables.dueDate, range.from));
    if (range.to) recFilters.push(lte(receivables.dueDate, range.to));

    const payFilters = [
      eq(payments.tenantId, actor.tenantId),
      eq(payments.companyId, companyId),
      isNull(payments.deletedAt),
      resourceDivisionFilter(actor, 'payments', payments.divisionId) ?? sql`true`,
    ];
    if (range.from) payFilters.push(gte(payments.paymentDate, range.from));
    if (range.to) payFilters.push(lte(payments.paymentDate, range.to));

    const recRows = await this.db.select().from(receivables).where(and(...recFilters));
    const payRows = await this.db.select().from(payments).where(and(...payFilters));

    const payableRows = showAlacak
      ? await this.db
          .select()
          .from(payables)
          .where(
            and(
              eq(payables.tenantId, actor.tenantId),
              eq(payables.companyId, companyId),
              isNull(payables.deletedAt),
              resourceDivisionFilter(actor, 'payments', payables.divisionId) ?? sql`true`,
              range.from ? gte(payables.dueDate, range.from) : sql`true`,
              range.to ? lte(payables.dueDate, range.to) : sql`true`
            )
          )
      : [];

    type RawLine = { date: Date; sortKey: string; line: Omit<StatementLine, 'balance'> };
    const raw: RawLine[] = [];

    for (const r of recRows) {
      const code = curMap.get(r.currencyId ?? '') ?? 'USD';
      const isSales = r.movementType === 'sales_invoice';
      raw.push({
        date: new Date(r.dueDate),
        sortKey: `r-${r.id}`,
        line: {
          id: r.id,
          date: new Date(r.dueDate).toISOString(),
          type: isSales ? 'sales' : 'receivable',
          description: r.notes ?? (isSales ? 'Satış faturası' : 'Alacak kaydı'),
          invoiceNo: r.invoiceNo,
          debit: this.num(r.amount),
          credit: 0,
          currencyCode: code,
        },
      });
    }

    for (const py of payableRows) {
      const code = curMap.get(py.currencyId ?? '') ?? 'USD';
      raw.push({
        date: new Date(py.dueDate),
        sortKey: `py-${py.id}`,
        line: {
          id: py.id,
          date: new Date(py.dueDate).toISOString(),
          type: py.movementType === 'purchase_invoice' ? 'purchase' : 'payable',
          description: py.notes ?? 'Alış faturası',
          invoiceNo: py.invoiceNo,
          debit: 0,
          credit: this.num(py.amount),
          currencyCode: code,
        },
      });
    }

    for (const p of payRows) {
      const code = curMap.get(p.currencyId ?? '') ?? 'USD';
      const isIn = p.direction === 'in';
      raw.push({
        date: new Date(p.paymentDate),
        sortKey: `p-${p.id}`,
        line: {
          id: p.id,
          date: new Date(p.paymentDate).toISOString(),
          type: isIn ? 'collection' : 'payment',
          description: p.notes ?? (isIn ? 'Tahsilat' : 'Ödeme'),
          invoiceNo: p.invoiceNo,
          debit: 0,
          credit: isIn ? this.num(p.amount) : 0,
          currencyCode: code,
        },
      });
      if (!isIn) {
        raw[raw.length - 1].line.debit = this.num(p.amount);
        raw[raw.length - 1].line.credit = 0;
      }
    }

    raw.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sortKey.localeCompare(b.sortKey));

    const balanceByCurrency = new Map<string, number>();
    return raw.map(({ line }) => {
      const prev = balanceByCurrency.get(line.currencyCode) ?? 0;
      const next = prev + line.debit - line.credit;
      balanceByCurrency.set(line.currencyCode, next);
      return { ...line, balance: next };
    });
  }

  async getCustomerBalances(actor: AuthContext) {
    const showAlacak = this.isFinanceAdmin(actor);
    const companyRows = await this.db
      .select({ id: companies.id, name: companies.legalTitle, shortName: companies.shortName })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
        ),
      );

    const summaries = await Promise.all(
      companyRows.map(async (c) => {
        const summary = await this.getCompanyFinanceSummary(c.id, actor);
        const primary = summary.byCurrency[0];
        return {
          companyId: c.id,
          companyName: c.shortName || c.name,
          currencies: summary.byCurrency,
          salesTotal: primary?.salesTotal ?? 0,
          collections: primary?.collections ?? 0,
          borc: primary?.borc ?? 0,
          purchases: showAlacak ? (primary?.purchases ?? 0) : null,
          payouts: showAlacak ? (primary?.payouts ?? 0) : null,
          alacak: showAlacak ? (primary?.alacak ?? 0) : null,
          netBorc: primary?.net ?? 0,
          totalBalance: primary?.totalBalance ?? primary?.net ?? 0,
          primaryCurrency: primary?.currencyCode ?? null,
          nearestDueDate: summary.nearestDueDate,
          nearestDueAmount: summary.nearestDueAmount,
          nearestDueCurrency: summary.nearestDueCurrency,
          nearestDueType: summary.nearestDueType,
        };
      })
    );

    return summaries;
  }

  async getDueDates(actor: AuthContext, range: DateRange) {
    const showAlacak = this.isFinanceAdmin(actor);
    const st = await this.statusIds();
    const openStatuses = [st.pending, st.partial, st.overdue].filter(Boolean) as string[];
    const curMap = await this.currencyCodeMap(actor.tenantId);

    const recFilters = [eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt)];
    const scopedReceivables = resourceDivisionFilter(actor, 'receivables', receivables.divisionId);
    if (scopedReceivables) recFilters.push(scopedReceivables);
    if (range.from) recFilters.push(gte(receivables.dueDate, range.from));
    if (range.to) recFilters.push(lte(receivables.dueDate, range.to));
    if (openStatuses.length) recFilters.push(inArray(receivables.statusId, openStatuses));

    const recRows = await this.db
      .select({
        id: receivables.id,
        companyId: receivables.companyId,
        amount: receivables.amount,
        dueDate: receivables.dueDate,
        currencyId: receivables.currencyId,
        invoiceNo: receivables.invoiceNo,
        companyName: companies.legalTitle,
        shortName: companies.shortName,
      })
      .from(receivables)
      .leftJoin(companies, eq(receivables.companyId, companies.id))
      .where(and(...recFilters));

    const payableRows = showAlacak
      ? await this.db
          .select({
            id: payables.id,
            companyId: payables.companyId,
            amount: payables.amount,
            dueDate: payables.dueDate,
            currencyId: payables.currencyId,
            invoiceNo: payables.invoiceNo,
            companyName: companies.legalTitle,
            shortName: companies.shortName,
          })
          .from(payables)
          .leftJoin(companies, eq(payables.companyId, companies.id))
          .where(
            and(
              eq(payables.tenantId, actor.tenantId),
              isNull(payables.deletedAt),
              resourceDivisionFilter(actor, 'payments', payables.divisionId) ?? sql`true`,
              range.from ? gte(payables.dueDate, range.from) : sql`true`,
              range.to ? lte(payables.dueDate, range.to) : sql`true`,
              openStatuses.length ? inArray(payables.statusId, openStatuses) : sql`true`
            )
          )
      : [];

    const items = [
      ...recRows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        companyName: r.shortName || r.companyName,
        dueDate: r.dueDate,
        amount: this.num(r.amount),
        currencyCode: curMap.get(r.currencyId ?? '') ?? 'USD',
        invoiceNo: r.invoiceNo,
        type: 'borc' as const,
      })),
      ...payableRows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        companyName: r.shortName || r.companyName,
        dueDate: r.dueDate,
        amount: this.num(r.amount),
        currencyCode: curMap.get(r.currencyId ?? '') ?? 'USD',
        invoiceNo: r.invoiceNo,
        type: 'alacak' as const,
      })),
    ];

    items.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return items;
  }

  buildInstallments(input: {
    grandTotal: number;
    installmentCount: number;
    firstDueDate: Date;
    lastDueDate?: Date;
    installments?: { installmentNo: number; dueDate: Date; amount: number }[];
  }) {
    if (input.installments?.length) return input.installments;
    const count = input.installmentCount;
    const total = input.grandTotal;
    const base = Math.floor((total / count) * 100) / 100;
    const items: { installmentNo: number; dueDate: Date; amount: number }[] = [];
    const first = input.firstDueDate;
    const last = input.lastDueDate;
    const msPerInstallment =
      last && count > 1 ? (last.getTime() - first.getTime()) / (count - 1) : 30 * 24 * 60 * 60 * 1000;

    let allocated = 0;
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? Math.round((total - allocated) * 100) / 100 : base;
      allocated += amount;
      items.push({
        installmentNo: i + 1,
        dueDate: new Date(first.getTime() + msPerInstallment * i),
        amount,
      });
    }
    return items;
  }

  async resolveContractPaymentTerm(companyId: string, actor: AuthContext, quoteId?: string | null) {
    const baseWhere = [
      eq(contracts.tenantId, actor.tenantId),
      isNull(contracts.deletedAt),
      sql`${contracts.paymentTermDays} IS NOT NULL`,
    ];
    if (quoteId) {
      const [byQuote] = await this.db
        .select({ paymentTermDays: contracts.paymentTermDays, contractNo: contracts.contractNo })
        .from(contracts)
        .where(and(...baseWhere, eq(contracts.quoteId, quoteId)))
        .orderBy(sql`${contracts.signedDate} DESC NULLS LAST`, desc(contracts.createdAt))
        .limit(1);
      if (byQuote) return byQuote;
    }
    const [byCompany] = await this.db
      .select({ paymentTermDays: contracts.paymentTermDays, contractNo: contracts.contractNo })
      .from(contracts)
      .innerJoin(quotes, eq(contracts.quoteId, quotes.id))
      .where(and(...baseWhere, eq(quotes.companyId, companyId)))
      .orderBy(sql`${contracts.signedDate} DESC NULLS LAST`, desc(contracts.createdAt))
      .limit(1);
    return byCompany ?? null;
  }

  async createAccountingInvoice(body: AccountingInvoiceCreateInput, actor: AuthContext) {
    await this.assertCompanyVisible(body.companyId, actor);
    const currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    const issued = await this.db.query.invoiceStatuses.findFirst({ where: eq(invoiceStatuses.code, 'issued') });
    const st = await this.statusIds();
    const divisionId = resolveAssignedResourceDivision(actor, 'accounting_invoices', body.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Fatura için bölüm ataması zorunludur', { field: 'divisionId' });
    const totals = this.normalizeAccountingInvoiceTotals(body);

    // Vadeli satış faturasında vade girilmemişse sözleşmedeki vadeyi uygula (kullanıcı girdisi her zaman kazanır)
    let paymentTermDays = body.paymentTermDays ?? null;
    let firstDueDate = body.firstDueDate ?? null;
    if (body.type === 'sales' && body.paymentType === 'term' && paymentTermDays == null && firstDueDate == null) {
      const term = await this.resolveContractPaymentTerm(body.companyId, actor, body.quoteId);
      if (term?.paymentTermDays != null) {
        paymentTermDays = term.paymentTermDays;
        firstDueDate = new Date(body.invoiceDate.getTime() + term.paymentTermDays * 24 * 60 * 60 * 1000);
      }
    }

    const installments = this.buildInstallments({
      grandTotal: totals.grandTotal,
      installmentCount: body.installmentCount,
      firstDueDate: firstDueDate ?? body.invoiceDate,
      lastDueDate: body.lastDueDate,
      installments: body.installments,
    });

    const firstDue = installments[0]?.dueDate ?? body.invoiceDate;
    const lastDue = installments[installments.length - 1]?.dueDate ?? body.invoiceDate;

    const [invoice] = await this.db
      .insert(accountingInvoices)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        companyId: body.companyId,
        type: body.type,
        invoiceCategory: body.invoiceCategory ?? 'commercial',
        invoiceNo: body.invoiceNo,
        invoiceDate: body.invoiceDate,
        amount: totals.amount.toString(),
        vatAmount: totals.vatAmount.toString(),
        grandTotal: totals.grandTotal.toString(),
        currencyId,
        paymentType: body.paymentType ?? 'cash',
        paymentTermDays,
        previousPaymentTermDays: body.previousPaymentTermDays ?? null,
        termChangeReason: body.termChangeReason ?? null,
        incoterm: body.incoterm ?? null,
        shipmentReference: body.shipmentReference ?? null,
        orderNo: body.orderNo ?? null,
        expectedDate: body.expectedDate ?? null,
        quoteId: body.quoteId ?? null,
        salesOrderId: body.salesOrderId ?? null,
        firstDueDate: firstDue,
        lastDueDate: lastDue,
        installmentCount: body.installmentCount,
        statusId: issued?.id ?? null,
        notes: body.notes ?? null,
        createdBy: actor.userId,
      })
      .returning();

    for (const inst of installments) {
      if (body.type === 'sales') {
        const [rec] = await this.db
          .insert(receivables)
          .values({
            tenantId: actor.tenantId,
            divisionId,
            companyId: body.companyId,
            accountingInvoiceId: invoice.id,
            invoiceNo: body.invoiceNo,
            movementType: 'sales_invoice',
            amount: inst.amount.toString(),
            currencyId,
            dueDate: inst.dueDate,
            statusId: st.pending ?? null,
            notes: `${body.invoiceNo} taksit ${inst.installmentNo}`,
          })
          .returning();
        await this.db.insert(invoiceInstallments).values({
          tenantId: actor.tenantId,
          accountingInvoiceId: invoice.id,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          amount: inst.amount.toString(),
          statusId: st.pending ?? null,
          receivableId: rec.id,
        });
      } else {
        const [payable] = await this.db
          .insert(payables)
          .values({
            tenantId: actor.tenantId,
            divisionId,
            companyId: body.companyId,
            accountingInvoiceId: invoice.id,
            invoiceNo: body.invoiceNo,
            movementType: 'purchase_invoice',
            amount: inst.amount.toString(),
            currencyId,
            dueDate: inst.dueDate,
            statusId: st.pending ?? null,
            notes: `${body.invoiceNo} taksit ${inst.installmentNo}`,
          })
          .returning();
        await this.db.insert(invoiceInstallments).values({
          tenantId: actor.tenantId,
          accountingInvoiceId: invoice.id,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          amount: inst.amount.toString(),
          statusId: st.pending ?? null,
          payableId: payable.id,
        });
      }
    }

    if (body.lineItems?.length) {
      for (const line of body.lineItems) {
        await this.db.insert(accountingInvoiceLines).values({
          tenantId: actor.tenantId,
          accountingInvoiceId: invoice.id,
          productModelId: line.productModelId ?? null,
          inventoryItemId: line.inventoryItemId ?? null,
          categoryCode: line.categoryCode ?? (line.saleType === 'tezgah' ? 'TEZGAH' : null),
          description: line.description ?? null,
          quantity: (line.quantity ?? 1).toString(),
          listPrice: line.listPrice?.toString() ?? null,
          unitPrice: line.unitPrice?.toString() ?? null,
          discountAmount: (line.discountAmount ?? 0).toString(),
          vatRate: (line.vatRate ?? 20).toString(),
          lineTotal: line.lineTotal?.toString() ?? null,
          expectedDate: line.expectedDate ?? null,
        });
      }
    }

    if (body.type === 'sales' && body.lineItems?.length) {
      await this.inventory.sellFromSalesInvoice(
        {
          invoiceId: invoice.id,
          divisionId,
          companyId: body.companyId,
          invoiceDate: body.invoiceDate,
          lines: body.lineItems,
        },
        actor,
      );
    }

    return invoice;
  }

  private async assertAccountingInvoiceHasNoActivePayments(id: string, actor: AuthContext) {
    const [invoiceReceivables, invoicePayables] = await Promise.all([
      this.db
        .select({ id: receivables.id })
        .from(receivables)
        .where(and(eq(receivables.accountingInvoiceId, id), eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt))),
      this.db
        .select({ id: payables.id })
        .from(payables)
        .where(and(eq(payables.accountingInvoiceId, id), eq(payables.tenantId, actor.tenantId), isNull(payables.deletedAt))),
    ]);
    const paymentRefs = [eq(payments.accountingInvoiceId, id)];
    if (invoiceReceivables.length) paymentRefs.push(inArray(payments.receivableId, invoiceReceivables.map((r) => r.id)));
    if (invoicePayables.length) paymentRefs.push(inArray(payments.payableId, invoicePayables.map((p) => p.id)));
    const cancelledPaymentId = (await this.statusIds()).cancelled;
    const [activePayment] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, actor.tenantId),
          isNull(payments.deletedAt),
          or(...paymentRefs)!,
          cancelledPaymentId ? or(isNull(payments.statusId), ne(payments.statusId, cancelledPaymentId))! : sql`true`
        )
      )
      .limit(1);
    if (activePayment) {
      throw new ValidationError('Ödemesi bulunan fatura düzenlenemez veya silinemez. Önce bağlı ödeme kayıtlarını iptal edin.');
    }
  }

  async updateAccountingInvoice(id: string, body: AccountingInvoiceUpdateInput, actor: AuthContext) {
    const invoice = await this.db.query.accountingInvoices.findFirst({
      where: and(
        eq(accountingInvoices.id, id),
        eq(accountingInvoices.tenantId, actor.tenantId),
        isNull(accountingInvoices.deletedAt),
        resourceDivisionFilter(actor, 'accounting_invoices', accountingInvoices.divisionId) ?? sql`true`,
      ),
    });
    if (!invoice) throw new NotFoundError('Fatura bulunamadı');
    if (body.lineItems?.length) {
      throw new ValidationError('Fatura stok satırları düzenleme sırasında değiştirilemez. Gerekirse faturayı silip yeniden oluşturun.');
    }
    if (body.type && body.type !== invoice.type) {
      throw new ValidationError('Fatura türü düzenlenemez. Gerekirse faturayı silip yeniden oluşturun.');
    }

    const [stockLine] = await this.db
      .select({ id: accountingInvoiceLines.id })
      .from(accountingInvoiceLines)
      .where(and(eq(accountingInvoiceLines.accountingInvoiceId, id), eq(accountingInvoiceLines.tenantId, actor.tenantId), isNull(accountingInvoiceLines.deletedAt)))
      .limit(1);
    if (stockLine && body.companyId && body.companyId !== invoice.companyId) {
      throw new ValidationError('Stok satırı bulunan faturada firma değiştirilemez. Gerekirse faturayı silip yeniden oluşturun.');
    }

    await this.assertAccountingInvoiceHasNoActivePayments(id, actor);

    const companyId = body.companyId ?? invoice.companyId;
    await this.assertCompanyVisible(companyId, actor);
    const currentCurrency = invoice.currencyId
      ? await this.db.query.currencies.findFirst({ where: eq(currencies.id, invoice.currencyId) })
      : null;
    const currencyCode = body.currencyCode ?? currentCurrency?.code ?? 'USD';
    const currencyId = await lookupIdByCode(this.db, currencies, currencyCode);
    const divisionId = body.divisionId ? resolveAssignedResourceDivision(actor, 'accounting_invoices', body.divisionId) : invoice.divisionId;
    if (!divisionId) throw new ValidationError('Fatura için bölüm ataması zorunludur', { field: 'divisionId' });

    const invoiceDate = body.invoiceDate ?? invoice.invoiceDate;
    const invoiceNo = body.invoiceNo ?? invoice.invoiceNo;
    const invoiceCategory = body.invoiceCategory ?? (invoice.invoiceCategory as 'commercial' | 'administrative' | null) ?? 'commercial';
    const amount = body.amount ?? this.num(invoice.amount);
    const vatAmount = body.vatAmount ?? this.num(invoice.vatAmount);
    const grandTotal = body.grandTotal ?? this.num(invoice.grandTotal);
    const vatRate = body.vatRate ?? (amount > 0 ? this.roundMoney((vatAmount / amount) * 100) : 0);
    const installmentCount = body.installmentCount ?? invoice.installmentCount ?? 1;
    const firstDueDate = body.firstDueDate ?? invoice.firstDueDate ?? invoiceDate;
    const lastDueDate = body.lastDueDate ?? invoice.lastDueDate ?? undefined;
    const totals = this.normalizeAccountingInvoiceTotals({
      companyId,
      divisionId,
      type: invoice.type as 'sales' | 'purchase',
      invoiceCategory,
      invoiceNo,
      invoiceDate,
      amount,
      vatRate,
      vatAmount,
      grandTotal,
      currencyCode,
      paymentType: body.paymentType ?? (invoice.paymentType as 'cash' | 'leasing' | 'term' | null) ?? 'cash',
      quoteId: body.quoteId ?? invoice.quoteId ?? undefined,
      salesOrderId: body.salesOrderId ?? invoice.salesOrderId ?? undefined,
      firstDueDate,
      lastDueDate,
      installmentCount,
      notes: body.notes ?? invoice.notes ?? undefined,
      installments: body.installments,
    });
    const installments = this.buildInstallments({
      grandTotal: totals.grandTotal,
      installmentCount,
      firstDueDate,
      lastDueDate,
      installments: body.installments,
    });
    const firstDue = installments[0]?.dueDate ?? invoiceDate;
    const lastDue = installments[installments.length - 1]?.dueDate ?? invoiceDate;
    const st = await this.statusIds();
    const now = new Date();

    await Promise.all([
      this.db
        .update(invoiceInstallments)
        .set({ deletedAt: now })
        .where(and(eq(invoiceInstallments.accountingInvoiceId, id), eq(invoiceInstallments.tenantId, actor.tenantId), isNull(invoiceInstallments.deletedAt))),
      this.db
        .update(receivables)
        .set({ deletedAt: now })
        .where(and(eq(receivables.accountingInvoiceId, id), eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt))),
      this.db
        .update(payables)
        .set({ deletedAt: now })
        .where(and(eq(payables.accountingInvoiceId, id), eq(payables.tenantId, actor.tenantId), isNull(payables.deletedAt))),
    ]);

    const [updated] = await this.db
      .update(accountingInvoices)
      .set({
        divisionId,
        companyId,
        invoiceCategory,
        invoiceNo,
        invoiceDate,
        amount: totals.amount.toString(),
        vatAmount: totals.vatAmount.toString(),
        grandTotal: totals.grandTotal.toString(),
        currencyId,
        paymentType: body.paymentType ?? invoice.paymentType,
        paymentTermDays: body.paymentTermDays !== undefined ? body.paymentTermDays ?? null : invoice.paymentTermDays,
        previousPaymentTermDays: body.previousPaymentTermDays !== undefined ? body.previousPaymentTermDays ?? null : invoice.previousPaymentTermDays,
        termChangeReason: body.termChangeReason !== undefined ? body.termChangeReason || null : invoice.termChangeReason,
        incoterm: body.incoterm !== undefined ? body.incoterm || null : invoice.incoterm,
        shipmentReference: body.shipmentReference !== undefined ? body.shipmentReference || null : invoice.shipmentReference,
        orderNo: body.orderNo !== undefined ? body.orderNo || null : invoice.orderNo,
        expectedDate: body.expectedDate !== undefined ? body.expectedDate ?? null : invoice.expectedDate,
        quoteId: body.quoteId !== undefined ? body.quoteId ?? null : invoice.quoteId,
        salesOrderId: body.salesOrderId !== undefined ? body.salesOrderId ?? null : invoice.salesOrderId,
        firstDueDate: firstDue,
        lastDueDate: lastDue,
        installmentCount,
        notes: body.notes !== undefined ? body.notes || null : invoice.notes,
      })
      .where(and(eq(accountingInvoices.id, id), eq(accountingInvoices.tenantId, actor.tenantId), isNull(accountingInvoices.deletedAt)))
      .returning();
    if (!updated) throw new NotFoundError('Fatura bulunamadı');

    for (const inst of installments) {
      if (invoice.type === 'sales') {
        const [rec] = await this.db
          .insert(receivables)
          .values({
            tenantId: actor.tenantId,
            divisionId,
            companyId,
            accountingInvoiceId: id,
            invoiceNo,
            movementType: 'sales_invoice',
            amount: inst.amount.toString(),
            currencyId,
            dueDate: inst.dueDate,
            statusId: st.pending ?? null,
            notes: `${invoiceNo} taksit ${inst.installmentNo}`,
          })
          .returning();
        await this.db.insert(invoiceInstallments).values({
          tenantId: actor.tenantId,
          accountingInvoiceId: id,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          amount: inst.amount.toString(),
          statusId: st.pending ?? null,
          receivableId: rec.id,
        });
      } else {
        const [payable] = await this.db
          .insert(payables)
          .values({
            tenantId: actor.tenantId,
            divisionId,
            companyId,
            accountingInvoiceId: id,
            invoiceNo,
            movementType: 'purchase_invoice',
            amount: inst.amount.toString(),
            currencyId,
            dueDate: inst.dueDate,
            statusId: st.pending ?? null,
            notes: `${invoiceNo} taksit ${inst.installmentNo}`,
          })
          .returning();
        await this.db.insert(invoiceInstallments).values({
          tenantId: actor.tenantId,
          accountingInvoiceId: id,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          amount: inst.amount.toString(),
          statusId: st.pending ?? null,
          payableId: payable.id,
        });
      }
    }

    return this.getAccountingInvoice(id, actor);
  }

  /** Satış faturası iptali (minimal) — stok teslim edilmediyse geri al. */
  async cancelAccountingInvoice(id: string, actor: AuthContext) {
    const invoice = await this.db.query.accountingInvoices.findFirst({
      where: and(
        eq(accountingInvoices.id, id),
        eq(accountingInvoices.tenantId, actor.tenantId),
        isNull(accountingInvoices.deletedAt),
        resourceDivisionFilter(actor, 'accounting_invoices', accountingInvoices.divisionId) ?? sql`true`,
      ),
    });
    if (!invoice) throw new NotFoundError('Fatura bulunamadı');

    const cancelled = await this.db.query.invoiceStatuses.findFirst({ where: eq(invoiceStatuses.code, 'cancelled') });
    if (!cancelled) throw new NotFoundError('Fatura durumu bulunamadı (cancelled)');

    if (invoice.statusId === cancelled.id) return { ok: true };

    await this.db.update(accountingInvoices).set({ statusId: cancelled.id }).where(eq(accountingInvoices.id, id));
    if (invoice.type === 'sales') {
      await this.inventory.reverseSalesInvoice(id, actor);
      await this.cancelTezgahSaleDownstreamSideEffects({
        invoiceId: invoice.id,
        invoiceDate: invoice.invoiceDate,
        tenantId: actor.tenantId,
      });
    }
    return { ok: true };
  }

  async deleteAccountingInvoice(id: string, actor: AuthContext) {
    const invoice = await this.db.query.accountingInvoices.findFirst({
      where: and(
        eq(accountingInvoices.id, id),
        eq(accountingInvoices.tenantId, actor.tenantId),
        isNull(accountingInvoices.deletedAt),
        resourceDivisionFilter(actor, 'accounting_invoices', accountingInvoices.divisionId) ?? sql`true`,
      ),
    });
    if (!invoice) throw new NotFoundError('Fatura bulunamadı');

    const [invoiceReceivables, invoicePayables] = await Promise.all([
      this.db
        .select({ id: receivables.id })
        .from(receivables)
        .where(and(eq(receivables.accountingInvoiceId, id), eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt))),
      this.db
        .select({ id: payables.id })
        .from(payables)
        .where(and(eq(payables.accountingInvoiceId, id), eq(payables.tenantId, actor.tenantId), isNull(payables.deletedAt))),
    ]);
    const paymentRefs = [eq(payments.accountingInvoiceId, id)];
    if (invoiceReceivables.length) paymentRefs.push(inArray(payments.receivableId, invoiceReceivables.map((r) => r.id)));
    if (invoicePayables.length) paymentRefs.push(inArray(payments.payableId, invoicePayables.map((p) => p.id)));
    const cancelledPaymentId = (await this.statusIds()).cancelled;
    const [activePayment] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, actor.tenantId),
          isNull(payments.deletedAt),
          or(...paymentRefs)!,
          cancelledPaymentId ? or(isNull(payments.statusId), ne(payments.statusId, cancelledPaymentId))! : sql`true`
        )
      )
      .limit(1);
    if (activePayment) {
      throw new ValidationError('Ödemesi bulunan fatura silinemez. Önce bağlı ödeme kayıtlarını iptal edin.');
    }

    await this.cancelAccountingInvoice(id, actor);

    const now = new Date();
    await Promise.all([
      this.db
        .update(invoiceInstallments)
        .set({ deletedAt: now })
        .where(and(eq(invoiceInstallments.accountingInvoiceId, id), eq(invoiceInstallments.tenantId, actor.tenantId), isNull(invoiceInstallments.deletedAt))),
      this.db
        .update(accountingInvoiceLines)
        .set({ deletedAt: now })
        .where(and(eq(accountingInvoiceLines.accountingInvoiceId, id), eq(accountingInvoiceLines.tenantId, actor.tenantId), isNull(accountingInvoiceLines.deletedAt))),
      this.db
        .update(receivables)
        .set({ deletedAt: now })
        .where(and(eq(receivables.accountingInvoiceId, id), eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt))),
      this.db
        .update(payables)
        .set({ deletedAt: now })
        .where(and(eq(payables.accountingInvoiceId, id), eq(payables.tenantId, actor.tenantId), isNull(payables.deletedAt))),
      this.db
        .update(accountingInvoices)
        .set({ deletedAt: now })
        .where(and(eq(accountingInvoices.id, id), eq(accountingInvoices.tenantId, actor.tenantId), isNull(accountingInvoices.deletedAt))),
    ]);

    return { ok: true };
  }

  /**
   * Sales invoice "tezgah" lines may have created:
   * - `customer_devices` (by inventoryItemId)
   * - `installation_jobs` (notes include invoiceId prefix)
   *
   * Rollback rules:
   * - If `customer_devices.installationDate` is null -> revert: soft-delete device + reset warranty fields.
   * - Otherwise -> mark cancelled/void without clearing installationDate (safe rollback).
   *
   * Idempotent: updates are conditional and soft-deletes won’t re-run for already deleted rows.
   */
  private async cancelTezgahSaleDownstreamSideEffects(
    params: { invoiceId: string; invoiceDate: Date; tenantId: string },
  ): Promise<void> {
    const installationCancelledId = await lookupIdByCode(this.db, installationStatuses, 'cancelled');
    const warrantyVoidId = await lookupIdByCode(this.db, warrantyStatuses, 'void');
    if (!installationCancelledId || !warrantyVoidId) return;

    const tezgahLines = await this.db
      .select({ inventoryItemId: accountingInvoiceLines.inventoryItemId })
      .from(accountingInvoiceLines)
      .where(
        and(
          eq(accountingInvoiceLines.tenantId, params.tenantId),
          eq(accountingInvoiceLines.accountingInvoiceId, params.invoiceId),
          eq(accountingInvoiceLines.categoryCode, 'TEZGAH'),
          isNull(accountingInvoiceLines.deletedAt),
        ),
      );

    const inventoryItemIds = Array.from(new Set(tezgahLines.map((l) => l.inventoryItemId).filter((x): x is string => !!x)));
    if (!inventoryItemIds.length) return;

    const devices = await this.db.query.customerDevices.findMany({
      where: and(eq(customerDevices.tenantId, params.tenantId), inArray(customerDevices.inventoryItemId, inventoryItemIds), isNull(customerDevices.deletedAt)),
    });

    const deviceById = new Map(devices.map((d) => [d.id, d]));

    // Installation job notes created by inventory.sellFromSalesInvoice:
    // `Satış faturası kurulumu (${params.invoiceId.slice(0, 8)})`
    const invoicePrefix = params.invoiceId.slice(0, 8);
    const jobNotePattern = `%Satış faturası kurulumu (${invoicePrefix})%`;

    const customerDeviceIds = devices.map((d) => d.id);
    const jobs = await this.db.query.installationJobs.findMany({
      where: and(
        eq(installationJobs.tenantId, params.tenantId),
        isNull(installationJobs.deletedAt),
        customerDeviceIds.length ? inArray(installationJobs.customerDeviceId, customerDeviceIds) : sql`true`,
        ilike(installationJobs.notes, jobNotePattern),
      ),
    });

    const impactedDeviceIds = new Set(jobs.map((j) => j.customerDeviceId).filter((x): x is string => !!x));

    const now = new Date();

    // 1) Cancel installation jobs.
    for (const job of jobs) {
      const device = job.customerDeviceId ? deviceById.get(job.customerDeviceId) : undefined;
      const shouldRevert = device != null && device.installationDate == null;
      await this.db
        .update(installationJobs)
        .set({
          statusId: installationCancelledId,
          // If installationDate is null, treat as not started and clear completion fields.
          ...(shouldRevert ? { startedAt: null, completedAt: null } : {}),
        })
        .where(and(eq(installationJobs.id, job.id), eq(installationJobs.tenantId, params.tenantId)));
    }

    // 2) Roll back (or void) customer devices.
    for (const device of devices) {
      const shouldRevert = device.installationDate == null && (impactedDeviceIds.has(device.id) || (device.saleDate ? device.saleDate.getTime() === params.invoiceDate.getTime() : false));

      if (shouldRevert) {
        await this.db
          .update(customerDevices)
          .set({
            deletedAt: now,
            statusId: warrantyVoidId,
            installationDate: null,
            warrantyStartDate: null,
            warrantyEndDate: null,
          })
          .where(and(eq(customerDevices.id, device.id), eq(customerDevices.tenantId, params.tenantId)));
      } else if (device.installationDate != null) {
        await this.db.update(customerDevices).set({ statusId: warrantyVoidId }).where(and(eq(customerDevices.id, device.id), eq(customerDevices.tenantId, params.tenantId)));
      }
    }
  }

  async listAccountingInvoices(actor: AuthContext, query: AccountingInvoiceListQuery) {
    const filters = [eq(accountingInvoices.tenantId, actor.tenantId), isNull(accountingInvoices.deletedAt)];
    if (query.companyId) filters.push(eq(accountingInvoices.companyId, query.companyId));
    if (query.type) filters.push(eq(accountingInvoices.type, query.type));
    if (query.invoiceCategory) filters.push(eq(accountingInvoices.invoiceCategory, query.invoiceCategory));
    const scoped = resourceDivisionFilter(actor, 'accounting_invoices', accountingInvoices.divisionId);
    if (scoped) filters.push(scoped);

    const offset = (query.page - 1) * query.pageSize;
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(accountingInvoices)
      .where(and(...filters));

    const rows = await this.db
      .select({
        inv: accountingInvoices,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        currency: { code: currencies.code },
      })
      .from(accountingInvoices)
      .leftJoin(companies, eq(accountingInvoices.companyId, companies.id))
      .leftJoin(currencies, eq(accountingInvoices.currencyId, currencies.id))
      .where(and(...filters))
      .orderBy(desc(accountingInvoices.invoiceDate))
      .limit(query.pageSize)
      .offset(offset);

    return {
      data: rows.map((r) => ({ ...r.inv, company: r.company, currency: r.currency })),
      total: count,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getAccountingInvoice(id: string, actor: AuthContext) {
    const filters = [
      eq(accountingInvoices.id, id),
      eq(accountingInvoices.tenantId, actor.tenantId),
      isNull(accountingInvoices.deletedAt),
      resourceDivisionFilter(actor, 'accounting_invoices', accountingInvoices.divisionId) ?? sql`true`,
    ];
    const [row] = await this.db
      .select({
        inv: accountingInvoices,
        company: {
          id: companies.id,
          legalTitle: companies.legalTitle,
          shortName: companies.shortName,
          taxOffice: companies.taxOffice,
          taxNumber: companies.taxNumber,
        },
        currency: { code: currencies.code },
      })
      .from(accountingInvoices)
      .leftJoin(companies, eq(accountingInvoices.companyId, companies.id))
      .leftJoin(currencies, eq(accountingInvoices.currencyId, currencies.id))
      .where(and(...filters))
      .limit(1);
    if (!row) throw new NotFoundError('Fatura bulunamadı');
    const installments = await this.db
      .select()
      .from(invoiceInstallments)
      .where(and(eq(invoiceInstallments.accountingInvoiceId, id), isNull(invoiceInstallments.deletedAt)))
      .orderBy(asc(invoiceInstallments.installmentNo));
    const lineItems = await this.db
      .select()
      .from(accountingInvoiceLines)
      .where(and(eq(accountingInvoiceLines.accountingInvoiceId, id), isNull(accountingInvoiceLines.deletedAt)))
      .orderBy(asc(accountingInvoiceLines.createdAt));
    return { ...row.inv, company: row.company, currency: row.currency, installments, lineItems };
  }

  async createReceivable(body: ReceivableCreateInput, actor: AuthContext) {
    const currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    await this.assertCompanyVisible(body.companyId, actor);
    const pending = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, 'pending') });
    const divisionId = resolveAssignedResourceDivision(actor, 'receivables', body.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Alacak için bölüm ataması zorunludur', { field: 'divisionId' });
    const [row] = await this.db
      .insert(receivables)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        companyId: body.companyId,
        quoteId: body.quoteId ?? null,
        amount: body.amount.toString(),
        currencyId,
        dueDate: body.dueDate,
        statusId: pending?.id ?? null,
        invoiceNo: body.invoiceNo ?? null,
        movementType: body.movementType ?? 'manual',
        documentRef: body.documentRef ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return row;
  }

  async createPayment(body: PaymentCreateInput, actor: AuthContext) {
    const currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    const st = await this.statusIds();

    const receivable = body.receivableId
      ? await this.db.query.receivables.findFirst({
          where: and(
            eq(receivables.id, body.receivableId),
            eq(receivables.tenantId, actor.tenantId),
            resourceDivisionFilter(actor, 'receivables', receivables.divisionId) ?? sql`true`,
          ),
        })
      : null;
    if (body.receivableId && !receivable) throw new NotFoundError('Alacak kaydı bulunamadı');

    const payable = body.payableId
      ? await this.db.query.payables.findFirst({
          where: and(
            eq(payables.id, body.payableId),
            eq(payables.tenantId, actor.tenantId),
            resourceDivisionFilter(actor, 'payments', payables.divisionId) ?? sql`true`,
          ),
        })
      : null;
    if (body.payableId && !payable) throw new NotFoundError('Borç kaydı bulunamadı');

    const companyId = receivable?.companyId ?? payable?.companyId ?? body.companyId;
    if (!companyId) throw new NotFoundError('Firma bulunamadı');
    if (!receivable && !payable) await this.assertCompanyVisible(companyId, actor);
    const divisionId = receivable?.divisionId ?? payable?.divisionId ?? resolveAssignedResourceDivision(actor, 'payments', body.divisionId ?? null);
    if (!divisionId) throw new ValidationError('Ödeme için bölüm ataması zorunludur', { field: 'divisionId' });

    const [row] = await this.db
      .insert(payments)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        direction: body.direction,
        receivableId: body.receivableId ?? null,
        payableId: body.payableId ?? null,
        companyId,
        amount: body.amount.toString(),
        currencyId,
        paymentDate: body.paymentDate,
        paymentMethod: body.paymentMethod,
        statusId: st.paid ?? null,
        invoiceNo: body.invoiceNo ?? receivable?.invoiceNo ?? payable?.invoiceNo ?? null,
        notes: body.notes ?? null,
        createdBy: actor.userId,
      })
      .returning();

    if (receivable) {
      const paidAmt = this.num(receivable.amount);
      const newPaid = body.amount;
      if (newPaid >= paidAmt) {
        await this.db.update(receivables).set({ statusId: st.paid ?? null }).where(eq(receivables.id, receivable.id));
      } else if (st.partial) {
        await this.db.update(receivables).set({ statusId: st.partial }).where(eq(receivables.id, receivable.id));
      }
    }

    if (payable) {
      const owed = this.num(payable.amount);
      const newPaid = body.amount;
      if (newPaid >= owed) {
        await this.db.update(payables).set({ statusId: st.paid ?? null }).where(eq(payables.id, payable.id));
      } else if (st.partial) {
        await this.db.update(payables).set({ statusId: st.partial }).where(eq(payables.id, payable.id));
      }
    }

    return row;
  }

  private async refreshReceivablePaymentStatus(receivableId: string | null | undefined, actor: AuthContext) {
    if (!receivableId) return;
    const receivable = await this.db.query.receivables.findFirst({
      where: and(eq(receivables.id, receivableId), eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt)),
    });
    if (!receivable) return;
    const st = await this.statusIds();
    const rows = await this.db
      .select({ amount: payments.amount })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, actor.tenantId),
          eq(payments.receivableId, receivableId),
          isNull(payments.deletedAt),
          st.paid ? eq(payments.statusId, st.paid) : sql`true`
        )
      );
    const paidTotal = rows.reduce((sum, row) => sum + this.num(row.amount), 0);
    const requiredTotal = this.num(receivable.amount);
    const statusId = paidTotal <= 0 ? st.pending ?? null : paidTotal >= requiredTotal ? st.paid ?? null : st.partial ?? st.pending ?? null;
    await this.db.update(receivables).set({ statusId }).where(eq(receivables.id, receivableId));
  }

  private async refreshPayablePaymentStatus(payableId: string | null | undefined, actor: AuthContext) {
    if (!payableId) return;
    const payable = await this.db.query.payables.findFirst({
      where: and(eq(payables.id, payableId), eq(payables.tenantId, actor.tenantId), isNull(payables.deletedAt)),
    });
    if (!payable) return;
    const st = await this.statusIds();
    const rows = await this.db
      .select({ amount: payments.amount })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, actor.tenantId),
          eq(payments.payableId, payableId),
          isNull(payments.deletedAt),
          st.paid ? eq(payments.statusId, st.paid) : sql`true`
        )
      );
    const paidTotal = rows.reduce((sum, row) => sum + this.num(row.amount), 0);
    const requiredTotal = this.num(payable.amount);
    const statusId = paidTotal <= 0 ? st.pending ?? null : paidTotal >= requiredTotal ? st.paid ?? null : st.partial ?? st.pending ?? null;
    await this.db.update(payables).set({ statusId }).where(eq(payables.id, payableId));
  }

  async updatePayment(id: string, body: PaymentUpdateInput, actor: AuthContext) {
    const payment = await this.db.query.payments.findFirst({
      where: and(
        eq(payments.id, id),
        eq(payments.tenantId, actor.tenantId),
        isNull(payments.deletedAt),
        resourceDivisionFilter(actor, 'payments', payments.divisionId) ?? sql`true`,
      ),
    });
    if (!payment) throw new NotFoundError('Ödeme kaydı bulunamadı');

    const patch: Record<string, unknown> = {};
    if (body.companyId !== undefined) {
      await this.assertCompanyVisible(body.companyId, actor);
      patch.companyId = body.companyId;
    }
    if (body.divisionId !== undefined) {
      const divisionId = resolveAssignedResourceDivision(actor, 'payments', body.divisionId);
      if (!divisionId) throw new ValidationError('Ödeme için bölüm ataması zorunludur', { field: 'divisionId' });
      patch.divisionId = divisionId;
    }
    if (body.direction !== undefined) patch.direction = body.direction;
    if (body.amount !== undefined) patch.amount = body.amount.toString();
    if (body.currencyCode !== undefined) patch.currencyId = await lookupIdByCode(this.db, currencies, body.currencyCode);
    if (body.paymentDate !== undefined) patch.paymentDate = body.paymentDate;
    if (body.paymentMethod !== undefined) patch.paymentMethod = body.paymentMethod;
    if (body.invoiceNo !== undefined) patch.invoiceNo = body.invoiceNo || null;
    if (body.notes !== undefined) patch.notes = body.notes || null;
    if (body.status !== undefined) patch.statusId = await this.resolveStatusId(body.status);

    const [updated] = await this.db
      .update(payments)
      .set(patch)
      .where(and(eq(payments.id, id), eq(payments.tenantId, actor.tenantId), isNull(payments.deletedAt)))
      .returning();
    if (!updated) throw new NotFoundError('Ödeme kaydı bulunamadı');
    await this.refreshReceivablePaymentStatus(updated.receivableId, actor);
    await this.refreshPayablePaymentStatus(updated.payableId, actor);
    return updated;
  }

  async deletePayment(id: string, actor: AuthContext) {
    const payment = await this.db.query.payments.findFirst({
      where: and(
        eq(payments.id, id),
        eq(payments.tenantId, actor.tenantId),
        isNull(payments.deletedAt),
        resourceDivisionFilter(actor, 'payments', payments.divisionId) ?? sql`true`,
      ),
    });
    if (!payment) throw new NotFoundError('Ödeme kaydı bulunamadı');
    await this.db
      .update(payments)
      .set({ deletedAt: new Date() })
      .where(and(eq(payments.id, id), eq(payments.tenantId, actor.tenantId), isNull(payments.deletedAt)));
    await this.refreshReceivablePaymentStatus(payment.receivableId, actor);
    await this.refreshPayablePaymentStatus(payment.payableId, actor);
    return { ok: true };
  }

  async resolveStatusId(code?: string): Promise<string> {
    const allowed = ['pending', 'partial', 'paid', 'overdue', 'cancelled'];
    if (!code || !allowed.includes(code)) throw new ValidationError('Geçersiz ödeme durumu');
    const st = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, code) });
    if (!st) throw new NotFoundError('Ödeme durumu bulunamadı');
    return st.id;
  }
}
