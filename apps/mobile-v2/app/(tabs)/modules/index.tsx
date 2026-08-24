import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/auth/AuthProvider';
import { canAccessModule, groupTitles, modules, modulesByGroup, type ModuleEntry } from '@/src/modules/catalog';
import { chipClass, toneColor, useTheme } from '@/src/theme/theme';
import { EmptyState, Eyebrow, ScreenHeader, SearchBar } from '@/src/ui';
import { Enter } from '@/src/ui/motion';
import { SyncStatus } from '@/src/ui/SyncStatus';

function Tile({ entry, index }: { entry: ModuleEntry; index: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Enter delay={Math.min(index * 35, 280)} distance={16} className="w-1/3 p-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entry.title}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(entry.route);
        }}
        className="min-h-[92px] items-center justify-center gap-2 rounded-surface border border-border bg-card px-2 py-3 active:opacity-70"
      >
        <View className={`h-11 w-11 items-center justify-center rounded-control border ${chipClass[entry.tone]}`}>
          <Ionicons name={entry.icon} size={21} color={toneColor(colors, entry.tone)} />
        </View>
        <Text className="text-center font-inter-medium text-[12px] leading-[1.25] text-foreground" numberOfLines={2}>
          {entry.title}
        </Text>
      </Pressable>
    </Enter>
  );
}

export default function ModulesScreen() {
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return modules
      .filter((m) => canAccessModule(user, tenant, m))
      .filter((m) => !term || m.title.toLocaleLowerCase('tr').includes(term));
  }, [user, tenant, search]);

  const groups = modulesByGroup(visible);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Modüller" subtitle="Tüm iş süreçlerinize tek ekrandan erişin." />

      {/* Katalog büyüdükçe kaydırmadan bulmak için. */}
      <View className="pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Modül ara..." />
      </View>

      <ScrollView contentContainerClassName="px-2.5 pb-8" keyboardShouldPersistTaps="handled">
        {groups.length === 0 ? (
          <EmptyState
            title="Modül bulunamadı"
            hint={search ? 'Aramayı değiştirin.' : 'Yetkileriniz için tanımlı modül yok.'}
          />
        ) : (
          groups.map(([group, entries]) => (
            <View key={group} className="pt-3">
              <View className="flex-row items-center justify-between px-1.5 pb-1">
                <Eyebrow>{groupTitles[group]}</Eyebrow>
                <Text className="font-inter-medium text-[11px] text-muted-foreground">{entries.length}</Text>
              </View>
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
