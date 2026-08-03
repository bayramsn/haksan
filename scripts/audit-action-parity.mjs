#!/usr/bin/env node
/**
 * Action Parity Auditor — Haksan CRM
 *
 * Web (`apps/web`) ve mobil (`apps/mobile`) için **kullanıcının yapabildiği her aksiyonun**
 * envanterini çıkarır ve iki taraf arasındaki parite farkını raporlar.
 *
 * Çıktılar:
 *   - docs/web-action-registry.json    Tam makine-okur envanter (controller + service + page)
 *   - docs/web-action-registry.md      Sayfa bazında insan-okur rapor
 *   - docs/mobile-parity-gaps.md       Web'de olup mobilde olmayan servis metotları
 *
 * Mantık:
 *   1. apps/api/src/modules/<x>/<y>.controller.ts → her HTTP handler için
 *        { method, path, permission, controller, handler }
 *   2. apps/web/src/lib/services.ts → `xxxService.method` blokları içindeki
 *        `api.<verb>('<path>'`  satırlarından action key (ör: `company.update`) ve endpoint çıkarılır
 *   3. (2) ↔ (1): HTTP method + path eşleşmesiyle permission key bağlanır
 *   4. apps/mobile/src/api/services.ts aynı şekilde okunur → mobilde mevcut service.method seti
 *   5. apps/web/src/app/components/pages/**.tsx içinde `<service>.<method>(` çağrıları taranır
 *        → her sayfa için kullanılan aksiyonların listesi
 *   6. Parite raporu üretilir.
 *
 * Kullanım:
 *   node scripts/audit-action-parity.mjs
 *   node scripts/audit-action-parity.mjs --check   # CI: parite eksiği varsa exit 1
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API_MODULES = join(ROOT, 'apps/api/src/modules');
const WEB_SERVICES = join(ROOT, 'apps/web/src/lib/services.ts');
const MOBILE_SERVICES = join(ROOT, 'apps/mobile/src/api/services.ts');
const MOBILE_SERVICES_WEB = join(ROOT, 'apps/mobile/src/api/services.web.ts');
const WEB_PAGES = join(ROOT, 'apps/web/src/app/components/pages');
const DOCS = join(ROOT, 'docs');

const CHECK_MODE = process.argv.includes('--check');

// ───────── helpers ─────────

function walk(dir, filter = () => true, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
      walk(full, filter, acc);
    } else if (filter(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function read(file) {
  return readFileSync(file, 'utf8');
}

/**
 * Normalize an API path from either a TypeScript template literal or a Nest controller decorator.
 * - `${qs(params)}` / `${qs(...)}` / `${...query...}` → stripped (these emit a query string, not a path segment)
 * - Other `${id}` interpolations → `:param`
 * - `:id` route params → `:param`
 * - Query string after `?` → stripped
 * - Duplicate slashes collapsed, trailing slash removed.
 */
function stripBalancedInterpolations(input, predicate) {
  let out = '';
  let i = 0;
  while (i < input.length) {
    if (input[i] === '$' && input[i + 1] === '{') {
      // Find matching closing brace, accounting for nested braces.
      let depth = 1;
      let j = i + 2;
      while (j < input.length && depth > 0) {
        const c = input[j];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        if (depth === 0) break;
        j++;
      }
      const inner = input.slice(i + 2, j);
      out += predicate(inner);
      i = j + 1;
    } else {
      out += input[i++];
    }
  }
  return out;
}

