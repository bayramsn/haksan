import Screen from '@/src/features/calendar-screen';
import { ModuleAccess } from '@/src/modules/ModuleAccess';
export default function ProtectedScreen() {
  return <ModuleAccess moduleKey="calendar"><Screen /></ModuleAccess>;
}
