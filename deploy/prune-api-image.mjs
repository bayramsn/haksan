#!/usr/bin/env node
// API imajı için: package-lock.json'dan kök + API + shared'ın üretim bağımlılık
// ağacını Node çözümleme kuralıyla yürür; ulaşılamayan her paketi node_modules'tan
// siler. `npm prune --workspace` hoist edilmiş mobile-v2 (Expo/metro) ve web
// bağımlılıklarını bırakıyor; imaj taraması bunlar yüzünden yayını durduruyordu.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROOTS = ['', 'apps/api', 'packages/shared'];

/** `from` konumundaki paketin `name` bağımlılığı için lock anahtarı (Node'un yukarı doğru araması). */
export function resolve(packages, from, name) {
  let dir = from;
  for (;;) {
    const key = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[key]) return key;
    if (!dir) return null;
    const nested = dir.lastIndexOf('/node_modules/');
    dir = nested >= 0 ? dir.slice(0, nested) : '';
  }
}

export function reachable(packages, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = packages[key];
    if (!entry) continue;
    if (entry.link) { queue.push(entry.resolved); continue; }
    const peers = Object.keys(entry.peerDependencies ?? {}).filter((n) => !entry.peerDependenciesMeta?.[n]?.optional);
    for (const name of [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {}), ...peers]) {
      const dep = resolve(packages, key, name);
      if (dep) queue.push(dep);
    }
  }
  return seen;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const keep = reachable(packages, ROOTS);
  let removed = 0;
  for (const key of Object.keys(packages).filter((k) => k.includes('node_modules/')).sort()) {
    if (keep.has(key) || !existsSync(key)) continue;
    rmSync(key, { recursive: true, force: true });
    removed += 1;
  }
  console.log(`prune-api-image: ${keep.size} paket tutuldu, ${removed} paket silindi`);
}
