import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import * as ExcelJS from 'exceljs';
import { dateRangeSchema, type DateRange } from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ReportsService } from './reports.service';

const expiringSchema = z.object({ days: z.coerce.number().int().positive().default(60) });
const yearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
});

async function rowsToXlsx(rows: any[], reply: FastifyReply, filename: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  if (rows.length) {
    ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 20 }));
    ws.addRows(rows);
  }
  const buf = await wb.xlsx.writeBuffer();
  reply
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return Buffer.from(buf);
}

/** Birden çok bölümü (her biri kendi sayfasında) tek bir xlsx olarak yazar. */
async function sheetsToXlsx(
  sheets: Array<{ name: string; rows: any[] }>,
  reply: FastifyReply,
  filename: string
) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    if (s.rows.length) {
      ws.columns = Object.keys(s.rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
      ws.addRows(s.rows);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  reply
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return Buffer.from(buf);
}

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @RequirePermissions('reports.read')
  @Get('weekly-visits')
  weeklyVisits(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.visitsReport(u, 'weekly', r);
  }

  @RequirePermissions('reports.read')
  @Get('monthly-visits')
  monthlyVisits(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.visitsReport(u, 'monthly', r);
  }

  @RequirePermissions('reports.read')
  @Get('yearly-visits')
  yearlyVisits(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.visitsReport(u, 'yearly', r);
  }

  @RequirePermissions('reports.read')
  @Get('weekly-quotes-by-product')
  weeklyQuotes(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.quotesByProduct(u, 'weekly', r);
  }

  @RequirePermissions('reports.read')
  @Get('monthly-quotes-by-product')
  monthlyQuotes(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.quotesByProduct(u, 'monthly', r);
  }

  @RequirePermissions('reports.read')
  @Get('yearly-quotes-by-product')
  yearlyQuotes(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.quotesByProduct(u, 'yearly', r);
  }

  @RequirePermissions('reports.read')
  @Get('expected-receivables')
  expectedReceivables(@CurrentUser() u: AuthContext) {
    return this.svc.expectedReceivables(u);
  }

  @RequirePermissions('reports.read')
  @Get('completed-payments')
  completedPayments(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.completedPayments(u, r);
  }

  @RequirePermissions('reports.read')
  @Get('stock-summary')
  stockSummary(@CurrentUser() u: AuthContext) {
    return this.svc.stockSummary(u);
  }

  @RequirePermissions('reports.read')
  @Get('pipeline-summary')
  pipelineSummary(@CurrentUser() u: AuthContext) {
    return this.svc.pipelineSummary(u);
  }

  @RequirePermissions('reports.read')
  @Get('warranty-expiring')
  warranty(@Query(new ZodValidationPipe(expiringSchema)) q: { days: number }, @CurrentUser() u: AuthContext) {
    return this.svc.warrantyExpiring(u, q.days);
  }

  @RequirePermissions('reports.read')
  @Get('year-end')
  yearEnd(@Query(new ZodValidationPipe(yearSchema)) q: { year: number }, @CurrentUser() u: AuthContext) {
    return this.svc.yearEndReport(u, q.year);
  }

  @RequirePermissions('reports.export')
  @Get('export/year-end')
  async exportYearEnd(
    @Query(new ZodValidationPipe(yearSchema)) q: { year: number },
    @CurrentUser() u: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const r = await this.svc.yearEndReport(u, q.year);
    return sheetsToXlsx(
      [
        { name: 'Özet', rows: [{ year: r.year, ...r.summary }] },
        { name: 'Aylık', rows: r.monthly },
        { name: 'Ret Nedenleri', rows: r.lostReasons },
        { name: 'Rakipler', rows: r.competitors },
        { name: 'Kazanma Nedenleri', rows: r.wonReasons },
        { name: 'Teklif Fiyatları', rows: r.quotesByStatus },
        { name: 'Temsilciler', rows: r.byUser },
      ],
      reply,
      `karlilik-raporu-${q.year}.xlsx`
    );
  }

  @RequirePermissions('reports.export')
  @Get('export/pipeline-summary')
  async exportPipeline(@CurrentUser() u: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.pipelineSummary(u);
    return rowsToXlsx(rows, reply, 'pipeline-summary.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('export/stock-summary')
  async exportStock(@CurrentUser() u: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.stockSummary(u);
    return rowsToXlsx(rows, reply, 'stock-summary.xlsx');
  }
}
