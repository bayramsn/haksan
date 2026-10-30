Pod::Spec.new do |s|
  s.name = 'HaksanCallAssistant'
  s.version = '1.0.0'
  s.summary = 'On-device speech and foreground assistant handoff'
  s.description = s.summary
  s.license = { :type => 'Private' }
  s.author = 'Haksan'
  s.homepage = 'https://haksanmakina.com.tr'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Speech', 'AVFoundation', 'Contacts', 'CryptoKit', 'Security'
  s.weak_frameworks = 'AppIntents'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
