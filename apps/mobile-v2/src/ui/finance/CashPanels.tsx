import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { useCompany } from '@/src/api/companies.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme } from '@/src/theme/theme';
import { toast } from '@/src/ui/toast';
import { Panel, Segmented, ShareBar } from './kit';
import {
  AGING_LABELS,
  agingByCurrency,
  cashByCurrency,
  collectionTrend,
  currencyDistribution,
  dailyCashFlow,
  topDebtors,
  upcomingDues,
  type CashMovement,
  type Debtor,
} from './cash-movements';

const money = (value: number, currencyCode: string) => formatAmount(value, currencyCode);

function Empty({ text }: { text: string }) {
  return <Text className="py-4 text-center font-inter text-xs text-muted-foreground">{text}</Text>;
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'destructive' | 'warning' }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between gap-3 py-0.5">
      <Text className="font-inter text-xs text-muted-foreground">{label}</Text>
      <Text
        className="font-inter-semibold text-[13px] text-foreground"
        style={[{ fontVariant: ['tabular-nums'] }, tone ? { color: toneColor(colors, tone) } : null]}
      >
        {value}
      </Text>
    </View>
  );
}

/** "Kasa Bakiyesi": gerçekleşen hareketler, para birimi bazında. */
export function CashBalancePanel({ rows }: { rows: readonly CashMovement[] }) {
  const balances = useMemo(() => cashByCurrency(rows), [rows]);
  const realized = balances.filter((item) => item.incoming || item.outgoing);
  const pendingOut = balances.filter((item) => item.pendingOut > 0);
  return (
    <Panel title="Kasa Bakiyesi" subtitle="Gerçekleşen (ödenmiş) hareketler · para birimi bazında">
      {realized.length ? (
        realized.map((item) => (
          <View key={item.currencyCode} className="gap-0.5 border-t border-border pt-2">
            <Text className="font-inter-semibold text-xs text-muted-foreground">{item.currencyCode}</Text>
            <Line label="Giren" value={money(item.incoming, item.currencyCode)} tone="success" />
            <Line label="Çıkan" value={money(item.outgoing, item.currencyCode)} tone="destructive" />
            <Line label="Net Bakiye" value={money(item.net, item.currencyCode)} tone={item.net >= 0 ? 'success' : 'destructive'} />
          </View>
        ))
      ) : (
        <Empty text="Henüz gerçekleşmiş kasa hareketi yok." />
      )}
      {pendingOut.length ? (
        <Line label="Bekleyen ödeme (çıkış):" value={pendingOut.map((item) => money(item.pendingOut, item.currencyCode)).join(' · ')} tone="warning" />
      ) : null}
    </Panel>
  );
}

/** "Yaklaşan Vadeler": önümüzdeki 60 gün, en yakın 5 kayıt. */
export function UpcomingDuesPanel({ rows, onOpen }: { rows: readonly CashMovement[]; onOpen: (row: CashMovement) => void }) {
  const dues = useMemo(() => upcomingDues(rows), [rows]);
  if (!dues.length) return null;
  return (
    <Panel title="Yaklaşan Vadeler" subtitle="Önümüzdeki 60 gün · en yakın 5 kayıt">
      {dues.map((row) => (
        <Pressable
          key={`${row.source}-${row.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${row.companyName} ${formatDate(row.dueDate)}`}
          onPress={() => onOpen(row)}
          className="min-h-11 flex-row items-center justify-between gap-3 border-t border-border py-2 active:opacity-60"
        >
          <View className="flex-1">
            <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>{row.companyName}</Text>
            <Text className="font-inter text-xs text-muted-foreground">
              {formatDate(row.dueDate)} · {row.direction === 'out' ? 'Ödenecek' : 'Tahsil'}
            </Text>
          </View>
          <Text className="font-inter-semibold text-[13px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
            {money(row.amount, row.currencyCode)}
          </Text>
        </Pressable>
      ))}
    </Panel>
  );
}

