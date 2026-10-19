import { useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, View } from 'react-native';
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
import { EmptyState, ScreenHeader, SearchBar } from '@/src/ui';
import { Enter } from '@/src/ui/motion';
import { SyncStatus } from '@/src/ui/SyncStatus';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function ModuleRow({ entry, index }: { entry: ModuleEntry; index: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Enter delay={Math.min(index * 28, 200)} distance={10}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entry.title}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(entry.route);
        }}
        className="min-h-[52px] flex-row items-center gap-3 border-t border-border px-3 py-2.5 active:opacity-70"
      >
        <View className={`h-9 w-9 items-center justify-center rounded-control border ${chipClass[entry.tone]}`}>
          <Ionicons name={entry.icon} size={18} color={toneColor(colors, entry.tone)} />
        </View>
        <Text className="flex-1 font-inter-medium text-[14px] text-foreground" numberOfLines={1}>
          {entry.title}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </Pressable>
    </Enter>
  );
}

function AccordionGroup({
  title,
  hint,
  icon,
  count,
  open,
  onToggle,
  entries,
}: {
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  open: boolean;
  onToggle: () => void;
  entries: ModuleEntry[];
}) {
  const { colors } = useTheme();
  return (
    <View className="mb-2 overflow-hidden rounded-surface border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count} modül`}
        onPress={onToggle}
        className="min-h-[56px] flex-row items-center gap-2.5 px-3 py-2.5 active:opacity-80"
      >
        <View className="h-9 w-9 items-center justify-center rounded-control border border-border bg-canvas">
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-display-semibold text-[16px] text-foreground">{title}</Text>
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
            {hint}
          </Text>
        </View>
        <View className="min-w-[28px] items-center rounded-full border border-border bg-canvas px-2 py-0.5">
          <Text className="font-inter-semibold text-[12px] text-foreground">{count}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>
      {open
        ? entries.map((entry, index) => <ModuleRow key={entry.key} entry={entry} index={index} />)
        : null}
    </View>
  );
}

export default function ModulesScreen() {
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Partial<Record<ModuleGroup, boolean>>>({ sales: true });

  const permitted = useMemo(() => modules.filter((m) => canAccessModule(user, tenant, m)), [user, tenant]);
  const matching = useMemo(() => permitted.filter((m) => matchesModuleSearch(m, search)), [permitted, search]);
  const groups = useMemo(() => modulesByGroup(matching), [matching]);
  const searching = search.trim().length > 0;
  const groupKeys = useMemo(() => groups.map(([meta]) => meta.key).join(','), [groups]);

  useEffect(() => {
    if (!searching || !groupKeys) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenGroups(Object.fromEntries(groupKeys.split(',').map((key) => [key, true])) as Partial<Record<ModuleGroup, boolean>>);
  }, [searching, groupKeys]);

  const toggle = (key: ModuleGroup) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void Haptics.selectionAsync();
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Modüller" subtitle={`${permitted.length} modül · iş alanına göre gruplu`} />

      <View className="pb-1 pt-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Modül veya alan ara..." />
      </View>

      <ScrollView contentContainerClassName="px-3 pb-10 pt-2" keyboardShouldPersistTaps="handled">
        {groups.length === 0 ? (
          <EmptyState
            icon="grid-outline"
            title="Modül bulunamadı"
            hint={search ? 'Aramayı değiştirin.' : 'Yetkileriniz için tanımlı modül yok.'}
            actionLabel={search ? 'Aramayı temizle' : undefined}
            onAction={search ? () => setSearch('') : undefined}
          />
        ) : (
          groups.map(([meta, entries]) => (
            <AccordionGroup
              key={meta.key}
              title={meta.title}
              hint={meta.hint}
              icon={meta.icon}
              count={entries.length}
              open={searching || Boolean(openGroups[meta.key])}
              onToggle={() => toggle(meta.key)}
              entries={entries}
            />
          ))
        )}
        {!searching && groups.length > 0 ? (
          <Text className="px-1 pt-1 font-inter text-[12px] text-muted-foreground">
            {moduleGroups.length} alan · grubu açarak tüm modüllere ulaşın
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
