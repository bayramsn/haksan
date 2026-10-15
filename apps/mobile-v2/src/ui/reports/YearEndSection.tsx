import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useYearEndReport } from '@/src/api/reports.hooks';
import { reportExports } from '@/src/api/reports.api';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Card, ErrorState, Loading } from '@/src/ui';
import { ActionButton, ChoiceChips, GroupedBars, Kpi, KpiRow, SimpleTable } from './parts';
import { TR_MONTHS, money, recentYears } from './reportMath';

export function YearEndSection() {
  const { colors } = useTheme();
  const canExport = useCan('reports.export');
  const [year, setYear] = useState(new Date().getFullYear());
  const report = useYearEndReport(year);
  const data = report.data;

  const share = async () => {
    if (!data) return;
    const s = data.summary;
    const lines = [
      `Karlılık (Yıl Sonu) Raporu — ${data.year}`,
      `Toplam Fırsat: ${s.total}`,
      `Kazanılan / Kaybedilen: ${s.won} / ${s.lost}`,
      `Kazanma Oranı: %${s.winRate}`,
      `Ort. Kazanılan Değer: ${money(s.avgWonValue)}`,
      `Ort. Teklif Değeri: ${money(s.avgQuoteValue)}`,
      '',
      'Kaybetme Nedenleri:',
      ...data.lostReasons.map((r) => `- ${r.name}: ${r.count} (${money(r.value)})`),
      '',
      'Temsilci Bazlı Performans:',
      ...data.byUser.map((u) => `- ${u.name}: ${u.total} fırsat, ${u.won} kazanılan, ${u.lost} kaybedilen, ${money(u.wonValue)}`),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <View className="gap-4">
      <ChoiceChips label="Yıl" options={recentYears().map((y) => ({ value: y, label: String(y) }))} value={year} onChange={setYear} />
      <View className="flex-row flex-wrap gap-2">
        <ActionButton icon="share-outline" label="Paylaş" run={share} disabled={!data} />
        {canExport ? <ActionButton icon="download-outline" label="Excel" run={() => reportExports.yearEnd(year)} disabled={!data} /> : null}
      </View>

      {report.isPending ? (
        <Loading />
      ) : report.error ? (
        <ErrorState message={report.error.message || 'Karlılık raporu yüklenemedi'} onRetry={() => void report.refetch()} />
      ) : data ? (
        <>
          <KpiRow>
            <Kpi label="Toplam Fırsat" value={String(data.summary.total)} tone="info" />
            <Kpi label="Kazanılan / Kaybedilen" value={`${data.summary.won} / ${data.summary.lost}`} tone="success" />
          </KpiRow>
          <KpiRow>
            <Kpi label="Kazanma Oranı" value={`%${data.summary.winRate}`} tone="stage" />
            <Kpi label="Ort. Kazanılan Değer" value={money(data.summary.avgWonValue)} />
          </KpiRow>
          <KpiRow>
            <Kpi label="Ort. Teklif Değeri" value={money(data.summary.avgQuoteValue)} />
            <Kpi label="Açık Fırsat Değeri" value={money(data.summary.openValue)} tone="warning" />
          </KpiRow>

          <Card className="gap-3">
            <Text className="font-inter-semibold text-base text-foreground">Fırsat Dağılımı</Text>
            {(() => {
              const slices = (
                [
                  ['Kazanılan', data.summary.won, colors.success],
                  ['Kaybedilen', data.summary.lost, colors.destructive],
                  ['İptal', data.summary.cancelled, colors.mutedForeground],
                  ['Açık', data.summary.open, colors.info],
                ] as [string, number, string][]
              ).filter(([, value]) => value > 0);
              if (slices.length === 0) return <Text className="py-4 font-inter text-sm text-muted-foreground">Bu yıl kapanmış fırsat yok.</Text>;
              return (
                <View className="flex-row items-center gap-4">
                  <PieChart donut radius={58} innerRadius={38} data={slices.map(([text, value, color]) => ({ text, value, color }))} />
                  <View className="flex-1 gap-1.5">
                    {slices.map(([label, value, color]) => (
                      <View key={label} className="flex-row items-center gap-2">
                        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <Text className="flex-1 font-inter text-sm text-muted-foreground">{label}</Text>
                        <Text className="font-inter-semibold text-sm text-foreground">{value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
          </Card>

          <GroupedBars
            title="Aylık Kazanılan / Kaybedilen"
            caption={String(data.year)}
            buckets={data.monthly.map((m) => ({ key: String(m.month), label: TR_MONTHS[m.month - 1] ?? String(m.month) }))}
            series={[
              { key: 'won', label: 'Kazanılan', color: colors.success },
              { key: 'lost', label: 'Kaybedilen', color: colors.destructive },
            ]}
            valueOf={(bucket, key) => {
              const month = data.monthly.find((m) => String(m.month) === bucket);
              return month ? (key === 'won' ? month.won : month.lost) : 0;
            }}
          />

          <Card className="gap-2">
            <Text className="font-inter-semibold text-base text-foreground">Kaybetme Nedenleri</Text>
            <SimpleTable
              headers={['Neden', 'Adet', 'Değer']}
              firstColumnWidth={160}
              columnWidth={90}
              empty="Kayıp nedeni girilmemiş."
              rows={data.lostReasons.map((r) => ({ key: r.code, cells: [r.name, r.count, money(r.value)] }))}
            />
          </Card>
          <Card className="gap-2">
            <Text className="font-inter-semibold text-base text-foreground">Kazanma Nedenleri</Text>
            <SimpleTable
              headers={['Neden', 'Adet', 'Değer']}
              firstColumnWidth={160}
              columnWidth={90}
              empty="Kazanma nedeni girilmemiş."
              rows={data.wonReasons.map((r, index) => ({ key: `${r.reason}-${index}`, cells: [r.reason, r.count, money(r.value)] }))}
            />
          </Card>
          <Card className="gap-2">
            <Text className="font-inter-semibold text-base text-foreground">Rakip Kaybı</Text>
            <SimpleTable
              headers={['Rakip', 'Adet', 'Değer']}
              firstColumnWidth={160}
              columnWidth={90}
              empty="Rakibe kaybedilen fırsat yok."
              rows={data.competitors.map((r) => ({ key: r.id, cells: [r.name, r.count, money(r.value)] }))}
            />
          </Card>
          <Card className="gap-2">
            <Text className="font-inter-semibold text-base text-foreground">Teklif Fiyat Ortalamaları</Text>
            <SimpleTable
              headers={['Durum', 'Adet', 'Toplam', 'Ortalama']}
              firstColumnWidth={120}
              columnWidth={96}
              empty="Bu yıl teklif yok."
              rows={data.quotesByStatus.map((r) => ({ key: r.code, cells: [r.name, r.count, money(r.totalValue), money(r.avgValue)] }))}
            />
          </Card>
          <Card className="gap-2">
            <Text className="font-inter-semibold text-base text-foreground">Temsilci Bazlı Performans</Text>
            <SimpleTable
              headers={['Temsilci', 'Toplam', 'Kazanılan', 'Kaybedilen', 'Kazanılan Değer']}
              firstColumnWidth={130}
              columnWidth={88}
              empty="Temsilci verisi yok."
              rows={data.byUser.map((u) => ({
                key: u.userId,
                cells: [u.name, u.total, u.won, u.lost, money(u.wonValue)],
                tones: [undefined, undefined, 'success', 'destructive'],
              }))}
            />
          </Card>
        </>
      ) : null}
    </View>
  );
}
