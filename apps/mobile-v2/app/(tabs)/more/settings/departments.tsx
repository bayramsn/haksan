import { useAdminAccess } from '@/src/ui/admin/access';
import { DepartmentManager } from '@/src/ui/admin/DepartmentManager';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

export default function SettingsDepartmentsScreen() {
  const access = useAdminAccess();
  return (
    <SettingsSubpage
      title="Kullanıcı Departmanları"
      subtitle="Kullanıcı formlarındaki departman listesi"
      allowed={access.isSuperAdmin}
      scroll={false}
    >
      <DepartmentManager mode="settings" />
    </SettingsSubpage>
  );
}
