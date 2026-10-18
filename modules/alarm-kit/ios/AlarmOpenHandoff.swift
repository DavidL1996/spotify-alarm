import Foundation
#if canImport(AppIntents)
import AppIntents
#endif

// Glue between the App Intent that lives in the *app target* and this pod.
//
// Why the intent is not in this pod: AlarmKit runs the alarm's secondary-button intent through
// the App Intents system, which looks intents up in the app bundle's extracted App Intents
// metadata. Xcode runs that metadata extraction for app / framework / extension targets; for
// static libraries (what CocoaPods builds for Expo) it's not reliably done. Apple DTS
// recommends keeping intents in Xcode app/framework targets:
// https://developer.apple.com/forums/thread/759160
// So `app.plugin.js` generates `SpotifyAlarmOpenIntent.swift` into the app target. That file:
//   1. defines the `LiveActivityIntent` that AlarmKit runs when "Open" is tapped, and
//   2. defines a class named `AlarmOpenHandoff.providerClassName` conforming to
//      `AlarmOpenIntentProvider`, which this pod finds at runtime with `NSClassFromString`
//      to create intent instances while scheduling (the pod can't see app-target types at
//      compile time).
// When the intent runs, it calls `AlarmOpenHandoff.alarmOpened(...)`, which stores the event
// (for cold starts, before JS is running) and notifies the module (for warm starts).

#if canImport(AppIntents)
/// Implemented by the generated app-target class. See the comment at the top of this file.
@available(iOS 26.0, *)
public protocol AlarmOpenIntentProvider {
  static func makeOpenIntent(alarmId: String, playlistId: String?) -> any LiveActivityIntent
}
#endif

public enum AlarmOpenHandoff {
  /// Objective-C runtime name of the generated provider class. Must match app.plugin.js.
  public static let providerClassName = "SpotifyAlarmOpenIntentProvider"

  static let didOpenNotification = Notification.Name("AlarmKitBridge.alarmOpened")
  private static let pendingKey = "AlarmKitBridge.pendingAlarmOpen"

  /// Called from the app target's intent `perform()` when the user taps the alarm's Open button.
  public static func alarmOpened(alarmId: String, playlistId: String?) {
    var payload: [String: Any] = [
      "alarmId": alarmId,
      "openedAt": Date().timeIntervalSince1970 * 1000,
    ]
    if let playlistId = playlistId, !playlistId.isEmpty {
      payload["playlistId"] = playlistId
    }
    // Plist-safe values only (String / Double), so UserDefaults can store it.
    UserDefaults.standard.set(payload, forKey: pendingKey)
    NotificationCenter.default.post(name: didOpenNotification, object: nil)
  }

  static func peekPending() -> [String: Any]? {
    return UserDefaults.standard.dictionary(forKey: pendingKey)
  }

  /// Returns the last "alarm opened" event (if any) and clears it.
  static func consumePending() -> [String: Any]? {
    let payload = UserDefaults.standard.dictionary(forKey: pendingKey)
    UserDefaults.standard.removeObject(forKey: pendingKey)
    return payload
  }
}
