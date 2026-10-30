import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTargetDirectories, useTargetReport, useTeamScorecard } from '@/src/api/targets.hooks';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, EmptyState, ErrorState, Eyebrow, Loading, ScreenHeader, SCREEN_PAD } from '@/src/ui';
import { ProgressBar, StatCard, StatGrid, Tabs } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { PillGroup, SalesSheet, SheetOption } from '@/src/ui/sales/Sheet';
import { shareTextFile } from '@/src/ui/sales/shareText';
import {
  currentPeriod,
  formatTargetValue,
  monthRange,
  paceMeta,
  periodLabel,
  periodLabelLong,
  quarterRange,
  SCOPE_META,
  shiftMonth,
  sortTeamRows,
  STATUS_META,
  summarizeResults,
  targetReportCsv,
  targetReportHtml,
  yearRange,
  type ScopeKind,
  type TeamSort,
} from '@/src/ui/sales/targets-logic';

type QuickRange = 'month' | 'last3' | 'quarter' | 'year';
const QUICK_RANGES: { value: QuickRange; label: string }[] = [
  { value: 'month', label: 'Bu ay' },
  { value: 'last3', label: 'Son 3 ay' },
  { value: 'quarter', label: 'Bu çeyrek' },
  { value: 'year', label: 'Bu yıl' },
];
const TEAM_SORTS: { value: TeamSort; label: string }[] = [
  { value: 'pace', label: 'Tempo' },
  { value: 'progress', label: 'Gerçekleşme' },
  { value: 'name', label: 'İsim' },
];

