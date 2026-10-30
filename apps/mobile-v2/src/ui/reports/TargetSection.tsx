import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { usePreviousTargetProgress, useTargetProgress } from '@/src/api/reports.hooks';
import { reportExports } from '@/src/api/reports.api';
import { useCan } from '@/src/auth/AuthProvider';
import type { Tone } from '@/src/theme/theme';
import { Card, Chip, EmptyState, ErrorState, FilterChips, Loading } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { ActionButton, ChoiceChips, Kpi, KpiRow, Stepper } from './parts';
import {
  TARGET_STATUS_LABELS,
  analyzeTargetSubject,
  averageCompletion,
  departmentProgress,
  currentMonth,
  daysLeftInPeriod,
  inDepartment,
  metricLineText,
  monthTitle,
  previousPeriod,
  shiftMonth,
  sortPeople,
  sumMetrics,
  type PersonTarget,
  type TargetStatus,
} from './reportMath';

const STATUS_TONE: Record<TargetStatus, Tone> = {
  completed: 'success',
  on_track: 'info',
  at_risk: 'warning',
  missed: 'destructive',
  scheduled: 'neutral',
  manual: 'neutral',
  no_target: 'neutral',
};

export function TargetSection() {
  const canExport = useCan('reports.export');
  const [period, setPeriod] = useState(currentMonth());
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'problems'>('all');
  const users = useTargetProgress(period, 'all-users');
  const departments = useTargetProgress(period, 'department');
  const previous = usePreviousTargetProgress(previousPeriod(period));

  const expectedPct = Number(users.data?.expectedProgressPct ?? departments.data?.expectedProgressPct ?? 0) || 0;
  const previousPct = useMemo(() => {
    const map = new Map<string, number | null>();
    const prev = previousPeriod(period);
    for (const row of previous.data?.subjects ?? []) map.set(row.subject.id, analyzeTargetSubject(row, 100, prev).completionPct);
    return map;
  }, [previous.data, period]);

  const people = useMemo<PersonTarget[]>(
    () =>
      sortPeople(
        (users.data?.subjects ?? []).map((row) => ({
          row,
          analysis: analyzeTargetSubject(row, expectedPct, period),
          previousPct: previousPct.get(row.subject.id) ?? null,
        })),
      ),
    [users.data, expectedPct, period, previousPct],
  );
  const departmentRows = departments.data?.subjects ?? [];
  const scoped = people.filter((p) => inDepartment(p, departmentId));
  const isProblem = (p: PersonTarget) => p.analysis.status === 'at_risk' || p.analysis.status === 'missed';
  const visible = scoped.filter((p) => filter === 'all' || isProblem(p));
  const average = averageCompletion(scoped);
  const daysLeft = daysLeftInPeriod(period);
  const teamMetrics = sumMetrics(scoped.map((p) => p.analysis.metrics));
  const noTargetNames = scoped.filter((p) => p.analysis.status === 'no_target').map((p) => p.row.subject.name);
  const fx = users.data?.currencyNormalization;

  return (
    <View className="gap-4">
      <Stepper label={monthTitle(period)} onPrev={() => setPeriod(shiftMonth(period, -1))} onNext={() => setPeriod(shiftMonth(period, 1))} />
      {departmentRows.length > 0 ? (
        <FilterChips
          allLabel="Tüm departmanlar"
          options={departmentRows.map((d) => ({ value: d.subject.id, label: d.subject.name }))}
          value={departmentId}
          onChange={setDepartmentId}
        />
      ) : null}
      <ChoiceChips
        label="Görünüm"
        options={[{ value: 'all', label: 'Tüm ekip' }, { value: 'problems', label: 'Eksik / riskli' }]}
        value={filter}
        onChange={setFilter}
      />
      {canExport ? (
        <View className="flex-row">
          <ActionButton icon="download-outline" label="Excel Raporu" run={() => reportExports.targetProgress(period)} disabled={!users.data} />
        </View>
      ) : null}

      {users.isPending ? (
        <Loading />
      ) : users.error ? (
        <ErrorState message={users.error.message || 'Hedef raporu yüklenemedi'} onRetry={() => void users.refetch()} />
      ) : (
        <>
          <KpiRow>
            <Kpi label="Ortalama gerçekleşme" value={average == null ? '—' : `%${average}`} tone="info" />
            <Kpi label="Beklenen ilerleme" value={`%${expectedPct}`} />
          </KpiRow>
          <KpiRow>
            <Kpi label="Tamamlandı" value={String(scoped.filter((p) => p.analysis.status === 'completed').length)} tone="success" />
            <Kpi label="Riskte" value={String(scoped.filter((p) => p.analysis.status === 'at_risk').length)} tone="warning" />
            <Kpi label="Tamamlanmadı" value={String(scoped.filter((p) => p.analysis.status === 'missed').length)} tone="destructive" />
          </KpiRow>
          <Text className="px-1 font-inter text-[11px] text-muted-foreground">
            Fatura, teklif, sipariş, tahsilat, ziyaret, arama, servis ve kurulum kayıtlarından anlık hesaplanır. Kalan gün: {daysLeft}
            {fx ? ` · Ciro USD, kur ${fx.rateDate}` : ''}
          </Text>

          {teamMetrics.length > 0 ? (
            <Card className="gap-2">
              <Text className="font-inter-semibold text-base text-foreground">Ekip geneli</Text>
              {teamMetrics.map((line) => (
                <ProgressBar key={line.label} label={`${line.label}: ${metricLineText(line, daysLeft)}`} done={line.actual} total={line.target} tone={line.pct >= 100 ? 'success' : line.pct + 10 < expectedPct ? 'warning' : 'info'} />
              ))}
            </Card>
          ) : null}

          {departmentRows.length > 0 ? (
            <Card className="gap-3">
              <Text className="font-inter-semibold text-base text-foreground">Departmanlar</Text>
              {departmentRows
                .filter((d) => !departmentId || d.subject.id === departmentId)
                .map((d) => {
                  const members = people.filter((p) => inDepartment(p, d.subject.id));
                  const own = analyzeTargetSubject(d, expectedPct, period);
                  const { completionPct: pctValue, status } = departmentProgress(own, members, expectedPct, period);
                  const problems = members.filter(isProblem).length;
                  return (
                    <View key={d.subject.id} className="gap-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 font-inter-semibold text-sm text-foreground" numberOfLines={1}>{d.subject.name}</Text>
                        <Chip tone={STATUS_TONE[status]} label={TARGET_STATUS_LABELS[status]} />
                      </View>
                      <Text className="font-inter text-xs text-muted-foreground">
                        {members.length} kişi · {problems} riskli/eksik · {pctValue == null ? 'Otomatik veri yok' : `%${pctValue}`}
                      </Text>
                      {own.metrics.map((line) => (
                        <Text key={line.label} className="font-inter text-xs text-foreground">{line.label}: {metricLineText(line, daysLeft)}</Text>
                      ))}
                    </View>
                  );
                })}
            </Card>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState title={filter === 'problems' ? 'Riskli veya eksik kişi yok' : 'Bu dönem için hedef kaydı yok'} icon="flag-outline" />
          ) : (
            visible.map((person) => (
              <Card key={person.row.subject.id} className="gap-2">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="font-inter-semibold text-base text-foreground" numberOfLines={1}>{person.row.subject.name}</Text>
                    <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                      {person.row.subject.departmentNames?.join(', ') || person.row.subject.departmentName || 'Departman yok'}
                    </Text>
                  </View>
                  <Chip tone={STATUS_TONE[person.analysis.status]} label={TARGET_STATUS_LABELS[person.analysis.status]} />
                </View>
                {person.analysis.completionPct != null ? (
                  <ProgressBar
                    label={`%${person.analysis.completionPct}${person.previousPct != null ? ` · geçen ay %${person.previousPct}` : ''} · beklenen %${expectedPct}`}
                    done={person.analysis.completionPct}
                    total={100}
                    tone={person.analysis.completionPct >= 100 ? 'success' : person.analysis.completionPct + 10 < expectedPct ? 'warning' : 'info'}
                  />
                ) : (
                  <Text className="font-inter text-xs text-muted-foreground">Otomatik veri yok</Text>
                )}
                {person.analysis.metrics.map((line) => (
                  <Text key={line.label} className="font-inter text-xs text-foreground">{line.label}: {metricLineText(line, daysLeft)}</Text>
                ))}
                {person.analysis.manual.map((line) => (
                  <Text key={`m-${line.label}`} className="font-inter text-xs text-muted-foreground">{line.label} (manuel): {line.target}</Text>
                ))}
                {person.row.note?.trim() ? <Text className="font-inter text-xs italic text-muted-foreground">{person.row.note.trim()}</Text> : null}
              </Card>
            ))
          )}
          {noTargetNames.length > 0 && filter === 'all' ? (
            <Text className="px-1 font-inter text-xs text-muted-foreground">Hedefi girilmemiş: {noTargetNames.join(', ')}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}
