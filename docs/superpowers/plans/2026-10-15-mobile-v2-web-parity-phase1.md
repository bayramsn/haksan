# Mobile-v2 Web Paritesi Aşama 1 (Temel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/mobile-v2`'yi git'e almak, temasını web'in lacivert marka diline hizalamak ve aşama 2–6'yı besleyecek web↔mobil eşleşme tablosunu üretmek.

**Architecture:** Renkler tek kaynaktan (`theme.config.js` → `gen:css` → `global.css`) akar; web değerleriyle eşitliği bir `node --test` testi korur. Parite ölçümü mevcut `scripts/audit-action-parity.mjs`'e `--target=mobile-v2` modu eklenerek alınır; mobil çağrılar `request(path, { method })` biçiminden HTTP metodu + normalize yol olarak çıkarılır.

**Tech Stack:** Expo SDK 54, React Native 0.81, NativeWind 4, Node `node:test`, ripgrep.

**Spec:** `docs/superpowers/specs/2026-10-15-mobile-v2-web-parity-phase1-design.md`

## Global Constraints

- `apps/web/**` değişmez. `apps/api/**` değişmez.
- Canlı API (`https://crm.52-28-67-148.sslip.io/api/v1`) yalnız okuma; yazan istek gönderilmez.
- Commit'ler yalnız ilgili dosyaları içerir (`git add <path>`); `apps/api` içindeki kullanıcı değişiklikleri stage edilmez.
- `.env` git'e girmez.
- Ana renk `#000c69` (koyu tema `#8fa2ff`); kırmızı `#cf060c` yalnız `destructive` / `brandRed`.
- Başlık fontu Barlow Condensed (`font-display`, `font-display-semibold`); gövde ve sayılar Inter.
- Conventional commits, Türkçe özet.

## Dosya haritası

| Dosya | Sorumluluk |
|---|---|
| `.gitignore` | `apps/mobile-v2/ios/`, `apps/mobile-v2/Archive 3/` hariç tutma |
| `apps/mobile-v2/theme.config.js` | Renk token'ları (tek kaynak) |
| `apps/mobile-v2/global.css` | Üretilmiş CSS değişkenleri (`npm run gen:css`) |
| `apps/mobile-v2/src/theme/web-parity.test.mjs` | Mobil token'ların web `theme.css` ile eşitliği |
| `apps/mobile-v2/src/ui/index.tsx` | `H1`, `H2`, `ScreenHeader`, `DetailHeader`, `SectionHeader` fontları; `Fab` gölgesi |
| `apps/mobile-v2/src/features/company-map/leaflet-web.css` | Harita işaretçisi rengi |
| `apps/mobile-v2/DESIGN.md` | Görsel kural dokümanı |
| `scripts/audit-action-parity.mjs` | `--target=mobile-v2` modu, dışa aktarılan yardımcılar |
| `scripts/audit-action-parity.test.mjs` | `mobile-v2` çıkarıcısının testi |
| `docs/mobile-v2/web-action-coverage.{json,md}` | Üretilmiş aksiyon kapsamı |
| `docs/mobile-v2/web-parity.md` | Sayfa bazlı eşleşme tablosu |

---

### Task 1: mobile-v2'yi git'e al

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: `.gitignore`'a ekle** (dosya sonuna)

```gitignore

# mobile-v2: ios/ Expo prebuild ile app.config.ts'ten yeniden üretilir; Archive 3 yerel mockup arşivi.
apps/mobile-v2/ios/
apps/mobile-v2/Archive 3/
```

- [ ] **Step 2: Kuru çalıştırma ile içeriği denetle**

Run: `git add --dry-run apps/mobile-v2 | rg -c .` ve
`git add --dry-run apps/mobile-v2 | rg "node_modules|/ios/|Archive 3|\.env$|/\.expo/"`
Expected: ikinci komut çıktı vermez. Ayrıca 1 MB üstü dosya kontrolü:
`git add --dry-run apps/mobile-v2 | sed -E "s/^add '(.*)'$/\1/" | while read f; do [ -f "$f" ] && [ $(stat -f%z "$f") -gt 1048576 ] && echo "$f"; done`
Expected: çıktı yok (varsa durup kullanıcıya sor).

