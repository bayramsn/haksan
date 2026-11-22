import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { applyFix, constantsScript } = require('./with-ios-build-fixes.js');

test('existing marked Podfile migrates Constants phase once and keeps Updates unchanged', () => {
  const old = `# haksan: ios-build-fixes
'EXConstants' => ['phase', 'bash -l "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"'],
'EXUpdates' => ['phase', 'bash -l "$PODS_TARGET_SRCROOT/../scripts/create-updates-resources-ios.sh"']`;
  const fixed = applyFix(old);
  assert.ok(fixed.includes(`'${constantsScript}'`));
  assert.ok(fixed.includes(`'bash -l "$PODS_TARGET_SRCROOT/../scripts/create-updates-resources-ios.sh"'`));
  assert.equal(applyFix(fixed), fixed);
});

test('real Expo Constants script writes public API config when project path has spaces', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'haksan constants regression '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project with spaces');
  const pods = path.join(project, 'ios', 'Pods');
  const build = path.join(root, 'build with spaces');
  const dest = path.join(build, 'EXConstants.bundle');
  mkdirSync(pods, { recursive: true }); mkdirSync(dest, { recursive: true });
  writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'constants-fixture', version: '1.0.0' }));
  writeFileSync(path.join(project, 'app.json'), JSON.stringify({ expo: { name: 'Fixture', slug: 'fixture', extra: { apiUrl: 'https://example.com/api/v1' } } }));
  const packageDir = path.dirname(require.resolve('expo-constants/package.json'));
  const env = { ...process.env, PROJECT_DIR: pods, PROJECT_ROOT: '', PODS_ROOT: pods, PODS_TARGET_SRCROOT: path.join(packageDir, 'ios'), CONFIGURATION_BUILD_DIR: build, BUNDLE_FORMAT: 'shallow' };
  const config = path.join(dest, 'app.config');
  spawnSync('/bin/bash', ['-c', 'bash -l "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"'], { env, cwd: project, encoding: 'utf8' });
  assert.equal(existsSync(config), false, 'upstream unquoted basename skips the config');
  const result = spawnSync('/bin/bash', ['-c', constantsScript], { env, cwd: project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(config, 'utf8')).extra.apiUrl, 'https://example.com/api/v1');
});
