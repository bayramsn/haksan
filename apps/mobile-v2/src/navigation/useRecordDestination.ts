import { useRootNavigationState, type Href } from 'expo-router';
import { recordDestination } from './tab-destination';
export function useRecordDestination() {
  const state = useRootNavigationState();
  return (path: string) => recordDestination(path, state) as Href;
}
