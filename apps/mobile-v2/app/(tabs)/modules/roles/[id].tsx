import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useAdminPermissions, useAdminRoles, useUpdateRole } from '@/src/api/admin.hooks';
import { Button, Card, Chip, DetailHeader, DetailSkeleton, EmptyState, ErrorState, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ACTION_LABEL, PERMISSION_ACTIONS, effectiveActionCounts, moduleCount, sameCodes } from '@/src/ui/admin/admin-model';
import { ActionPill, Notice, PeriodStepper, confirmDestructive } from '@/src/ui/admin/controls';
import { PermissionMatrix } from '@/src/ui/admin/PermissionMatrix';
import { currentPeriod } from '@/src/ui/admin/target-model';

export default function RoleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAdminAccess();
  const canManageRoles = access.isSuperAdmin;
  const roles = useAdminRoles();
  const permissions = useAdminPermissions();
  const update = useUpdateRole();
  const role = roles.data?.find((row) => row.id === id);
  const savedCodes = useMemo(() => (role ? role.permissions.map((p) => p.code).sort() : []), [role]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [period, setPeriod] = useState(currentPeriod());

  const reset = () => {
    if (!role) return;
    setName(role.name);
    setDescription(role.description ?? '');
    setCodes(savedCodes);
  };
  useEffect(reset, [role, savedCodes]);

  const dirty =
    !!role && (name.trim() !== role.name || (description.trim() || null) !== (role.description ?? null) || !sameCodes(codes, savedCodes));
  const counts = effectiveActionCounts(permissions.data ?? [], codes);

  const save = () => {
    if (!role || !canManageRoles) return;
    if (!name.trim()) {
      toast.error('Rol adı gerekli');
      return;
    }
    update.mutate(
      { id: role.id, body: { name: name.trim(), description: description.trim() || null, permissionCodes: codes } },
      {
        onSuccess: () => toast.success('Rol güncellendi'),
        onError: (err) => toast.error(`Rol güncellenemedi: ${err.message}`),
      }
    );
  };

  const shell = (body: React.ReactNode) => (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title={role?.name ?? 'Rol'} subtitle={role?.code} />
      {body}
    </SafeAreaView>
  );

  if (roles.isPending || permissions.isPending) return shell(<DetailSkeleton />);
  if (roles.error || permissions.error) {
    return shell(
      <ErrorState
        message={(roles.error ?? permissions.error)!.message}
        onRetry={() => {
          void roles.refetch();
          void permissions.refetch();
        }}
      />
    );
  }
  if (!role) return shell(<EmptyState icon="shield-outline" title="Rol bulunamadı" actionLabel="Listeye dön" onAction={() => router.back()} />);

  return shell(
    <ScrollView
      contentContainerClassName="gap-4 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={roles.isRefetching}
          onRefresh={() => {
            if (dirty) return;
            void roles.refetch();
            void permissions.refetch();
          }}
        />
      }
    >
      <View className="flex-row flex-wrap gap-1.5">
        <Chip tone="info" label={role.code} />
        {role.isSystemRole ? <Chip tone="neutral" label="Sistem rolü" /> : null}
        {!canManageRoles ? <Chip tone="warning" label="Salt görüntüleme" /> : null}
        {dirty ? <Chip tone="info" label="Kaydedilmemiş değişiklik" /> : null}
      </View>

      {!canManageRoles ? (
        <Notice tone="warning" title="Rolleri yalnızca Süper Admin düzenleyebilir">
          Bu sayfada rol ve yetki matrisi görüntülenebilir; değişiklik yapmak için süper admin hesabı gerekir.
        </Notice>
      ) : null}

      <Field label="Rol Adı" value={name} onChangeText={setName} editable={canManageRoles} maxLength={255} />
      <Field
        label="Açıklama"
        value={description}
        onChangeText={setDescription}
        editable={canManageRoles}
        placeholder="Rol açıklaması yok."
        multiline
        maxLength={2000}
        style={{ minHeight: 72, paddingTop: 12 }}
      />

      <View className="flex-row gap-3">
        <Card className="flex-1 gap-0.5 p-3">
          <Text className="font-inter text-[11px] text-muted-foreground">Seçili Yetki</Text>
          <Text className="font-display text-[22px] text-foreground">{codes.length}</Text>
        </Card>
        <Card className="flex-1 gap-0.5 p-3">
          <Text className="font-inter text-[11px] text-muted-foreground">Modül</Text>
          <Text className="font-display text-[22px] text-foreground">{moduleCount(permissions.data ?? [], codes)}</Text>
        </Card>
      </View>

      {canManageRoles ? (
        <Card className="gap-3 p-3">
          <PeriodStepper period={period} onChange={setPeriod} />
          <ActionPill
            icon="trending-up-outline"
            label="Hedef Belirle"
            onPress={() => router.push(`/modal/role-target?id=${role.id}&period=${period}` as Href)}
          />
        </Card>
      ) : null}

      <View className="gap-1">
        <Text className="font-inter-semibold text-[16px] text-foreground">Yetki Matrisi</Text>
        <Text className="font-inter text-[12px] text-muted-foreground">Kaynak bazında aksiyon yetkileri</Text>
      </View>
      <View accessible accessibilityLabel="Efektif yetki özeti" className="flex-row flex-wrap gap-2">
        {PERMISSION_ACTIONS.map((action) => (
          <View key={action} className="min-w-[72px] flex-1 items-center rounded-control border border-border bg-card px-2 py-2">
            <Text className="font-display text-[18px] text-foreground">{counts[action]}</Text>
            <Text className="font-inter-semibold text-[9px] uppercase tracking-[0.8px] text-muted-foreground" numberOfLines={1}>
              {ACTION_LABEL[action]}
            </Text>
          </View>
        ))}
      </View>

      <PermissionMatrix permissions={permissions.data ?? []} selected={codes} onChange={setCodes} readOnly={!canManageRoles} />

      {canManageRoles ? (
        <View className="flex-row gap-2">
          {dirty ? (
            <View className="flex-1">
              <Button
                label="Vazgeç"
                variant="ghost"
                disabled={update.isPending}
                onPress={() => confirmDestructive('Değişiklikler geri alınsın mı?', 'Kaydedilmemiş rol değişiklikleri silinir.', 'Geri Al', reset)}
              />
            </View>
          ) : null}
          <View className="flex-1">
            <Button label="Kaydet" loading={update.isPending} disabled={!dirty} onPress={save} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
