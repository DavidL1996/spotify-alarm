import ExpoModulesCore

// JS: modules/spotify-remote/index.ts. Module API: https://docs.expo.dev/modules/module-api/
public class SpotifyRemoteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpotifyRemote")

    /// True when a Spotify Client ID and redirect URL were baked into Info.plist by the config plugin.
    Function("isConfigured") { () -> Bool in
      return SpotifyRemoteController.isConfigured
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
  }
}
