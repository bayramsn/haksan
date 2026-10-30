import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNavigationMaterial } from './navigation-material.ts';

const supported = {
  platform: 'ios', version: 26, reducedEffects: false, reduceTransparency: false,
  glassAvailable: true, blurAvailable: true,
};

test('uygulama ve sistem erişilebilirlik tercihleri efektlerin önüne geçer', () => {
  for (const preference of [{ reducedEffects: true }, { reduceTransparency: true }, { reducedEffects: true, reduceTransparency: true }]) {
    assert.equal(resolveNavigationMaterial({ ...supported, ...preference }), 'solid');
  }
});

test('iOS 26 ve sonraki dotted sürümlerde glass varsa önceliklidir', () => {
  for (const version of [26, '26.0', '26.0.1', 27, '27.1.2']) {
    assert.equal(resolveNavigationMaterial({ ...supported, version }), 'glass');
  }
});

test('eski iOS veya eksik glass modülünde mevcut blur kullanılır', () => {
  assert.equal(resolveNavigationMaterial({ ...supported, version: '18.6.2' }), 'blur');
  assert.equal(resolveNavigationMaterial({ ...supported, glassAvailable: false }), 'blur');
  assert.equal(resolveNavigationMaterial({ ...supported, version: 26, blurAvailable: false }), 'glass');
});

test('Android blur için API 31 alt sınırını uygular, glass kullanmaz', () => {
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'android', version: 30 }), 'solid');
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'android', version: 31 }), 'blur');
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'android', version: '35' }), 'blur');
});

test('web sürümden bağımsız yalnız blur varlığını kullanır', () => {
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'web', version: 'unknown' }), 'blur');
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'web', blurAvailable: false }), 'solid');
});

test('kullanılabilir efekt yoksa veya platform desteklenmiyorsa solid döner', () => {
  assert.equal(resolveNavigationMaterial({ ...supported, glassAvailable: false, blurAvailable: false }), 'solid');
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'android', version: 35, blurAvailable: false }), 'solid');
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'windows', version: 31 }), 'solid');
});

test('bilinmeyen sürüm glass ve Android blur desteği varsaymaz', () => {
  assert.equal(resolveNavigationMaterial({ ...supported, version: 'unknown' }), 'blur');
  assert.equal(resolveNavigationMaterial({ ...supported, platform: 'android', version: 'unknown' }), 'solid');
});
