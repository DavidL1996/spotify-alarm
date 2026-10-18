require 'digest/sha2'
require 'fileutils'
require 'tmpdir'

# ---------------------------------------------------------------------------------------------
# Spotify iOS SDK (SpotifyiOS.xcframework), pinned to an exact release.
#
# Spotify ships the SDK only as a binary xcframework checked into https://github.com/spotify/ios-sdk
# (consumed via Swift Package Manager or by adding the xcframework by hand; there is no official pod).
# We download the tagged source tarball at `pod install` time, extract just the xcframework into
# ./Frameworks (git-ignored) and vendor it. SHA-256 checksums of both binaries are verified, so a
# changed or tampered download fails the install instead of being linked.
#
# Why here and not in `prepare_command`: CocoaPods does not run `prepare_command` for pods installed
# from a local `:path`, which is how Expo autolinking installs local modules.
#
# This file is Ruby that only CocoaPods evaluates (macOS). Windows / Android / Expo Go never run it.
#
# To upgrade: change the version, re-download, update the checksums below.
# ---------------------------------------------------------------------------------------------
spotify_sdk_version = '5.0.1'
spotify_sdk_sha256 = {
  'ios-arm64/SpotifyiOS.framework/SpotifyiOS' =>
    '988704167a3839136c7a4fd83742fca1422dfad48de41354ed07aa8e47611e32',
  'ios-arm64_x86_64-simulator/SpotifyiOS.framework/SpotifyiOS' =>
    '456f5066a3b7d93854b5a02358ab58baa1d952dfcc21eb77ff4de5cf21935bd3',
}
frameworks_dir = File.join(__dir__, 'Frameworks')
xcframework_path = File.join(frameworks_dir, 'SpotifyiOS.xcframework')

spotify_sdk_valid = lambda { |dir|
  next false unless File.file?(File.join(dir, 'Info.plist'))
  spotify_sdk_sha256.all? { |relative_path, sha|
    path = File.join(dir, relative_path)
    File.file?(path) && Digest::SHA256.file(path).hexdigest == sha
  }
}

if RUBY_PLATFORM.include?('darwin') && !spotify_sdk_valid.call(xcframework_path)
  Dir.mktmpdir('spotify-ios-sdk') do |tmp|
    tarball = File.join(tmp, 'ios-sdk.tar.gz')
    url = "https://codeload.github.com/spotify/ios-sdk/tar.gz/refs/tags/v#{spotify_sdk_version}"
    # GitHub names the tarball's top folder "<repo>-<tag without the leading v>".
    member = "ios-sdk-#{spotify_sdk_version}/SpotifyiOS.xcframework"
    puts "[SpotifyRemote] Downloading Spotify iOS SDK v#{spotify_sdk_version} from #{url}"

    unless system('curl', '-fsSL', '--retry', '3', '-o', tarball, url)
      raise "[SpotifyRemote] Could not download the Spotify iOS SDK from #{url}"
    end
    unless system('tar', '-xzf', tarball, '-C', tmp, member)
      raise "[SpotifyRemote] Could not extract #{member} from the Spotify iOS SDK tarball"
    end

    extracted = File.join(tmp, member)
    unless spotify_sdk_valid.call(extracted)
      raise "[SpotifyRemote] Checksum mismatch for the Spotify iOS SDK v#{spotify_sdk_version}. " \
            'Refusing to use it. If you upgraded the SDK, update the checksums in SpotifyRemote.podspec.'
    end

    FileUtils.rm_rf(xcframework_path)
    FileUtils.mkdir_p(frameworks_dir)
    FileUtils.mv(extracted, xcframework_path)
  end
end

Pod::Spec.new do |s|
  s.name           = 'SpotifyRemote'
  s.version        = '1.0.0'
  s.summary        = 'Shuffle-plays a Spotify playlist through the Spotify iOS SDK (App Remote).'
  s.description    = 'Local Expo module for Spotify Alarm. Wraps SPTAppRemote from the Spotify iOS SDK.'
  s.author         = 'David Ljungberg'
  s.homepage       = 'https://github.com/spotify/ios-sdk'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # SpotifyiOS.xcframework is a dynamic framework (device arm64, simulator arm64 + x86_64).
  # CocoaPods copies the right slice and embeds it in the app ("[CP] Embed Pods Frameworks").
  s.vendored_frameworks = 'Frameworks/SpotifyiOS.xcframework'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Only our own Swift files: a "**/*" glob would also pick up the SDK headers in ./Frameworks.
  s.source_files = '*.swift'
end
