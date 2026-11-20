import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./layout.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { authLayout, androidSceneBottom } = exports;
test('portrait phone keeps the reference artwork proportions', () => {
  for (const width of [320, 360, 390, 430]) {
    const result = authLayout(width, 844, 758 / 657);
    assert.equal(result.contentWidth, width);
    assert.equal(result.artworkHeight, width / (758 / 657));
  }
});
test('tablet and landscape constrain auth artwork and readable form width', () => {
  for (const [width, height] of [[768, 1024], [1024, 768], [844, 390]]) {
    const result = authLayout(width, height, 758 / 657);
    assert.ok(result.contentWidth <= 520);
    assert.ok(result.artworkHeight <= 280);
    assert.ok(result.artworkHeight <= height * .3);
  }
});
test('Android scene returns space to the form when keyboard hides tab bar', () => {
  assert.equal(androidSceneBottom(84, false), 84);
  assert.equal(androidSceneBottom(84, true), 0);
  assert.equal(androidSceneBottom(68, false), 68);
});