function normalizePath(p) {
  let out = p ?? '';
  out = stripBalancedInterpolations(out, (inner) => {
    const trimmed = inner.trim();
    // Query-string–producing interpolations are stripped entirely.
    if (/^qs\s*\(/.test(trimmed)) return '';
    // Anything else is treated as a single path parameter.
    return ':param';
  });
  // Nest-style :id → :param
  out = out.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ':param');
  // Strip query string.
  out = out.replace(/\?.*$/, '');
  if (!out.startsWith('/')) out = '/' + out;
  out = out.replace(/\/{2,}/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function joinRoute(base, sub) {
  const b = base.replace(/^\/+|\/+$/g, '');
  const s = (sub ?? '').replace(/^\/+|\/+$/g, '');
  return '/' + [b, s].filter(Boolean).join('/');
}

// ───────── 1. API controllers ─────────

function parseControllers() {
  const files = walk(API_MODULES, (f) => f.endsWith('.controller.ts') && !basename(f).includes(' '));
  /** @type {Array<{ method:string, path:string, permission:string|null, controller:string, handler:string, file:string }>} */
  const endpoints = [];

  for (const file of files) {
    const src = read(file);
    // Split on top-level @Controller(...) blocks so we can support files with multiple controllers
    // @Controller(...) followed (optionally) by other decorators, then `export class X`.
    // Supports @Controller(), @Controller('x'), @Controller({ path: 'x', ... }).
    const controllerRe = /@Controller\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*?path\s*:\s*['"`]([^'"`]*)['"`][^}]*\}|)\s*\)[\s\S]*?export\s+class\s+(\w+)/g;
    const blocks = [];
    let m;
    while ((m = controllerRe.exec(src)) !== null) {
      blocks.push({ basePath: m[1] ?? m[2] ?? '', className: m[3], start: m.index });
    }
    if (blocks.length === 0) continue;
    for (let i = 0; i < blocks.length; i++) {
      const start = blocks[i].start;
      const end = i + 1 < blocks.length ? blocks[i + 1].start : src.length;
      const body = src.slice(start, end);

      // Walk through method handlers
      const handlerRe = /(?:@RequirePermissions\(\s*['"`]([^'"`]+)['"`]\s*\)[\s\S]*?)?@(Get|Post|Patch|Put|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)\s*\n\s*(?:async\s+)?(\w+)\s*\(/g;
      let h;
      while ((h = handlerRe.exec(body)) !== null) {
        const [, perm, verb, sub, handler] = h;
        endpoints.push({
          method: verb.toUpperCase(),
          path: normalizePath(joinRoute(blocks[i].basePath, sub ?? '')),
          permission: perm ?? null,
          controller: blocks[i].className,
          handler,
          file: relative(ROOT, file),
        });
      }
    }
  }
  return endpoints;
}

function parseServices(file) {
  const src = read(file);
  const actions = [];
  const serviceRe = /export\s+const\s+(\w+)Service\s*=\s*\{/g;
  let s;
  while ((s = serviceRe.exec(src)) !== null) {
    const ns = s[1]; // ör: company, contact, opportunity
    const startIdx = src.indexOf('{', s.index);
    // Find matching closing brace
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx === -1) continue;
    const body = src.slice(startIdx + 1, endIdx);

    // Split into method properties at top-level commas
    let depthLocal = 0;
    let parenDepth = 0;
    let lastCut = 0;
    const props = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '{') depthLocal++;
      else if (c === '}') depthLocal--;
      else if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
      else if (c === ',' && depthLocal === 0 && parenDepth === 0) {
        props.push(body.slice(lastCut, i));
        lastCut = i + 1;
      }
    }
    if (lastCut < body.length) props.push(body.slice(lastCut));

    for (const raw of props) {
      const prop = raw.trim();
      if (!prop) continue;
      // method name = identifier before `:`
      const nameMatch = prop.match(/^(\w+)\s*:/);
      if (!nameMatch) continue;
      const method = nameMatch[1];
      // First api.<verb>('<path>'  call. Generics may nest (e.g. `<Paginated<Foo>>`), so we
      // allow any characters except parentheses inside the generic argument.
      const apiCall = prop.match(/api\.(get|post|patch|put|delete)\s*(?:<[^()]*>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/i);
      const verb = apiCall ? apiCall[1].toUpperCase() : null;
      const path = apiCall ? normalizePath(apiCall[2]) : null;

      actions.push({
        key: `${ns}.${method}`,
        ns,
        method,
        verb,
        path,
      });
    }
  }
  return actions;
}

function dedupeActions(actions) {
  const seen = new Map();
  for (const a of actions) {
    if (!seen.has(a.key)) seen.set(a.key, a);
  }
  return [...seen.values()];
}

// ───────── 3. Per-page action usage (web) ─────────

function parsePageUsage(webActions) {
  const pageFiles = walk(WEB_PAGES, (f) => /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f) && !basename(f).includes(' '));
  /** @type {Record<string, Set<string>>} pageFile → actionKeys */
  const map = {};
  for (const file of pageFiles) {
    const src = read(file);
    const used = new Set();
    for (const a of webActions) {
      // crude but effective: <ns>Service.<method>(
      const needle = `${a.ns}Service.${a.method}(`;
      if (src.includes(needle)) used.add(a.key);
    }
    if (used.size > 0) {
      map[relative(ROOT, file)] = used;
    }
  }
  return map;
}

// ───────── 4. Cross-reference & report ─────────

function indexEndpoints(eps) {
  const byMethodPath = new Map();
  for (const e of eps) byMethodPath.set(`${e.method} ${e.path}`, e);
  return byMethodPath;
}

function enrichActions(actions, epIndex) {
  return actions.map((a) => {
    if (!a.verb || !a.path) return { ...a, permission: null, controller: null };
    const ep = epIndex.get(`${a.verb} ${a.path}`);
    return {
      ...a,
      permission: ep?.permission ?? null,
      controller: ep?.controller ?? null,
      handler: ep?.handler ?? null,
    };
  });
}

function buildJsonReport({ endpoints, webActions, mobileActions, pageUsage, missingInMobile }) {
  const pages = Object.fromEntries(
    Object.entries(pageUsage).map(([file, set]) => [file, [...set].sort()])
  );
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      apiEndpoints: endpoints.length,
      webActions: webActions.length,
      mobileActions: mobileActions.length,
      pagesScanned: Object.keys(pageUsage).length,
      missingInMobile: missingInMobile.length,
    },
    endpoints,
    webActions,
    mobileActions,
    pageUsage: pages,
    parity: {
      missingInMobile,
    },
  };
}