- [ ] **Step 3: Commit**

```bash
git add .gitignore apps/mobile-v2
git commit -m "chore(mobile-v2): mevcut durumu kayıt altına al"
```

---

### Task 2: Lacivert tema token'ları + web eşitlik testi

**Files:**
- Create: `apps/mobile-v2/src/theme/web-parity.test.mjs`
- Modify: `apps/mobile-v2/theme.config.js`, `apps/mobile-v2/global.css` (üretilmiş), `apps/mobile-v2/src/ui/index.tsx` (Fab), `apps/mobile-v2/src/features/company-map/leaflet-web.css`

- [ ] **Step 1: Başarısız testi yaz** — `apps/mobile-v2/src/theme/web-parity.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { themes } = require(resolve(here, '../../theme.config.js'));
const webCss = readFileSync(resolve(here, '../../../web/src/styles/theme.css'), 'utf8');

/** theme.css içindeki ilk (açık) ve `.dark` bloklarından değişkenleri okur. */
function webVars(block) {
  const vars = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[m[1]] ??= m[2].trim();
  return vars;
}
const darkStart = webCss.indexOf('.dark');
const web = { light: webVars(webCss.slice(0, darkStart)), dark: webVars(webCss.slice(darkStart)) };

/** mobil token → web CSS değişkeni. */
const MAPPED = {
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  secondary: 'secondary',
  secondaryForeground: 'secondary-foreground',
  canvas: 'canvas',
  foreground: 'foreground',
  mutedForeground: 'muted-foreground',
  muted: 'muted',
  card: 'card',
  border: 'border',
  destructive: 'destructive',
  destructiveSoft: 'destructive-soft',
  success: 'success',
  successSoft: 'success-soft',
  warning: 'warning',
  warningSoft: 'warning-soft',
  chart1: 'chart-1',
};

for (const mode of ['light', 'dark']) {
  for (const [token, cssVar] of Object.entries(MAPPED)) {
    test(`${mode}.${token} web --${cssVar} ile aynı`, () => {
      assert.ok(web[mode][cssVar], `web theme.css'te --${cssVar} (${mode}) yok`);
      assert.equal(themes[mode][token].toLowerCase(), web[mode][cssVar].toLowerCase());
    });
  }
}

