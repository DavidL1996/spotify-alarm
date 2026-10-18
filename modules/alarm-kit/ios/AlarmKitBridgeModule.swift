import ExpoModulesCore
import Foundation
#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents
import SwiftUI
#endif

// AlarmKit (iOS 26+) bridge. Kept deliberately small, and every AlarmKit call sits behind
// `if #available(iOS 26.0, *)` because Expo SDK 57 apps deploy to iOS 16.4.
//
// API references (Apple):
// - Overview + sample walkthrough: https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit
// - AlarmManager (shared, authorizationState, requestAuthorization(), schedule(id:configuration:),
//   cancel(id:), alarms): https://developer.apple.com/documentation/alarmkit/alarmmanager
// - AlarmManager.AlarmConfiguration.alarm(schedule:attributes:stopIntent:secondaryIntent:sound:) (iOS 26.0):
//   https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration
// - Alarm.Schedule .fixed(Date) / .relative(Relative(time:repeats:)) with Recurrence .never / .weekly([Locale.Weekday]):
//   https://developer.apple.com/documentation/alarmkit/alarm/schedule-swift.enum
// - AlarmPresentation(alert:), AlarmPresentation.Alert, AlarmButton(text:textColor:systemImageName:),
//   AlarmAttributes(presentation:metadata:tintColor:), AlarmMetadata.

/// What JS passes to `scheduleAlarm`.
struct ScheduleAlarmOptions: Record {
  /// AlarmKit alarm ID (UUID string).
  @Field var id: String = ""
  /// The app's own alarm ID, handed back in `onAlarmOpened`.
  @Field var appAlarmId: String? = nil
  @Field var hour: Int = 0
  @Field var minute: Int = 0
  /// 0 = Sunday ... 6 = Saturday. Empty = one-time alarm.
  @Field var weekdays: [Int] = []
  /// One-time alarms: exact time as a Unix timestamp in milliseconds.
  @Field var date: Double? = nil
  @Field var title: String = "Alarm"
  @Field var playlistId: String? = nil
  @Field var openButtonText: String = "Open"
}

/// Plain copy of the options, so nothing non-Sendable crosses into async code.
struct AlarmRequest: Sendable {
  let id: String
  let appAlarmId: String
  let hour: Int
  let minute: Int
  let weekdays: [Int]
  let date: Double?
  let title: String
  let playlistId: String?
  let openButtonText: String

  init(_ options: ScheduleAlarmOptions) {
    id = options.id
    appAlarmId = options.appAlarmId ?? options.id
    hour = options.hour
    minute = options.minute
    weekdays = options.weekdays
    date = options.date
    title = options.title
    playlistId = options.playlistId
    openButtonText = options.openButtonText
  }
}

internal final class AlarmKitUnavailableException: Exception {
  override var reason: String {
    "AlarmKit is not available (it needs iOS 26 or later)"
  }
}

internal final class InvalidAlarmIdException: GenericException<String> {
  override var reason: String {
    "Alarm ID '\(param)' is not a valid UUID"
  }
}

public class AlarmKitBridgeModule: Module {
  private var openObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AlarmKitBridge")

    Events("onAlarmOpened")

    OnStartObserving("onAlarmOpened") {
      self.startObservingOpens()
    }

    OnStopObserving("onAlarmOpened") {
      self.stopObservingOpens()
    }

    OnDestroy {
      self.stopObservingOpens()
    }

    Function("isAvailable") { () -> Bool in
      return AlarmKitBridgeCore.isAvailable
    }

    Function("getAuthorizationStatus") { () -> String in
      return AlarmKitBridgeCore.authorizationStatus()
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      return try await AlarmKitBridgeCore.requestAuthorization()
    }

    AsyncFunction("scheduleAlarm") { (options: ScheduleAlarmOptions) async throws -> String in
      let request = AlarmRequest(options)
      return try await AlarmKitBridgeCore.schedule(request)
    }

    AsyncFunction("cancelAlarm") { (id: String) throws in
      try AlarmKitBridgeCore.cancel(id: id)
    }

    AsyncFunction("cancelAll") { () throws in
      try AlarmKitBridgeCore.cancelAll()
    }

    AsyncFunction("listAlarms") { () throws -> [[String: Any]] in
      return try AlarmKitBridgeCore.list()
    }

    /// The last "Open tapped" event, cleared once read. Used at cold start.
    Function("consumePendingAlarmOpen") { () -> [String: Any]? in
      return AlarmOpenHandoff.consumePending()
    }
  }

  private func startObservingOpens() {
    guard openObserver == nil else { return }
    openObserver = NotificationCenter.default.addObserver(
      forName: AlarmOpenHandoff.didOpenNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let payload = AlarmOpenHandoff.peekPending() else { return }
      self?.sendEvent("onAlarmOpened", payload.mapValues { Optional($0) })
    }
  }

  private func stopObservingOpens() {
    if let observer = openObserver {
      NotificationCenter.default.removeObserver(observer)
      openObserver = nil
    }
  }
}

