import Foundation
import SpotifyiOS
import UIKit

/// A failure reported to JavaScript as a promise rejection (`code` becomes `error.code` in JS).
struct SpotifyRemoteFailure: Error {
  let code: String
  let message: String

  static let notConfigured = SpotifyRemoteFailure(
    code: "NOT_CONFIGURED",
    message: "SpotifyClientID / SpotifyRedirectURL are missing from Info.plist. Set clientId for the spotify-remote plugin in app.json and rebuild."
  )
  static let invalidURI = SpotifyRemoteFailure(code: "INVALID_URI", message: "Expected a Spotify URI such as spotify:playlist:<id>.")
  static let notInstalled = SpotifyRemoteFailure(code: "SPOTIFY_NOT_INSTALLED", message: "The Spotify app is not installed.")
  static let cancelled = SpotifyRemoteFailure(code: "CANCELLED", message: "Replaced by a newer playback request.")
  static let timeout = SpotifyRemoteFailure(code: "TIMEOUT", message: "Spotify did not respond in time.")
  static let notConnected = SpotifyRemoteFailure(
    code: "NOT_CONNECTED",
    message: "Not connected to Spotify and no access token yet. Call connectForNight first, while the app is open."
  )
}

/**
 Drives one "shuffle-play this playlist" request through the Spotify App Remote:

 1. `authorizeAndPlayURI` opens the Spotify app, which authorizes us and starts playing the URI
    (playing is what keeps Spotify alive in the background so App Remote can connect).
 2. Spotify redirects back to `SpotifyRedirectURL` with an access token. The app delegate subscriber
    forwards that URL to `handleOpenURL(_:)`.
 3. We `connect()` App Remote with the token (retrying a few times while Spotify spins up).
 4. Once connected: `play(uri)` (in case Spotify was already playing something else, in which case
    `authorizeAndPlayURI` doesn't replace it), `setShuffle(true)`, then `skip(toNext:)` so the alarm
    doesn't start on track 1 every morning. Then we disconnect.

 API reference: SPTAppRemote.h / SPTAppRemotePlayerAPI.h in SpotifyiOS.xcframework v5.0.1
 (https://github.com/spotify/ios-sdk/tree/v5.0.1/SpotifyiOS.xcframework/ios-arm64/SpotifyiOS.framework/Headers),
 Swift names as used in Spotify's own demo, DemoProjects/NowPlayingView (SceneDelegate.swift, ViewController.swift).

 All state is touched on the main thread only. SDK callbacks are hopped to main explicitly because the
 headers don't promise which queue they arrive on.
 */
final class SpotifyRemoteController: NSObject, SPTAppRemoteDelegate {
  static let shared = SpotifyRemoteController()

  typealias Completion = (Result<Void, SpotifyRemoteFailure>) -> Void

  private enum Stage {
    /// Waiting for Spotify to redirect back with a token.
    case authorizing
    /// Have a token, waiting for App Remote to connect.
    case connecting
    /// Connected, sending player commands.
    case playing
  }

  private struct Request {
    let id: UUID
    let uri: String
    let completion: Completion
    var stage: Stage
    /// Night mode: stay connected after playback starts (normal taps disconnect when done).
    var keepConnected = false
    /// Night mode setup: start the playlist with shuffle on, then pause it right away.
    var pauseAfterStart = false
  }

  private static let maxConnectAttempts = 5
  private static let connectRetryDelay: TimeInterval = 1.0
  /// Generous, because the very first run shows Spotify's consent screen.
  private static let timeout: TimeInterval = 90

  private var appRemote: SPTAppRemote?
  private var request: Request?
  private var connectAttempts = 0

  /// Night mode experiment: told about every connect/disconnect so JS can log when Spotify drops us.
  /// Set by SpotifyRemoteModule. Always called on the main thread.
  var onConnectionChange: ((_ connected: Bool, _ error: String?) -> Void)?

  var isConnected: Bool { appRemote?.isConnected ?? false }

  // MARK: Configuration (written to Info.plist by modules/spotify-remote/app.plugin.js)

  static var clientId: String? { infoString("SpotifyClientID") }
  static var redirectURL: URL? { infoString("SpotifyRedirectURL").flatMap { URL(string: $0) } }
  static var isConfigured: Bool { clientId != nil && redirectURL != nil }

