import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * JS side of the local "spotify-remote" Expo module (iOS only, see ./ios).
 * In Expo Go, on Android and on web the native module doesn't exist and isAvailable() is false.
 */
type SpotifyRemoteNativeModule = {
  isConfigured(): boolean;
  isSpotifyInstalled(): Promise<boolean>;
  playPlaylistShuffled(playlistUri: string): Promise<void>;
};

const native =
  Platform.OS === 'ios' ? requireOptionalNativeModule<SpotifyRemoteNativeModule>('SpotifyRemote') : null;

/** Error codes the native side rejects with (`error.code`). */
export type SpotifyRemoteErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_URI'
  | 'SPOTIFY_NOT_INSTALLED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'AUTH_FAILED'
  | 'CONNECT_FAILED'
  | 'DISCONNECTED'
  | 'PLAYER_ERROR';

/** True in a development build on iOS with a Spotify Client ID configured. */
export function isAvailable(): boolean {
  return native?.isConfigured() ?? false;
}

export async function isSpotifyInstalled(): Promise<boolean> {
  return native ? native.isSpotifyInstalled() : false;
}

/**
 * Opens Spotify (briefly), authorizes, comes back, and leaves `playlistUri` playing with shuffle on.
 * @param playlistUri e.g. "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
 */
export async function playPlaylistShuffled(playlistUri: string): Promise<void> {
  if (!native) throw new Error('SpotifyRemote native module is not available');
  await native.playPlaylistShuffled(playlistUri);
}
