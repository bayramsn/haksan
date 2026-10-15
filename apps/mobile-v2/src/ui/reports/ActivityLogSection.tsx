import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import {
  activityLogDate,
  activityLogMoney,
  activityLogTotals,
  companyContextLine,
  opportunityContextLine,
  PLAN_KIND_LABEL,
  weekStatsLine,
  type ActivityLogReport,
} from '@haksan/shared';
import { useActivityLog } from '@/src/api/reports.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Chip, ErrorState, Field, Loading } from '@/src/ui';
import { ActionButton } from './parts';
import { defaultActivityRange, validateActivityRange } from './reportMath';

function reportText(report: ActivityLogReport): string {
  const lines = [`Haftalık Aktivite ve Teklif Raporu — ${activityLogDate(report.range.from)} / ${activityLogDate(new Date(new Date(report.range.to).getTime() - 1).toISOString())}`];
  for (const user of report.users) {
    if (!user.activityCount && !user.quoteCount && !weekStatsLine(user.week)) continue;
    lines.push('', `${user.userName} — ${user.activityCount} aktivite · ${user.quoteCount} teklif (${activityLogTotals(user.quoteTotals)})`);
    const week = weekStatsLine(user.week);
    if (week) lines.push(week);
    for (const group of user.groups) {
      lines.push(`${group.typeName} (${group.entries.length})`);
      for (const entry of group.entries) {
        lines.push(`- ${activityLogDate(entry.occurredAt)} ${entry.companyName ?? '—'}: ${entry.subject}${entry.note ? ` — ${entry.note}` : ''}`);
      }
    }
  }
  return lines.join('\n');
}

