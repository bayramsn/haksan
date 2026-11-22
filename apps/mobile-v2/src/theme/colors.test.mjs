import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { themes, themeVariables } = require('../../theme.config.js');

function rgb(color, backdrop = '#ffffff') {
  if (color.startsWith('#')) { const n = parseInt(color.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const parts = color.match(/[\d.]+/g).map(Number), alpha = parts[3] ?? 1, base = rgb(backdrop);
  return parts.slice(0, 3).map((v, i) => v * alpha + base[i] * (1 - alpha));
}
function luminance(color, backdrop) {
  return rgb(color, backdrop).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b, backdrop) { const x = luminance(a), y = luminance(b, backdrop); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

for (const [scheme, colors] of Object.entries(themes)) {
  test(`${scheme}: action labels and status text remain readable`, () => {
    for (const [fg, bg] of [['primaryForeground', 'primary'], ['destructiveForeground', 'destructive'], ['secondaryForeground', 'secondary'], ['foreground', 'canvas'], ['mutedForeground', 'inputBackground'], ...['warning', 'success', 'info', 'stage', 'destructive'].map(tone => [tone, `${tone}Soft`])]) {
      assert.ok(contrast(colors[fg], colors[bg], colors.card) >= 4.5, `${scheme} ${fg}/${bg}`);
    }
    assert.ok(contrast(colors.controlBorder, colors.inputBackground) >= 3, `${scheme} input boundary`);
  });
  test(`${scheme}: generated CSS includes the same variables used by native surfaces`, () => {
    const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
    for (const [name, value] of Object.entries(themeVariables(colors))) assert.ok(css.includes(`${name}: ${value};`), `${scheme} ${name}`);
  });
}

test('Tailwind emits semantic opacity utilities and selected/error colors', async () => {
  const names = ['bg-primary/10', 'bg-primary/5', 'border-primary/20', 'bg-muted/40', 'bg-primary-foreground/15', 'bg-primary-soft', 'text-destructive-foreground'];
  const result = await require('postcss')([require('tailwindcss')({ ...require('../../tailwind.config.js'), content: [{ raw: names.join(' '), extension: 'tsx' }] })]).process('@tailwind utilities;', { from: undefined });
  const selectors = new Set();
  result.root.walkRules(rule => { for (const selector of rule.selectors ?? []) selectors.add(selector.slice(1).replaceAll('\\', '')); });
  for (const name of names) assert.ok(selectors.has(name), `missing generated utility ${name}`);
});