test('kırmızı yalnız destructive/brandRed olarak kalır', () => {
  assert.equal(themes.light.brandRed, '#cf060c');
  assert.notEqual(themes.light.primary.toLowerCase(), '#cf060c');
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npm --workspace @haksan/mobile-v2 run test`
Expected: FAIL — en az `light.primary`, `light.canvas`, `light.secondary`, `light.chart1`, `dark.primary` eşleşmez.
Web'de karşılığı farklı çıkan başka token varsa (ör. `card`, `border`) değeri web'den alınır; testte web'de hiç olmayan değişken varsa o satır `MAPPED`'den çıkarılır.

- [ ] **Step 3: `theme.config.js` token'larını web değerlerine çek**

Açık tema değişiklikleri: `canvas: '#f4f6f8'`, `primary: '#000c69'`, `secondary: '#eef1ff'`, `secondaryForeground: '#000c69'`, `chart1: '#2a3aa0'`.
Koyu tema: `primary: '#8fa2ff'`, `primaryForeground: '#0a1030'`, `secondary: 'rgba(125, 143, 251, 0.16)'`, `secondaryForeground: '#c7d2ff'`, `chart1: '#8fa2ff'`.
Test başka fark gösterirse o token'ı da web değerine eşitle. Dosya başındaki yorum korunur.

- [ ] **Step 4: CSS'i üret, testi geçir**

Run: `npm --workspace @haksan/mobile-v2 run gen:css && npm --workspace @haksan/mobile-v2 run test`
Expected: PASS.

- [ ] **Step 5: Sabit kırmızıları token'a bağla**

`src/ui/index.tsx` `Fab`: `shadowColor: '#d32f2f'` → `shadowColor: colors.primary`.
`src/features/company-map/leaflet-web.css`: `.haksan-map-marker { background: #cf060c; }` → `background: #000c69;`
(Bu dosya web haritası için düz CSS; token değişkeni yok.)
Doğrula: `rg -n "d32f2f|cf060c" apps/mobile-v2/app apps/mobile-v2/src` → yalnız test dosyası.

- [ ] **Step 6: typecheck + commit**

```bash
npm --workspace @haksan/mobile-v2 run typecheck
git add apps/mobile-v2/theme.config.js apps/mobile-v2/global.css apps/mobile-v2/src/theme/web-parity.test.mjs apps/mobile-v2/src/ui/index.tsx apps/mobile-v2/src/features/company-map/leaflet-web.css
git commit -m "feat(mobile-v2): ana renk web ile aynı lacivert, token eşitliği testle korunuyor"
```

---

### Task 3: Barlow Condensed başlıklar + DESIGN.md

**Files:**
- Modify: `apps/mobile-v2/src/ui/index.tsx`, `apps/mobile-v2/DESIGN.md`

- [ ] **Step 1: Başlık bileşenleri**

`H1`: `font-inter-bold text-[28px] leading-[1.12]` → `font-display text-[32px] leading-[1.1]`.
`H2`: `font-inter-bold text-[22px] leading-[1.2]` → `font-display text-[24px] leading-[1.2]`.
`ScreenHeader` başlığı: `className="font-inter-bold"` → `className="font-display"`, style `fontSize: 34, lineHeight: 38`.
`DetailHeader` başlığı: `font-inter-semibold text-[17px]` → `font-display-semibold text-[20px]`.
`SectionHeader` başlığı: `font-inter-semibold text-[15px]` → `font-display-semibold text-[18px]`.
Barlow Condensed dar olduğu için punto bir kademe büyütülür. KPI değerleri ve tutarlar Inter kalır.
`H1`/`H2` üstündeki "sıkıştırılmış değil" yorumları yeni kurala göre düzeltilir.

- [ ] **Step 2: DESIGN.md güncelle**

§1 "Kırmızı yalnızca eylem ve dikkat için…" paragrafı ve §2 renk listesi: ana aksan **Haksan Lacivert `#000c69`** (birincil buton, aktif sekme, FAB, link, seçili filtre pili); **Haksan Red `#cf060c`** yalnız marka detayı ve tehlikeli aksiyon (sil, iptal, "Acil"). Zemin `#f4f6f8`. Kural satırı: "tek aksan lacivert".
§3: Display/Başlık **Barlow Condensed 600–700**; gövde Inter; sayılar Inter `tabular-nums`. "Inter dışı font YASAK" satırı "Barlow Condensed ve Inter dışı font yasak" olur.
§4: Buton, Input odak halkası, Filter Chips, Tabs, FAB: "kırmızı" → "lacivert".
Başa not: "Kaynak: web `DESIGN.md` + `apps/web/src/styles/theme.css`; renk eşitliği `src/theme/web-parity.test.mjs` ile korunur."

- [ ] **Step 3: typecheck + commit**

```bash
npm --workspace @haksan/mobile-v2 run typecheck
git add apps/mobile-v2/src/ui/index.tsx apps/mobile-v2/DESIGN.md
git commit -m "feat(mobile-v2): başlıklar web gibi Barlow Condensed, tasarım dokümanı lacivert kurala geçti"
```

---

### Task 4: Parite script'ine `--target=mobile-v2`

**Files:**
- Modify: `scripts/audit-action-parity.mjs`
- Create: `scripts/audit-action-parity.test.mjs`

**Interfaces:**
- Produces: `export function parseRequestCalls(src: string): Array<{ verb: string, path: string }>` ve `export function normalizePath(p: string): string`. `main()` yalnız script doğrudan çalıştırıldığında çağrılır.

- [ ] **Step 1: Başarısız testi yaz** — `scripts/audit-action-parity.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestCalls } from './audit-action-parity.mjs';

const SRC = `
export const companies = {
  list: (q: Q) => request<Paginated<C>>('/companies', { query: q }),
  get: (id: string) => request<C>(\`/companies/\${id}\`),
  create: (body: X) => request<C>('/companies', { method: 'POST', body }),
  setStatus: (id: string, body: Y) =>
    request<C>(\`/companies/\${id}/status\`, {
      method: 'PATCH',
      body,
    }),
  remove: (id: string) => request<void>(\`/companies/\${id}\`, { method: 'DELETE' }),
  bySerial: (s: string) => request<I>(\`/inventory/serial/\${encodeURIComponent(s)}\`),
};
`;

test('request() çağrılarından metot + normalize yol çıkarır', () => {
  assert.deepEqual(parseRequestCalls(SRC), [
    { verb: 'GET', path: '/companies' },
    { verb: 'GET', path: '/companies/:param' },
    { verb: 'POST', path: '/companies' },
    { verb: 'PATCH', path: '/companies/:param/status' },
    { verb: 'DELETE', path: '/companies/:param' },
    { verb: 'GET', path: '/inventory/serial/:param' },
  ]);
});

test('fonksiyon tanımını (request<T>(path: string…) çağrı saymaz', () => {
  assert.deepEqual(parseRequestCalls('export async function request<T>(path: string, opts = {}) {}'), []);
});
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `node --test scripts/audit-action-parity.test.mjs`
Expected: FAIL — `parseRequestCalls` export edilmiyor (ve import, `main()`'i çalıştırıp docs yazmamalı — bu yüzden Step 3'te guard şart).

- [ ] **Step 3: Script'i değiştir**

1. `import { fileURLToPath } from 'node:url';` satırına `pathToFileURL` ekle.
2. `normalizePath`'i `export function normalizePath` yap.
3. `parseServices`'ten sonra ekle:

```js
// ───────── 2b. mobile-v2: request(path, { method }) çağrıları ─────────

/**
 * `request<T>('/x', { method: 'POST' })` / `request(\`/x/${id}\`)` çağrılarını okur.
 * Metot verilmemişse GET. Yol ilk argümandaki string/template literal'dır.
 */
export function parseRequestCalls(src) {
  const calls = [];
  const re = /\brequest\s*(?:<(?:[^<>()]|<[^<>()]*>)*>)?\s*\(\s*([`'"])((?:(?!\1).)*)\1/gs;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Argüman listesini parantez dengesine göre sonuna kadar al.
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    const args = src.slice(re.lastIndex, i);
    const verb = args.match(/\bmethod\s*:\s*['"`](GET|POST|PATCH|PUT|DELETE)['"`]/i)?.[1]?.toUpperCase() ?? 'GET';
    calls.push({ verb, path: normalizePath(m[2]) });
  }
  return calls;
}

function parseMobileV2Actions() {
  const files = walk(MOBILE_V2_API, (f) => f.endsWith('.ts') && !/\.test\./.test(f) && !basename(f).includes(' '));
  const seen = new Map();
  for (const file of files) {
    for (const c of parseRequestCalls(read(file))) {
      const key = `${c.verb} ${c.path}`;
      if (!seen.has(key)) seen.set(key, { ...c, file: relative(ROOT, file) });
    }
  }
  return [...seen.values()];
}
```

4. Sabitlere ekle: `const MOBILE_V2_API = join(ROOT, 'apps/mobile-v2/src/api');`, `const MOBILE_V2_DOCS = join(DOCS, 'mobile-v2');`, `const TARGET = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length) ?? 'mobile';`
5. Rapor fonksiyonu:

```js
function buildCoverage({ webActions, mobileCalls, pageUsage }) {
  const mobileKeys = new Set(mobileCalls.map((c) => `${c.verb} ${c.path}`));
  const pagesByAction = {};
  for (const [file, keys] of Object.entries(pageUsage)) {
    for (const k of keys) (pagesByAction[k] ??= []).push(file);
  }
  const rows = webActions.map((a) => ({
    key: a.key,
    verb: a.verb,
    path: a.path,
    permission: a.permission,
    inMobile: Boolean(a.verb && a.path && mobileKeys.has(`${a.verb} ${a.path}`)),
    pages: (pagesByAction[a.key] ?? []).sort(),
  }));
  const covered = rows.filter((r) => r.inMobile).length;
  return { generatedAt: new Date().toISOString(), counts: { webActions: rows.length, covered, missing: rows.length - covered, mobileCalls: mobileCalls.length }, rows };
}

function buildCoverageMarkdown(cov) {
  const pct = cov.counts.webActions ? Math.round((cov.counts.covered / cov.counts.webActions) * 100) : 0;
  const lines = [
    '# mobile-v2 Web Aksiyon Kapsamı',
    '',
    '> Otomatik üretildi — `node scripts/audit-action-parity.mjs --target=mobile-v2`.',
    '> Eşleşme: web servis aksiyonunun HTTP metodu + yolu, `apps/mobile-v2/src/api` içindeki `request()` çağrılarında var mı.',
    '',
    `- Web aksiyonu: **${cov.counts.webActions}**`,
    `- Mobilde karşılığı olan: **${cov.counts.covered}** (%${pct})`,
    `- Eksik: **${cov.counts.missing}**`,
    '',
  ];
  const byNs = new Map();
  for (const r of cov.rows.filter((x) => !x.inMobile)) {
    const ns = r.key.split('.')[0];
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push(r);
  }
  lines.push('## Eksikler (namespace bazında)', '');
  for (const [ns, arr] of [...byNs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`### \`${ns}\` — ${arr.length} eksik`, '', '| Aksiyon | HTTP | Yol | İzin | Web sayfaları |', '|---|---|---|---|---|');
    for (const r of arr.sort((x, y) => x.key.localeCompare(y.key))) {
      const pages = r.pages.map((p) => basename(p).replace(/\.tsx?$/, '')).join(', ') || '—';
      lines.push(`| \`${r.key}\` | ${r.verb ?? '?'} | \`${r.path ?? '?'}\` | ${r.permission ? '`' + r.permission + '`' : '—'} | ${pages} |`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}
```

6. `main()` başında `TARGET === 'mobile-v2'` dalı: endpoints + web aksiyonları + pageUsage aynı şekilde üretilir, `parseMobileV2Actions()` ile mobil çağrılar alınır, `docs/mobile-v2/web-action-coverage.json` ve `.md` yazılır, eski çıktılar yazılmaz, `return`. `--check` bu modda `missing > 0` ise exit 1.
7. Dosya sonundaki `main();` →

```js
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
```

- [ ] **Step 4: Testi geçir**

Run: `node --test scripts/audit-action-parity.test.mjs`
Expected: PASS (2 test).

- [ ] **Step 5: Varsayılan modun bozulmadığını doğrula**

Run: `node scripts/audit-action-parity.mjs && git diff --stat docs/web-action-registry.json docs/web-action-registry.md docs/mobile-parity-gaps.md`
Expected: script hatasız biter. Fark yalnız `generatedAt` ve 2026-09-25'ten beri API'ye eklenen uç noktalar kaynaklı olmalı. Sonra bu üç dosyayı geri al: `git checkout -- docs/web-action-registry.json docs/web-action-registry.md docs/mobile-parity-gaps.md` (eski mobil raporlarını yenilemek bu işin kapsamı değil).

- [ ] **Step 6: mobile-v2 raporunu üret**

Run: `node scripts/audit-action-parity.mjs --target=mobile-v2`
Expected: `docs/mobile-v2/web-action-coverage.{json,md}` yazılır; konsolda kapsam yüzdesi.
Sağduyu kontrolü: `company.list` (GET `/companies`) `inMobile: true` olmalı.

- [ ] **Step 7: Commit**

```bash
git add scripts/audit-action-parity.mjs scripts/audit-action-parity.test.mjs docs/mobile-v2/web-action-coverage.json docs/mobile-v2/web-action-coverage.md
git commit -m "feat(parity): audit script'ine mobile-v2 hedefi, ilk kapsam raporu"
```

---

### Task 5: Sayfa bazlı eşleşme tablosu

**Files:**
- Create: `docs/mobile-v2/web-parity.md`

- [ ] **Step 1: Web sayfa envanteri**

Kaynak: `apps/web/src/app/App.tsx` `TITLES` (satır 78–114) ve `switch (nav)` (satır 430–539); izinler `apps/web/src/app/components/Layout.tsx` (satır 68–176).
Her NavKey için web bileşen dosyasını not al.

- [ ] **Step 2: Her sayfa için satır doldur**

Her web sayfası için: mobil karşılık (`apps/mobile-v2/app/**` yolu veya "yok"), görünümler, ana alanlar/filtreler, aksiyonlar (web aksiyon anahtarlarıyla, `docs/mobile-v2/web-action-coverage.json` → `rows[].pages` alanından), izin, durum (Tam/Eksik/Yok), aşama (2–6).
Aşama atama kuralı: satış (sales-cases, kanban, dashboard hedefleri) → 2; mevcut mobil ekranı olan ve Eksik olan → 3; servis (service-requests, service-kanban, machines, service-price-list) → 4; offers/proformas/contracts/references/trade-fairs/sales-price-list → 5; users/roles/departments/settings/meta → 6.

Doküman yapısı:

```markdown
# mobile-v2 ↔ Web Eşleşme Tablosu

> Kaynak: apps/web App.tsx + Layout.tsx, docs/mobile-v2/web-action-coverage.json (<tarih>).
> Yeniden ölçüm: `node scripts/audit-action-parity.mjs --target=mobile-v2`.

## Özet
| Durum | Sayfa sayısı |
| Aşama | Sayfalar |

## Sayfalar
### <NavKey> — <Başlık>
- **Web:** `apps/web/...`
- **Mobil:** `apps/mobile-v2/app/...` | yok
- **İzin:** `<perm>` · departman: <...>
- **Görünümler:** ...
- **Alanlar/filtreler:** ...
- **Aksiyonlar:** `company.create` ✅, `company.export` ❌ ...
- **Durum:** Tam | Eksik | Yok — **Aşama:** N
- **Eksikler:** madde madde
```

- [ ] **Step 3: Commit**

```bash
git add docs/mobile-v2/web-parity.md
git commit -m "docs(mobile-v2): sayfa bazlı web eşleşme tablosu ve aşama ataması"
```

---

### Task 6: Görsel doğrulama (yalnız okuma)

- [ ] **Step 1:** `npm --workspace @haksan/mobile-v2 run ios` (ios/ yoksa Expo prebuild yapar). Canlı API'ye giriş kullanıcı tarafından yapılır; ajan parola girmez.
- [ ] **Step 2:** Ekran görüntüleri: giriş, dashboard, firma listesi, firma detayı, yeni firma modalı (kaydetmeden kapat), modüller. Açık + koyu tema.
- [ ] **Step 3:** Kontrol listesi: birincil buton/aktif sekme/filtre pili/FAB lacivert; sil/iptal kırmızı; başlıklar Barlow Condensed; metin taşması yok.
- [ ] **Step 4:** Eşleşme tablosundaki "Tam" işaretli en az 5 ekran açılıp listelenen alanların göründüğü doğrulanır; uyuşmazlık varsa tablo düzeltilip commit edilir.
