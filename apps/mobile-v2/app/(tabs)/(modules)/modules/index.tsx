import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/auth/AuthProvider';
import { modules, mobileMenu, canAccessModule, type MenuGroup } from '@/src/modules/catalog';
import { EmptyState, ScreenHeader, SearchBar } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';
import { SyncStatus } from '@/src/ui/SyncStatus';

const normalize = (value: string) => value.toLocaleLowerCase('tr');

/**
 * Mobil iş akışlarına göre gruplanır. Arama, ana sayfaların
 * içinde duran alt sayfaları da bulur: "tahsilat" → Ödemeler & Kasa › Tahsilatlar.
 */
export default function ModulesScreen() {
  const router = useRouter();
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');
  const menu = useMemo(() => mobileMenu(user, tenant), [user, tenant]);
  const sectionFor = (key: string) => {
    const direct = menu.find(group => group.items.some(item => item.key === key));
    if (direct) return direct.title;
    const entry = modules.find(item => item.key === key);
    const parent = modules.find(item => item.key === entry?.parent);
    return menu.find(group => group.items.some(item => item.route.split('?')[0] === parent?.route))?.title;
  };

  const groups = useMemo<MenuGroup[]>(() => {
    const term = normalize(search.trim());
    if (!term) return menu;
    const pages = menu.flatMap((group) => group.items).filter((item) => normalize(item.title).includes(term));
    const children = modules
      .filter((entry) => entry.parent && canAccessModule(user, tenant, entry) && normalize(entry.title).includes(term))
      .map((entry) => {
        const parent = menu.flatMap((group) => group.items).find((item) => item.route.split('?')[0] === (modules.find((m) => m.key === entry.parent)?.route as string | undefined));
        return { key: entry.key, title: parent ? `${parent.title} › ${entry.title}` : entry.title, icon: entry.icon, route: entry.route as string };
      });
    const results = [...pages, ...children];
    return results.length ? [{ title: 'Sonuçlar', items: results }] : [];
  }, [menu, search, user, tenant]);

  function open(route: string) {
    void Haptics.selectionAsync();
    router.push(route as Href);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Modüller" />
      <View className="pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Sayfa ara (ör. teklif, tahsilat)" />
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 20, paddingTop: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        {groups.length === 0 ? (
          <EmptyState title="Sayfa bulunamadı" hint={search ? 'Aramayı değiştirin.' : 'Yetkileriniz için tanımlı sayfa yok.'} />
        ) : (
          groups.map((group) => (
            <SettingsGroup key={group.title} title={group.title}>
              {group.items.map((item, index) => (
                <SettingsRow key={item.key} first={index === 0} icon={item.icon} title={item.title} subtitle={search.trim() ? sectionFor(item.key) ?? 'Alt sayfa' : undefined} onPress={() => open(item.route)} />
              ))}
            </SettingsGroup>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
