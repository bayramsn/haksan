/**
 * @bacons/apple-targets 4.0.7 re-reads target.props.buildConfigurationList after
 * removeReference has cleared it (with-xcode-changes.js:217-223). Keep only that
 * owner link until the upstream immediately assigns its replacement list.
 * This adapter changes parsed objects in memory, never installed package files.
 */
function protectConfigurationLists(project) {
  const restorers = [];
  for (const target of project.rootObject.props.targets) {
    const list = target.props.buildConfigurationList;
    if (!list || typeof list.getReferrers !== 'function') continue;
    const original = list.getReferrers;
    const own = Object.getOwnPropertyDescriptor(list, 'getReferrers');
    list.getReferrers = function () {
      return original.call(this).filter((ref) => ref !== target);
    };
    restorers.push(() => {
      if (own) Object.defineProperty(list, 'getReferrers', own);
      else delete list.getReferrers;
    });
  }
  return () => restorers.reverse().forEach((restore) => restore());
}

module.exports = function withSafeAppleTargets(config, props) {
  const { version } = require('@bacons/apple-targets/package.json');
  if (version !== '4.0.7') throw new Error(`with-safe-apple-targets: Review/remove the 4.0.7 workaround before using apple-targets ${version}.`);
  const beta = require('@bacons/apple-targets/build/with-bacons-xcode');
  const upstream = require('@bacons/apple-targets/app.plugin');
  const original = beta.withXcodeProjectBeta;
  beta.withXcodeProjectBeta = (nextConfig, action) => original(nextConfig, async (modConfig) => {
    const restore = protectConfigurationLists(modConfig.modResults);
    try { return await action(modConfig); }
    finally { restore(); }
  });
  try { return upstream(config, props); }
  finally { beta.withXcodeProjectBeta = original; }
};
module.exports.protectConfigurationLists = protectConfigurationLists;
