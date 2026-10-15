import { Text, useWindowDimensions, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useLostOpportunitiesForQuotes, useQuoteStatusCounts, useQuoteTrend } from '@/src/api/quotes.hooks';
import { SCREEN_PAD, useTheme } from '@/src/theme/theme';
import { Card, SubtleCard } from '@/src/ui';
import { ProgressBar, StatCard, StatGrid } from '@/src/ui/data';
import { sharePercent, topRejectionReason, winRate, type BusinessLine } from './quote-logic';

const WIN_TARGET = 50;

/** Web OffersPage KPI kartları: Toplam, Onaylanan, Gönderilen, Kazanma Oranı. */
export function QuoteKpis({ businessLine }: { businessLine?: BusinessLine }) {
  const counts = useQuoteStatusCounts(businessLine);
  const rate = winRate(counts.approved, counts.total);
  const value = (n: number) => (counts.isPending ? '—' : String(n));
  return (
    <StatGrid>
      {[
        <StatCard key="total" icon="document-text-outline" tone="info" label="Toplam Teklif" value={value(counts.total)} />,
        <StatCard
          key="approved"
          icon="checkmark-circle-outline"
          tone="success"
          label="Onaylanan"
          value={value(counts.approved)}
          trend={counts.total > 0 ? { value: `%${sharePercent(counts.approved, counts.total)}`, direction: 'flat', caption: 'toplamın' } : undefined}
        />,
        <StatCard
          key="sent"
          icon="paper-plane-outline"
          tone="warning"
          label="Gönderilen"
          value={value(counts.sent)}
          trend={{ value: 'cevap bekleniyor', direction: 'flat' }}
        />,
        <StatCard
          key="win"
          icon="trophy-outline"
          tone="neutral"
          label="Kazanma Oranı"
          value={counts.isPending ? '—' : `%${rate}`}
          trend={{ value: `hedef %${WIN_TARGET}`, direction: rate >= WIN_TARGET ? 'up' : 'down' }}
        />,
      ]}
    </StatGrid>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="font-inter text-[12px] text-muted-foreground">{label}</Text>
    </View>
  );
}

/** "Teklif Trendi": son 6 ay, gönderilen vs onaylanan; ay etiketleri gerçek takvimden. */
export function QuoteTrendCard({ businessLine }: { businessLine?: BusinessLine }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const trend = useQuoteTrend(businessLine);
  const chartWidth = Math.max(220, width - SCREEN_PAD * 2 - 64);
  const spacing = Math.max(28, (chartWidth - 24) / Math.max(1, trend.points.length - 1));
  const max = Math.max(1, ...trend.points.map((point) => Math.max(point.sent, point.approved)));
  const first = trend.buckets[0];
  const last = trend.buckets[trend.buckets.length - 1];
  return (
    <Card className="gap-3">
      <View className="gap-0.5">
        <Text className="font-display text-[17px] text-foreground">Teklif Trendi</Text>
        <Text className="font-inter text-[12px] text-muted-foreground">
          Gönderilen vs onaylanan · son 6 ay{first && last ? ` (${first.long} ${first.year} – ${last.long} ${last.year})` : ''}
        </Text>
      </View>
      <View className="flex-row gap-4">
        <Legend color={colors.chart1} label="Gönderilen" />
        <Legend color={colors.chart3} label="Onaylanan" />
      </View>
      {trend.isPending ? (
        <View className="h-[120px] items-center justify-center">
          <Text className="font-inter text-[12px] text-muted-foreground">Yükleniyor…</Text>
        </View>
      ) : (
        <LineChart
          data={trend.points.map((point) => ({ value: point.sent, label: point.label }))}
          data2={trend.points.map((point) => ({ value: point.approved }))}
          height={120}
          width={chartWidth}
          spacing={spacing}
          initialSpacing={12}
          endSpacing={12}
          maxValue={Math.ceil(max * 1.2)}
          noOfSections={3}
          color1={colors.chart1}
          color2={colors.chart3}
          dataPointsColor1={colors.chart1}
          dataPointsColor2={colors.chart3}
          thickness={2}
          curved
          rulesColor={colors.border}
          rulesType="solid"
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisTextStyle={{ color: colors.mutedForeground, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.mutedForeground, fontSize: 10 }}
          yAxisLabelWidth={28}
        />
      )}
    </Card>
  );
}

/** "Durum Dağılımı" + "En sık ret nedeni" kutusu. */
export function QuoteDistributionCard({ businessLine }: { businessLine?: BusinessLine }) {
  const counts = useQuoteStatusCounts(businessLine);
  const lost = useLostOpportunitiesForQuotes();
  const top = topRejectionReason(lost.data ?? []);
  const known = counts.draft + counts.sent + counts.approved + counts.rejected;
  const rows = [
    { label: 'Taslak', value: counts.draft, tone: 'neutral' as const },
    { label: 'Gönderilen', value: counts.sent, tone: 'info' as const },
    { label: 'Onaylanan', value: counts.approved, tone: 'success' as const },
    { label: 'Reddedilen', value: counts.rejected, tone: 'destructive' as const },
  ];
  return (
    <Card className="gap-3">
      <Text className="font-display text-[17px] text-foreground">Durum Dağılımı</Text>
      {rows.map((row) => (
        <View key={row.label} className="gap-1">
          <ProgressBar done={row.value} total={known} label={`${row.label} · %${sharePercent(row.value, known)}`} tone={row.tone} />
        </View>
      ))}
      <SubtleCard className="gap-1 p-3">
        <Text className="font-inter-semibold text-[12px] text-muted-foreground">En sık ret nedeni</Text>
        {top ? (
          <>
            <Text className="font-inter-semibold text-[14px] text-foreground">{top.reason}</Text>
            <Text className="font-inter text-[12px] text-muted-foreground">{top.count} satış kartı · takip planına dönüştürün</Text>
          </>
        ) : (
          <Text className="font-inter text-[13px] text-muted-foreground">
            {lost.isPending ? 'Yükleniyor…' : 'Kayıp satış kartı yok.'}
          </Text>
        )}
      </SubtleCard>
    </Card>
  );
}
