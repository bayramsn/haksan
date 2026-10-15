import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAdminRoles, useAdminUsers, useUpdateUser } from '@/src/api/admin.hooks';
import { Button, EmptyState } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { sortRoles, toggleSorted } from '@/src/ui/admin/admin-model';
import { CheckRow } from '@/src/ui/admin/controls';
import { ModalShell } from '@/src/ui/admin/ModalShell';

export default function UserRolesModal() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAdminAccess();
  const allowed = access.isAdmin && (access.isSuperAdmin || access.has('users.update'));
  const users = useAdminUsers(allowed);
  const roles = useAdminRoles(allowed);
  const update = useUpdateUser();
  const user = users.data?.find((row) => row.id === id);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (user) setSelected(user.roles.map((role) => role.code).sort());
  }, [user]);

  const save = () => {
    if (!user) return;
    update.mutate(
      { id: user.id, body: { roleCodes: selected } },
      {
        onSuccess: () => {
          toast.success('Roller güncellendi');
          router.back();
        },
        onError: (err) => toast.error(`Roller güncellenemedi: ${err.message}`),
      }
    );
  };

  const roleList = sortRoles(roles.data ?? []);

  return (
    <ModalShell
      title={user ? `Rol Ata · ${user.fullName}` : 'Rol Ata'}
      allowed={allowed}
      loading={users.isPending || roles.isPending}
      error={users.error?.message ?? (users.data && !user ? 'Kullanıcı bulunamadı' : null)}
      onRetry={() => {
        void users.refetch();
        void roles.refetch();
      }}
      description="Kullanıcının erişim rollerini seçin. Kaydettiğinizde roller mevcut seçimle değiştirilir."
    >
      {roles.error || roleList.length === 0 ? (
        <EmptyState icon="shield-outline" title="Rol listesi yüklenemedi" actionLabel="Tekrar dene" onAction={() => void roles.refetch()} />
      ) : (
        roleList.map((role) => (
          <CheckRow
            key={role.code}
            title={role.name}
            subtitle={role.description ?? role.code}
            badge={role.isSystemRole ? 'Sistem' : undefined}
            checked={selected.includes(role.code)}
            onToggle={() => setSelected((prev) => toggleSorted(prev, role.code, !prev.includes(role.code)))}
          />
        ))
      )}
      <Button label="Rolleri Kaydet" loading={update.isPending} disabled={!user || roleList.length === 0} onPress={save} />
    </ModalShell>
  );
}