function buildMarkdownReport({ webActions, pageUsage, endpoints }) {
  const epIndex = indexEndpoints(endpoints);
  const lines = [];
  lines.push('# Web Action Registry');
  lines.push('');
  lines.push('> Otomatik üretildi — `node scripts/audit-action-parity.mjs`.');
  lines.push('> Her aksiyon `<namespace>.<method>` formundadır ve `apps/web/src/lib/services.ts` ile API controller permission key\'i ile eşleşir.');
  lines.push('');
  lines.push(`- Toplam web aksiyonu: **${webActions.length}**`);
  lines.push(`- Tarana sayfa: **${Object.keys(pageUsage).length}**`);
  lines.push('');

  // Group actions by namespace
  const byNs = new Map();
  for (const a of webActions) {
    if (!byNs.has(a.ns)) byNs.set(a.ns, []);
    byNs.get(a.ns).push(a);
  }
  lines.push('## Namespace özeti');
  lines.push('');
  lines.push('| Namespace | Aksiyon sayısı | Permission key örneği |');
  lines.push('|---|---:|---|');
  for (const [ns, arr] of [...byNs.entries()].sort()) {
    const samplePerm = arr.find((a) => a.permission)?.permission ?? '—';
    lines.push(`| \`${ns}\` | ${arr.length} | \`${samplePerm}\` |`);
  }
  lines.push('');

  lines.push('## Sayfa bazında aksiyon kullanımı');
  lines.push('');
  const pageEntries = Object.entries(pageUsage).sort(([a], [b]) => a.localeCompare(b));
  for (const [file, keys] of pageEntries) {
    lines.push(`### \`${file}\``);
    lines.push('');
    lines.push('| Action key | HTTP | Path | Permission |');
    lines.push('|---|---|---|---|');
    for (const k of [...keys].sort()) {
      const a = webActions.find((x) => x.key === k);
      if (!a) continue;
      lines.push(`| \`${a.key}\` | ${a.verb ?? '?'} | \`${a.path ?? '?'}\` | ${a.permission ? '`' + a.permission + '`' : '—'} |`);
    }
    lines.push('');
  }

  lines.push('## Tam aksiyon listesi');
  lines.push('');
  lines.push('| Action key | HTTP | Path | Permission | Controller.handler |');
  lines.push('|---|---|---|---|---|');
  for (const a of [...webActions].sort((x, y) => x.key.localeCompare(y.key))) {
    const handler = a.controller ? `${a.controller}.${a.handler}` : '—';
    lines.push(`| \`${a.key}\` | ${a.verb ?? '?'} | \`${a.path ?? '?'}\` | ${a.permission ? '`' + a.permission + '`' : '—'} | ${handler} |`);
  }

  return lines.join('\n') + '\n';
}

