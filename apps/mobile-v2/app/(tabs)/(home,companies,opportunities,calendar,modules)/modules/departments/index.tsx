import { SafeAreaView } from 'react-native-safe-area-context';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { ScreenHeader } from '@/src/ui';
import { DepartmentManager } from '@/src/ui/admin/DepartmentManager';

export default function DepartmentsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Departmanlar"
        subtitle="Ekipler, departman bilgileri ve dönemsel hedefler."
      />
      <DepartmentManager mode="module" />
    </SafeAreaView>
  );
}
