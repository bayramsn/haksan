import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { teamActivity, type ActivityPeriod } from '@/src/api/general.endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { Card, ErrorState, Eyebrow, Skeleton } from '@/src/ui';

const PERIODS: { value: ActivityPeriod; label: string }[] = [
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
  { value: 'year', label: 'Bu yıl' },
];

const METRICS = [
  { key: 'activities', label: 'Aktivite (ziyaret + arama dahil)' },
  { key: 'quotes', label: 'Teklif' },
  { key: 'opportunitiesCreated', label: 'Açılan fırsat' },
  { key: 'won', label: 'Kazanılan' },
] as const;

/** Web "Ekip aktivitesi" ile aynı uç: süper admin ekibi, diğer kullanıcılar kendi sayılarını görür. */
export function ActivityStats() {
  const { scope } = useAuth();
  const [period, setPeriod] = useState<ActivityPeriod>('week');
  const query = useQuery({
    queryKey: ['reports', 'team-activity', period, scope.divisionId, scope.departmentId],
    queryFn: () => teamActivity(period),
  });
  const data = query.data;

  return (
    <Card className="gap-3">
      <Eyebrow>{data?.canSeeTeam ? 'Ekip aktivitesi' : 'Aktivitelerim'}</Eyebrow>
      <View className="flex-row gap-2">
        {PERIODS.map((item) => {
          const active = item.value === period;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setPeriod(item.value)}
              className={`min-h-10 justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}
            >
              <Text className={`font-inter-medium text-[13px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {query.isPending ? (
        <Skeleton height={120} />
      ) : query.error || !data ? (
        <ErrorState message={query.error?.message ?? 'Aktivite raporu yüklenemedi.'} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {METRICS.map((metric) => {
              const current = data.totals[metric.key];
              const previous = data.previousTotals[metric.key];
              const diff = current - previous;
              return (
                <View key={metric.key} className="min-w-[46%] flex-1 gap-0.5 rounded-control border border-border px-3 py-2">
                  <Text className="font-inter-bold text-[19px] text-foreground">{current}</Text>
                  <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={2}>{metric.label}</Text>
                  <Text className={`font-inter text-[11px] ${diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Önceki dönem {previous}{diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
          {data.canSeeTeam && data.users.length ? (
            <View className="gap-1.5">
              {data.users.slice(0, 10).map((row) => (
                <View key={row.userId} className="flex-row items-center justify-between gap-3 border-b border-border py-2">
                  <Text className="flex-1 font-inter-medium text-sm text-foreground" numberOfLines={1}>{row.name}</Text>
                  <Text className="font-inter text-xs text-muted-foreground">
                    {row.activities.current} akt · {row.quotes.current} tkl · {row.won.current} kzn
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}
