import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/src/theme/theme';
import { ScreenHeader } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { AnalyticsSection } from '@/src/ui/reports/AnalyticsSection';
import { OperationalSection } from '@/src/ui/reports/OperationalSection';
import { OverviewSection } from '@/src/ui/reports/OverviewSection';
import { TargetSection } from '@/src/ui/reports/TargetSection';
import { YearEndSection } from '@/src/ui/reports/YearEndSection';

type Mode = 'overview' | 'operational' | 'year-end' | 'targets' | 'analytics';

const MODES: { value: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'overview', label: 'Genel', icon: 'grid-outline' },
  { value: 'operational', label: 'Operasyonel', icon: 'bar-chart-outline' },
  { value: 'year-end', label: 'Karlılık', icon: 'trending-up-outline' },
  { value: 'targets', label: 'Hedef Takibi', icon: 'flag-outline' },
  { value: 'analytics', label: 'Analitik', icon: 'analytics-outline' },
];

export default function ReportsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Raporlar" subtitle="Operasyon, karlılık, hedef ve analitik raporları." />
      <View className="px-4 pb-2">
        <Tabs tabs={MODES} value={mode} onChange={setMode} />
      </View>
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.mutedForeground} />}
      >
        {mode === 'overview' ? <OverviewSection /> : null}
        {mode === 'operational' ? <OperationalSection /> : null}
        {mode === 'year-end' ? <YearEndSection /> : null}
        {mode === 'targets' ? <TargetSection /> : null}
        {mode === 'analytics' ? <AnalyticsSection /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
