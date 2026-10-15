import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TargetUpsertInput } from '@haksan/shared';
import { useAdminRoles, useRoleTargetMembers, useSaveRoleTarget } from '@/src/api/admin.hooks';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ModalShell } from '@/src/ui/admin/ModalShell';
import { TargetEditor } from '@/src/ui/admin/TargetEditor';
import { currentPeriod, emptyTarget, formatPeriodLabel, targetToApi } from '@/src/ui/admin/target-model';

export default function RoleTargetModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; period?: string }>();
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : currentPeriod();
  const access = useAdminAccess();
  const allowed = access.isSuperAdmin;
  const roles = useAdminRoles(allowed);
  const members = useRoleTargetMembers(params.id);
  const save = useSaveRoleTarget();
  const role = roles.data?.find((row) => row.id === params.id);

  return (
    <ModalShell
      title="Hedef Belirle"
      allowed={allowed}
      scroll={false}
      loading={roles.isPending || members.isPending}
      error={
        roles.error?.message ??
        (members.error ? `Rol üyeleri alınamadı: ${members.error.message}` : null) ??
        (roles.data && !role ? 'Rol bulunamadı' : null)
      }
      onRetry={() => {
        void roles.refetch();
        void members.refetch();
      }}
    >
      {role && members.data ? (
        <TargetEditor
          key={`${role.id}-${period}`}
          scope={{ kind: 'role', id: role.id, name: role.name, subtitle: role.code, memberCount: members.data.memberCount }}
          period={period}
          initial={emptyTarget(period)}
          saving={save.isPending}
          onSave={(form) =>
            save.mutate(
              { roleId: role.id, body: targetToApi(form) as TargetUpsertInput },
              {
                onSuccess: () => {
                  toast.success(`Hedef kaydedildi · ${role.name} · ${formatPeriodLabel(period)}`);
                  router.back();
                },
                onError: (err) => toast.error(`Hedef kaydedilemedi: ${err.message}`),
              }
            )
          }
        />
      ) : null}
    </ModalShell>
  );
}
