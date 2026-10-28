import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/auth/AuthProvider';
import { canAccessModule, modules, type ModuleEntry } from '@/src/modules/catalog';
import { buildModuleMenu } from '@/src/modules/module-menu';
import { chipClass, toneColor, useTheme } from '@/src/theme/theme';
import { EmptyState, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';

const GROUP_HINTS: Record<string, string> = {
  Genel: 'Günlük plan ve ekip takibi', Satış: 'Firmalar, fırsatlar ve satış hedefleri',
  'Satış Operasyonu': 'Kontaklar, teklifler ve ticari belgeler', Operasyon: 'Ürün, stok, finans ve sevkiyat',
  Servis: 'Makineler, kurulum ve servis kayıtları', Yönetim: 'Raporlar ve yönetim araçları',
};

function ModuleRow({ entry, first, accessible }: { entry: ModuleEntry; first: boolean; accessible: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessible ? `${entry.title} ekranını aç` : `${entry.title}, erişime kapalı`}
      accessibilityState={{ disabled: !accessible }} disabled={!accessible}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(entry.route); }}
      className={`min-h-[60px] flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${first ? '' : 'border-t border-border'}`}>
      <View className={`h-10 w-10 items-center justify-center rounded-control border ${chipClass[entry.tone]}`}>
        <Ionicons name={entry.icon} size={19} color={toneColor(colors, entry.tone)} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-inter-medium text-[15px] leading-[21px] text-foreground" numberOfLines={2}>{entry.title}</Text>
        {!accessible ? <Text className="font-inter text-[12px] text-muted-foreground">Erişime kapalı</Text> : null}
      </View>
      <Ionicons name={accessible ? 'chevron-forward' : 'lock-closed-outline'} size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function ModulesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  const accessibleKeys = useMemo(() => new Set(modules.filter((entry) => canAccessModule(user, tenant, entry)).map((entry) => entry.key)), [user, tenant]);
  const categories = useMemo(() => buildModuleMenu(modules), []);
  const matching = useMemo(() => buildModuleMenu(modules, search), [search]);
  // A category removed by a permission/scope change must not leave an invisible filter.
  const selectedCategory = categories.some((group) => group.title === category) ? category : null;
  const groups = matching.filter((group) => !selectedCategory || group.title === selectedCategory);
  const count = groups.reduce((total, group) => total + group.entries.length, 0);
  const searching = search.trim().length > 0;
  const narrowed = searching || selectedCategory !== null;
  useEffect(() => { listRef.current?.scrollTo({ y: 0, animated: false }); }, [search, selectedCategory]);
  function reset() { setSearch(''); setCategory(null); }
  useFocusEffect(useCallback(() => {
    setSearch('');
    setCategory(null);
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Modüller" subtitle="Tüm modüller; işinize uygun alanı seçin." />
      <View className="pb-3 pt-2"><SearchBar value={search} onChange={setSearch} placeholder="Modül veya kategori ara…" /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, height: 52 }}
        keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
        {[{ title: 'Tümü', value: null, count: modules.length }, ...categories.map((group) => ({ title: group.title, value: group.title, count: group.entries.length }))].map((item) => {
          const active = selectedCategory === item.value;
          return <Pressable key={item.title} accessibilityRole="tab" accessibilityState={{ selected: active }}
            accessibilityLabel={`${item.title}, ${item.count} modül`} onPress={() => { setCategory(item.value); void Haptics.selectionAsync(); }}
            className={`min-h-11 flex-row items-center gap-2 rounded-control border px-3.5 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
            <Text className={`font-inter-medium text-[13px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{item.title}</Text>
            <Text className={`font-inter text-[12px] ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{item.count}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <View className="min-h-11 flex-row items-center justify-between gap-3 px-4 py-2">
        <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 font-inter text-[12px] text-muted-foreground">
          {searching ? `${count} arama sonucu` : `${count} modül`} · {groups.length} kategori
        </Text>
        {narrowed ? <Pressable accessibilityRole="button" onPress={reset} className="min-h-11 justify-center px-2">
          <Text className="font-inter-medium text-[13px] text-primary">Temizle</Text>
        </Pressable> : null}
      </View>
      <ScrollView ref={listRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: GLASS_TAB_BAR_HEIGHT + 32, gap: 20 }}>
        {groups.length === 0 ? <EmptyState icon="grid-outline" title="Modül bulunamadı"
          hint={narrowed ? 'Aramayı veya kategori seçimini değiştirin.' : 'Modül kataloğu boş.'}
          actionLabel={narrowed ? 'Seçimleri temizle' : undefined} onAction={narrowed ? reset : undefined} /> : groups.map((group) => (
          <View key={group.title} className="gap-2">
            <View className="gap-0.5 px-1">
              <Text accessibilityRole="header" className="font-display-semibold text-[19px] text-foreground">{group.title}</Text>
              <Text className="font-inter text-[12px] text-muted-foreground">{GROUP_HINTS[group.title]}</Text>
            </View>
            <View className="overflow-hidden rounded-surface border border-border bg-card">
              {group.entries.map((entry, index) => <ModuleRow key={entry.key} entry={entry} first={index === 0} accessible={accessibleKeys.has(entry.key)} />)}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
