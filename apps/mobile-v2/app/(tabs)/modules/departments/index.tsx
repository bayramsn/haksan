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
        subtitle="Şirket kapsamındaki ekipleri, kod yapılarını ve dönemsel hedef hazırlığını tek yüzeyde izleyin."
      />
      <DepartmentManager mode="module" />
    </SafeAreaView>
  );
}
