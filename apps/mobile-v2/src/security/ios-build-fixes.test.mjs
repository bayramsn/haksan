import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixBundleScript } = require('../../plugins/with-ios-build-fixes.js');

const legacy = `fi

\`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\`
`;

test('bundle phase runs react-native-xcode.sh through a quoted variable (spaces in repo path)', () => {
  const fixed = fixBundleScript(legacy);
  assert.ok(!fixed.includes('`'), 'backtick call is gone');
  assert.match(fixed, /^RN_XCODE_SCRIPT=\$\("\$NODE_BINARY" --print "[^\n]*react-native-xcode\.sh'"\)$/m);
  assert.match(fixed, /^"\$RN_XCODE_SCRIPT"$/m);
  assert.equal(fixBundleScript(fixed), fixed, 'idempotent');
});
