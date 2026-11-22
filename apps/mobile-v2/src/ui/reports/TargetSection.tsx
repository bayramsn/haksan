import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ApiError, requestContextKey } from '@/src/api/client';
import { useMailAccountStatus } from '@/src/api/crm-general.hooks';
import { stageMailDocument } from '@/src/ui/crm/mail-document-handoff';
import { personTargetHistory, targetRanks } from './target-history';
import { printDocument } from '@/src/native/print-document';
import { shareServerPdf } from '@/src/api/server-pdf';
import { targetReportPrint } from './report-print';
import { Text, View } from 'react-native';
import { usePreviousTargetProgress, useTargetProgress, useTargetHistory } from '@/src/api/reports.hooks';
import { reportExports } from '@/src/api/reports.api';
import { useCan } from '@/src/auth/AuthProvider';
import type { Tone } from '@/src/theme/theme';
import { Card, Chip, EmptyState, ErrorState, FilterChips, Loading } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { ActionButton, ChoiceChips, Kpi, KpiRow, Stepper, SimpleTable } from './parts';
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
  const router = useRouter();
  const mailAccount = useMailAccountStatus();
  const [period, setPeriod] = useState(currentMonth());
  const [historyRequested, setHistoryRequested] = useState<string | null>(null);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const historyKey = JSON.stringify([requestContextKey(), period]);
  const historyActive = historyRequested === historyKey;
  const history = useTargetHistory(period, historyActive);
  const historyData = historyActive ? history.data : undefined;
  const changePeriod = (next: string) => { setHistoryRequested(null); setExpandedPerson(null); setPeriod(next); };
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
  const departmentDenied = departments.error instanceof ApiError && departments.error.status === 403;
  const departmentRows = departmentDenied ? [] : departments.data?.subjects ?? [];
  const selectedDepartmentId = departmentDenied ? null : departmentId;
  const scoped = people.filter((p) => inDepartment(p, selectedDepartmentId));
  const isProblem = (p: PersonTarget) => p.analysis.status === 'at_risk' || p.analysis.status === 'missed';
  const visible = scoped.filter((p) => filter === 'all' || isProblem(p));
  const average = averageCompletion(scoped);
  const daysLeft = daysLeftInPeriod(period);
  const teamMetrics = sumMetrics(scoped.map((p) => p.analysis.metrics));
  const noTargetNames = scoped.filter((p) => p.analysis.status === 'no_target').map((p) => p.row.subject.name);
  const fx = users.data?.currencyNormalization;
  const ranks = useMemo(() => targetRanks(people), [people]);
  const comparable = scoped.filter(person => person.analysis.completionPct != null && person.previousPct != null);
  const previousAveragePct = comparable.length ? Math.round(comparable.reduce((sum, person) => sum + (person.previousPct ?? 0), 0) / comparable.length) : null;
  const departmentError = departments.error && !departmentDenied;
  const exportDisabled = !users.data || users.isFetching || departments.isFetching || Boolean(users.error) || Boolean(departmentError) || (historyActive && history.isFetching);

  function buildPrint(focus?: PersonTarget) {
    const departmentName = departmentRows.find(row => row.subject.id === selectedDepartmentId)?.subject.name || (selectedDepartmentId ? scoped[0]?.row.subject.departmentName || 'Seçili departman' : undefined);
    return targetReportPrint({ period, departmentName, problemsOnly: filter === 'problems', expectedPct, averagePct: average, previousAveragePct, daysLeft, teamMetrics, noTargetNames, people: focus ? [focus] : visible, focusPersonId: focus?.row.subject.id, ranks, departments: departmentRows.filter(row => !selectedDepartmentId || row.subject.id === selectedDepartmentId), scopedPeople: scoped, fx,
      history: historyData ? Object.fromEntries((focus ? [focus] : visible).map(person => [person.row.subject.id, personTargetHistory(historyData, person.row.subject.id)])) : undefined });
  }
  async function shareReport(focus?: PersonTarget) {
    if (!canExport || exportDisabled) return;
    await shareServerPdf('target-report', printDocument(buildPrint(focus)), `hedef-gerceklesme-${period}${focus ? '-kisi' : ''}.pdf`);
  }
  async function mailReport(focus?: PersonTarget) {
    if (!canExport || exportDisabled || !mailAccount.data?.featureEnabled) return;
    const draftId = stageMailDocument({ label: focus ? `Hedef raporu · ${focus.row.subject.name}` : 'Hedef gerçekleşme raporu', subject: `Hedef Gerçekleşme Raporu — ${monthTitle(period)}`, payload: { reportDocument: { html: printDocument(buildPrint(focus)), filename: `hedef-gerceklesme-${period}.pdf` } } });
    router.push({ pathname: '/modal/mail-compose', params: { draftId } });
  }


  return (
    <View className="gap-4">
      <Stepper label={monthTitle(period)} onPrev={() => changePeriod(shiftMonth(period, -1))} onNext={() => changePeriod(shiftMonth(period, 1))} />
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
        <View className="flex-row flex-wrap gap-2">
          <ActionButton icon="download-outline" label="Excel Raporu" run={() => reportExports.targetProgress(period)} disabled={!users.data} />
          <ActionButton icon="document-text-outline" label="PDF" disabled={exportDisabled} run={() => shareReport()} />
          {mailAccount.data?.featureEnabled ? <ActionButton icon="mail-outline" label="E-posta hazırla" disabled={exportDisabled} run={() => mailReport()} /> : null}
        </View>
      ) : null}

      <View className="gap-2">
        <ActionButton icon="trending-up-outline" label={historyData ? 'Yıl içi seyri yenile' : 'Yıl içi seyri yükle'} disabled={!users.data || users.isFetching || history.isFetching} run={async () => {
          if (historyActive) { const result = await history.refetch(); if (result.error) throw result.error; }
          else setHistoryRequested(historyKey);
        }} />
        <Text className="font-inter text-xs text-muted-foreground">Ocaktan seçili aya kadar sırayla yüklenir. Seyirde son 6 ay, kümülatif ölçütlerde yılın tamamı kullanılır.</Text>
        {historyActive && history.isFetching ? <Loading /> : null}
        {historyActive && history.error ? <ErrorState message={history.error.message} onRetry={() => void history.refetch()} /> : null}
      </View>

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
                {(person.row.topSales ?? []).map((sale, index) => <Text key={`sale-${index}`} className="font-inter text-xs text-muted-foreground">Ciroyu oluşturan: {sale.label} · {sale.amount.toLocaleString('tr-TR')} {sale.currency}</Text>)}
                {person.analysis.manual.map((line) => (
                  <Text key={`m-${line.label}`} className="font-inter text-xs text-muted-foreground">{line.label} (manuel): {line.target}</Text>
                ))}
                {person.row.note?.trim() ? <Text className="font-inter text-xs italic text-muted-foreground">{person.row.note.trim()}</Text> : null}
                {ranks.has(person.row.subject.id) ? <Text className="font-inter text-xs text-muted-foreground">Ekip sırası: {ranks.get(person.row.subject.id)}</Text> : null}
                {historyData ? <View className="gap-2">
                  <ActionButton icon="trending-up-outline" label={expandedPerson === person.row.subject.id ? 'Yıl içi ayrıntıları gizle' : 'Yıl içi ayrıntıları göster'} run={async () => setExpandedPerson(current => current === person.row.subject.id ? null : person.row.subject.id)} />
                  {expandedPerson === person.row.subject.id ? (() => {
                    const detail = personTargetHistory(historyData, person.row.subject.id);
                    return <View className="gap-2">
                      <SimpleTable headers={['Ay', 'Gerçekleşme']} rows={detail.periods.map((month, index) => ({ key: month, cells: [monthTitle(month), detail.percentages[index] == null ? '—' : `%${detail.percentages[index]}`] }))} />
                      <Text className="font-inter-semibold text-sm text-foreground">Yıl başından seçili döneme</Text>
                      {detail.ytdMetrics.length ? detail.ytdMetrics.map(line => <Text key={line.label} className="font-inter text-xs text-foreground">{line.label}: {metricLineText(line)}</Text>) : <Text className="font-inter text-xs text-muted-foreground">Kümülatif ölçülebilir hedef yok.</Text>}
                    </View>;
                  })() : null}
                </View> : null}
                {canExport ? <View className="flex-row flex-wrap gap-2">
                  <ActionButton icon="document-text-outline" label="Kişisel PDF" disabled={exportDisabled} run={() => shareReport(person)} />
                  {mailAccount.data?.featureEnabled ? <ActionButton icon="mail-outline" label="Kişisel e-posta" disabled={exportDisabled} run={() => mailReport(person)} /> : null}
                </View> : null}
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
