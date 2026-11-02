import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const app = process.argv[2];
assert.ok(app?.endsWith('.app'), 'Usage: node scripts/verify-ios-assistant-metadata.mjs /path/to/Haksan.app');
const metadata = JSON.parse(readFileSync(join(resolve(app), 'Metadata.appintents/extract.actionsdata'), 'utf8'));
const expected = ['HaksanAssistantIntent', 'HaksanAssistantCommandIntent'];
for (const name of expected) {
  const action = metadata.actions?.[name];
  assert.ok(action, `Missing exported intent: ${name}`);
  assert.equal(action.isAuthPolExplicit, true, `${name} needs an explicit authentication policy`);
  assert.equal(action.authenticationPolicy, 1, `${name} must require authentication`);
  assert.equal(action.openAppWhenRun, true, `${name} must open for review`);
}
const parameters = metadata.actions.HaksanAssistantIntent.parameters;
for (const name of ['note', 'query', 'dueAt']) assert.equal(parameters.find(item => item.name === name)?.isOptional, true, `Missing optional ${name}`);
assert.equal(metadata.actions.HaksanAssistantCommandIntent.parameters.find(item => item.name === 'command')?.isOptional, false);
const shortcuts = metadata.autoShortcuts?.filter(item => expected.includes(item.actionIdentifier)) ?? [];
assert.equal(shortcuts.length, 8, 'Expected eight exported assistant shortcuts');
for (const shortcut of shortcuts) assert.ok(shortcut.phraseTemplates?.every(phrase => phrase.key.includes('${applicationName}')), 'Every shortcut phrase must contain the app name');
console.log(JSON.stringify({ intents: expected, shortcuts: shortcuts.map(item => item.shortTitle.key), authentication: 'required', noteQueryDate: 'exported', deviceRuntimeVerified: false }, null, 2));
