import { requireOptionalNativeModule, type NativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * JS side of the local "spotify-remote" Expo module (iOS only, see ./ios).
 * In Expo Go, on Android and on web the native module doesn't exist and isAvailable() is false.
 */
export type ConnectionChangedEvent = { connected: boolean; error: string | null };

type SpotifyRemoteEvents = {
  onConnectionChanged: (event: ConnectionChangedEvent) => void;
};

declare class SpotifyRemoteNativeModule extends NativeModule<SpotifyRemoteEvents> {
  isConfigured(): boolean;
  getClientId(): string | null;
  isSpotifyInstalled(): Promise<boolean>;
  playPlaylistShuffled(playlistUri: string): Promise<void>;
  isConnected(): Promise<boolean>;
  connectForNight(playlistUri: string): Promise<void>;
  playIfConnected(playlistUri: string): Promise<void>;
}

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
  | 'PLAYER_ERROR'
  | 'NOT_CONNECTED';

/** True in a development build on iOS with a Spotify Client ID configured. */
export function isAvailable(): boolean {
  return native?.isConfigured() ?? false;
}

/** The Spotify Client ID baked into this build (null in Expo Go or if none was configured). */
export function getClientId(): string | null {
  return native?.getClientId() ?? null;
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

// ---- Night mode experiment -------------------------------------------------------------------

/** Whether App Remote is connected to the Spotify app right now. */
export async function isConnected(): Promise<boolean> {
  return native ? native.isConnected() : false;
}

/**
 * Bedtime setup (app must be in the foreground): opens Spotify once, starts the playlist with shuffle
 * on, pauses it, and keeps the connection open for `playIfConnected`.
 */
export async function connectForNight(playlistUri: string): Promise<void> {
  if (!native) throw new Error('SpotifyRemote native module is not available');
  await native.connectForNight(playlistUri);
}

/**
 * Alarm time (may be in the background): shuffle-plays through the open connection, or reconnects with
 * the token from `connectForNight`. Never opens the Spotify app. Rejects with NOT_CONNECTED / CONNECT_FAILED
 * if Spotify isn't reachable any more.
 */
export async function playIfConnected(playlistUri: string): Promise<void> {
  if (!native) throw new Error('SpotifyRemote native module is not available');
  await native.playIfConnected(playlistUri);
}

/** Called whenever App Remote connects or disconnects (e.g. iOS suspended Spotify overnight). */
export function addConnectionListener(listener: (event: ConnectionChangedEvent) => void): { remove(): void } | null {
  return native ? native.addListener('onConnectionChanged', listener) : null;
}
