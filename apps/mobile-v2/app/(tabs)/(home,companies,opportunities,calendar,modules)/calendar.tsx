import { ModuleGate } from '@/src/navigation/ModuleGate';
import Screen from './modules/calendar/index';

export default function CalendarTab() {
  return (
    <ModuleGate moduleKey="calendar">
      <Screen />
    </ModuleGate>
  );
}
