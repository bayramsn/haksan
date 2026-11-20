import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/src/auth/AuthProvider';
import { request } from '@/src/api/client';
import { Card, EmptyState, ErrorState, Skeleton } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { HomeNote, HomePanelTitle } from './HomeComponents';

type Metric = { target: number | null; actual: number | null; pct: number | null };
type TargetItem = { activity?: string; category?: string; description?: string; target?: string | number | null; actual?: number | null; pct?: number | null; unit?: string; metricKey?: string | null };
type TargetReport = {
  currencyNormalization: { base: string; rateDate: string; unsupportedCurrencies: string[] };
  subjects: Array<{ hasTarget: boolean; note?: string | null; targetItems: TargetItem[]; metrics: Record<string, Metric> }>;
};
const labels: Record<string, string> = {
  salesAmount: 'Satış tutarı', salesNewCustomers: 'Yeni müşteri', serviceAmount: 'Servis tutarı', serviceCompleted: 'Tamamlanan servis',
  visitTarget: 'Ziyaret', callTarget: 'Arama', quoteTarget: 'Teklif', digitalLeadTarget: 'Dijital fırsat', digitalConversionTarget: 'Dijital dönüşüm', digitalBudget: 'Dijital bütçe',
};

export function HomeTargets({ period }: { period: string }) {
  const { user, scope } = useAuth();
  // This endpoint intentionally exposes only the authenticated user's own targets.
  const query = useQuery({ queryKey: ['home', 'my-targets', user?.id, user?.tenantId, scope.divisionId, scope.departmentId, period],
    queryFn: () => request<TargetReport>('/reports/my-target-progress', { query: { period } }), enabled: Boolean(user) });
  const subject = query.data?.subjects[0];
  const items: TargetItem[] = subject?.targetItems?.length ? subject.targetItems : Object.entries(subject?.metrics ?? {})
    .filter(([, metric]) => metric.target != null && metric.target > 0)
    .map(([key, metric]) => ({ ...metric, activity: labels[key] ?? key, unit: /amount|budget/i.test(key) ? 'amount' : 'count' }));
  const normalization = query.data?.currencyNormalization;
  return <Card className="gap-3">
    <HomePanelTitle title="Kişisel hedeflerim" />
    <HomeNote>{new Date(`${period}-01T12:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} · Web ile aynı hedef ve gerçekleşmeler</HomeNote>
    {query.isPending ? <Skeleton height={160} /> : query.error ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      : !subject?.hasTarget ? <EmptyState title="Bu ay için hedef atanmamış" hint="Hedefler webde tanımlandığında burada görünecek." />
      : <>
        {subject.note ? <HomeNote>{subject.note}</HomeNote> : null}
        {items.map((item, index) => <View key={`${item.metricKey ?? item.activity}-${index}`} className="gap-2 border-b border-border py-3">
          <Text className="font-inter-semibold text-base text-foreground">{item.activity || item.category || 'Hedef'}</Text>
          {item.description ? <HomeNote>{item.description}</HomeNote> : null}
          <Text className="font-inter text-sm text-foreground">{item.actual == null ? 'Gerçekleşme girilmedi' : item.actual.toLocaleString('tr-TR')} / {item.target == null ? '—' : Number(item.target).toLocaleString('tr-TR')}{item.unit === 'amount' ? ` ${normalization?.base ?? ''}` : ' adet'}</Text>
          {item.pct != null && Number.isFinite(item.pct) ? <><ProgressBar done={Math.max(0, item.pct)} total={100} /><HomeNote>%{Math.round(item.pct)} tamamlandı</HomeNote></> : <HomeNote>İlerleme henüz hesaplanmadı.</HomeNote>}
        </View>)}
        {!items.length ? <HomeNote>Hedef ayrıntıları webde görüntülenebilir.</HomeNote> : null}
        {normalization ? <HomeNote>Tutarlar {normalization.base} bazında gösterilir. Kur tarihi: {normalization.rateDate}.</HomeNote> : null}
        {normalization?.unsupportedCurrencies?.length ? <Text className="font-inter text-sm text-destructive">Kur bilgisi bulunamayan para birimleri: {normalization.unsupportedCurrencies.join(', ')}. Bu tutarlar gerçekleşmeye dahil edilemeyebilir.</Text> : null}
      </>}
  </Card>;
}
