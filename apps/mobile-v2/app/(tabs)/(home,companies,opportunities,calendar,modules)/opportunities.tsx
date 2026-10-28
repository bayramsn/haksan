import { ModuleGate } from '@/src/navigation/ModuleGate';
import Screen from './modules/opportunities/index';

export default function OpportunitiesTab() {
  return (
    <ModuleGate moduleKey="opportunities">
      <Screen />
    </ModuleGate>
  );
}
