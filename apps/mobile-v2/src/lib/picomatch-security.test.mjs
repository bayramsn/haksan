import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const copies = Object.keys(lock.packages ?? {})
  .filter((entry) => entry.endsWith('node_modules/picomatch'))
  .map((entry) => path.join(root, entry))
  .filter((directory) => fs.existsSync(directory));

test('all installed picomatch copies reject dangerous repetition before regex matching', () => {
  assert.ok(copies.length > 0, 'Expected installed picomatch dependencies');
  for (const directory of copies) {
    // A separate process with a deadline makes a missing/broken mitigation fail
    // without allowing a regression to freeze the complete mobile test runner.
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const pm = require(process.argv[1]);
      const malicious = ['+(*)', '+(*a)', '*(*)', '*(*a)', '+(*(a))', '+(a|aa)', '+([ab]*)'];
      for (const pattern of malicious) {
        for (const options of [{}, {maxExtglobRecursion: false}]) {
          assert.throws(() => pm.makeRe(pattern, options), /HAKSAN: complex repeated extglobs/);
        }
      }
      assert.equal(pm('src/**/*.ts')('src/nested/file.ts'), true);
      assert.equal(pm('**/*.{js,ts}')('src/file.ts'), true);
      assert.equal(pm('@(foo|bar).js')('bar.js'), true);
      assert.equal(pm('!(*.test).js')('app.js'), true);
      assert.equal(pm('+(foo)')('foofoo'), true);
      assert.equal(pm('+(foo)')('foox'), false);
      assert.equal(pm('*(foo)')('foofoo'), true);
    `, directory], { timeout: 30000, encoding: 'utf8' });
    assert.equal(result.error, undefined, `${directory}: ${result.error?.message}`);
    assert.equal(result.status, 0, `${directory}: ${result.stderr}`);
  }
});
