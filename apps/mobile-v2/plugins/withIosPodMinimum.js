const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// Resource bundle pods can declare iOS 11–13 even though this app requires 15.1.
// New Xcode SDKs reject those targets before compiling any application code.
const marker = '# Haksan: align pod deployment targets with the app minimum';
const patch = `
    ${marker}
    minimum_ios = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '15.1')
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        current_ios = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current_ios.nil? || Gem::Version.new(current_ios) < minimum_ios
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios.to_s
        end
      end
    end
`;

function patchPodfile(source) {
  if (source.includes(marker)) return source;
  const hook = 'post_install do |installer|';
  if (!source.includes(hook)) throw new Error('Haksan iOS Pod minimum: post_install hook not found.');
  return source.replace(hook, hook + patch);
}

module.exports = (config) => withDangerousMod(config, ['ios', async (mod) => {
  const filename = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
  const source = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, patchPodfile(source));
  return mod;
}]);
module.exports.patchPodfile = patchPodfile;
