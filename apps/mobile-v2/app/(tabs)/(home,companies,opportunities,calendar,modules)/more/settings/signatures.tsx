import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { apiBaseUrl } from '@/src/api/config';
import { useRemoveSignature, useSignatures } from '@/src/api/settings.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { resolveMediaUrl } from '@/src/lib/mediaUrl';
import { useTheme } from '@/src/theme/theme';
import { Card, Chip, EmptyState } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, confirmDestructive } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

export default function SignatureSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const access = useAdminAccess();
  const canManage = access.has('tenants.update');
  const list = useSignatures();
  const remove = useRemoveSignature();
  const divisions = user?.divisions ?? [];
  const divisionLabel = (id: string | null) => (id ? divisions.find((d) => d.id === id)?.name ?? 'Bölüm' : 'Tüm bölümler');
  const rows = [...(list.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

  return (
    <SettingsSubpage
      title="Belge İmzaları"
      allowed={canManage}
      loading={list.isPending}
      error={list.error ? list.error.message || 'İmzalar yüklenemedi.' : null}
      onRetry={() => void list.refetch()}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      actions={[{ icon: 'add', label: 'İmza Ekle', onPress: () => router.push('/modal/signature-edit' as Href) }]}
    >
      <Help>Teklif, proforma, servis teklifi ve sözleşme çıktılarının altına basılan ad, ünvan ve imza görseli.</Help>
      {rows.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title="Henüz imza tanımlı değil"
          hint="İlk imzayı ekleyin; belge çıktılarında seçilebilir olsun."
          actionLabel="İmza Ekle"
          onAction={() => router.push('/modal/signature-edit' as Href)}
        />
      ) : (
        rows.map((signature) => {
          const image = resolveMediaUrl(signature.imageUrl, apiBaseUrl());
          return (
            <Card key={signature.id} className="gap-3 p-3">
              <View className="flex-row items-center gap-3">
                {image ? (
                  <Image
                    source={{ uri: image }}
                    accessibilityIgnoresInvertColors
                    resizeMode="contain"
                    className="h-12 w-20 rounded border border-border bg-card"
                  />
                ) : (
                  <View className="h-12 w-20 items-center justify-center rounded border border-dashed border-border">
                    <Ionicons name="image-outline" size={18} color={colors.mutedForeground} />
                  </View>
                )}
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="shrink font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
                      {signature.name}
                    </Text>
                    {!signature.isActive ? <Chip tone="neutral" label="Pasif" /> : null}
                  </View>
                  <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
                    {signature.title} · {divisionLabel(signature.divisionId)}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <ActionPill
                  icon="create-outline"
                  label="Düzenle"
                  onPress={() => router.push(`/modal/signature-edit?id=${signature.id}` as Href)}
                />
                <ActionPill
                  icon="trash-outline"
                  tone="destructive"
                  label="Kaldır"
                  disabled={remove.isPending}
                  onPress={() =>
                    confirmDestructive(
                      'İmza kaldırılsın mı?',
                      `${signature.name} yeni belgelerde seçilemez olur. Daha önce basılmış belgeler kendi imzasını korur, ancak kaldırılan imzanın görseli yeniden yazdırmada çıkmaz — ad ve ünvan basılmaya devam eder.`,
                      'Kaldır',
                      () =>
                        remove.mutate(signature.id, {
                          onSuccess: () => toast.success('İmza kaldırıldı. Yeni belgelerde seçilemez; basılmış belgeler kendi imzasını korur.'),
                          onError: (err) => toast.error(`İmza kaldırılamadı: ${err.message}`),
                        })
                    )
                  }
                />
              </View>
            </Card>
          );
        })
      )}
    </SettingsSubpage>
  );
}