export function ActivityLogSection() {
  const canReadCompanies = useCan('companies.read');
  const [draft, setDraft] = useState(defaultActivityRange);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const log = useActivityLog(range);
  const report = log.data;

  if (!canReadCompanies) return null;

  const load = () => {
    const message = validateActivityRange(draft);
    setError(message);
    if (message) return;
    if (range && range.from === draft.from && range.to === draft.to) void log.refetch();
    else setRange({ ...draft });
  };

  const activeUsers = report ? report.users.filter((u) => u.activityCount || u.quoteCount || weekStatsLine(u.week)) : [];
  const planUsers = report ? report.users.filter((u) => u.plan.length) : [];

  return (
    <Card className="gap-3">
      <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground">Haftalık Aktivite ve Teklif Raporu</Text>
      <Text className="font-inter text-xs text-muted-foreground">
        Seçilen aralıkta kişi bazlı aktivite dökümü — fırsat içi/dışı fark etmeksizin — haftanın CRM hareketi, verilen teklifler ve önümüzdeki haftanın planı.
      </Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Field label="Başlangıç tarihi" value={draft.from} onChangeText={(from) => setDraft((r) => ({ ...r, from }))} placeholder="YYYY-AA-GG" maxLength={10} keyboardType="numbers-and-punctuation" />
        </View>
        <View className="flex-1">
          <Field label="Bitiş tarihi" value={draft.to} onChangeText={(to) => setDraft((r) => ({ ...r, to }))} placeholder="YYYY-AA-GG" maxLength={10} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      {error ? <Text className="font-inter text-xs text-destructive">{error}</Text> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Raporu Getir" loading={log.isFetching} onPress={load} />
        </View>
        <ActionButton icon="share-outline" label="Paylaş" run={async () => { if (report) await Share.share({ message: reportText(report) }); }} disabled={!report} />
      </View>

      {range && log.isPending ? <Loading /> : log.error ? (
        <ErrorState message={log.error.message || 'Rapor alınamadı'} onRetry={() => void log.refetch()} />
      ) : report ? (
        <View className="gap-4">
          {activeUsers.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Bu aralıkta kayıt bulunamadı.</Text> : null}
          {activeUsers.map((user) => (
            <View key={user.userId} className="gap-2 border-t border-border pt-3">
              <Text className="font-inter-semibold text-sm text-foreground">{user.userName}</Text>
              <Text className="font-inter text-xs text-muted-foreground">
                {user.activityCount} aktivite · {user.quoteCount} teklif · {activityLogTotals(user.quoteTotals)}
              </Text>
              {weekStatsLine(user.week) ? <Text className="font-inter text-xs text-foreground">{weekStatsLine(user.week)}</Text> : null}
              {user.week.missedFollowUps.length > 0 ? (
                <Text className="font-inter text-xs text-destructive">
                  Kaçırılan takip: {user.week.missedFollowUps.map((m) => `${m.companyName ?? '—'} (${activityLogDate(m.dueAt)})`).join(', ')}
                </Text>
              ) : null}
              {user.targets ? (
                <Text className="font-inter text-xs text-muted-foreground">
                  Hedef ({user.targets.period}): {user.targets.metrics.map((m) => `${m.label} ${m.actual}/${m.target}${m.pct != null ? ` %${m.pct}` : ''}`).join(' · ')}
                </Text>
              ) : null}
              {user.groups.map((group) => (
                <View key={group.typeCode} className="gap-1.5">
                  <Chip tone="info" label={`${group.typeName} · ${group.entries.length}`} />
                  {group.entries.map((entry) => (
                    <View key={entry.id} className="gap-0.5 rounded-control border border-border bg-card-subtle p-2.5">
                      <Text className="font-inter-medium text-[13px] text-foreground">
                        {activityLogDate(entry.occurredAt)} · {entry.companyName ?? '—'}
                        {entry.province ? ` · ${[entry.district, entry.province].filter(Boolean).join(' / ')}` : ''}
                      </Text>
                      <Text className="font-inter text-[13px] text-foreground">{entry.subject}</Text>
                      {entry.contactName ? (
                        <Text className="font-inter text-xs text-muted-foreground">
                          {entry.contactName}{entry.contactTitle ? ` (${entry.contactTitle})` : ''}{entry.contactPhone ? ` · ${entry.contactPhone}` : ''}
                        </Text>
                      ) : null}
                      {entry.note ? <Text className="font-inter text-xs text-foreground">{entry.note}</Text> : null}
                      {entry.result ? <Text className="font-inter text-xs text-muted-foreground">Sonuç: {entry.result}</Text> : null}
                      {companyContextLine(entry.company) ? <Text className="font-inter text-[11px] text-muted-foreground">{companyContextLine(entry.company)}</Text> : null}
                      {entry.inOpportunity ? (
                        <Text className="font-inter text-[11px] text-muted-foreground">
                          Fırsat: {entry.opportunityTitle ?? '—'}{opportunityContextLine(entry.opportunity) ? ` · ${opportunityContextLine(entry.opportunity)}` : ''}
                        </Text>
                      ) : null}
                      {entry.nextFollowUpAt ? <Text className="font-inter text-[11px] text-info">Sonraki takip: {activityLogDate(entry.nextFollowUpAt)}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}

          {report.quotes.length > 0 ? (
            <View className="gap-1.5 border-t border-border pt-3">
              <Text className="font-inter-semibold text-sm text-foreground">Verilen Teklifler</Text>
              {report.quotes.map((quote) => (
                <Text key={quote.id} className="font-inter text-xs text-foreground">
                  {activityLogDate(quote.quoteDate)} · {quote.documentNo}{quote.revisionNo ? ` R${quote.revisionNo}` : ''} · {quote.companyName ?? '—'} · {quote.productName} × {quote.quantity} ·{' '}
                  {activityLogMoney(quote.lineTotal, quote.currency)} · {quote.userName}
                </Text>
              ))}
            </View>
          ) : null}

          {planUsers.length > 0 ? (
            <View className="gap-1.5 border-t border-border pt-3">
              <Text className="font-inter-semibold text-sm text-foreground">Önümüzdeki Haftanın Planı</Text>
              {planUsers.map((user) => (
                <View key={user.userId} className="gap-0.5">
                  <Text className="font-inter-medium text-xs text-foreground">{user.userName}</Text>
                  {user.plan.map((item, index) => (
                    <Text key={`${item.kind}-${index}`} className="font-inter text-xs text-muted-foreground">
                      {activityLogDate(item.dueAt)} · {PLAN_KIND_LABEL[item.kind]} · {item.companyName ?? '—'} · {item.title}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
