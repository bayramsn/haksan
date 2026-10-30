#!/usr/bin/env node
// CI bağımlılık denetimi: `npm audit` high/critical bulgularında kırılır; yalnızca
// aşağıda gerekçesi ve gözden geçirme tarihi yazılı advisory'ler geçici olarak kabul edilir.
// Yeni bir advisory (aynı pakette bile olsa) listede yoksa CI yine kırmızıdır.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ACCEPTED = {
  // zod 3.x için yama yok; düzeltme zod 4 geçişi (api/web/shared şemalarının tamamı).
  'GHSA-mrhx-c7xc-m3w5': { pkg: 'zod', until: '2027-01-31', reason: 'zod 4 geçişi ayrı iş olarak planlandı' },
  // Expo/metro araç zinciri (mobile-v2); web/API üretim paketine girmez, düzeltme Expo major yükseltmesi.
  'GHSA-qr28-fpjm-wq7f': { pkg: 'decode-uri-component', until: '2027-01-31', reason: 'expo-router → query-string; Expo yükseltmesi bekliyor' },
  'GHSA-5p2g-fcmc-qvqq': { pkg: 'image-size', until: '2027-01-31', reason: 'metro image-size ^1 ister; 1.x yaması yok' },
  'GHSA-w3rx-r6r6-pgpr': { pkg: 'image-size', until: '2027-01-31', reason: 'metro image-size ^1 ister; 1.x yaması yok' },
};

const BLOCKING = new Set(['high', 'critical']);

/** Kabul edilmemiş ya da süresi geçmiş high/critical advisory'leri döner. */
export function unacceptedAdvisories(report, today = new Date().toISOString().slice(0, 10)) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const id = via.url.split('/').pop();
      const accepted = ACCEPTED[id];
      if (accepted && accepted.pkg === via.name && today <= accepted.until) continue;
      found.set(id, `${via.severity} ${via.name} ${id} — ${via.title}${accepted ? ' (istisna süresi doldu)' : ''}`);
    }
  }
  return [...found.values()];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = ['audit', '--json', '--omit=dev', '--workspace', '@haksan/shared', '--workspace', '@haksan/api', '--workspace', '@haksan/web', '--include-workspace-root'];
  let raw;
  try {
    raw = execFileSync('npm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm audit bulgu olduğunda 1 ile çıkar; JSON yine stdout'tadır.
    raw = error.stdout;
    if (!raw) throw error;
  }
  const problems = unacceptedAdvisories(JSON.parse(raw));
  for (const [id, { pkg, until, reason }] of Object.entries(ACCEPTED)) console.log(`istisna: ${pkg} ${id} (${until}'e kadar) — ${reason}`);
  if (problems.length) {
    console.error(`\n${problems.length} kabul edilmemiş high/critical advisory:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('\nBağımlılık denetimi geçti.');
}
