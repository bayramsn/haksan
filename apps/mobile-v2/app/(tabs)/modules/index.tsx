import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/auth/AuthProvider';
import {
  canAccessModule,
  matchesModuleSearch,
  moduleGroups,
  modules,
  modulesByGroup,
  type ModuleEntry,
  type ModuleGroup,
} from '@/src/modules/catalog';
import { chipClass, toneColor, useTheme } from '@/src/theme/theme';
import { EmptyState, FilterChips, ScreenHeader, SearchBar } from '@/src/ui';
import { Enter } from '@/src/ui/motion';
import { SyncStatus } from '@/src/ui/SyncStatus';

function Tile({ entry, index }: { entry: ModuleEntry; index: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={{ width: '33.333%' }} className="p-1.5">
      <Enter delay={Math.min(index * 35, 280)} distance={16}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={entry.title}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(entry.route);
          }}
          className="min-h-[96px] items-center justify-center gap-2 rounded-surface border border-border bg-card px-2 py-3 active:opacity-70"
        >
          <View className={`h-11 w-11 items-center justify-center rounded-control border ${chipClass[entry.tone]}`}>
            <Ionicons name={entry.icon} size={21} color={toneColor(colors, entry.tone)} />
          </View>
          <Text className="text-center font-inter-medium text-[12px] leading-[1.25] text-foreground" numberOfLines={2}>
            {entry.title}
          </Text>
        </Pressable>
      </Enter>
    </View>
  );
}

function SectionHeader({ title, hint, icon, count }: { title: string; hint: string; icon: keyof typeof Ionicons.glyphMap; count: number }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2.5 px-1.5 pb-1.5">
      <View className="h-9 w-9 items-center justify-center rounded-control border border-border bg-card">
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text accessibilityRole="header" className="font-display-semibold text-[19px] leading-6 text-foreground">
          {title}
        </Text>
        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
          {hint}
        </Text>
      </View>
      <View className="min-w-[28px] items-center rounded-full border border-border bg-card px-2 py-0.5">
        <Text className="font-inter-semibold text-[12px] text-foreground">{count}</Text>
      </View>
    </View>
  );
}

export default function ModulesScreen() {
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<ModuleGroup | null>(null);

  const permitted = useMemo(() => modules.filter((m) => canAccessModule(user, tenant, m)), [user, tenant]);
  const matching = useMemo(() => permitted.filter((m) => matchesModuleSearch(m, search)), [permitted, search]);
  const groups = modulesByGroup(group ? matching.filter((m) => m.group === group) : matching);

  const groupOptions = moduleGroups
    .map((meta) => ({ value: meta.key, label: meta.title, count: matching.filter((m) => m.group === meta.key).length }))
    .filter((option) => option.count > 0);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Modüller" subtitle={`${permitted.length} modül · iş alanlarına göre gruplandı`} />

      <View className="gap-2.5 pb-1 pt-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Modül veya alan ara..." />
        {groupOptions.length > 1 ? (
          <FilterChips options={groupOptions} value={group} onChange={setGroup} allLabel="Tümü" />
        ) : null}
      </View>

      <ScrollView contentContainerClassName="px-2.5 pb-10" keyboardShouldPersistTaps="handled">
        {groups.length === 0 ? (
          <EmptyState
            icon="grid-outline"
            title="Modül bulunamadı"
            hint={search ? 'Aramayı değiştirin.' : 'Yetkileriniz için tanımlı modül yok.'}
            actionLabel={search || group ? 'Filtreyi temizle' : undefined}
            onAction={
              search || group
                ? () => {
                    setSearch('');
                    setGroup(null);
                  }
                : undefined
            }
          />
        ) : (
          groups.map(([meta, entries]) => (
            <View key={meta.key} className="pt-4">
              <SectionHeader title={meta.title} hint={meta.hint} icon={meta.icon} count={entries.length} />
              <View className="flex-row flex-wrap">
                {entries.map((entry, tileIndex) => (
                  <Tile key={entry.key} entry={entry} index={tileIndex} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
