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

/** `selector {` ile başlayan üst düzey bloğun değişkenlerini okur. */
function webVars(selector) {
  const start = webCss.search(new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{`, 'm'));
  assert.ok(start >= 0, `web theme.css'te ${selector} bloğu yok`);
  const block = webCss.slice(start, webCss.indexOf('\n}', start));
  const vars = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[m[1]] ??= m[2].trim();
  return vars;
}
const web = { light: webVars(':root'), dark: webVars('.dark') };

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
