import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import {
  useActivityTrend,
  useComplaintsSummary,
  useDepartmentPerformance,
  usePipelineSummary,
  useQuotesByProduct,
  useReportDepartments,
  useReportStockSummary,
  useVisitTrend,
  useWarrantyExpiring,
} from '@/src/api/reports.hooks';
import { reportExports } from '@/src/api/reports.api';
import { ApiError } from '@/src/api/client';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Card, ErrorState, FilterChips, Loading } from '@/src/ui';
import { ActionButton, ChoiceChips, GroupedBars, InfoLine, SimpleTable, Stepper } from './parts';
import { ActivityLogSection } from './ActivityLogSection';
import {
  activityBucketLabel,
  aggregateQuoteProducts,
  currentMonth,
  money,
  monthTitle,
  shiftMonth,
  totalsLabel,
  type Granularity,
} from './reportMath';

const SOURCE_LABELS: Record<string, string> = { qr: 'QR', web: 'Web', phone: 'Telefon', whatsapp: 'WhatsApp', email: 'E-posta', manual: 'İç kayıt' };
const SEVERITY_LABELS: Record<string, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' };
const GRANULARITY: { value: Granularity; label: string }[] = [
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
];

function CardTitle({ children }: { children: string }) {
  return <Text className="font-inter-semibold text-base text-foreground">{children}</Text>;
}

