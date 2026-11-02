import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { PACKAGE_SOURCE, applyAssistantProjectLocalization } = require('../../plugins/with-call-assistant.js');
test('CNG puts the shortcut provider in the application compilation unit', () => {
  assert.match(PACKAGE_SOURCE, /import HaksanCallAssistant/);
  assert.match(PACKAGE_SOURCE, /struct HaksanAssistantShortcuts: AppShortcutsProvider/);
  assert.match(PACKAGE_SOURCE, /HaksanCallAssistantIntentsPackage.self/);
  const shortcuts = [...PACKAGE_SOURCE.matchAll(/AppShortcut\(intent: ([^,]+)/g)];
  assert.equal(shortcuts.length, 8);
  for (const action of ['afterCall', 'openToday', 'newOpportunity', 'findOpportunities', 'addNote', 'createTask', 'newServiceTicket']) assert.ok(shortcuts.some(match => match[1].includes(`.${action})`)), action);
  assert.ok(shortcuts.some(match => match[1] === 'HaksanAssistantCommandIntent()'));
  assert.equal((PACKAGE_SOURCE.match(/phrases: \[/g) ?? []).length, 8);
  const native = readFileSync(new URL('../../modules/haksan-call-assistant/ios/HaksanAssistantIntents.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(native, /: AppShortcutsProvider/); // one provider, owned by the app target
  assert.equal((native.match(/authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication/g) ?? []).length, 2);
});
test('Turkish phrases compile under the Turkish development language without dropping supported regions', () => {
  const root = { developmentRegion: 'en', knownRegions: ['en', 'Base'] };
  const project = { getFirstProject: () => ({ firstProject: root }) };
  applyAssistantProjectLocalization(project); applyAssistantProjectLocalization(project);
  assert.equal(root.developmentRegion, 'tr'); assert.deepEqual(root.knownRegions, ['en', 'Base', 'tr']);
});
