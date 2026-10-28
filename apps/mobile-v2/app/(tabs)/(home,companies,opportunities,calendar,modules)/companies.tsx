import { ModuleGate } from '@/src/navigation/ModuleGate';
import Screen from './modules/companies/index';

export default function CompaniesTab() {
  return (
    <ModuleGate moduleKey="companies">
      <Screen />
    </ModuleGate>
  );
}