export function AnalyticsSection() {
  const { colors } = useTheme();
  const chartColors = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5];
  const canExport = useCan('reports.export');
  const [period, setPeriod] = useState(currentMonth());
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('monthly');

  const departments = useReportDepartments();
  const performance = useDepartmentPerformance(period, departmentId ?? undefined);
  const pipeline = usePipelineSummary();
  const stock = useReportStockSummary();
  const complaints = useComplaintsSummary();
  const warranty = useWarrantyExpiring(60);
  const activities = useActivityTrend(granularity, period);
  const visits = useVisitTrend(granularity, period);
  const quotes = useQuotesByProduct(granularity, period);

  const productRows = useMemo(() => aggregateQuoteProducts(quotes.data ?? []), [quotes.data]);
  const performanceForbidden = performance.error instanceof ApiError && performance.error.status === 403;
  const trendBuckets = useMemo(() => {
    const keys = new Set([...(activities.data ?? []).map((r) => r.bucket), ...(visits.data ?? []).map((r) => r.bucket)]);
    return [...keys].sort().map((key) => ({ key, label: activityBucketLabel(key, granularity) }));
  }, [activities.data, visits.data, granularity]);

  return (
    <View className="gap-4">
      <Stepper
        label={monthTitle(period)}
        onPrev={() => setPeriod(shiftMonth(period, -1))}
        onNext={() => setPeriod(shiftMonth(period, 1))}
        nextDisabled={period >= currentMonth()}
      />
      {departments.data && departments.data.length > 0 ? (
        <FilterChips allLabel="Tüm departmanlar" options={departments.data.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} />
      ) : null}
      {canExport ? (
        <View className="flex-row flex-wrap gap-2">
          {!performanceForbidden ? <ActionButton icon="download-outline" label="Departman" run={() => reportExports.departmentPerformance(period, departmentId ?? undefined)} /> : null}
          <ActionButton icon="download-outline" label="Fırsat" run={reportExports.pipelineSummary} />
          <ActionButton icon="download-outline" label="Stok" run={reportExports.stockSummary} />
          <ActionButton icon="download-outline" label="Teslimat" run={reportExports.deliveries} />
          <ActionButton icon="download-outline" label="Sevkiyat" run={reportExports.shipments} />
          <ActionButton icon="download-outline" label="Servis" run={reportExports.serviceTickets} />
          <ActionButton icon="download-outline" label="Şikayet" run={reportExports.serviceComplaints} />
        </View>
      ) : null}

      <Card className="gap-1">
        <CardTitle>Şikayet Kutusu Özeti</CardTitle>
        {complaints.isPending ? <Loading /> : complaints.error ? (
          <ErrorState message={complaints.error.message} onRetry={() => void complaints.refetch()} />
        ) : complaints.data ? (
          <>
            <InfoLine label="Toplam" value={complaints.data.total} />
            <InfoLine label="Yeni" value={complaints.data.new} tone="destructive" />
            <InfoLine label="İnceleniyor" value={complaints.data.reviewing} tone="warning" />
            <InfoLine label="Servise Çevrildi" value={complaints.data.converted} tone="success" />
            <InfoLine label="Reddedildi" value={complaints.data.rejected} />
            <InfoLine label="Garanti İşaretli" value={complaints.data.warrantyClaim} tone="stage" />
            {(complaints.data.bySource ?? []).length > 0 ? (
              <Text className="pt-2 font-inter text-xs text-muted-foreground">
                Kaynak: {complaints.data.bySource.map((s) => `${SOURCE_LABELS[s.source] ?? s.source} ${s.count}`).join(' · ')}
              </Text>
            ) : null}
            {(complaints.data.bySeverity ?? []).length > 0 ? (
              <Text className="font-inter text-xs text-muted-foreground">
                Önem: {complaints.data.bySeverity.map((s) => `${SEVERITY_LABELS[s.severity] ?? s.severity} ${s.count}`).join(' · ')}
              </Text>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card className="gap-1">
        <CardTitle>Garanti Süresi Yaklaşan Makineler</CardTitle>
        {warranty.isPending ? <Loading /> : warranty.error ? (
          <ErrorState message={warranty.error.message} onRetry={() => void warranty.refetch()} />
        ) : (warranty.data ?? []).length === 0 ? (
          <Text className="py-2 font-inter text-sm text-muted-foreground">Önümüzdeki 60 gün içinde garanti bitişi görünmüyor.</Text>
        ) : (
          (warranty.data ?? []).slice(0, 20).map((row) => (
            <InfoLine key={row.id} label={row.serialNumber ?? row.id} value={row.warrantyEndDate ? formatDate(row.warrantyEndDate) : 'Tarih yok'} />
          ))
        )}
      </Card>

      {!performanceForbidden ? (
        <Card className="gap-2">
          <CardTitle>Departman Satış/Teklif Hedef vs Gerçekleşen</CardTitle>
          {performance.isPending ? <Loading /> : performance.error ? (
            <ErrorState message={performance.error.message} onRetry={() => void performance.refetch()} />
          ) : (
            <>
              <GroupedBars
                title="Satış (hedef / gerçekleşen)"
                buckets={(performance.data?.departments ?? []).map((d) => ({ key: d.departmentId, label: d.departmentName.slice(0, 8) }))}
                series={[
                  { key: 'target', label: 'Hedef', color: colors.chart2 },
                  { key: 'actual', label: 'Gerçekleşen', color: colors.chart1 },
                ]}
                valueOf={(bucket, key) => {
                  const row = performance.data?.departments.find((d) => d.departmentId === bucket);
                  if (!row) return 0;
                  return key === 'target' ? Number(row.targets.departmentSalesAmount ?? 0) : Number(row.actuals.wonValue ?? 0);
                }}
              />
              <Text className="pt-1 font-inter-semibold text-sm text-foreground">Departman Özet Tablosu</Text>
              <SimpleTable
                headers={['Departman', 'Üye', 'Satış hedefi', 'Kazanılan', 'Satış %', 'Teklif hedefi', 'Teklif', 'Teklif %', 'Açık fırsat']}
                firstColumnWidth={120}
                columnWidth={88}
                empty="Departman verisi yok."
                rows={(performance.data?.departments ?? []).map((d) => ({
                  key: d.departmentId,
                  cells: [
                    d.departmentName,
                    d.memberCount,
                    d.targets.departmentSalesAmount == null ? '—' : money(d.targets.departmentSalesAmount),
                    money(d.actuals.wonValue),
                    d.attainment.salesPct == null ? '—' : `%${d.attainment.salesPct}`,
                    d.targets.departmentQuoteTarget ?? '—',
                    d.actuals.quotesCreated,
                    d.attainment.quotePct == null ? '—' : `%${d.attainment.quotePct}`,
                    d.actuals.openOpportunities,
                  ],
                }))}
              />
            </>
          )}
        </Card>
      ) : null}

      <Card className="gap-2">
        <CardTitle>Satış Fırsatları</CardTitle>
        {pipeline.isPending ? <Loading /> : pipeline.error ? (
          <ErrorState message={pipeline.error.message} onRetry={() => void pipeline.refetch()} />
        ) : (
          <SimpleTable
            headers={['Aşama', 'Adet', 'Toplam']}
            firstColumnWidth={150}
            columnWidth={96}
            empty="Açık fırsat yok."
            rows={[...(pipeline.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ key: s.stageCode, cells: [s.stageName, s.count, money(s.totalValue)] }))}
          />
        )}
      </Card>

      <Card className="gap-2">
        <CardTitle>Stok Durumu</CardTitle>
        {stock.isPending ? <Loading /> : stock.error ? (
          <ErrorState message={stock.error.message} onRetry={() => void stock.refetch()} />
        ) : (stock.data ?? []).length === 0 ? (
          <Text className="py-2 font-inter text-sm text-muted-foreground">Stok kaydı yok.</Text>
        ) : (
          <View className="flex-row items-center gap-4">
            <PieChart radius={52} data={(stock.data ?? []).map((row, index) => ({ value: row.count, color: chartColors[index % chartColors.length] }))} />
            <View className="flex-1 gap-1.5">
              {(stock.data ?? []).map((row, index) => (
                <View key={row.status ?? `row-${index}`} className="flex-row items-center gap-2">
                  <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                  <Text className="flex-1 font-inter text-sm text-muted-foreground" numberOfLines={1}>{row.statusName ?? 'Tanımsız'}</Text>
                  <Text className="font-inter-semibold text-sm text-foreground">{row.count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>

      <View className="gap-2">
        <ChoiceChips label="Trend aralığı" options={GRANULARITY} value={granularity} onChange={setGranularity} />
        {activities.isPending || visits.isPending ? <Loading /> : activities.error ? (
          <ErrorState message={activities.error.message} onRetry={() => void activities.refetch()} />
        ) : (
          <GroupedBars
            title={granularity === 'weekly' ? 'Haftalık Aktivite Trendi' : granularity === 'yearly' ? 'Yıllık Aktivite Trendi' : 'Aylık Aktivite Trendi'}
            buckets={trendBuckets}
            series={[
              { key: 'activities', label: 'Aktivite', color: colors.chart1 },
              { key: 'visits', label: 'Ziyaret', color: colors.chart3 },
            ]}
            valueOf={(bucket, key) =>
              (key === 'activities' ? activities.data : visits.data)?.find((r) => r.bucket === bucket)?.count ?? 0
            }
          />
        )}
      </View>

      <Card className="gap-2">
        <CardTitle>Ürün Bazlı Teklif</CardTitle>
        <Text className="font-inter text-xs text-muted-foreground">
          {granularity === 'monthly' ? monthTitle(period) : granularity === 'weekly' ? 'Son 12 hafta' : 'Son 5 yıl'} · en çok teklif edilen 12 ürün
        </Text>
        {quotes.isPending ? <Loading /> : quotes.error ? (
          <ErrorState message={quotes.error.message} onRetry={() => void quotes.refetch()} />
        ) : (
          <SimpleTable
            headers={['Ürün', 'Adet', 'Tutar']}
            firstColumnWidth={150}
            columnWidth={150}
            empty="Bu ay teklif kalemi yok."
            rows={productRows.map((p) => ({ key: p.key, cells: [p.brand ? `${p.productName} · ${p.brand}` : p.productName, p.count, totalsLabel(p.totals)] }))}
          />
        )}
      </Card>

      <ActivityLogSection />
    </View>
  );
}
