import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NAVIGATION_GROUPS, type NavigationVisibilityKey } from '@haksan/shared';
import { useTenantSettings, useUpdateTenant } from '@/src/api/admin.hooks';
import { chipClass, toneColor, useTheme } from '@/src/theme/theme';
import { Button, Card } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, Notice, confirmDestructive } from '@/src/ui/admin/controls';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

const TOTAL = NAVIGATION_GROUPS.reduce((total, group) => total + group.items.length, 0);
const sortedKey = (keys: string[]) => JSON.stringify([...keys].sort());

export default function MenuSettingsScreen() {
  const { colors } = useTheme();
  const access = useAdminAccess();
  const canEditTenant = access.has('tenants.update');
  const tenant = useTenantSettings();
  const update = useUpdateTenant();
  const baseline = useMemo(() => (tenant.data?.hiddenNavigationKeys ?? []) as NavigationVisibilityKey[], [tenant.data]);
  const [hidden, setHidden] = useState<NavigationVisibilityKey[]>([]);

  useEffect(() => setHidden(baseline), [baseline]);
  const dirty = sortedKey(hidden) !== sortedKey(baseline);

  const toggle = (key: NavigationVisibilityKey) =>
    setHidden((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const save = () =>
    update.mutate(
      { hiddenNavigationKeys: hidden },
      {
        onSuccess: () =>
          toast.success('Menü ve akış ayarları kaydedildi. Seçim tüm kullanıcıların sol menüsüne uygulandı.'),
        onError: (err) => toast.error(`Menü ve akış ayarları kaydedilemedi: ${err.message}`),
      }
    );

  return (
    <SettingsSubpage
      title="Menü ve akış"
      subtitle="Kullanıcıların kullanacağı sayfaları ve uygulama akışını yönetin."
      allowed={canEditTenant}
      loading={tenant.isPending}
      error={tenant.error ? 'Şirket bilgileri yüklenemedi' : null}
      onRetry={() => void tenant.refetch()}
      refreshing={tenant.isRefetching}
      onRefresh={() => {
        if (!dirty) void tenant.refetch();
      }}
    >
      <Notice tone="info">
        Burada kapatılan sayfalar tüm kullanıcıların ana menüsünden, Sabitlenenler, Son kullanılan, Hızlı Oluştur ve uygulama içi yönlendirme akışlarından çıkarılır. Ayarlar sayfası her zaman açık kalır.
      </Notice>
      <Card className="flex-row items-center gap-3 p-3.5">
        <View className="flex-1">
          <Text className="font-inter-semibold text-[14px] text-foreground">{TOTAL - hidden.length} sayfa açık</Text>
          <Text className="font-inter text-[12px] text-muted-foreground">
            {hidden.length === 0 ? 'Tüm çalışma alanları akışta.' : `${hidden.length} çalışma alanı kapatıldı.`}
          </Text>
        </View>
        <ActionPill icon="eye-outline" label="Tümünü göster" disabled={hidden.length === 0} onPress={() => setHidden([])} />
      </Card>

      {NAVIGATION_GROUPS.map((group) => (
        <Card key={group.group} className="overflow-hidden p-0">
          <View className="flex-row items-center justify-between border-b border-border px-3.5 py-2.5">
            <Text className="font-inter-semibold text-[13px] text-foreground">{group.group}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground">
              {group.items.filter((item) => !hidden.includes(item.key)).length}/{group.items.length} açık
            </Text>
          </View>
          {group.items.map((item, index) => {
            const visible = !hidden.includes(item.key);
            return (
              <Pressable
                key={item.key}
                accessibilityRole="switch"
                accessibilityLabel={item.label}
                accessibilityState={{ checked: visible }}
                onPress={() => toggle(item.key)}
                className={`min-h-[52px] flex-row items-center gap-3 px-3.5 py-2 active:opacity-70 ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <View className={`h-8 w-8 items-center justify-center rounded-md border ${chipClass[visible ? 'info' : 'neutral']}`}>
                  <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={16} color={toneColor(colors, visible ? 'info' : 'neutral')} />
                </View>
                <Text className="flex-1 font-inter-medium text-[14px] text-foreground">{item.label}</Text>
                <Text className="font-inter-semibold text-[11px]" style={{ color: toneColor(colors, visible ? 'success' : 'neutral') }}>
                  {visible ? 'Açık' : 'Akış dışı'}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      ))}

      {dirty ? (
        <Notice tone="warning" title="Kaydedilmemiş değişiklikler var">
          Menü seçimi henüz tüm kullanıcılara uygulanmadı.
        </Notice>
      ) : null}
      <View className="flex-row gap-2">
        {dirty ? (
          <View className="flex-1">
            <Button
              label="Vazgeç"
              variant="ghost"
              onPress={() => confirmDestructive('Değişiklikler geri alınsın mı?', 'Menü seçimi kayıtlı hâline döner.', 'Geri Al', () => setHidden(baseline))}
            />
          </View>
        ) : null}
        <View className="flex-1">
          <Button label="Kaydet" loading={update.isPending} disabled={!dirty} onPress={save} />
        </View>
      </View>
    </SettingsSubpage>
  );
}
