import ExpoModulesCore

// JS: modules/spotify-remote/index.ts. Module API: https://docs.expo.dev/modules/module-api/
public class SpotifyRemoteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpotifyRemote")

    /// Night mode experiment: { connected: Bool, error: String? } whenever App Remote connects/disconnects.
    Events("onConnectionChanged")

    OnCreate {
      SpotifyRemoteController.shared.onConnectionChange = { [weak self] connected, error in
        self?.sendEvent("onConnectionChanged", ["connected": connected, "error": error])
      }
    }

    OnDestroy {
      SpotifyRemoteController.shared.onConnectionChange = nil
    }

    /// True when a Spotify Client ID and redirect URL were baked into Info.plist by the config plugin.
    Function("isConfigured") { () -> Bool in
      return SpotifyRemoteController.isConfigured
    }

    /// The Client ID baked into Info.plist, so the JS Web API login uses the same Spotify app. Nil if unset.
    Function("getClientId") { () -> String? in
      return SpotifyRemoteController.clientId
    }

    AsyncFunction("isSpotifyInstalled") { () -> Bool in
      return SpotifyRemoteController.isSpotifyInstalled()
    }
    .runOnQueue(.main)

    /// Resolves once the playlist is playing with shuffle on. Rejects with a code from SpotifyRemoteFailure.
    AsyncFunction("playPlaylistShuffled") { (playlistUri: String, promise: Promise) in
      SpotifyRemoteController.shared.playShuffled(uri: playlistUri) { result in
        switch result {
        case .success:
          promise.resolve()
        case .failure(let failure):
          promise.reject(failure.code, failure.message)
        }
      }
    }
    .runOnQueue(.main)

    AsyncFunction("isConnected") { () -> Bool in
      return SpotifyRemoteController.shared.isConnected
    }
    .runOnQueue(.main)

    /// Night mode setup, app in the foreground: opens Spotify once, then stays connected (paused).
    AsyncFunction("connectForNight") { (playlistUri: String, promise: Promise) in
      SpotifyRemoteController.shared.connectForNight(uri: playlistUri) { result in
        switch result {
        case .success:
          promise.resolve()
        case .failure(let failure):
          promise.reject(failure.code, failure.message)
        }
      }
    }
    .runOnQueue(.main)

    /// Night mode alarm, possibly in the background: plays through the existing connection only.
    AsyncFunction("playIfConnected") { (playlistUri: String, promise: Promise) in
      SpotifyRemoteController.shared.playIfConnected(uri: playlistUri) { result in
        switch result {
        case .success:
          promise.resolve()
        case .failure(let failure):
          promise.reject(failure.code, failure.message)
        }
      }
    }
    .runOnQueue(.main)
  }
}
