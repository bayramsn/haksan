import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TargetUpsertInput } from '@haksan/shared';
import { useAdminDepartments, useDepartmentTargets, useSaveDepartmentTarget } from '@/src/api/admin.hooks';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ModalShell } from '@/src/ui/admin/ModalShell';
import { TargetEditor } from '@/src/ui/admin/TargetEditor';
import { currentPeriod, emptyTarget, formatPeriodLabel, targetFromApi, targetToApi } from '@/src/ui/admin/target-model';

export default function DepartmentTargetModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; period?: string }>();
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : currentPeriod();
  const access = useAdminAccess();
  const allowed = access.isAdmin;
  const departments = useAdminDepartments(allowed);
  const targets = useDepartmentTargets(period, allowed);
  const save = useSaveDepartmentTarget();
  const department = departments.data?.find((d) => d.id === params.id);
  const row = targets.data?.find((item) => item.departmentId === params.id);

  return (
    <ModalShell
      title="Hedef Belirle"
      allowed={allowed}
      scroll={false}
      loading={departments.isPending || targets.isPending}
      error={departments.error?.message ?? targets.error?.message ?? (departments.data && !department ? 'Departman bulunamadı' : null)}
      onRetry={() => {
        void departments.refetch();
        void targets.refetch();
      }}
    >
      {department ? (
        <TargetEditor
          key={`${department.id}-${period}-${row?.id ?? 'new'}`}
          scope={{ kind: 'department', id: department.id, name: department.name, subtitle: department.code }}
          period={period}
          initial={row ? targetFromApi(row, period) : emptyTarget(period)}
          saving={save.isPending}
          onSave={(form) =>
            save.mutate(
              { departmentId: department.id, body: targetToApi(form) as TargetUpsertInput },
              {
                onSuccess: () => {
                  toast.success(`Hedef kaydedildi · ${department.name} · ${formatPeriodLabel(period)}`);
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
