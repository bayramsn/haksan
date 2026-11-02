import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('compiled Swift handoff policy requires consent/scope and preserves JavaScript UTF-16 limits', { skip: process.platform !== 'darwin' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'haksan-handoff-policy-'));
  try {
    const main = join(root, 'main.swift'), executable = join(root, 'policy-test');
    writeFileSync(main, `import Foundation
precondition(AssistantHandoffPolicy.activeScope(enabled: false, scope: "account") == nil)
precondition(AssistantHandoffPolicy.activeScope(enabled: true, scope: nil) == nil)
precondition(AssistantHandoffPolicy.activeScope(enabled: true, scope: " \\n ") == nil)
precondition(AssistantHandoffPolicy.activeScope(enabled: true, scope: String(repeating: "a", count: 513)) == nil)
precondition(AssistantHandoffPolicy.activeScope(enabled: true, scope: "account") == "account")
let emoji = String(repeating: "😀", count: 1100)
let bounded = AssistantHandoffPolicy.boundedText(emoji, limit: 2000)
precondition(bounded.utf16.count == 2000 && bounded.count == 1000)
precondition(AssistantHandoffPolicy.boundedText("a😀b", limit: 2) == "a")
precondition(AssistantHandoffPolicy.boundedText("a😀b", limit: 3) == "a😀")
precondition(AssistantHandoffPolicy.boundedText("İyi görüşme", limit: 300) == "İyi görüşme")
precondition(AssistantHandoffPolicy.boundedText("text", limit: 0).isEmpty)
print("native handoff policy verified")
`);
    const source = fileURLToPath(new URL('../../modules/haksan-call-assistant/ios/AssistantHandoffPolicy.swift', import.meta.url));
    const build = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(root, 'cache'), source, main, '-o', executable], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(build.status, 0, build.stderr || build.error?.message);
    const result = spawnSync(executable, [], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /native handoff policy verified/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
