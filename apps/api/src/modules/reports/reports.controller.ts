import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { dateRangeSchema, type DateRange } from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { rowsToXlsxBuffer, sendXlsx, sheetsToXlsxBuffer } from '../../shared/utils/excel-export';
import { ReportsService } from './reports.service';

const expiringSchema = z.object({ days: z.coerce.number().int().positive().default(60) });
const yearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
});

const periodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  departmentId: z.string().uuid().optional(),
});

const targetProgressSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  scope: z.enum(['user', 'department', 'role', 'all-users']).default('all-users'),
  id: z.string().uuid().optional(),
});

const targetPeriodOnlySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

const teamActivitySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('week'),
  // Dönemin çapası; verilmezse bugün. Önceki dönem buradan türetilir.
  date: z.string().datetime().optional(),
  // Yalnız süper admin 'team' alabilir; servis diğerlerini 'self'e zorlar.
  scope: z.enum(['team', 'self']).default('team'),
});

const teamActivityDetailsSchema = teamActivitySchema.extend({
  // Bir tablo hücresi seçildiğinde yalnız o sütunun kayıtları; kullanıcı/toplam
  // seçildiğinde bütün kaynaklar tek zaman akışında döner.
  metric: z
    .enum(['all', 'quotes', 'activities', 'opportunitiesCreated', 'won'])
    .default('all'),
  userId: z.string().uuid().optional(),
});

type TargetExportMetric = { target: number | null; actual: number | null; pct: number | null };
type TargetExportItem = {
  targetType?: string;
  category?: string;
  activity?: string;
  description?: string;
  unit?: string;
  target?: string | number | null;
  actual?: number | null;
  pct?: number | null;
  metricKey?: string | null;
  trackingMode?: string | null;
};
type TargetExportSubject = {
  subject: {
    kind: 'user' | 'department' | 'role';
    id: string;
    name: string;
    departmentName?: string | null;
    departmentNames?: string[];
    memberCount?: number;
  };
  hasTarget: boolean;
  note?: string | null;
  metrics: Record<string, TargetExportMetric>;
  targetItems: TargetExportItem[];
};
type TargetExportReport = {
  period: string;
  expectedProgressPct: number;
  currencyNormalization: {
    base: string;
    rateDate: string;
    source: string;
    unsupportedCurrencies: string[];
  };
  subjects: TargetExportSubject[];
};

const TARGET_EXPORT_METRIC_LABELS: Record<string, string> = {
  salesAmount: 'Satış cirosu',
  salesNewCustomers: 'Yeni müşteri',
  quoteTarget: 'Teklif',
  visitTarget: 'Ziyaret',
  callTarget: 'Arama',
  serviceCompleted: 'Tamamlanan servis',
  serviceAmount: 'Servis cirosu',
  digitalLeadTarget: 'Dijital lead',
  digitalConversionTarget: 'Dijital dönüşüm',
  digitalBudget: 'Dijital bütçe',
  paymentsInAmount: 'Tahsilat',
  purchaseInvoiceAmount: 'Alış faturası',
  purchaseOrderAmount: 'Satınalma tutarı',
  purchaseOrderCount: 'Satınalma siparişi',
  salesOrderAmount: 'Satış siparişi tutarı',
  salesOrderCount: 'Satış siparişi',
  installationCompleted: 'Kurulum',
};

const configuredTargetCount = (row: TargetExportSubject) =>
  Object.values(row.metrics).filter((metric) => metric.target != null).length +
  row.targetItems.filter((item) => String(item.target ?? '').trim()).length;

