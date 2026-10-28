import { useSyncExternalStore } from 'react';
import { kv } from '@/src/offline/storage';

const KEY = 'reduce_navigation_effects';
const listeners = new Set<() => void>();

export const loadReducedEffects = () => kv.getString(KEY) === 'true';

export function setReducedEffects(value: boolean): void {
  kv.set(KEY, String(value));
  listeners.forEach((listener) => listener());
}

export function useReducedEffects(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, loadReducedEffects, () => true);
}
