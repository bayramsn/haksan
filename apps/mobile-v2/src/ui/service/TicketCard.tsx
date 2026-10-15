import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceTicket } from '@/src/api/endpoints';
import { useCompanyMapPoints } from '@/src/api/companies.hooks';
import { useDirectory } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
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
  const { colors } = useTheme();
  const stage = serviceStageOf(item);
  const overdue = isSlaOverdue(item, Date.now());
  const company = item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlanmadı';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.ticketNo}, ${company}, ${STAGE_LABELS[stage]}`}
      accessibilityHint={onLongPress ? 'Uzun basarak aşamaya taşıyın' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      className={`gap-1.5 rounded-surface border border-border bg-card active:opacity-70 ${compact ? 'p-3' : 'my-1.5 p-4'}`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="shrink font-inter-bold text-[15px] text-foreground" numberOfLines={1}>{item.ticketNo}</Text>
        <Chip tone={SEVERITY_TONE[item.severity] ?? 'neutral'} label={SEVERITY_LABELS[item.severity] ?? item.severity} />
      </View>
      <Text className="font-inter-medium text-[14px] text-foreground" numberOfLines={1}>{company}</Text>
      {location ? (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
          <Text className="flex-1 font-inter text-[12px] text-muted-foreground" numberOfLines={1}>{location}</Text>
        </View>
      ) : null}
      <Text className="font-inter text-[13px] text-foreground" numberOfLines={compact ? 2 : 1}>{item.subject}</Text>
      <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
        {compact ? null : <Chip tone="info" label={STAGE_LABELS[stage]} />}
        {overdue ? <Chip tone="destructive" label="SLA aşıldı" /> : null}
        <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
          {[assignee ?? 'Atanmadı', SERVICE_NEXT_ACTION[stage], formatDate(item.reportedAt)].join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}