const averageTargetProgress = (row: TargetExportSubject) => {
  const percentages = [
    ...Object.values(row.metrics).map((metric) => metric.pct),
    ...row.targetItems.map((item) => item.pct),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return percentages.length
    ? Math.round(percentages.reduce((sum, value) => sum + Math.min(100, Math.max(0, value)), 0) / percentages.length)
    : null;
};

const targetSubjectSummaryRows = (report: TargetExportReport) =>
  report.subjects.map((row) => ({
    Dönem: report.period,
    Kapsam: row.subject.kind === 'user' ? 'Kullanıcı' : row.subject.kind === 'department' ? 'Departman' : 'Rol',
    Ad: row.subject.name,
    Departman: row.subject.departmentNames?.join(', ') || row.subject.departmentName || '',
    'Üye Sayısı': row.subject.memberCount ?? null,
    'Hedef Durumu': row.hasTarget ? 'Hedef atandı' : 'Hedef yok',
    'Hedef Kalemi': configuredTargetCount(row),
    'Ortalama Gerçekleşme (%)': averageTargetProgress(row),
    Not: row.note ?? '',
  }));

const targetDetailRows = (report: TargetExportReport) =>
  report.subjects.flatMap((row) => {
    const common = {
      Dönem: report.period,
      Kapsam: row.subject.kind === 'user' ? 'Kullanıcı' : row.subject.kind === 'department' ? 'Departman' : 'Rol',
      Ad: row.subject.name,
      Departman: row.subject.departmentNames?.join(', ') || row.subject.departmentName || '',
    };
    const metrics = Object.entries(row.metrics)
      .filter(([, metric]) => metric.target != null)
      .map(([key, metric]) => ({
        ...common,
        'Kalem Türü': 'Ana metrik',
        Kategori: '',
        Hedef: TARGET_EXPORT_METRIC_LABELS[key] ?? key,
        Açıklama: '',
        Birim: key.toLowerCase().includes('amount') || key.toLowerCase().includes('budget') ? 'USD' : 'Adet',
        'Takip Türü': metric.actual == null ? 'Manuel' : 'Otomatik',
        'Hedef Değer': metric.target,
        Gerçekleşen: metric.actual,
        'Gerçekleşme (%)': metric.pct,
      }));
    const items = row.targetItems
      .filter((item) => String(item.target ?? '').trim())
      .map((item) => ({
        ...common,
        'Kalem Türü': item.targetType || 'Özel hedef',
        Kategori: item.category ?? '',
        Hedef: item.activity ?? '',
        Açıklama: item.description ?? '',
        Birim: item.unit === 'amount' ? 'USD' : item.unit ?? '',
        'Takip Türü': item.trackingMode === 'automatic' ? 'Otomatik' : 'Manuel',
        'Hedef Değer': item.target ?? '',
        Gerçekleşen: item.actual ?? null,
        'Gerçekleşme (%)': item.pct ?? null,
      }));
    return [...metrics, ...items];
  });

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
  @Get('weekly-activities')
  weeklyActivities(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.activitiesReport(u, 'weekly', r);
  }

  @RequirePermissions('reports.read')
  @Get('monthly-activities')
  monthlyActivities(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.activitiesReport(u, 'monthly', r);
  }

  @RequirePermissions('reports.read')
  @Get('yearly-activities')
  yearlyActivities(@Query(new ZodValidationPipe(dateRangeSchema)) r: DateRange, @CurrentUser() u: AuthContext) {
    return this.svc.activitiesReport(u, 'yearly', r);
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
  @Get('service-complaints-summary')
  serviceComplaintsSummary(@CurrentUser() u: AuthContext) {
    return this.svc.serviceComplaintsSummary(u);
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
    return sendXlsx(
      reply,
      await sheetsToXlsxBuffer([
        { name: 'Özet', rows: [{ year: r.year, ...r.summary }] },
        { name: 'Aylık', rows: r.monthly },
        { name: 'Ret Nedenleri', rows: r.lostReasons },
        { name: 'Rakipler', rows: r.competitors },
        { name: 'Kazanma Nedenleri', rows: r.wonReasons },
        { name: 'Teklif Fiyatları', rows: r.quotesByStatus },
        { name: 'Temsilciler', rows: r.byUser },
      ]),
      `karlilik-raporu-${q.year}.xlsx`
    );
  }

  @RequirePermissions('reports.read')
  @Get('target-progress')
  targetProgress(@Query(new ZodValidationPipe(targetProgressSchema)) q: z.infer<typeof targetProgressSchema>, @CurrentUser() u: AuthContext) {
    return this.svc.targetProgress(u, q.period, { kind: q.scope, id: q.id });
  }

  @RequirePermissions('reports.export', 'reports.read')
  @Get('export/target-progress')
  async exportTargetProgress(
    @Query(new ZodValidationPipe(targetPeriodOnlySchema)) q: z.infer<typeof targetPeriodOnlySchema>,
    @CurrentUser() u: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const [users, departments] = await Promise.all([
      this.svc.targetProgress(u, q.period, { kind: 'all-users' }),
      this.svc.targetProgress(u, q.period, { kind: 'department' }),
    ]);
    const userReport = users as TargetExportReport;
    const departmentReport = departments as TargetExportReport;
    const detailRows = [...targetDetailRows(departmentReport), ...targetDetailRows(userReport)];
    const normalization = userReport.currencyNormalization ?? departmentReport.currencyNormalization;

    return sendXlsx(
      reply,
      await sheetsToXlsxBuffer([
        {
          name: 'Genel Özet',
          rows: [{
            Dönem: q.period,
            'Beklenen İlerleme (%)': userReport.expectedProgressPct,
            'Hedef Atanan Kişi': userReport.subjects.filter((row) => row.hasTarget).length,
            'Toplam Kullanıcı': userReport.subjects.length,
            'Hedef Atanan Departman': departmentReport.subjects.filter((row) => row.hasTarget).length,
            'Toplam Departman': departmentReport.subjects.length,
            'Kur Bazı': normalization.base,
            'Kur Tarihi': normalization.rateDate,
            'Kur Kaynağı': normalization.source,
            'Dönüştürülemeyen Para Birimleri': normalization.unsupportedCurrencies.join(', '),
          }],
        },
        { name: 'Departmanlar', rows: targetSubjectSummaryRows(departmentReport) },
        { name: 'Kullanıcılar', rows: targetSubjectSummaryRows(userReport) },
        { name: 'Hedef Detayları', rows: detailRows },
      ]),
      `hedef-gerceklesme-${q.period}.xlsx`
    );
  }

  /** Kullanıcının kendi hedef ilerlemesi — ek izin gerektirmez (Dashboard "Hedefler" sekmesi). */
  @Get('my-target-progress')
  myTargetProgress(@Query(new ZodValidationPipe(targetPeriodOnlySchema)) q: z.infer<typeof targetPeriodOnlySchema>, @CurrentUser() u: AuthContext) {
    return this.svc.targetProgress(u, q.period, { kind: 'user', id: u.userId });
  }

  /**
   * Gösterge panelindeki ekip aktivitesi. Süper admin tüm ekibi görür; diğer
   * kullanıcılar `scope` ne gönderirse göndersin yalnız kendi verisini alır
   * (kısıt serviste zorlanır, arayüzde değil).
   */
  @RequirePermissions('reports.read')
  @Get('team-activity')
  teamActivity(
    @Query(new ZodValidationPipe(teamActivitySchema)) q: z.infer<typeof teamActivitySchema>,
    @CurrentUser() u: AuthContext
  ) {
    return this.svc.teamActivity(u, q.period, q.date, q.scope);
  }

  /** Ekip aktivitesi tablosundaki sayaçların kişi/firma bazlı kayıt dökümü. */
  @RequirePermissions('reports.read', 'companies.read')
  @Get('team-activity/details')
  teamActivityDetails(
    @Query(new ZodValidationPipe(teamActivityDetailsSchema)) q: z.infer<typeof teamActivityDetailsSchema>,
    @CurrentUser() u: AuthContext
  ) {
    return this.svc.teamActivityDetails(u, q.period, q.date, q.scope, q.metric, q.userId);
  }

  @RequirePermissions('reports.read')
  @Get('department-performance')
  departmentPerformance(@Query(new ZodValidationPipe(periodSchema)) q: z.infer<typeof periodSchema>, @CurrentUser() u: AuthContext) {
    return this.svc.departmentPerformance(u, q.period, q.departmentId);
  }

  @RequirePermissions('reports.export')
  @Get('export/department-performance')
  async exportDepartmentPerformance(
    @Query(new ZodValidationPipe(periodSchema)) q: z.infer<typeof periodSchema>,
    @CurrentUser() u: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const report = await this.svc.departmentPerformance(u, q.period, q.departmentId);
    const flat = report.departments.map((d) => ({
      period: report.period,
      department: d.departmentName,
      members: d.memberCount,
      salesTarget: d.targets.departmentSalesAmount,
      salesActual: d.actuals.wonValue,
      salesAttainmentPct: d.attainment.salesPct,
      quoteTarget: d.targets.departmentQuoteTarget,
      quotesActual: d.actuals.quotesCreated,
      quoteAttainmentPct: d.attainment.quotePct,
      wonDeals: d.actuals.wonOpportunities,
      openPipeline: d.actuals.openOpportunities,
    }));
    return sendXlsx(
      reply,
      await sheetsToXlsxBuffer([
        { name: 'Özet', rows: flat },
        {
          name: 'Detay',
          rows: report.departments.map((d) => ({
            ...d.targets,
            ...d.actuals,
            department: d.departmentName,
            members: d.memberCount,
          })),
        },
      ]),
      `departman-raporu-${q.period}.xlsx`
    );
  }

  @RequirePermissions('reports.export')
  @Get('export/pipeline-summary')
  async exportPipeline(@CurrentUser() u: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.pipelineSummary(u);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Pipeline'), 'pipeline-summary.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('export/stock-summary')
  async exportStock(@CurrentUser() u: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.stockSummary(u);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Stok'), 'stock-summary.xlsx');
  }
}
