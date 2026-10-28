import { useMemo, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useOperationalReport, usePreviousOperationalReport, useReportDepartments, useReportUsers } from '@/src/api/reports.hooks';
import { reportExports, type OperationalParams } from '@/src/api/reports.api';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Card, ErrorState, FilterChips, Loading } from '@/src/ui';
import { ActionButton, ChoiceChips, GroupedBars, Kpi, KpiRow, SimpleTable } from './parts';
import {
  TR_MONTHS,
  bucketLabel,
  comparedMonths,
  delta,
  pct,
  rowsUpToMonth,
  sumOperational,
  usd,
  type OperationalTotals,
} from './reportMath';

type DrillKey = 'quotes' | 'approved' | 'rejected' | 'won' | 'lost' | 'service';

/** Mobil listeler dönem süzgeci tanımıyor; web'deki gibi ilgili modüle iner. */
const DRILL: Record<DrillKey, Href> = {
  quotes: '/modules/quotes' as Href,
  approved: '/modules/quotes' as Href,
  rejected: '/modules/quotes' as Href,
  won: '/modules/opportunities' as Href,
  lost: '/modules/opportunities' as Href,
  service: '/modules/service-tickets' as Href,
};

export function OperationalSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const canExport = useCan('reports.export');
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [year, setYear] = useState(currentYear);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const users = useReportUsers();
  const departments = useReportDepartments();
  const params = useMemo<OperationalParams>(
    () => ({ period, year, ...(ownerUserId ? { ownerUserId } : {}), ...(departmentId ? { departmentId } : {}) }),
    [period, year, ownerUserId, departmentId],
  );
  const report = useOperationalReport(params);
  const previous = usePreviousOperationalReport(params);

  const rows = report.data?.rows ?? [];
  const totals = useMemo(() => sumOperational(rows), [rows]);
  const months = comparedMonths(year);
  const prevTotals: OperationalTotals | null = useMemo(
    () => (period === 'monthly' && previous.data ? sumOperational(rowsUpToMonth(previous.data.rows, months)) : null),
    [period, previous.data, months],
  );
  const curTotals = useMemo(() => (period === 'monthly' ? sumOperational(rowsUpToMonth(rows, months)) : totals), [period, rows, months, totals]);
  const conversion = pct(totals.approved, totals.quotes);
  const fx = report.data?.currencyNormalization;
  const years = [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
  const drill = (key: DrillKey) => router.push(DRILL[key]);

  const share = async () => {
    const ownerName = users.data?.find((u) => u.id === ownerUserId)?.fullName;
    const departmentName = departments.data?.find((d) => d.id === departmentId)?.name;
    const lines = [
      `Operasyonel Rapor — ${period === 'monthly' ? year : 'Yıllık'}`,
      ownerName ? `Temsilci: ${ownerName}` : departmentName ? `Departman: ${departmentName}` : 'Tüm temsilciler',
      `Toplam Teklif: ${totals.quotes}`,
      `Onaylanan / Reddedilen: ${totals.approved} / ${totals.rejected}`,
      `Dönüşüm Oranı: %${conversion}`,
      `Kazanılan / Kaybedilen: ${totals.won} / ${totals.lost}`,
      `Servis: ${totals.service}`,
      `Ciro (USD): ${usd(totals.revenueUsd)}`,
      '',
      ...rows.map((r) => `${bucketLabel(r.bucket)}: teklif ${r.quotes}, onay ${r.approved}, red ${r.rejected}, kazanılan ${r.won}, kaybedilen ${r.lost}, servis ${r.service}, ciro ${usd(r.revenueUsd)}`),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <View className="gap-4">
      <View className="gap-2">
        <ChoiceChips
          label="Dönem"
          options={[{ value: 'monthly', label: 'Aylık' }, { value: 'yearly', label: 'Yıllık' }]}
          value={period}
          onChange={setPeriod}
        />
        {period === 'monthly' ? (
          <ChoiceChips label="Yıl" options={years.map((y) => ({ value: y, label: String(y) }))} value={year} onChange={setYear} />
        ) : null}
        {users.data && users.data.length > 0 ? (
          <FilterChips
            allLabel="Tüm temsilciler"
            options={users.data.map((u) => ({ value: u.id, label: u.fullName }))}
            value={ownerUserId}
            onChange={(next) => {
              setOwnerUserId(next);
              setDepartmentId(null);
            }}
          />
        ) : null}
        {departments.data && departments.data.length > 0 ? (
          <FilterChips
            allLabel="Tüm departmanlar"
            options={departments.data.map((d) => ({ value: d.id, label: d.name }))}
            value={departmentId}
            onChange={(next) => {
              setDepartmentId(next);
              setOwnerUserId(null);
            }}
          />
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <ActionButton icon="share-outline" label="Paylaş" run={share} disabled={!report.data} />
          {canExport ? <ActionButton icon="download-outline" label="Excel" run={() => reportExports.operational(params)} disabled={!report.data} /> : null}
        </View>
      </View>

      {report.isPending ? (
        <Loading />
      ) : report.error ? (
        <ErrorState message={report.error.message || 'Rapor yüklenemedi'} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <KpiRow>
            <Kpi label="Toplam Teklif" value={String(totals.quotes)} tone="info" delta={delta(curTotals.quotes, prevTotals?.quotes)} onPress={() => drill('quotes')} />
            <Kpi label="Onaylanan / Reddedilen" value={`${totals.approved} / ${totals.rejected}`} tone="success" delta={delta(curTotals.approved, prevTotals?.approved)} onPress={() => drill('approved')} />
          </KpiRow>
          <KpiRow>
            <Kpi
              label="Dönüşüm Oranı"
              value={`%${conversion}`}
              tone="stage"
              delta={delta(pct(curTotals.approved, curTotals.quotes), prevTotals ? pct(prevTotals.approved, prevTotals.quotes) : null, 'puan')}
            />
            <Kpi label="Kazanılan / Kaybedilen" value={`${totals.won} / ${totals.lost}`} tone="info" delta={delta(curTotals.won, prevTotals?.won)} onPress={() => drill('won')} />
          </KpiRow>
          <KpiRow>
            <Kpi label="Ciro (USD)" value={usd(totals.revenueUsd)} tone="warning" delta={delta(curTotals.revenueUsd, prevTotals?.revenueUsd, 'usd')} />
            <Kpi label="Servis Talebi" value={String(totals.service)} tone="neutral" onPress={() => drill('service')} />
          </KpiRow>
          {period === 'monthly' && prevTotals ? (
            <Text className="px-1 font-inter text-[11px] text-muted-foreground">
              Kıyas: {year - 1} yılının {year === currentYear ? `Ocak–${TR_MONTHS[months - 1]}` : 'tamamı'} · kırılım kaydın açıldığı tarihe göre
              {fx ? ` · kur ${fx.rateDate}${fx.unsupportedCurrencies.length ? ` (çevrilemeyen: ${fx.unsupportedCurrencies.join(', ')})` : ''}` : ''}
            </Text>
          ) : null}

          {(
            [
              { title: 'Teklif Raporu', series: [
                { key: 'quotes', label: 'Toplam Teklif', color: colors.brandBlue },
                { key: 'approved', label: 'Onaylanan', color: colors.success },
                { key: 'rejected', label: 'Reddedilen', color: colors.destructive },
              ] },
              { title: 'Satış Dönüşüm', series: [
                { key: 'won', label: 'Kazanılan', color: colors.success },
                { key: 'lost', label: 'Kaybedilen', color: colors.destructive },
              ] },
              { title: 'Servis Raporu', series: [{ key: 'service', label: 'Servis Talebi', color: colors.info }] },
              { title: 'Ciro (Kazanılan, USD)', series: [{ key: 'revenueUsd', label: 'USD', color: colors.brandBlue }] },
            ] as const
          ).map((card) => (
            <GroupedBars
              key={card.title}
              title={card.title}
              caption={period === 'monthly' ? String(year) : 'Yıllık'}
              buckets={rows.map((r) => ({ key: r.bucket, label: bucketLabel(r.bucket) }))}
              series={[...card.series]}
              valueOf={(bucket, key) => Number(rows.find((r) => r.bucket === bucket)?.[key as keyof OperationalTotals] ?? 0)}
            />
          ))}

          <Card className="gap-2">
            <Text className="font-inter-semibold text-base text-foreground">{period === 'monthly' ? `${year} - Aylık Detay` : 'Yıllık Detay'}</Text>
            <Text className="font-inter text-xs text-muted-foreground">Satıra dokununca ilgili kayıtlar açılır</Text>
            <SimpleTable
              headers={[period === 'monthly' ? 'Ay' : 'Yıl', 'Teklif', 'Onaylanan', 'Reddedilen', 'Kazanılan', 'Kaybedilen', 'Servis', 'Ciro (USD)']}
              firstColumnWidth={64}
              columnWidth={80}
              rows={rows.map((r) => ({
                key: r.bucket,
                cells: [bucketLabel(r.bucket), r.quotes, r.approved, r.rejected, r.won, r.lost, r.service, usd(r.revenueUsd)],
                tones: [undefined, undefined, 'success', 'destructive'],
                onPress: r.quotes > 0 ? () => drill('quotes') : undefined,
              }))}
              footer={['Toplam', totals.quotes, totals.approved, totals.rejected, totals.won, totals.lost, totals.service, usd(totals.revenueUsd)]}
            />
          </Card>
        </>
      )}
    </View>
  );
}
