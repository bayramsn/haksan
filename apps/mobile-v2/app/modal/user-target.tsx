import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TargetUpsertInput } from '@haksan/shared';
import { useAdminUsers, useSaveUserTarget, useUserTargets } from '@/src/api/admin.hooks';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ModalShell } from '@/src/ui/admin/ModalShell';
import { TargetEditor } from '@/src/ui/admin/TargetEditor';
import { currentPeriod, emptyTarget, formatPeriodLabel, targetFromApi, targetToApi } from '@/src/ui/admin/target-model';

export default function UserTargetModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; period?: string }>();
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : currentPeriod();
  const access = useAdminAccess();
  const allowed = access.isAdmin;
  const users = useAdminUsers(allowed);
  const targets = useUserTargets(period, allowed);
  const save = useSaveUserTarget();
  const user = users.data?.find((row) => row.id === params.id);
  const row = targets.data?.find((item) => item.userId === params.id);

  return (
    <ModalShell
      title="Hedef Belirle"
      allowed={allowed}
      scroll={false}
      loading={users.isPending || targets.isPending}
      error={users.error?.message ?? targets.error?.message ?? (users.data && !user ? 'Kullanıcı bulunamadı' : null)}
      onRetry={() => {
        void users.refetch();
        void targets.refetch();
      }}
    >
      {user ? (
        <TargetEditor
          key={`${user.id}-${period}-${row?.id ?? 'new'}`}
          scope={{ kind: 'user', id: user.id, name: user.fullName, subtitle: user.department?.name ?? user.email }}
          period={period}
          initial={row ? targetFromApi(row, period) : emptyTarget(period)}
          saving={save.isPending}
          onSave={(form) =>
            save.mutate(
              { userId: user.id, body: targetToApi(form) as TargetUpsertInput },
              {
                onSuccess: () => {
                  toast.success(`Hedef kaydedildi · ${user.fullName} · ${formatPeriodLabel(period)}`);
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
