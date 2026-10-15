import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useAdminLookupNames } from '@/src/api/admin.hooks';
import { useTheme } from '@/src/theme/theme';
import { Card, EmptyState, SearchBar } from '@/src/ui';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect } from '@/src/ui/admin/controls';
import { flowStepIndex, lookupLabel, lookupMenuGroups, PRODUCT_FLOW_STEPS } from '@/src/ui/admin/lookup-meta';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';
import { useSettingsDivision } from '@/src/ui/admin/useSettingsDivision';

export default function LookupMenuScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const access = useAdminAccess();
  const names = useAdminLookupNames(access.isSuperAdmin);
  const { divisionId, setDivisionId, options } = useSettingsDivision();
  const [search, setSearch] = useState('');
  // Uç başarısız olursa web gibi bilinen tüm listelere düşülür.
  const groups = useMemo(() => lookupMenuGroups(names.data?.available ?? [], search), [names.data, search]);

  return (
    <SettingsSubpage
      title="CRM Alan Ayarları"
      subtitle="Firma, satış, ürün ve finans formlarındaki seçim listelerini yönetin."
      allowed={access.isSuperAdmin}
      loading={names.isPending}
      refreshing={names.isRefetching}
      onRefresh={() => void names.refetch()}
    >
      {options.length ? (
        <ChipSelect label="Bölüm" options={options.map((d) => ({ value: d.id, label: d.name }))} value={divisionId} onChange={setDivisionId} />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <ActionPill icon="layers-outline" label="Teknik alanları düzenle" onPress={() => router.push('/(tabs)/more/settings/spec-templates' as Href)} />
        <ActionPill
          icon="cloud-upload-outline"
          label="Teknik bilgileri içe aktar"
          onPress={() => router.push('/modal/spec-template-import' as Href)}
        />
      </View>
      <Help>Seçim listelerini CSV ile aktarın. Marka, sahip ve tedarikçi bağlantıları marka formundan yönetilir.</Help>
      <SearchBar value={search} onChange={setSearch} placeholder="Alan ayarında ara…" />
      {groups.length === 0 ? (
        <EmptyState icon="search-outline" title="Eşleşen alan yok." />
      ) : (
        groups.map((group) => (
          <View key={group.label} className="gap-2">
            <Text className="font-inter-semibold text-[11px] uppercase tracking-[1.4px] text-muted-foreground">
              {group.label}
              {group.label === 'Ürün' ? <Text className="normal-case tracking-normal"> · 1→{PRODUCT_FLOW_STEPS.length} sırayla kurulur</Text> : null}
            </Text>
            <Card className="overflow-hidden p-0">
              {group.names.map((name, index) => {
                const step = flowStepIndex(name);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={lookupLabel(name)}
                    onPress={() =>
                      router.push(`/(tabs)/more/settings/lookups/${name}?divisionId=${encodeURIComponent(divisionId)}` as Href)
                    }
                    className={`min-h-[52px] flex-row items-center gap-3 px-3.5 py-2.5 active:opacity-70 ${index ? 'border-t border-border' : ''}`}
                  >
                    {step >= 0 ? (
                      <View className="h-6 w-6 items-center justify-center rounded bg-muted">
                        <Text className="font-inter-semibold text-[11px] text-muted-foreground">{step + 1}</Text>
                      </View>
                    ) : null}
                    <View className="flex-1 gap-0.5">
                      <Text className="font-inter-medium text-[15px] text-foreground">{lookupLabel(name)}</Text>
                      {step >= 0 ? (
                        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
                          {PRODUCT_FLOW_STEPS[step]?.helper}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </SettingsSubpage>
  );
}