  private static func infoString(_ key: String) -> String? {
    guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  /// Needs `spotify` in LSApplicationQueriesSchemes. Must be called on the main thread
  /// (the module runs it with `.runOnQueue(.main)`); `assumeIsolated` traps otherwise.
  static func isSpotifyInstalled() -> Bool {
    guard let url = URL(string: "spotify:") else { return false }
    return MainActor.assumeIsolated {
      UIApplication.shared.canOpenURL(url)
    }
  }

  // MARK: Entry points (main thread)

  func playShuffled(uri: String, completion: @escaping Completion) {
    begin(uri: uri, keepConnected: false, pauseAfterStart: false, allowAuthorize: true, completion: completion)
  }

  /// Night mode setup (app in the foreground): opens Spotify once, starts the playlist with shuffle on,
  /// pauses it, and stays connected so `playIfConnected` can start it later from the background.
  func connectForNight(uri: String, completion: @escaping Completion) {
    begin(uri: uri, keepConnected: true, pauseAfterStart: true, allowAuthorize: true, completion: completion)
  }

  /// Night mode alarm (may run in the background): never opens the Spotify app, because iOS doesn't
  /// allow that from the background. Uses the open connection, or reconnects with the token we got
  /// from `connectForNight`; that only works if Spotify is still running.
  func playIfConnected(uri: String, completion: @escaping Completion) {
    begin(uri: uri, keepConnected: true, pauseAfterStart: false, allowAuthorize: false, completion: completion)
  }

  private func begin(
    uri: String,
    keepConnected: Bool,
    pauseAfterStart: Bool,
    allowAuthorize: Bool,
    completion: @escaping Completion
  ) {
    guard uri.hasPrefix("spotify:") else {
      completion(.failure(.invalidURI))
      return
    }
    guard let remote = makeRemoteIfNeeded() else {
      completion(.failure(.notConfigured))
      return
    }

    // Only one request at a time; a newer alarm tap wins.
    if let previous = request {
      request = nil
      previous.completion(.failure(.cancelled))
    }

    let id = UUID()
    connectAttempts = 0
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.timeout) { [weak self] in
      guard let self = self, self.request?.id == id else { return }
      self.finish(.failure(.timeout))
    }

    var newRequest = Request(id: id, uri: uri, completion: completion, stage: .playing)
    newRequest.keepConnected = keepConnected
    newRequest.pauseAfterStart = pauseAfterStart

    if remote.isConnected {
      // Still connected from earlier: no need to bounce through the Spotify app.
      request = newRequest
      startShuffledPlayback()
      return
    }

    if !allowAuthorize {
      guard remote.connectionParameters.accessToken != nil else {
        request = newRequest
        finish(.failure(.notConnected))
        return
      }
      newRequest.stage = .connecting
      request = newRequest
      connect()
      return
    }

    newRequest.stage = .authorizing
    request = newRequest
    // SPTAppRemote.h: "Open Spotify app to obtain access token and start playback. The passed URI will
    // start playing unless Spotify is already playing." The BOOL only says whether Spotify is installed.
    remote.authorizeAndPlayURI(uri, asRadio: false) { [weak self] spotifyInstalled in
      DispatchQueue.main.async {
        guard let self = self, self.request?.id == id else { return }
        if !spotifyInstalled {
          self.finish(.failure(.notInstalled))
        }
      }
    }
  }

  /// Called from the app delegate subscriber for every URL the app is opened with.
  /// Returns true if the URL is our Spotify redirect.
  func handleOpenURL(_ url: URL) -> Bool {
    guard let redirect = Self.redirectURL, Self.isRedirect(url, to: redirect) else { return false }

    // The same URL can be delivered more than once; only the first one while authorizing counts.
    guard let remote = appRemote, let current = request, current.stage == .authorizing else { return true }

    // SPTAppRemote.h: authorizationParametersFromURL returns the access token or an error description.
    let parameters = remote.authorizationParameters(from: url)
    if let token = parameters?[SPTAppRemoteAccessTokenKey] {
      remote.connectionParameters.accessToken = token
      request?.stage = .connecting
      connect()
    } else {
      let description = parameters?[SPTAppRemoteErrorDescriptionKey] ?? "Spotify did not return an access token."
      finish(.failure(SpotifyRemoteFailure(code: "AUTH_FAILED", message: description)))
    }
    return true
  }