function buildGapsReport({ webActions, mobileActions, missingInMobile }) {
  const mobileKeys = new Set(mobileActions.map((a) => a.key));
  const lines = [];
  lines.push('# Mobile Parity Gaps');
  lines.push('');
  lines.push('> Otomatik üretildi. Web servislerinde olup mobil servislerinde **bulunmayan** action key\'leri.');
  lines.push('> Bu liste sıfırlanana kadar mobil "parite" hedefine ulaşmış sayılmaz.');
  lines.push('');
  lines.push(`- Web aksiyonu: **${webActions.length}**`);
  lines.push(`- Mobil aksiyon: **${mobileActions.length}**`);
  lines.push(`- Eksik (mobile'de yok): **${missingInMobile.length}**`);
  lines.push('');

  // Group missing by namespace
  const byNs = new Map();
  for (const a of missingInMobile) {
    if (!byNs.has(a.ns)) byNs.set(a.ns, []);
    byNs.get(a.ns).push(a);
  }
  lines.push('## Eksikler (namespace bazında)');
  lines.push('');
  for (const [ns, arr] of [...byNs.entries()].sort()) {
    lines.push(`### \`${ns}\` — ${arr.length} eksik`);
    lines.push('');
    lines.push('| Action key | HTTP | Path | Permission |');
    lines.push('|---|---|---|---|');
    for (const a of arr.sort((x, y) => x.key.localeCompare(y.key))) {
      lines.push(`| \`${a.key}\` | ${a.verb ?? '?'} | \`${a.path ?? '?'}\` | ${a.permission ? '`' + a.permission + '`' : '—'} |`);
    }
    lines.push('');
  }

  // Reverse view: mobile-only (likely dead code or mobile-specific)
  const webKeys = new Set(webActions.map((a) => a.key));
  const mobileOnly = mobileActions.filter((a) => !webKeys.has(a.key));
  if (mobileOnly.length > 0) {
    lines.push('## Sadece mobilde tanımlı aksiyonlar');
    lines.push('');
    lines.push('> Bunlar mobil-specific akışlar (örn. çağrı asistanı) veya web tarafına eklenmesi gereken parite borcudur.');
    lines.push('');
    lines.push('| Action key | HTTP | Path |');
    lines.push('|---|---|---|');
    for (const a of mobileOnly.sort((x, y) => x.key.localeCompare(y.key))) {
      lines.push(`| \`${a.key}\` | ${a.verb ?? '?'} | \`${a.path ?? '?'}\` |`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

// ───────── main ─────────

function main() {
  console.log('▸ API controller\'ları taranıyor…');
  const endpoints = parseControllers();
  console.log(`  ${endpoints.length} endpoint bulundu.`);

  console.log('▸ Web servisleri taranıyor…');
  const rawWebActions = parseServices(WEB_SERVICES);
  console.log(`  ${rawWebActions.length} aksiyon (ham).`);

  console.log('▸ Mobil servisleri taranıyor…');
  const rawMobileActions = dedupeActions([
    ...parseServices(MOBILE_SERVICES),
    ...parseServices(MOBILE_SERVICES_WEB),
  ]);
  console.log(`  ${rawMobileActions.length} aksiyon (ham).`);

  const epIndex = indexEndpoints(endpoints);
  const webActions = enrichActions(rawWebActions, epIndex);
  const mobileActions = enrichActions(rawMobileActions, epIndex);

  console.log('▸ Sayfa kullanımı taranıyor…');
  const pageUsage = parsePageUsage(webActions);
  console.log(`  ${Object.keys(pageUsage).length} sayfa aksiyon çağırıyor.`);

  const mobileKeys = new Set(mobileActions.map((a) => a.key));
  const missingInMobile = webActions.filter((a) => !mobileKeys.has(a.key));
  console.log(`▸ Parite: mobile'de ${missingInMobile.length} aksiyon eksik.`);

  mkdirSync(DOCS, { recursive: true });
  writeFileSync(
    join(DOCS, 'web-action-registry.json'),
    JSON.stringify(buildJsonReport({ endpoints, webActions, mobileActions, pageUsage, missingInMobile }), null, 2)
  );
  writeFileSync(
    join(DOCS, 'web-action-registry.md'),
    buildMarkdownReport({ webActions, pageUsage, endpoints })
  );
  writeFileSync(
    join(DOCS, 'mobile-parity-gaps.md'),
    buildGapsReport({ webActions, mobileActions, missingInMobile })
  );

  console.log('');
  console.log('Yazılan dosyalar:');
  console.log('  docs/web-action-registry.json');
  console.log('  docs/web-action-registry.md');
  console.log('  docs/mobile-parity-gaps.md');

  if (CHECK_MODE && missingInMobile.length > 0) {
    console.error(`\n✖ Parite hatası: mobile'de ${missingInMobile.length} aksiyon eksik (--check modu).`);
    process.exit(1);
  }
}

main();
