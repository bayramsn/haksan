import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useAdminUsers } from '@/src/api/admin.hooks';
import { useLeadRules, useRemoveLeadRule, useUpdateLeadRule } from '@/src/api/settings.hooks';
import type { LeadAssignmentRule } from '@/src/api/settings.api';
import { Card, Chip, EmptyState, ErrorState, ListSkeleton, SCREEN_PAD } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, confirmDestructive } from '@/src/ui/admin/controls';
import { leadRuleSummary } from '@/src/ui/admin/lead-rule-model';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

export default function LeadRulesScreen() {
  const router = useRouter();
  const access = useAdminAccess();
  const allowed = access.has('lead_assignment_rules.manage');
  const rules = useLeadRules(allowed);
  const users = useAdminUsers(allowed && access.has('users.read'));
  const update = useUpdateLeadRule();
  const remove = useRemoveLeadRule();
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.fullName])), [users.data]);

  const toggle = (rule: LeadAssignmentRule) =>
    update.mutate(
      { id: rule.id, body: { active: !rule.active } },
      {
        onSuccess: () => toast.success(rule.active ? 'Atama kuralı pasifleştirildi' : 'Atama kuralı aktifleştirildi'),
        onError: (err) => toast.error(`Atama kuralı güncellenemedi: ${err.message}`),
      }
    );

  const askRemove = (rule: LeadAssignmentRule) =>
    confirmDestructive(
      'Atama kuralı silinsin mi?',
      `“${rule.name}” yeni fırsatlarda artık çalışmayacak. Mevcut fırsat sahipleri değişmeyecek.`,
      'Kuralı sil',
      () =>
        remove.mutate(rule.id, {
          onSuccess: () => toast.success('Atama kuralı silindi'),
          onError: (err) => toast.error(`Atama kuralı silinemedi: ${err.message}`),
        })
    );

  const sorted = [...(rules.data ?? [])].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'tr-TR'));

  return (
    <SettingsSubpage
      title="Fırsat atama kuralları"
      allowed={allowed}
      scroll={false}
      actions={[{ icon: 'add', label: 'Kural ekle', onPress: () => router.push('/modal/lead-rule-edit' as Href) }]}
    >
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={rules.isPending || rules.error ? [] : sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="pb-2">
            <Help>Bölüm, şehir, ürün ve kaynağa göre aktif satış kullanıcılarına round-robin dağıtım.</Help>
          </View>
        }
        renderItem={({ item }) => (
          <Card className="my-1.5 gap-2 p-3.5">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="shrink font-inter-semibold text-[15px] text-foreground">{item.name}</Text>
              <Chip tone="neutral" label={`Öncelik ${item.priority}`} />
              <Chip tone={item.active ? 'success' : 'neutral'} label={item.active ? 'Aktif' : 'Pasif'} />
            </View>
            <Text className="font-inter text-[12px] text-muted-foreground">{leadRuleSummary(item)}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground">
              {item.assigneeUserIds.map((id) => names.get(id) ?? id.slice(0, 8)).join(' → ')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <ActionPill
                icon="sync-outline"
                label={item.active ? 'Kuralı pasifleştir' : 'Kuralı aktifleştir'}
                disabled={update.isPending}
                onPress={() => toggle(item)}
              />
              <ActionPill icon="create-outline" label="Kuralı düzenle" onPress={() => router.push(`/modal/lead-rule-edit?id=${item.id}` as Href)} />
              <ActionPill icon="trash-outline" tone="destructive" label="Kuralı sil" disabled={remove.isPending} onPress={() => askRemove(item)} />
            </View>
          </Card>
        )}
        refreshing={rules.isRefetching}
        onRefresh={() => {
          void rules.refetch();
          void users.refetch();
        }}
        ListEmptyComponent={
          rules.isPending ? (
            <ListSkeleton />
          ) : rules.error ? (
            <ErrorState message={`Fırsat atama kuralları yüklenemedi: ${rules.error.message}`} onRetry={() => void rules.refetch()} />
          ) : (
            <EmptyState
              icon="git-branch-outline"
              title="Henüz atama kuralı yok. Yeni fırsatlar sahipsiz havuzda kalır."
              actionLabel="Kural ekle"
              onAction={() => router.push('/modal/lead-rule-edit' as Href)}
            />
          )
        }
      />
    </SettingsSubpage>
  );
}
