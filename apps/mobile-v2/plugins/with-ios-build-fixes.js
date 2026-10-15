const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARKER = '# haksan: ios-build-fixes';

/**
 * - Expo Constants ve Expo Updates betikleri genişletilmiş yolu `bash -c` içinde
 *   tırnaksız veriyor; repo yolunda boşluk varsa ("haksan local") derleme kırılıyor.
 * - Xcode 27 iOS 15.0 altındaki pod deployment target'larını reddediyor.
 */
const SNIPPET = `
    ${MARKER}
    {
      'EXConstants' => ['[CP-User] Generate app.config for prebuilt Constants.manifest', 'bash -l "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"'],
      'EXUpdates' => ['[CP-User] Generate updates resources for expo-updates', 'bash -l "$PODS_TARGET_SRCROOT/../scripts/create-updates-resources-ios.sh"'],
    }.each do |target_name, (phase_name, script)|
      installer.pods_project.targets
        .find { |target| target.name == target_name }
        &.shell_script_build_phases
        &.find { |phase| phase.name == phase_name }
        &.shell_script = script
    end
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new('15.1')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`;

function applyFix(podfile) {
  if (podfile.includes(MARKER)) return podfile;
  const anchor = /(react_native_post_install\([\s\S]*?\n\s*\))/;
  if (!anchor.test(podfile)) {
    throw new Error('with-ios-build-fixes: Podfile içinde react_native_post_install bulunamadı.');
  }
  return podfile.replace(anchor, `$1\n${SNIPPET}`);
}

module.exports = function withIosBuildFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const podfile = fs.readFileSync(podfilePath, 'utf8');
      fs.writeFileSync(podfilePath, applyFix(podfile));
      return cfg;
    },
  ]);
};

module.exports.applyFix = applyFix;