function PeriodStepper({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 gap-1">
      <Text className="font-inter-medium text-[12px] text-muted-foreground">{label}</Text>
      <View className="h-12 flex-row items-center rounded-[12px] border border-border bg-card">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: önceki ay`}
          onPress={() => onChange(shiftMonth(value, -1))}
          className="h-12 w-11 items-center justify-center active:opacity-60"
        >
          <Ionicons name="chevron-back" size={18} color={colors.foreground} />
        </Pressable>
        <Text className="flex-1 text-center font-inter-semibold text-[14px] text-foreground" accessibilityLabel={`${label} ${periodLabelLong(value)}`}>
          {periodLabel(value)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: sonraki ay`}
          onPress={() => onChange(shiftMonth(value, 1))}
          className="h-12 w-11 items-center justify-center active:opacity-60"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

/** Web pages/dashboard/TargetWorkspace.tsx — "Hedef Kontrol Merkezi". */
export default function TargetsScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.some((role) => role === 'admin' || role === 'super_admin'));
  const now = currentPeriod();

  const [scopeKind, setScopeKind] = useState<ScopeKind>('user');
  const [subjectId, setSubjectId] = useState<string>(user?.id ?? '');
  const [from, setFrom] = useState(() => shiftMonth(now, -2));
  const [to, setTo] = useState(now);
  const [teamSort, setTeamSort] = useState<TeamSort>('pace');
  const [detailPeriod, setDetailPeriod] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState('');
  const subjectSheet = useRef<BottomSheetModal>(null);

  const rangeError = useMemo(() => {
    try {
      monthRange(from, to);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Dönem aralığı geçersiz.';
    }
  }, [from, to]);

  const directories = useTargetDirectories(isAdmin);
  const subjects = directories.data?.[scopeKind] ?? [];
  const effectiveSubjectId = isAdmin ? subjectId || subjects[0]?.id || '' : user?.id ?? '';
  const subjectName = isAdmin
    ? subjects.find((row) => row.id === effectiveSubjectId)?.name ?? (scopeKind === 'user' ? user?.fullName ?? '' : '')
    : 'Kendi hedeflerim';

  const report = useTargetReport({
    scopeKind: isAdmin ? scopeKind : 'user',
    subjectId: rangeError ? '' : effectiveSubjectId,
    from,
    to,
    self: !isAdmin,
  });
  const team = useTeamScorecard(to, isAdmin && !rangeError);

  const results = report.data ?? [];
  const summary = useMemo(() => summarizeResults(results), [results]);
  const latest = results.find((row) => row.period === (detailPeriod ?? to)) ?? results[results.length - 1] ?? null;
  const teamRows = useMemo(() => sortTeamRows(team.data ?? [], teamSort), [team.data, teamSort]);
  const hasLines = results.some((row) => row.lines.length > 0);
  const filteredSubjects = subjects.filter((row) =>
    `${row.name} ${row.subtitle ?? ''}`.toLocaleLowerCase('tr-TR').includes(subjectSearch.trim().toLocaleLowerCase('tr-TR'))
  );

  function applyQuickRange(range: QuickRange) {
    if (range === 'month') {
      setFrom(now);
      setTo(now);
    } else if (range === 'last3') {
      setFrom(shiftMonth(now, -2));
      setTo(now);
    } else {
      const next = range === 'quarter' ? quarterRange(now) : yearRange(now);
      setFrom(next.from);
      setTo(next.to);
    }
    setDetailPeriod(null);
  }

  async function exportCsv() {
    if (!hasLines) {
      toast.info('Dışa aktarılacak hedef satırı yok');
      return;
    }
    try {
      await shareTextFile({
        fileName: `hedef-raporu-${from}-${to}.csv`,
        content: targetReportCsv({ scopeKind: isAdmin ? scopeKind : 'user', subjectName, results }),
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        title: 'Hedef raporu (CSV)',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rapor paylaşılamadı');
    }
  }

  async function exportPrint() {
    if (!hasLines) {
      toast.info('Yazdırılacak hedef satırı yok');
      return;
    }
    try {
      await shareTextFile({
        fileName: `hedef-raporu-${from}-${to}.html`,
        content: targetReportHtml({ scopeKind: isAdmin ? scopeKind : 'user', subjectName, results }),
        mimeType: 'text/html',
        uti: 'public.html',
        title: 'Hedef raporu — Yazdır / PDF',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rapor paylaşılamadı');
    }
  }

  const chartWidth = Math.max(200, width - SCREEN_PAD * 2 - 72);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 32, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={report.isRefetching || team.isRefetching}
            onRefresh={() => {
              void report.refetch();
              if (isAdmin) void team.refetch();
            }}
            tintColor={colors.mutedForeground}
          />
        }
      >
        <ScreenHeader title="Hedefler" subtitle="Hedefler, gerçekleşmeler ve ekip performansı." />

        {isAdmin ? (
          <Tabs
            tabs={(Object.keys(SCOPE_META) as ScopeKind[]).map((kind) => ({ value: kind, label: SCOPE_META[kind].label }))}
            value={scopeKind}
            onChange={(next) => {
              setScopeKind(next);
              setSubjectId(next === 'user' ? user?.id ?? '' : '');
              setDetailPeriod(null);
            }}
          />
        ) : null}

        <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3">
          <Card className="gap-3">
            <Eyebrow>Rapor kapsamı ve dönem</Eyebrow>
            {isAdmin ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${SCOPE_META[scopeKind].label} seç: ${subjectName || 'seçilmedi'}`}
                onPress={() => {
                  setSubjectSearch('');
                  subjectSheet.current?.present();
                }}
                className="min-h-[48px] flex-row items-center gap-2 rounded-[12px] border border-border bg-card px-3.5 active:opacity-70"
              >
                <Ionicons name={scopeKind === 'user' ? 'person-outline' : scopeKind === 'department' ? 'people-outline' : 'business-outline'} size={18} color={colors.primary} />
                <Text className="flex-1 font-inter-medium text-[15px] text-foreground" numberOfLines={1}>
                  {directories.isPending ? 'Yükleniyor…' : subjectName || `${SCOPE_META[scopeKind].label} seçin`}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : (
              <Text className="font-inter-medium text-[15px] text-foreground">Kendi hedeflerim · {user?.fullName}</Text>
            )}
            <View className={width < 380 ? "gap-3" : "flex-row gap-3"}>
              <PeriodStepper label="Başlangıç" value={from} onChange={(next) => { setFrom(next); setDetailPeriod(null); }} />
              <PeriodStepper label="Bitiş" value={to} onChange={(next) => { setTo(next); setDetailPeriod(null); }} />
            </View>
            <PillGroup options={QUICK_RANGES} value={null} allowClear={false} onChange={(next) => next && applyQuickRange(next)} />
            <Text className="font-inter text-[12px] text-muted-foreground">En fazla 18 aylık karşılaştırmalı rapor oluşturabilirsiniz.</Text>
            {rangeError ? <Text className="font-inter text-[13px] text-destructive">{rangeError}</Text> : null}
          </Card>

          <View className="flex-row flex-wrap gap-2">
            <View className="min-w-[45%] flex-1">
              <Button label="CSV / Excel" variant="ghost" onPress={() => void exportCsv()} />
            </View>
            <View className="min-w-[45%] flex-1">
              <Button label="Yazdır / PDF" variant="ghost" onPress={() => void exportPrint()} />
            </View>
            {isAdmin && effectiveSubjectId ? (
              <View className="w-full">
                <Button
                  label="Hedef ata / düzenle"
                  onPress={() =>
                    router.push({
                      pathname: '/modal/target-edit',
                      params: { kind: scopeKind, id: effectiveSubjectId, name: subjectName, period: to },
                    } as unknown as Href)
                  }
                />
              </View>
            ) : null}
          </View>

          {report.isPending && effectiveSubjectId && !rangeError ? (
            <Loading />
          ) : report.error ? (
            <ErrorState message={report.error.message || 'Hedef raporu alınamadı.'} onRetry={() => void report.refetch()} />
          ) : !hasLines ? (
            <EmptyState
              icon="flag-outline"
              title="Seçili kapsam ve dönemde ölçülebilir hedef bulunamadı."
              hint={isAdmin ? 'Hedef atayabilir veya farklı bir dönem seçebilirsiniz.' : 'Farklı bir dönem seçebilirsiniz.'}
            />
          ) : (
            <>
              <StatGrid>
                <StatCard icon="scan-outline" tone="info" label="Seçili kapsam" value={isAdmin ? SCOPE_META[scopeKind].label : 'Kendim'} />
                <StatCard
                  icon="speedometer-outline"
                  tone="stage"
                  label="Ortalama gerçekleşme"
                  value={summary.overallAverage == null ? '—' : `%${summary.overallAverage}`}
                />
                <StatCard
                  icon="trending-up-outline"
                  tone="info"
                  label="Ay sonu tahmini"
                  value={summary.monthEndProjection == null ? '—' : `%${summary.monthEndProjection}`}
                />
                <StatCard icon="checkmark-done-outline" tone="success" label="Tamamlanan" value={String(summary.totalAchieved)} />
                <StatCard icon="alert-circle-outline" tone="warning" label="Yakın takip" value={String(summary.totalRisk)} />
                <StatCard icon="hand-left-outline" tone="neutral" label="Manuel takip" value={String(summary.totalManual)} />
              </StatGrid>

              {results.length > 1 ? (
                <Card className="gap-2">
                  <Eyebrow>Gerçekleşme / beklenen</Eyebrow>
                  <View className="flex-row gap-4">
                    <View className="flex-row items-center gap-1.5">
                      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.chart1 }} />
                      <Text className="font-inter text-[12px] text-muted-foreground">Gerçekleşme %</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.mutedForeground }} />
                      <Text className="font-inter text-[12px] text-muted-foreground">Beklenen %</Text>
                    </View>
                  </View>
                  <LineChart
                    data={results.map((row) => ({ value: row.averagePct ?? 0, label: periodLabel(row.period).split(' ')[0] }))}
                    data2={results.map((row) => ({ value: row.expectedPct }))}
                    width={chartWidth}
                    height={150}
                    spacing={Math.max(28, chartWidth / Math.max(1, results.length))}
                    initialSpacing={12}
                    color1={colors.chart1}
                    color2={colors.mutedForeground}
                    dataPointsColor1={colors.chart1}
                    dataPointsColor2={colors.mutedForeground}
                    thickness={2}
                    maxValue={Math.max(100, ...results.map((row) => row.averagePct ?? 0))}
                    noOfSections={4}
                    yAxisTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
                    yAxisColor={colors.chartGrid}
                    xAxisColor={colors.chartGrid}
                    rulesColor={colors.chartGrid}
                  />
                </Card>
              ) : null}

              <Card className="gap-2">
                <Eyebrow>Dönem özeti</Eyebrow>
                {results.map((row) => {
                  const selected = latest?.period === row.period;
                  return (
                    <Pressable
                      key={row.period}
                      accessibilityRole="button"
                      accessibilityLabel={`${periodLabelLong(row.period)} hedef detayları`}
                      accessibilityState={{ selected }}
                      onPress={() => setDetailPeriod(row.period)}
                      className={`min-h-[52px] gap-1.5 rounded-[12px] border px-3 py-2 active:opacity-70 ${selected ? 'border-primary bg-secondary' : 'border-border'}`}
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="font-inter-semibold text-[14px] text-foreground">{periodLabelLong(row.period)}</Text>
                        <Text className="font-inter-semibold text-[14px] text-foreground">{row.averagePct == null ? '—' : `%${row.averagePct}`}</Text>
                      </View>
                      <ProgressBar done={Math.min(100, row.averagePct ?? 0)} total={100} tone="info" />
                      <Text className="font-inter text-[12px] text-muted-foreground">
                        Beklenen %{Math.round(row.expectedPct)} · {row.achievedCount} tamamlandı · {row.riskCount} yakın takip · {row.manualCount} manuel
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>

              {latest ? (
                <Card className="gap-2">
                  <Eyebrow>{`Hedef detayları · ${periodLabelLong(latest.period)}`}</Eyebrow>
                  {latest.lines.length === 0 ? (
                    <Text className="font-inter text-[13px] text-muted-foreground">Bu dönemde hedef yok.</Text>
                  ) : (
                    latest.lines.map((line) => {
                      const status = STATUS_META[line.status];
                      return (
                        <View key={line.id} className="gap-1.5 border-t border-border py-2.5">
                          <View className="flex-row items-start justify-between gap-2">
                            <View className="min-w-0 flex-1">
                              <Text className="font-inter-semibold text-[14px] text-foreground">{line.label}</Text>
                              <Text className="font-inter text-[12px] text-muted-foreground">
                                {line.category} · {line.trackingMode === 'automatic' ? 'Otomatik' : 'Manuel'}
                              </Text>
                            </View>
                            <Chip tone={status.tone} label={status.label} />
                          </View>
                          <View className="flex-row justify-between">
                            <Text className="font-inter text-[12px] text-muted-foreground">
                              Hedef {formatTargetValue(line.target, line.unit)}
                            </Text>
                            <Text className="font-inter-medium text-[12px] text-foreground">
                              Gerçekleşen {formatTargetValue(line.actual, line.unit)}
                              {line.pct != null ? ` · %${line.pct}` : ''}
                            </Text>
                          </View>
                          {line.pct != null ? <ProgressBar done={Math.min(100, Math.max(0, line.pct))} total={100} tone={status.tone} /> : null}
                          {line.source ? <Text className="font-inter text-[11px] text-muted-foreground">Kaynak: {line.source}</Text> : null}
                          {line.detail ? <Text className="font-inter text-[11px] text-muted-foreground">{line.detail}</Text> : null}
                        </View>
                      );
                    })
                  )}
                </Card>
              ) : null}
            </>
          )}

          {isAdmin && !rangeError ? (
            <Card className="gap-2">
              <Eyebrow>{`Ekip karnesi · ${periodLabelLong(to)}`}</Eyebrow>
              <PillGroup options={TEAM_SORTS} value={teamSort} allowClear={false} onChange={(next) => next && setTeamSort(next)} />
              {team.isPending ? (
                <Loading />
              ) : team.error ? (
                <ErrorState message={team.error.message || 'Ekip karnesi alınamadı.'} onRetry={() => void team.refetch()} />
              ) : teamRows.length === 0 ? (
                <Text className="font-inter text-[13px] text-muted-foreground">Bu dönem için kullanıcı hedefi yok.</Text>
              ) : (
                teamRows.map((row) => {
                  const pace = paceMeta(row.pace);
                  return (
                    <Pressable
                      key={row.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.name} hedef raporunu aç`}
                      onPress={() => {
                        setScopeKind('user');
                        setSubjectId(row.id);
                        setDetailPeriod(null);
                      }}
                      className="min-h-[56px] flex-row items-center gap-3 border-t border-border py-2 active:opacity-70"
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>{row.name}</Text>
                        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                          {[row.department, `${row.achievedCount}/${row.lineCount} tamamlandı`, row.riskCount ? `${row.riskCount} yakın takip` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="font-inter-semibold text-[14px] text-foreground">{row.averagePct == null ? '—' : `%${row.averagePct}`}</Text>
                        <Text className="font-inter-medium text-[12px]" style={{ color: toneColor(colors, pace.tone) }}>{pace.label}</Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </Card>
          ) : null}
        </View>
      </ScrollView>

      {isAdmin ? (
        <SalesSheet ref={subjectSheet} title={`${SCOPE_META[scopeKind].label} seç`} subtitle={SCOPE_META[scopeKind].plural}>
          <TextInput
            accessibilityLabel="Listede ara"
            value={subjectSearch}
            onChangeText={setSubjectSearch}
            placeholder="Ara..."
            placeholderTextColor={colors.mutedForeground}
            className="min-h-[48px] rounded-[12px] border border-border bg-input-background px-3.5 font-inter text-base text-foreground"
          />
          {directories.isPending ? <Loading /> : null}
          {directories.error ? <Text className="font-inter text-[13px] text-destructive">{directories.error.message}</Text> : null}
          {filteredSubjects.map((row) => (
            <SheetOption
              key={row.id}
              label={row.name}
              hint={row.subtitle}
              selected={row.id === effectiveSubjectId}
              onPress={() => {
                setSubjectId(row.id);
                setDetailPeriod(null);
                subjectSheet.current?.dismiss();
              }}
            />
          ))}
          {!directories.isPending && filteredSubjects.length === 0 ? (
            <Text className="py-4 text-center font-inter text-[13px] text-muted-foreground">Kayıt bulunamadı.</Text>
          ) : null}
        </SalesSheet>
      ) : null}
    </SafeAreaView>
  );
}
