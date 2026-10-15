import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useTaskCounts, useTaskList } from '@/src/api/tasks.hooks';
import { useTasksSummary, useTeamActivity, useTeamActivityDetails } from '@/src/api/sales.hooks';
import type { SalesOpportunityRow, TeamActivityMetric, TeamActivityPeriod, TeamActivityReport } from '@/src/api/sales.api';
import { useMyTargetProgress } from '@/src/api/targets.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, ErrorState, Loading } from '@/src/ui';
import { SalesSheet } from '@/src/ui/sales/Sheet';
import { STAGE_TONE } from '@/src/ui/sales/QualificationBoard';
import {
  activityDelta,
  qualificationSummary,
  teamTaskRows,
  type MonthlyBucket,
  type Qualification,
  type SalesFocus,
  type SalesPerformance,
} from '@/src/ui/sales/sales-logic';
import { activityBucketLabel, CHART_RANGE_MONTHS, type ChartRange, type WorkSignal } from '@/src/ui/sales/dashboard-logic';
import { currentPeriod, periodLabelLong, STATUS_META } from '@/src/ui/sales/targets-logic';

export function opportunitiesHref(params: { focus?: SalesFocus; stageCode?: string; stageName?: string; qualification?: string }): Href {
  return { pathname: '/(tabs)/modules/opportunities', params } as unknown as Href;
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-start justify-between gap-2">
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" className="font-display-semibold text-[17px] text-foreground">
          {title}
        </Text>
        {hint ? <Text className="font-inter text-[12px] text-muted-foreground">{hint}</Text> : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          className="min-h-[44px] flex-row items-center gap-1 px-1 active:opacity-60"
        >
          <Text className="font-inter-medium text-[13px] text-primary">{action.label}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function MetricTile({
  label,
  value,
  hint,
  valueTone,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  hint?: string;
  valueTone?: Tone;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ disabled: Boolean(disabled || !onPress) }}
      disabled={disabled || !onPress}
      onPress={onPress}
      className="min-h-[64px] flex-1 rounded-[12px] border border-border bg-canvas px-3 py-2.5 active:opacity-70"
    >
      <Text className="font-inter-medium text-[11px] uppercase text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="mt-0.5 font-display-semibold text-[20px] text-foreground"
        style={valueTone ? { color: toneColor(colors, valueTone) } : undefined}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hint ? (
        <Text className="font-inter text-[11px] leading-[14px] text-muted-foreground" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Pills<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (next: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            className={`min-h-[44px] justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}
          >
            <Text className={`font-inter-medium text-[13px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------ brifing ---- */

export function DashboardBriefing({
  firstName,
  counts,
  onToday,
  onOverdue,
}: {
  firstName: string;
  counts: { total: number; critical: number; warning: number };
  onToday: () => void;
  onOverdue: () => void;
}) {
  const { colors } = useTheme();
  const today = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', weekday: 'long' }).format(new Date());
  return (
    <View className="gap-3 rounded-[16px] bg-primary p-4">
      <View className="gap-1">
        <Text className="font-inter-semibold text-[11px] uppercase text-primary-foreground opacity-80">{`Günlük operasyon brifingi · ${today}`}</Text>
        <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-primary-foreground">
          {`Hoş geldin ${firstName}`}
        </Text>
        <Text className="font-inter text-[13px] text-primary-foreground opacity-80">
          {`Bugün ${counts.total} takip işi var; ${counts.critical} kritik, ${counts.warning} yakın takip.`}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bugün"
          onPress={onToday}
          className="min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-[10px] bg-white/15 active:opacity-70"
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primaryForeground} />
          <Text className="font-inter-semibold text-[14px] text-primary-foreground">Bugün</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gecikenler"
          onPress={onOverdue}
          className="min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-[10px] bg-card active:opacity-70"
        >
          <Text className="font-inter-semibold text-[14px] text-primary">Gecikenler</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- görevler ---- */

const TASK_METRICS = [
  { view: 'mine', label: 'Bana atanan açık' },
  { view: 'today', label: 'Bugün' },
  { view: 'overdue', label: 'Geciken' },
  { view: 'upcoming', label: 'Yaklaşan' },
  { view: 'all', label: 'Toplam görev' },
  { view: 'completed', label: 'Tamamlanan' },
] as const;

export function DashboardTasksPanel() {
  const router = useRouter();
  const canRead = useCan('tasks.read');
  const canManage = useCan('tasks.manage');
  const counts = useTaskCounts();
  const mine = useTaskList({ view: 'mine' });
  const summary = useTasksSummary(canRead && canManage);
  if (!canRead) return null;

  const tasks = [...(mine.data?.data ?? [])]
    .filter((task) => task.status !== 'done' && task.status !== 'cancelled')
    .sort((a, b) => (Date.parse(a.dueAt ?? '') || Infinity) - (Date.parse(b.dueAt ?? '') || Infinity))
    .slice(0, 5);
  const team = teamTaskRows(summary.data ?? []);
  const goTasks = () => router.push('/(tabs)/modules/tasks' as Href);

  return (
    <Card className="gap-3">
      <SectionTitle
        title="Görev takibi"
        hint={
          canManage
            ? 'Bugün, geciken ve yaklaşan sayıları seçili bölümde görebildiğiniz ekip görevlerini kapsar.'
            : 'Bugün, geciken ve yaklaşan sayıları size atanan veya sizin oluşturduğunuz görevleri kapsar.'
        }
        action={{ label: 'Tüm görevler', onPress: goTasks }}
      />
      {counts.isPending ? (
        <Loading />
      ) : counts.error ? (
        <ErrorState message="Görev takibi yüklenemedi. Lütfen yeniden deneyin." onRetry={() => void counts.refetch()} />
      ) : (
        <View className="gap-2">
          {[0, 2, 4].map((start) => (
            <View key={start} className="flex-row gap-2">
              {TASK_METRICS.slice(start, start + 2).map((metric) => {
                const count = counts.data?.[metric.view] ?? 0;
                return (
                  <MetricTile
                    key={metric.view}
                    label={metric.label}
                    value={String(count)}
                    valueTone={metric.view === 'overdue' && count > 0 ? 'destructive' : undefined}
                    onPress={goTasks}
                  />
                );
              })}
            </View>
          ))}
        </View>
      )}
      <Text className="font-inter-medium text-[12px] text-muted-foreground">Bana atananlar · son tarihe göre</Text>
      {mine.isPending ? null : tasks.length === 0 ? (
        <Text className="font-inter text-[13px] text-muted-foreground">Size atanmış açık görev yok.</Text>
      ) : (
        tasks.map((task) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            accessibilityLabel={task.title}
            onPress={() => router.push(`/(tabs)/modules/tasks/${task.id}` as Href)}
            className="min-h-[44px] flex-row items-center gap-2 border-t border-border py-2 active:opacity-70"
          >
            <View className="min-w-0 flex-1">
              <Text className="font-inter-medium text-[14px] text-foreground" numberOfLines={1}>
                {task.title}
              </Text>
              <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                {task.company?.shortName ?? task.company?.legalTitle ?? task.opportunity?.title ?? 'İlgili kayıt yok'}
              </Text>
            </View>
            <Text className={`font-inter text-[12px] ${task.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {task.dueAt ? formatDate(task.dueAt) : 'Tarih yok'}
            </Text>
          </Pressable>
        ))
      )}
      {canManage ? (
        <View className="gap-1 border-t border-border pt-3">
          <Text className="font-inter-medium text-[12px] text-muted-foreground">Ekip görev durumu</Text>
          {summary.isPending ? (
            <Loading />
          ) : team.length === 0 ? (
            <Text className="font-inter text-[12px] text-muted-foreground">Kimsenin üzerinde açık görev yok.</Text>
          ) : (
            <>
              <View className="flex-row py-1">
                <Text className="flex-1 font-inter-medium text-[11px] text-muted-foreground">Kişi</Text>
                {['Açık', 'Gecikmiş', 'Tamamlanan'].map((label) => (
                  <Text key={label} className="w-[72px] text-right font-inter-medium text-[11px] text-muted-foreground">
                    {label}
                  </Text>
                ))}
              </View>
              {team.map((row) => (
                <View key={row.userId} className="flex-row border-t border-border py-1.5">
                  <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={1}>
                    {row.fullName}
                  </Text>
                  <Text className="w-[72px] text-right font-inter text-[13px] text-foreground">{row.open}</Text>
                  <Text className={`w-[72px] text-right text-[13px] ${row.overdue > 0 ? 'font-inter-semibold text-destructive' : 'font-inter text-foreground'}`}>
                    {row.overdue}
                  </Text>
                  <Text className="w-[72px] text-right font-inter text-[13px] text-foreground">{row.completed}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------ ekip aktivitesi ---- */

const PERIOD_LABELS: Record<TeamActivityPeriod, string> = { day: 'Bugün', week: 'Bu hafta', month: 'Bu ay', year: 'Bu yıl' };
const PREVIOUS_LABELS: Record<TeamActivityPeriod, string> = {
  day: 'düne göre',
  week: 'geçen haftaya göre',
  month: 'geçen aya göre',
  year: 'geçen yıla göre',
};
const ACTIVITY_METRICS: { key: Exclude<TeamActivityMetric, 'all'>; label: string }[] = [
  { key: 'quotes', label: 'Teklif' },
  { key: 'activities', label: 'Aktivite' },
  { key: 'opportunitiesCreated', label: 'Yeni fırsat' },
  { key: 'won', label: 'Kazanılan' },
];
const METRIC_TITLES: Record<TeamActivityMetric, string> = {
  all: 'Tüm kayıtlar',
  quotes: 'Teklifler',
  activities: 'Aktiviteler',
  opportunitiesCreated: 'Yeni fırsatlar',
  won: 'Kazanılan fırsatlar',
};

function DeltaText({ current, previous, suffix }: { current: number; previous: number; suffix: string }) {
  const { pct, dir } = activityDelta(current, previous);
  const cls = dir === 'up' ? 'text-success' : dir === 'down' ? 'text-destructive' : 'text-muted-foreground';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  return <Text className={`font-inter-medium text-[11px] ${cls}`}>{`${arrow} ${pct === null ? 'yeni' : `%${Math.abs(pct)}`} ${suffix}`}</Text>;
}

type DetailTarget = { metric: TeamActivityMetric; user?: { id: string; name: string } };

function ActivityDetailsBody({ period, scope, target }: { period: TeamActivityPeriod; scope: 'team' | 'self'; target: DetailTarget }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const details = useTeamActivityDetails({ period, scope, metric: target.metric, userId: target.user?.id }, true);
  if (details.isPending) return <Loading />;
  if (details.error) return <ErrorState message={details.error.message || 'Aktivite detayları yüklenemedi.'} onRetry={() => void details.refetch()} />;
  if (details.data.items.length === 0) {
    return (
      <View className="items-center gap-1 py-6">
        <Text className="font-inter-medium text-[14px] text-foreground">Bu seçimde kayıt yok</Text>
        <Text className="font-inter text-[12px] text-muted-foreground">Başka bir dönem veya aktivite türü seçebilirsiniz.</Text>
      </View>
    );
  }
  return (
    <View className="gap-2">
      {details.data.items.map((item) => {
        const open = expanded === item.id;
        const content = item.content;
        const lines = content
          ? ([
              ['Not / Ayrıntı', content.detail],
              ['Sonuç', content.result],
              ['Konum', content.location],
              ['Sonraki aksiyon', content.nextAction],
              ['Sonraki takip', content.followUpAt ? formatDate(content.followUpAt) : null],
            ].filter(([, value]) => Boolean(value)) as [string, string][])
          : [];
        return (
          <View key={`${item.source}-${item.id}`} className="gap-1 rounded-[12px] border border-border p-3">
            <View className="flex-row items-center gap-2">
              <Chip tone="info" label={item.typeName} />
              <Text className="ml-auto font-inter text-[11px] text-muted-foreground">{formatDate(item.occurredAt)}</Text>
            </View>
            <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={2}>
              {item.title}
            </Text>
            <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
              {`${item.userName} · ${item.company.name ?? 'Firma bilgisi görünmüyor'}`}
            </Text>
            <View className="flex-row gap-2">
              {content ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={open ? 'İçeriği kapat' : 'İçeriği gör'}
                  onPress={() => setExpanded(open ? null : item.id)}
                  className="min-h-[44px] justify-center active:opacity-60"
                >
                  <Text className="font-inter-medium text-[13px] text-primary">{open ? 'İçeriği kapat' : 'İçeriği gör'}</Text>
                </Pressable>
              ) : null}
              {item.company.id ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Firmayı aç"
                  onPress={() => router.push(`/(tabs)/modules/companies/${item.company.id}` as Href)}
                  className="min-h-[44px] justify-center active:opacity-60"
                >
                  <Text className="font-inter-medium text-[13px] text-primary">Firmayı aç</Text>
                </Pressable>
              ) : null}
            </View>
            {open ? (
              lines.length ? (
                lines.map(([label, value]) => (
                  <Text key={label} className="font-inter text-[12px] text-foreground">
                    <Text className="font-inter-semibold">{`${label}: `}</Text>
                    {value}
                  </Text>
                ))
              ) : (
                <Text className="font-inter text-[12px] text-muted-foreground">Bu kayıt için ek içerik girilmemiş.</Text>
              )
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function TeamActivityPanel() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const canRead = useCan('reports.read');
  const isSuperAdmin = Boolean(user?.roles?.includes('super_admin'));
  const [period, setPeriod] = useState<TeamActivityPeriod>('week');
  const [scope, setScope] = useState<'team' | 'self'>('team');
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const report = useTeamActivity(period, scope, canRead);
  if (!canRead) return null;

  const data: TeamActivityReport | undefined = report.data;
  const effectiveScope = data?.scope ?? scope;
  const openDetails = (metric: TeamActivityMetric, target?: { id: string; name: string }) => {
    setDetail({ metric, user: target });
    sheetRef.current?.present();
  };
  const ranked = [...(data?.users ?? [])].sort((a, b) => b.total.current - a.total.current || a.name.localeCompare(b.name, 'tr-TR'));
  const stack = (data?.timeline ?? []).map((row) => ({
    label: activityBucketLabel(row.bucket, data?.bucket ?? 'day'),
    stacks: [
      { value: row.quotes, color: colors.chart1 },
      { value: row.activities, color: colors.success },
    ],
  }));

  return (
    <Card className="gap-3">
      <SectionTitle
        title={effectiveScope === 'self' ? 'Benim aktivitem' : 'Ekip aktivitesi'}
        hint={data ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : undefined}
        action={data && data.users.length ? { label: 'Tüm kayıtlar', onPress: () => openDetails('all') } : undefined}
      />
      {isSuperAdmin ? (
        <Pills
          options={[
            { value: 'team', label: 'Tüm ekip' },
            { value: 'self', label: 'Sadece ben' },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : effectiveScope === 'self' ? (
        <Chip tone="neutral" label="Kendi verileriniz" />
      ) : null}
      <Pills options={(Object.keys(PERIOD_LABELS) as TeamActivityPeriod[]).map((value) => ({ value, label: PERIOD_LABELS[value] }))} value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Text className="font-inter text-[12px] text-muted-foreground">Aktiviteler yükleniyor…</Text>
      ) : report.error ? (
        <ErrorState message={report.error.message || 'Aktivite raporu yüklenemedi.'} onRetry={() => void report.refetch()} />
      ) : data ? (
        <>
          <View className="gap-2">
            {[0, 2].map((start) => (
              <View key={start} className="flex-row gap-2">
                {ACTIVITY_METRICS.slice(start, start + 2).map((metric) => {
                  const current = data.totals[metric.key];
                  return (
                    <Pressable
                      key={metric.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${metric.label} kayıtlarını aç: ${current}`}
                      disabled={current === 0}
                      onPress={() => openDetails(metric.key)}
                      className={`min-h-[64px] flex-1 rounded-[12px] border border-border bg-canvas px-3 py-2.5 active:opacity-70 ${current === 0 ? 'opacity-60' : ''}`}
                    >
                      <Text className="font-inter-medium text-[11px] uppercase text-muted-foreground">{metric.label}</Text>
                      <Text className="font-display-semibold text-[20px] text-foreground">{current}</Text>
                      <DeltaText current={current} previous={data.previousTotals[metric.key]} suffix={PREVIOUS_LABELS[period]} />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {stack.some((row) => row.stacks.some((s) => s.value > 0)) ? (
            <View className="gap-1.5">
              <BarChart
                stackData={stack}
                barWidth={14}
                spacing={12}
                initialSpacing={8}
                noOfSections={4}
                height={150}
                yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
                yAxisColor={colors.chartGrid}
                xAxisColor={colors.chartGrid}
                rulesColor={colors.chartGrid}
              />
              <View className="flex-row gap-3">
                <Legend color={colors.chart1} label="Teklif" />
                <Legend color={colors.success} label="Aktivite" />
              </View>
            </View>
          ) : null}
          {effectiveScope === 'team' && ranked.length ? (
            <View className="gap-0.5">
              <Text className="font-inter-medium text-[12px] text-muted-foreground">Kullanıcı · Toplam Faaliyet</Text>
              {ranked.map((row, index) => (
                <Pressable
                  key={row.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.name} için tüm aktivite kayıtlarını aç`}
                  disabled={row.total.current === 0 && row.won.current === 0}
                  onPress={() => openDetails('all', { id: row.userId, name: row.name })}
                  className="min-h-[44px] flex-row items-center gap-2 border-t border-border py-1.5 active:opacity-70"
                >
                  <Text className="w-6 font-inter-semibold text-[12px] text-muted-foreground">
                    {index === 0 && row.total.current > 0 ? '★' : String(index + 1)}
                  </Text>
                  <View className="min-w-0 flex-1">
                    <Text className="font-inter-medium text-[13px] text-foreground" numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
                      {ACTIVITY_METRICS.map((metric) => `${metric.label} ${row[metric.key].current} (${row[metric.key].previous})`).join(' · ')}
                    </Text>
                  </View>
                  <Text className="font-inter-semibold text-[14px] text-foreground">{row.total.current}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <SalesSheet
        ref={sheetRef}
        title={detail ? `${detail.user ? detail.user.name : effectiveScope === 'team' ? 'Ekip' : 'Kendi kayıtlarım'} · ${METRIC_TITLES[detail.metric]}` : 'Aktivite detayları'}
        subtitle={PERIOD_LABELS[period]}
        onDismiss={() => setDetail(null)}
      >
        {detail ? <ActivityDetailsBody period={period} scope={effectiveScope} target={detail} /> : null}
      </SalesSheet>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
    </View>
  );
}

/* --------------------------------------------------- satış performansı ---- */

function money(total: { currency: string; total: number } | null): string {
  return total ? formatAmount(total.total, total.currency) : '—';
}

export function SalesPerformancePanel({ performance, truncated }: { performance: SalesPerformance; truncated: boolean }) {
  const router = useRouter();
  const go = (focus?: SalesFocus) => router.push(opportunitiesHref(focus ? { focus } : {}));
  return (
    <Card className="gap-3">
      <SectionTitle
        title="Satış Performansı"
        hint={`Açık ve kapanmış kartlardan türetilen yönetim metrikleri${truncated ? ' · ilk 800 kart' : ''}`}
      />
      <View className="flex-row gap-2">
        <MetricTile
          label="Kazanma Oranı"
          value={performance.winRate == null ? '—' : `%${performance.winRate}`}
          hint={`${performance.wonCount} kazanıldı · ${performance.lostCount} kaybedildi`}
          onPress={() => go('won')}
        />
        <MetricTile
          label="Satış Döngüsü"
          value={performance.avgCycleDays == null ? '—' : `${performance.avgCycleDays} gün`}
          hint={performance.avgCycleDays == null ? 'Kapanış tarihi olan kart yok' : 'Kazanılan kartların ortalaması'}
          onPress={() => go()}
        />
      </View>
      <View className="flex-row gap-2">
        <MetricTile
          label="Ortalama Fırsat"
          value={performance.openCount ? money(performance.avgDeal) : '—'}
          hint={`${performance.openCount} açık kart`}
          onPress={() => go('open')}
        />
        <MetricTile
          label="Pipeline Hızı"
          value={performance.velocityPerDay == null ? '—' : `${money(performance.velocityPerDay)}/gün`}
          hint={performance.velocityPerDay == null ? 'Kazanma oranı veya döngü süresi eksik' : 'Beklenen günlük kazanç akışı'}
          onPress={() => go('open')}
        />
      </View>
    </Card>
  );
}

export function QualificationPanel({ rows }: { rows: Pick<SalesOpportunityRow, 'qualificationStage'>[] }) {
  const router = useRouter();
  const { colors } = useTheme();
  const summary = qualificationSummary(rows);
  return (
    <Card className="gap-3">
      <SectionTitle title="Satış dereceleri" hint="Lead → C → B → A → A+ → WIN → LOST sırasıyla kart dağılımı." />
      <View className="flex-row flex-wrap gap-2">
        {summary.map((item) => (
          <Pressable
            key={item.stage}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.count}. Fırsatları aç`}
            onPress={() => router.push(opportunitiesHref({ qualification: item.stage }))}
            className="min-h-[64px] min-w-[30%] flex-1 rounded-[12px] border border-border bg-canvas px-3 py-2 active:opacity-70"
          >
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, STAGE_TONE[item.stage as Qualification]) }} />
              <Text className="font-inter-semibold text-[13px] text-foreground">{item.label}</Text>
            </View>
            <Text className="font-display-semibold text-[22px] text-foreground">{item.count}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------- sinyaller ---- */

const SEVERITY_META: Record<WorkSignal['severity'], { label: string; tone: Tone; icon: keyof typeof Ionicons.glyphMap }> = {
  critical: { label: 'Kritik', tone: 'destructive', icon: 'alert-circle-outline' },
  warning: { label: 'Takip', tone: 'warning', icon: 'time-outline' },
  info: { label: 'Bilgi', tone: 'info', icon: 'information-circle-outline' },
};

export function signalHref(signal: WorkSignal): Href {
  switch (signal.target.kind) {
    case 'opportunities':
      return opportunitiesHref({ focus: signal.target.focus });
    case 'tasks':
      return '/(tabs)/modules/tasks' as Href;
    case 'receivables':
      return '/(tabs)/modules/receivables' as Href;
    case 'service':
      return '/(tabs)/modules/service-tickets' as Href;
  }
}

export function SignalList({ title, hint, signals, empty, limit }: { title: string; hint?: string; signals: WorkSignal[]; empty: string; limit?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const list = limit ? signals.slice(0, limit) : signals;
  return (
    <Card className="gap-2">
      <SectionTitle title={title} hint={hint} />
      {list.length === 0 ? (
        <Text className="font-inter text-[13px] text-muted-foreground">{empty}</Text>
      ) : (
        list.map((signal) => {
          const meta = SEVERITY_META[signal.severity];
          return (
            <Pressable
              key={signal.id}
              accessibilityRole="button"
              accessibilityLabel={`${meta.label}: ${signal.title}, ${signal.detail}`}
              onPress={() => router.push(signalHref(signal))}
              className="min-h-[52px] flex-row items-center gap-3 border-t border-border py-2 active:opacity-70"
            >
              <Ionicons name={meta.icon} size={20} color={toneColor(colors, meta.tone)} />
              <View className="min-w-0 flex-1">
                <Text className="font-inter-semibold text-[14px] text-foreground">{signal.title}</Text>
                <Text className="font-inter text-[12px] text-muted-foreground">{signal.detail}</Text>
              </View>
              <Chip tone={meta.tone} label={meta.label} />
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

/* ------------------------------------------------------------- grafikler ---- */

export function MonthlySalesChart({ buckets, title, hint }: { buckets: MonthlyBucket[]; title: string; hint: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [range, setRange] = useState<ChartRange>('6A');
  const view = buckets.slice(-CHART_RANGE_MONTHS[range]);
  const hasData = view.some((b) => b.quotes > 0 || b.won > 0);
  return (
    <Card className="gap-3">
      <SectionTitle title={title} hint={hint} action={{ label: 'Kazanılanlar', onPress: () => router.push(opportunitiesHref({ focus: 'won' })) }} />
      <Pills options={(Object.keys(CHART_RANGE_MONTHS) as ChartRange[]).map((value) => ({ value, label: value }))} value={range} onChange={setRange} />
      {hasData ? (
        <>
          <LineChart
            data={view.map((b) => ({ value: b.quotes, label: b.label }))}
            data2={view.map((b) => ({ value: b.won }))}
            curved
            areaChart
            height={160}
            initialSpacing={10}
            spacing={view.length > 6 ? 26 : 44}
            color1={colors.chart1}
            color2={colors.success}
            startFillColor1={colors.chart1}
            startFillColor2={colors.success}
            startOpacity={0.25}
            endOpacity={0.02}
            dataPointsColor1={colors.chart1}
            dataPointsColor2={colors.success}
            noOfSections={4}
            yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
            yAxisColor={colors.chartGrid}
            xAxisColor={colors.chartGrid}
            rulesColor={colors.chartGrid}
          />
          <View className="flex-row gap-3">
            <Legend color={colors.chart1} label="Teklif" />
            <Legend color={colors.success} label="Kazanan" />
          </View>
        </>
      ) : (
        <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Bu dönemde teklif kaydı yok.</Text>
      )}
    </Card>
  );
}

export function StageDistribution({ stages }: { stages: { code: string; label: string; value: number }[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const palette = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5];
  const slices = stages.filter((stage) => stage.value > 0);
  const total = slices.reduce((sum, stage) => sum + stage.value, 0);
  return (
    <Card className="gap-3">
      <SectionTitle title="Fırsat Dağılımı" hint={`Aşamalara göre kart sayısı · satıra dokunun · ${total} açık kart`} />
      {slices.length === 0 ? (
        <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Açık satış kartı yok</Text>
      ) : (
        <View className="flex-row items-center gap-3">
          <PieChart donut radius={62} innerRadius={40} data={slices.map((stage, index) => ({ value: stage.value, color: palette[index % palette.length] }))} />
          <View className="flex-1">
            {slices.map((stage, index) => (
              <Pressable
                key={stage.code}
                accessibilityRole="button"
                accessibilityLabel={`${stage.label}: ${stage.value} kart`}
                onPress={() => router.push(opportunitiesHref({ stageCode: stage.code, stageName: stage.label }))}
                className="min-h-[44px] flex-row items-center gap-2 active:opacity-70"
              >
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={1}>
                  {stage.label}
                </Text>
                <Text className="font-inter-semibold text-[13px] text-foreground">{stage.value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

/** Yatay çubuk listesi (Satış Hunisi / Departman Performansı): her satır dokunulabilir detaya iner. */
export function BarList({
  title,
  hint,
  rows,
  max,
  suffix = '',
}: {
  title: string;
  hint: string;
  rows: { key: string; label: string; value: number | null; href: Href }[];
  max?: number;
  suffix?: string;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const top = max ?? Math.max(1, ...rows.map((row) => row.value ?? 0));
  return (
    <Card className="gap-2">
      <SectionTitle title={title} hint={hint} />
      {rows.length === 0 ? (
        <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Henüz veri yok.</Text>
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.value == null ? 'ölçülemedi' : `${row.value}${suffix}`}`}
            onPress={() => router.push(row.href)}
            className="min-h-[44px] justify-center gap-1 active:opacity-70"
          >
            <View className="flex-row justify-between">
              <Text className="font-inter text-[13px] text-foreground" numberOfLines={1}>
                {row.label}
              </Text>
              <Text className="font-inter-semibold text-[13px] text-foreground">{row.value == null ? '—' : `${row.value}${suffix}`}</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View className="h-2 rounded-full" style={{ width: `${Math.min(100, ((row.value ?? 0) / top) * 100)}%`, backgroundColor: colors.chart1 }} />
            </View>
          </Pressable>
        ))
      )}
    </Card>
  );
}

export function RevenueChart({ buckets, currency }: { buckets: MonthlyBucket[]; currency: string }) {
  const { colors } = useTheme();
  const hasData = buckets.some((b) => b.revenue > 0);
  return (
    <Card className="gap-3">
      <SectionTitle title="Aylık Ciro" hint={`Onaylanan teklifler · ${currency}`} />
      {hasData ? (
        <LineChart
          data={buckets.map((b) => ({ value: b.revenue, label: b.label }))}
          height={160}
          initialSpacing={10}
          spacing={26}
          color={colors.chart1}
          thickness={2.5}
          dataPointsColor={colors.chart1}
          noOfSections={4}
          yAxisLabelWidth={44}
          formatYLabel={(label) => {
            const n = Number(label);
            return n >= 1000 ? `${Math.round(n / 1000)}B` : label;
          }}
          yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
          yAxisColor={colors.chartGrid}
          xAxisColor={colors.chartGrid}
          rulesColor={colors.chartGrid}
        />
      ) : (
        <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Son 12 ayda onaylanan teklif yok.</Text>
      )}
    </Card>
  );
}

export function WonLostChart({ buckets }: { buckets: MonthlyBucket[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const data = buckets.flatMap((b) => [
    { value: b.won, frontColor: colors.success, spacing: 2, label: b.label, labelWidth: 30, onPress: () => router.push(opportunitiesHref({ focus: 'won' })) },
    { value: b.lost, frontColor: colors.destructive, spacing: 12, onPress: () => router.push(opportunitiesHref({ focus: 'lost' })) },
  ]);
  const hasData = data.some((d) => d.value > 0);
  return (
    <Card className="gap-3">
      <SectionTitle title="Kazanan vs Kaybedilen" hint="Aylık karşılaştırma · çubuğa dokunun" />
      {hasData ? (
        <>
          <BarChart
            data={data}
            barWidth={10}
            initialSpacing={8}
            noOfSections={4}
            height={150}
            yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
            yAxisColor={colors.chartGrid}
            xAxisColor={colors.chartGrid}
            rulesColor={colors.chartGrid}
          />
          <View className="flex-row gap-3">
            <Legend color={colors.success} label="Kazanan" />
            <Legend color={colors.destructive} label="Kaybedilen" />
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Kazanılanlar" variant="ghost" onPress={() => router.push(opportunitiesHref({ focus: 'won' }))} />
            </View>
            <View className="flex-1">
              <Button label="Kaybedilenler" variant="ghost" onPress={() => router.push(opportunitiesHref({ focus: 'lost' }))} />
            </View>
          </View>
        </>
      ) : (
        <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Son 12 ayda kazanılan veya kaybedilen kart yok.</Text>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- hedefler ---- */

export function MyTargetsPanel() {
  const router = useRouter();
  const { colors } = useTheme();
  const period = useMemo(() => currentPeriod(), []);
  const progress = useMyTargetProgress(period);
  const goTargets = () => router.push('/(tabs)/modules/targets' as Href);
  return (
    <Card className="gap-3">
      <SectionTitle title="Hedeflerim" hint={periodLabelLong(period)} action={{ label: 'Hedef çalışma alanı', onPress: goTargets }} />
      {progress.isPending ? (
        <Loading />
      ) : progress.error ? (
        <ErrorState message={progress.error.message} onRetry={() => void progress.refetch()} />
      ) : progress.data.lines.length === 0 ? (
        <Text className="font-inter text-[13px] text-muted-foreground">Bu dönem hedefi yok</Text>
      ) : (
        <>
          <View className="flex-row gap-2">
            <MetricTile label="Ortalama" value={progress.data.averagePct == null ? '—' : `%${Math.round(progress.data.averagePct)}`} onPress={goTargets} />
            <MetricTile label="Beklenen" value={`%${Math.round(progress.data.expectedPct)}`} onPress={goTargets} />
            <MetricTile label="Tamamlanan" value={String(progress.data.achievedCount)} onPress={goTargets} />
          </View>
          {progress.data.lines.map((line) => {
            const meta = STATUS_META[line.status];
            const pct = line.pct == null ? null : Math.round(line.pct);
            return (
              <View key={line.id} className="gap-1 border-t border-border pt-2">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={1}>
                    {line.label}
                  </Text>
                  <Chip tone={meta.tone as Tone} label={meta.label} />
                </View>
                <View className="h-2 overflow-hidden rounded-full bg-muted">
                  <View
                    className="h-2 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, backgroundColor: toneColor(colors, meta.tone as Tone) }}
                  />
                </View>
                <Text className="font-inter text-[11px] text-muted-foreground">
                  {pct == null ? 'Manuel takip' : `%${pct} · hedef ${line.target} ${line.unit}`}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </Card>
  );
}
