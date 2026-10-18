import ExpoModulesCore
import UIKit

/**
 Receives Spotify's auth redirect (spotifyalarm://spotify-login-callback#access_token=...).

 ExpoAppDelegate forwards `application(_:open:options:)` to every subscriber, and under the UIScene
 life cycle ExpoAppSceneDelegate re-feeds `scene(_:openURLContexts:)` into the same method
 (expo/ios/AppDelegates/ExpoAppSceneDelegate.swift + SceneEventForwarder.swift in SDK 57), so this works
 either way. Registered in expo-module.config.json -> apple.appDelegateSubscribers.
 Docs: https://docs.expo.dev/modules/appdelegate-subscribers/

 React Native's Linking still sees the URL too; src/app/+native-intent.tsx stops Expo Router from
 navigating to it.
 */
public class SpotifyRemoteAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return SpotifyRemoteController.shared.handleOpenURL(url)
  }
}
