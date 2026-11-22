import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { protectConfigurationLists } = require('./with-safe-apple-targets.js');

function fixture() {
  const deleted = [], target = { props: {} }, unrelated = { props: {} }, other = { uuid: 'OTHER' };
  const list = {
    uuid: 'LIST', props: { buildConfigurations: [] },
    getReferrers() { return [target, other]; },
    removeFromProject() { deleted.push(this.uuid); this.getReferrers().forEach((ref) => ref.removeReference(this.uuid)); },
  };
  target.props.buildConfigurationList = list;
  target.removeReference = (uuid) => { if (target.props.buildConfigurationList?.uuid === uuid) target.props.buildConfigurationList = undefined; };
  other.removeReference = (uuid) => deleted.push(`other-reference-${uuid}`);
  unrelated.props.buildConfigurationList = { uuid: 'UNRELATED', getReferrers() { return []; } };
  return { project: { rootObject: { props: { targets: [target, unrelated] } } }, target, list, deleted, unrelated };
}

function upstreamReplacement(target) {
  target.props.buildConfigurationList.getReferrers().forEach((ref) => ref.removeReference(target.props.buildConfigurationList.uuid));
  target.props.buildConfigurationList.removeFromProject();
  target.props.buildConfigurationList = { uuid: 'NEW-LIST' };
}

test('reproduces upstream repeat-prebuild crash without workaround', () => {
  const { target } = fixture();
  assert.throws(() => upstreamReplacement(target), /undefined/);
});

test('wrapper preserves cached owner reference until upstream replacement; other references removed', () => {
  const f = fixture(), original = f.list.getReferrers;
  const restore = protectConfigurationLists(f.project);
  upstreamReplacement(f.target); restore();
  assert.equal(f.target.props.buildConfigurationList.uuid, 'NEW-LIST');
  assert.ok(f.deleted.includes('LIST'));
  assert.ok(f.deleted.includes('other-reference-LIST'));
  assert.equal(f.unrelated.props.buildConfigurationList.uuid, 'UNRELATED');
  assert.equal(f.list.getReferrers, original);
});

test('model instance methods are restored even when upstream action throws', () => {
  const f = fixture(), original = f.list.getReferrers;
  const restore = protectConfigurationLists(f.project);
  try { throw new Error('upstream failure'); } catch {} finally { restore(); }
  assert.equal(f.list.getReferrers, original);
  assert.equal(f.list.getReferrers().length, 2);
});
