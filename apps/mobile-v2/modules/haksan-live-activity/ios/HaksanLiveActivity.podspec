Pod::Spec.new do |s|
  s.name = 'HaksanLiveActivity'
  s.version = '1.0.0'
  s.summary = 'Live Activity / Dynamic Island bridge for field work timers'
  s.description = s.summary
  s.license = { :type => 'Private' }
  s.author = 'Haksan'
  s.homepage = 'https://haksanmakina.com.tr'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ActivityKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
