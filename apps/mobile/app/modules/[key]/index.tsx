import { useLocalSearchParams } from 'expo-router';
import { ModuleRouter } from '@/src/screens/ModuleRouter';

export default function ModuleListRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <ModuleRouter navKey={key ?? ''} />;
}
