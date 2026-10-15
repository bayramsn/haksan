import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

import { useCan } from '@/src/auth/AuthProvider';
import { metaKeys, useMetaConnections, useMetaPermissions } from '@/src/api/meta.hooks';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, Eyebrow, ScreenHeader } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { AudiencesTab } from '@/src/ui/meta/AudiencesTab';
import { AutomationTab } from '@/src/ui/meta/AutomationTab';
import { CampaignsTab } from '@/src/ui/meta/CampaignsTab';
import { CatalogsTab } from '@/src/ui/meta/CatalogsTab';
import { ConnectionsTab } from '@/src/ui/meta/ConnectionsTab';
import { InboxTab } from '@/src/ui/meta/InboxTab';
import { LeadsTab } from '@/src/ui/meta/LeadsTab';
import { OverviewTab } from '@/src/ui/meta/OverviewTab';
import { MetaButton } from '@/src/ui/meta/parts';

type MetaTab = 'overview' | 'leads' | 'campaigns' | 'inbox' | 'automation' | 'audiences' | 'catalogs' | 'connections';

const TABS: { value: MetaTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'overview', label: 'Genel bakış', icon: 'speedometer-outline' },
  { value: 'leads', label: "Lead'ler", icon: 'people-outline' },
  { value: 'campaigns', label: 'Kampanyalar', icon: 'megaphone-outline' },
  { value: 'inbox', label: 'Mesajlar ve yorumlar', icon: 'chatbubbles-outline' },
  { value: 'automation', label: 'Otomasyonlar ve CAPI', icon: 'git-merge-outline' },
  { value: 'audiences', label: 'Kitleler', icon: 'people-circle-outline' },
  { value: 'catalogs', label: 'Katalog', icon: 'cube-outline' },
  { value: 'connections', label: 'Bağlantılar ve sağlık', icon: 'link-outline' },
];

function HeaderCount({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' }) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 rounded-control border border-border bg-card px-3 py-2">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text className="font-display text-[20px]" style={{ color: colors[tone] }}>{value}</Text>
    </View>
  );
}

export default function MetaScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const perms = useMetaPermissions();
  const canOpenOpportunity = useCan('opportunities.read');
  const [tab, setTab] = useState<MetaTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const connections = useMetaConnections(perms.canRead);
  const activeCount = (connections.data ?? []).filter((item) => item.status === 'active').length;
  const errorCount = (connections.data ?? []).filter((item) => item.status === 'error').length;

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: metaKeys.root });
    } finally {
      setRefreshing(false);
    }
  };

  if (!perms.canRead) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Meta Merkezi" />
        <EmptyState
          icon="lock-closed-outline"
          title="Meta Merkezi erişimi gerekli"
          hint="Meta lead, kampanya ve mesaj verilerini görüntülemek için yöneticinizden Meta okuma yetkisi isteyin."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Meta Merkezi" subtitle="Lead Ads, kampanya, konuşma, CAPI, kitle ve katalog operasyonlarını CRM sonuçlarıyla yönetin." />
      <View className="pb-2">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </View>
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-1"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshAll()} tintColor={colors.mutedForeground} />}
      >
        <View className="gap-2">
          <Eyebrow>META OPERASYON MERKEZİ</Eyebrow>
          <Text accessibilityRole="header" className="font-display text-[22px] text-foreground">Reklamdan satışa tek akış</Text>
          <View className="flex-row gap-2">
            <HeaderCount label="Aktif bağlantı" value={activeCount} tone="success" />
            <HeaderCount label="Kontrol gerekli" value={errorCount} tone="warning" />
          </View>
          <View className="flex-row">
            <MetaButton icon="refresh" label="Tümünü yenile" loading={refreshing} onPress={() => void refreshAll()} />
          </View>
        </View>

        {tab === 'overview' ? <OverviewTab canOpenOpportunity={canOpenOpportunity} /> : null}
        {tab === 'leads' ? <LeadsTab canOpenOpportunity={canOpenOpportunity} /> : null}
        {tab === 'campaigns' ? <CampaignsTab canManage={perms.canManageCampaigns} /> : null}
        {tab === 'inbox' ? <InboxTab canManage={perms.canManageMessages} /> : null}
        {tab === 'automation' ? <AutomationTab canManage={perms.canManageAutomation} /> : null}
        {tab === 'audiences' ? <AudiencesTab canManage={perms.canManageAudiences} /> : null}
        {tab === 'catalogs' ? <CatalogsTab canManage={perms.canManageCatalogs} /> : null}
        {tab === 'connections' ? <ConnectionsTab canManage={perms.canManageConnections} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