  // MARK: SPTAppRemoteDelegate

  func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    DispatchQueue.main.async {
      self.onConnectionChange?(true, nil)
      guard self.request?.stage == .connecting else { return }
      self.request?.stage = .playing
      self.startShuffledPlayback()
    }
  }

  func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
    DispatchQueue.main.async {
      guard let current = self.request, current.stage == .connecting else { return }
      if self.connectAttempts < Self.maxConnectAttempts {
        // Spotify may still be starting playback right after the redirect; try again shortly.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.connectRetryDelay) { [weak self] in
          guard let self = self, self.request?.id == current.id, self.request?.stage == .connecting else { return }
          self.connect()
        }
      } else {
        let message = error?.localizedDescription ?? "Could not connect to the Spotify app."
        self.finish(.failure(SpotifyRemoteFailure(code: "CONNECT_FAILED", message: message)))
      }
    }
  }

  func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    DispatchQueue.main.async {
      self.onConnectionChange?(false, error?.localizedDescription)
      guard self.request?.stage == .playing else { return }
      let message = error?.localizedDescription ?? "Disconnected from the Spotify app."
      self.finish(.failure(SpotifyRemoteFailure(code: "DISCONNECTED", message: message)))
    }
  }

  // MARK: Private

  private func makeRemoteIfNeeded() -> SPTAppRemote? {
    if let existing = appRemote { return existing }
    guard let clientId = Self.clientId, let redirectURL = Self.redirectURL else { return nil }
    let configuration = SPTConfiguration(clientID: clientId, redirectURL: redirectURL)
    let remote = SPTAppRemote(configuration: configuration, logLevel: .info)
    remote.delegate = self
    appRemote = remote
    return remote
  }

  private func connect() {
    guard let remote = appRemote else { return }
    connectAttempts += 1
    remote.connect()
  }

  private func startShuffledPlayback() {
    guard let current = request else { return }
    guard let player = appRemote?.playerAPI else {
      finish(.failure(SpotifyRemoteFailure(code: "PLAYER_ERROR", message: "Spotify player API is not available.")))
      return
    }
    let id = current.id

    player.play(current.uri) { [weak self] _, error in
      DispatchQueue.main.async {
        guard let self = self, self.request?.id == id else { return }
        if let error = error {
          self.finish(.failure(SpotifyRemoteFailure(code: "PLAYER_ERROR", message: "play: \(error.localizedDescription)")))
          return
        }
        player.setShuffle(true) { [weak self] _, error in
          DispatchQueue.main.async {
            guard let self = self, self.request?.id == id else { return }
            if let error = error {
              self.finish(.failure(SpotifyRemoteFailure(code: "PLAYER_ERROR", message: "setShuffle: \(error.localizedDescription)")))
              return
            }
            if current.pauseAfterStart {
              // Night mode setup: we only needed Spotify running and connected, not music at bedtime.
              player.pause { [weak self] _, error in
                DispatchQueue.main.async {
                  guard let self = self, self.request?.id == id else { return }
                  if let error = error {
                    NSLog("[SpotifyRemote] pause failed: %@", error.localizedDescription)
                  }
                  self.finish(.success(()))
                }
              }
              return
            }
            // With shuffle now on, "next" is a random track from the playlist.
            player.skip(toNext: { [weak self] _, error in
              DispatchQueue.main.async {
                guard let self = self, self.request?.id == id else { return }
                if let error = error {
                  // Music is playing and shuffle is on; a failed skip is not worth failing over.
                  NSLog("[SpotifyRemote] skipToNext failed: %@", error.localizedDescription)
                }
                self.finish(.success(()))
              }
            })
          }
        }
      }
    }
  }

  private func finish(_ result: Result<Void, SpotifyRemoteFailure>) {
    guard let current = request else { return }
    request = nil
    // Spotify's docs disconnect when the app resigns active; we're done with the connection anyway.
    // Night mode keeps it open on purpose: that's the thing being tested.
    if !current.keepConnected, let remote = appRemote, remote.isConnected {
      remote.disconnect()
    }
    current.completion(result)
  }

  private static func isRedirect(_ url: URL, to redirect: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == redirect.scheme?.lowercased() else { return false }
    return (url.host ?? "").lowercased() == (redirect.host ?? "").lowercased()
  }
}
