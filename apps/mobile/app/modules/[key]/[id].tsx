import { useLocalSearchParams } from 'expo-router';
import { ModuleRouter } from '@/src/screens/ModuleRouter';

export default function ModuleDetailRoute() {
  const { key, id } = useLocalSearchParams<{ key: string; id: string }>();
  return <ModuleRouter navKey={key ?? ''} id={id} />;
}
