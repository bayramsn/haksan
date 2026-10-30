import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ServiceTicket } from '@/src/api/endpoints';
import { useCompanyMapPoints } from '@/src/api/companies.hooks';
import { useDirectory } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Chip } from '@/src/ui';
import { SERVICE_NEXT_ACTION, SEVERITY_LABELS, STAGE_LABELS, isSlaOverdue, locationLabel, serviceStageOf } from './serviceStage';

const SEVERITY_TONE: Record<string, Tone> = { critical: 'destructive', high: 'warning', normal: 'info', low: 'neutral' };

/** Liste ve kanban kartlarının ortak çözücüleri: firma konumu ve sorumlu adı. */
export function useTicketLookups() {
  const points = useCompanyMapPoints();
  const directory = useDirectory();
  const { user } = useAuth();
  return useMemo(() => {
    const locations = new Map((points.data?.data ?? []).map((point) => [point.id, locationLabel(point)]));
    const names = new Map((directory.data ?? []).map((person) => [person.id, person.fullName]));
    if (user) names.set(user.id, user.fullName);
    return {
      location: (companyId: string | null | undefined) => (companyId ? locations.get(companyId) ?? null : null),
      person: (userId: string | null | undefined) => (userId ? names.get(userId) ?? null : null),
    };
  }, [points.data, directory.data, user]);
}

export function TicketCard({
  item,
  location,
  assignee,
  onPress,
  onLongPress,
  compact,
}: {
  item: ServiceTicket;
  location: string | null;
  assignee: string | null;
  onPress: () => void;
  onLongPress?: () => void;
  compact?: boolean;
}) {
  const stage = serviceStageOf(item);
  const overdue = isSlaOverdue(item, Date.now());
  const company = item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlanmadı';
  const meta = [company, location, assignee ?? 'Atanmadı', SERVICE_NEXT_ACTION[stage], formatDate(item.reportedAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.ticketNo}, ${company}, ${STAGE_LABELS[stage]}`}
      accessibilityHint={onLongPress ? 'Uzun basarak aşamaya taşıyın' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      className={`min-h-[52px] gap-1 rounded-surface border border-border bg-card active:opacity-70 ${compact ? 'p-2.5' : 'my-1 p-3'}`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 font-inter-bold text-[15px] text-foreground" numberOfLines={1}>
          {item.ticketNo}
        </Text>
        <Chip tone={SEVERITY_TONE[item.severity] ?? 'neutral'} label={SEVERITY_LABELS[item.severity] ?? item.severity} />
      </View>
      <Text className="font-inter text-[13px] text-foreground" numberOfLines={compact ? 2 : 1}>
        {item.subject}
      </Text>
      <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
        {meta}
      </Text>
      <View className="flex-row flex-wrap items-center gap-1">
        {compact ? null : <Chip tone="info" label={STAGE_LABELS[stage]} />}
        {overdue ? <Chip tone="destructive" label="SLA aşıldı" /> : null}
      </View>
    </Pressable>
  );
}
