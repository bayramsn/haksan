import { kv } from '@/src/offline/storage';
export type ModulePreferences = { favorites: string[]; recent: string[] };
const empty = (): ModulePreferences => ({ favorites: [], recent: [] });
export function readModulePreferences(scope: string): ModulePreferences {
  try {
    const raw = JSON.parse(kv.getString(`module-preferences:${scope}`) ?? '{}');
    const clean = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && /^[a-z0-9-]{1,80}$/.test(item)))].slice(0, 12) : [];
    return { favorites: clean(raw.favorites), recent: clean(raw.recent).slice(0, 5) };
  } catch { return empty(); }
}
export function writeModulePreferences(scope: string, value: ModulePreferences) {
  kv.set(`module-preferences:${scope}`, JSON.stringify(value));
}