function useCurrencyChoice(rows: readonly CashMovement[]) {
  const codes = useMemo(() => cashByCurrency(rows).map((item) => item.currencyCode), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked && codes.includes(picked) ? picked : (codes[0] ?? 'USD');
  return { codes, currency, setCurrency: setPicked };
}

/** "Tahsilat & Bekleyen Trendi": son 6 ay, seçili para birimi (kur dönüşümü yok). */
export function TrendPanel({ rows }: { rows: readonly CashMovement[] }) {
  const { colors } = useTheme();
  const { codes, currency, setCurrency } = useCurrencyChoice(rows);
  const months = useMemo(() => collectionTrend(rows, currency), [currency, rows]);
  const hasData = months.some((month) => month.collected || month.pending);
  const pendingColor = toneColor(colors, 'warning');
  return (
    <Panel title="Tahsilat & Bekleyen Trendi" subtitle={`Son 6 ay · ${currency}`}>
      {codes.length > 1 ? (
        <Segmented value={currency} options={codes.map((code) => ({ value: code, label: code }))} onChange={setCurrency} />
      ) : null}
      {hasData ? (
        <>
          <LineChart
            data={months.map((month) => ({ value: month.collected, label: month.label }))}
            data2={months.map((month) => ({ value: month.pending }))}
            color1={colors.chart1}
            color2={pendingColor}
            dataPointsColor1={colors.chart1}
            dataPointsColor2={pendingColor}
            thickness={2}
            curved
            noOfSections={3}
            height={130}
            spacing={44}
            initialSpacing={12}
            yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
            yAxisColor={colors.chartGrid}
            xAxisColor={colors.chartGrid}
            rulesColor={colors.chartGrid}
          />
          <View className="flex-row gap-4">
            <Legend color={colors.chart1} label="Tahsil" />
            <Legend color={pendingColor} label="Bekleyen" />
          </View>
        </>
      ) : (
        <Empty text="Bu para biriminde son 6 ayda hareket yok." />
      )}
    </Panel>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="font-inter text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

/** "Günlük Nakit Akışı": son 14 gün gerçekleşen giriş/çıkış. */
export function DailyFlowPanel({ rows }: { rows: readonly CashMovement[] }) {
  const { colors } = useTheme();
  const { codes, currency, setCurrency } = useCurrencyChoice(rows);
  const days = useMemo(() => dailyCashFlow(rows, currency), [currency, rows]);
  const hasData = days.some((day) => day.incoming || day.outgoing);
  const inColor = toneColor(colors, 'success');
  const outColor = toneColor(colors, 'destructive');
  const data = days.flatMap((day) => [
    { value: day.incoming, label: day.label, frontColor: inColor, spacing: 2 },
    { value: day.outgoing, frontColor: outColor },
  ]);
  return (
    <Panel title="Günlük Nakit Akışı" subtitle={`Son 14 gün · giriş vs çıkış · ${currency}`}>
      {codes.length > 1 ? (
        <Segmented value={currency} options={codes.map((code) => ({ value: code, label: code }))} onChange={setCurrency} />
      ) : null}
      {hasData ? (
        <>
          <BarChart
            data={data}
            barWidth={7}
            spacing={10}
            initialSpacing={6}
            noOfSections={3}
            height={130}
            yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
            yAxisColor={colors.chartGrid}
            xAxisColor={colors.chartGrid}
            rulesColor={colors.chartGrid}
          />
          <View className="flex-row gap-4">
            <Legend color={inColor} label="Giriş" />
            <Legend color={outColor} label="Çıkış" />
          </View>
        </>
      ) : (
        <Empty text="Son 14 günde gerçekleşen hareket yok." />
      )}
    </Panel>
  );
}

/** "Para Birimi Dağılımı": hareket adedi payı. */
export function CurrencySharePanel({ rows }: { rows: readonly CashMovement[] }) {
  const shares = useMemo(() => currencyDistribution(rows), [rows]);
  if (!shares.length) return null;
  return (
    <Panel title="Para Birimi Dağılımı" subtitle="Hareket adedine göre pay">
      {shares.map((item) => (
        <View key={item.currencyCode} className="gap-1">
          <View className="flex-row justify-between">
            <Text className="font-inter-medium text-xs text-foreground">{item.currencyCode}</Text>
            <Text className="font-inter text-xs text-muted-foreground">
              {item.count} hareket · %{Math.round(item.share * 100)}
            </Text>
          </View>
          <ShareBar ratio={item.share} tone="stage" />
        </View>
      ))}
    </Panel>
  );
}

/** "Yaşlandırma (Aging)": vadesi geçen alacaklar, para birimi bazında. */
export function AgingPanel({ rows }: { rows: readonly CashMovement[] }) {
  const aging = useMemo(() => agingByCurrency(rows), [rows]);
  const tones = ['warning', 'warning', 'destructive', 'destructive'] as const;
  return (
    <Panel title="Yaşlandırma (Aging)" subtitle="Vadesi geçen alacaklar">
      {aging.length ? (
        aging.map((item) => (
          <View key={item.currencyCode} className="gap-1.5 border-t border-border pt-2">
            {item.buckets.map((amount, index) => (
              <View key={AGING_LABELS[index]} className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="font-inter text-xs text-muted-foreground">{AGING_LABELS[index]} gün</Text>
                  <Text className="font-inter-medium text-xs text-foreground">{money(amount, item.currencyCode)}</Text>
                </View>
                <ShareBar ratio={item.total ? amount / item.total : 0} tone={tones[index]} />
              </View>
            ))}
            <Line label="Toplam Gecikmiş" value={money(item.total, item.currencyCode)} tone="destructive" />
          </View>
        ))
      ) : (
        <Empty text="Vadesi geçmiş alacak yok." />
      )}
    </Panel>
  );
}

function DebtorRow({ debtor, rank }: { debtor: Debtor; rank: number }) {
  const { colors } = useTheme();
  const company = useCompany(debtor.companyId);
  const emails = company.data?.emails ?? [];
  const phones = company.data?.phones ?? [];
  const mail = (emails.find((item) => item.isDefault) ?? emails[0])?.email?.trim();
  const phone = (phones.find((item) => item.isDefault) ?? phones[0])?.phone?.replace(/\s/g, '');
  const open = (url: string) => {
    Linking.openURL(url).catch(() => toast.error('Bağlantı açılamadı'));
  };
  return (
    <View className="flex-row items-center gap-3 border-t border-border py-1.5">
      <View className="h-7 w-7 items-center justify-center rounded-md bg-muted">
        <Text className="font-inter-semibold text-[11px] text-primary">{rank}</Text>
      </View>
      <View className="flex-1">
        <Text className="font-inter-medium text-[13px] text-foreground" numberOfLines={1}>{debtor.companyName}</Text>
        <Text className="font-inter text-[11px] text-muted-foreground">açık bakiye · {debtor.count} kayıt</Text>
      </View>
      <Text className="font-inter-semibold text-[13px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
        {money(debtor.amount, debtor.currencyCode)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="E-posta gönder"
        accessibilityState={{ disabled: !mail }}
        disabled={!mail}
        onPress={() => mail && open(`mailto:${mail}`)}
        className={`h-11 w-9 items-center justify-center ${mail ? 'active:opacity-60' : 'opacity-30'}`}
      >
        <Ionicons name="mail-outline" size={18} color={colors.primary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Telefon et"
        accessibilityState={{ disabled: !phone }}
        disabled={!phone}
        onPress={() => phone && open(`tel:${phone}`)}
        className={`h-11 w-9 items-center justify-center ${phone ? 'active:opacity-60' : 'opacity-30'}`}
      >
        <Ionicons name="call-outline" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** "En Yüksek Borçlular": açık bakiye TOP 5, e-posta/telefon kısayolu. */
export function TopDebtorsPanel({ rows, onShowAll }: { rows: readonly CashMovement[]; onShowAll: () => void }) {
  const debtors = useMemo(() => topDebtors(rows), [rows]);
  return (
    <Panel
      title="En Yüksek Borçlular"
      subtitle="Açık bakiye TOP 5"
      right={
        <Pressable accessibilityRole="button" accessibilityLabel="Gecikmiş tahsilatların tümü" onPress={onShowAll} className="min-h-11 justify-center px-1 active:opacity-60">
          <Text className="font-inter-semibold text-xs text-primary">Tümü</Text>
        </Pressable>
      }
    >
      {debtors.length ? (
        debtors.map((debtor, index) => <DebtorRow key={`${debtor.companyId}-${debtor.currencyCode}`} debtor={debtor} rank={index + 1} />)
      ) : (
        <Empty text="Açık bakiye yok" />
      )}
    </Panel>
  );
}
