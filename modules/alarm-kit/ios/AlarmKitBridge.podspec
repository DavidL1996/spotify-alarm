Pod::Spec.new do |s|
  s.name           = 'AlarmKitBridge'
  s.version        = '1.0.0'
  s.summary        = 'Minimal AlarmKit (iOS 26+) bridge for Spotify Alarm'
  s.description    = 'Schedules system alarms with AlarmKit and reports when the user opens the app from one.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  # Swift 5 language mode: strict-concurrency issues stay warnings, not errors.
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # AlarmKit only exists on iOS 26+. Weak-link it so the app still launches on older iOS
  # (every AlarmKit call is behind `if #available(iOS 26.0, *)`).
  s.weak_frameworks = 'AlarmKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