/// All AlarmKit calls. Static so the async closures above don't capture the module.
enum AlarmKitBridgeCore {
  static var isAvailable: Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      return true
    }
    #endif
    return false
  }

  static func authorizationStatus() -> String {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      return describe(AlarmManager.shared.authorizationState)
    }
    #endif
    return "unavailable"
  }

  static func requestAuthorization() async throws -> String {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      let state = try await AlarmManager.shared.requestAuthorization()
      return describe(state)
    }
    #endif
    return "unavailable"
  }

  static func schedule(_ request: AlarmRequest) async throws -> String {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      return try await scheduleWithAlarmKit(request)
    }
    #endif
    throw AlarmKitUnavailableException()
  }

  static func cancel(id: String) throws {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      guard let uuid = UUID(uuidString: id) else {
        throw InvalidAlarmIdException(id)
      }
      try AlarmManager.shared.cancel(id: uuid)
      return
    }
    #endif
    throw AlarmKitUnavailableException()
  }

  static func cancelAll() throws {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      let manager = AlarmManager.shared
      for alarm in try manager.alarms {
        try? manager.cancel(id: alarm.id)
      }
      return
    }
    #endif
    throw AlarmKitUnavailableException()
  }

  static func list() throws -> [[String: Any]] {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      let alarms = try AlarmManager.shared.alarms
      return alarms.map { alarm -> [String: Any] in
        return ["id": alarm.id.uuidString, "state": describe(alarm.state)]
      }
    }
    #endif
    return []
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  private static func scheduleWithAlarmKit(_ request: AlarmRequest) async throws -> String {
    guard let uuid = UUID(uuidString: request.id) else {
      throw InvalidAlarmIdException(request.id)
    }

    let time = Alarm.Schedule.Relative.Time(hour: request.hour, minute: request.minute)
    let schedule: Alarm.Schedule
    if !request.weekdays.isEmpty {
      // Repeating: weekly on the chosen days, at a wall-clock time in the device's time zone.
      let days: [Locale.Weekday] = request.weekdays.compactMap { localeWeekday($0) }
      schedule = .relative(Alarm.Schedule.Relative(time: time, repeats: .weekly(days)))
    } else if let ms = request.date {
      // One-time with a known moment (the store's `onceAt`).
      schedule = .fixed(Date(timeIntervalSince1970: ms / 1000))
    } else {
      // One-time, next occurrence of hour:minute.
      schedule = .relative(Alarm.Schedule.Relative(time: time, repeats: .never))
    }

    // Without a countdown the alarm only has an alert state, so no widget extension is needed.
    // ("AlarmKit expects a widget extension if an app supports a countdown presentation.")
    let stopButton = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
    let openIntent = makeOpenIntent(alarmId: request.appAlarmId, playlistId: request.playlistId)

    // Note: `Alert(title:stopButton:secondaryButton:secondaryButtonBehavior:)` is the iOS 26.0
    // initializer. iOS 26.1 deprecates it in favour of `Alert(title:secondaryButton:...)`
    // (system-provided stop button), but that one doesn't exist in the iOS 26.0 SDK, so we use
    // the 26.0 one to compile with any Xcode 26.x. It's only a deprecation warning.
    let alert: AlarmPresentation.Alert
    if openIntent != nil {
      // `.custom` shows the secondary button and runs `secondaryIntent` when tapped.
      alert = AlarmPresentation.Alert(
        title: LocalizedStringResource(stringLiteral: request.title),
        stopButton: stopButton,
        secondaryButton: AlarmButton(
          text: LocalizedStringResource(stringLiteral: request.openButtonText),
          textColor: .white,
          systemImageName: "play.fill"
        ),
        secondaryButtonBehavior: .custom
      )
    } else {
      // The app-target intent is missing (config plugin not applied): plain alarm, Stop only.
      alert = AlarmPresentation.Alert(
        title: LocalizedStringResource(stringLiteral: request.title),
        stopButton: stopButton
      )
    }

    let attributes = AlarmAttributes<AlarmKitBridgeMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: AlarmKitBridgeMetadata(),
      tintColor: Color(red: 0.114, green: 0.725, blue: 0.329) // Spotify green
    )

    let configuration = AlarmManager.AlarmConfiguration<AlarmKitBridgeMetadata>.alarm(
      schedule: schedule,
      attributes: attributes,
      stopIntent: nil,
      secondaryIntent: openIntent,
      sound: .default
    )

    _ = try await AlarmManager.shared.schedule(id: uuid, configuration: configuration)
    return uuid.uuidString
  }

  /// Creates the app-target intent through the generated provider class (see AlarmOpenHandoff.swift).
  @available(iOS 26.0, *)
  private static func makeOpenIntent(alarmId: String, playlistId: String?) -> (any LiveActivityIntent)? {
    guard
      let providerClass = NSClassFromString(AlarmOpenHandoff.providerClassName),
      let provider = providerClass as? any AlarmOpenIntentProvider.Type
    else {
      return nil
    }
    return provider.makeOpenIntent(alarmId: alarmId, playlistId: playlistId)
  }

  @available(iOS 26.0, *)
  private static func localeWeekday(_ day: Int) -> Locale.Weekday? {
    switch day {
    case 0: return .sunday
    case 1: return .monday
    case 2: return .tuesday
    case 3: return .wednesday
    case 4: return .thursday
    case 5: return .friday
    case 6: return .saturday
    default: return nil
    }
  }

  @available(iOS 26.0, *)
  private static func describe(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  @available(iOS 26.0, *)
  private static func describe(_ state: Alarm.State) -> String {
    switch state {
    case .scheduled: return "scheduled"
    case .countdown: return "countdown"
    case .paused: return "paused"
    case .alerting: return "alerting"
    @unknown default: return "unknown"
    }
  }
  #endif
}

#if canImport(AlarmKit)
/// AlarmKit requires a metadata type; we don't need any extra data in the alarm UI.
@available(iOS 26.0, *)
struct AlarmKitBridgeMetadata: AlarmMetadata {}
#endif
