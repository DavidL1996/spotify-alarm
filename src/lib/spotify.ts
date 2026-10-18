import * as Linking from 'expo-linking';

import * as SpotifyRemote from '../../modules/spotify-remote';

// Spotify IDs are 22 characters of base62 (0-9, a-z, A-Z).
const ID_PATTERN = /^[0-9A-Za-z]{22}$/;

/**
 * Pulls a playlist ID out of whatever the user pasted:
 *  - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc
 *  - https://open.spotify.com/intl-sv/playlist/37i9dQZF1DXcBWIGoYBM5M
 *  - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 *  - 37i9dQZF1DXcBWIGoYBM5M
 * Returns null if it doesn't look like a playlist.
 */
export function parsePlaylistId(input: string): string | null {
  const text = input.trim();
  if (ID_PATTERN.test(text)) return text;

  const uri = text.match(/^spotify:playlist:([0-9A-Za-z]{22})$/);
  if (uri) return uri[1];

  const url = text.match(/open\.spotify\.com\/(?:[\w-]+\/)?playlist\/([0-9A-Za-z]{22})/);
  if (url) return url[1];

  return null;
}

export function playlistWebUrl(id: string): string {
  return `https://open.spotify.com/playlist/${id}`;
}

/**
 * Opens the playlist in the Spotify app (falls back to the web player).
 * Used directly in Expo Go, and as the fallback for playPlaylistShuffled.
 */
export async function openPlaylistInSpotify(id: string): Promise<void> {
  const appUrl = `spotify:playlist:${id}`;
  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {
    // Fall through to the web URL.
  }
  await Linking.openURL(playlistWebUrl(id));
}

/**
 * Starts the playlist in Spotify with shuffle on, via the Spotify iOS SDK (modules/spotify-remote).
 * Only works in an iOS development build with a Spotify Client ID configured (docs/spotify-setup.md).
 * Everywhere else (Expo Go, Android, web, or if the SDK fails) it just opens the playlist.
 * Returns which of the two happened.
 */
export async function playPlaylistShuffled(id: string): Promise<'shuffled' | 'opened'> {
  if (SpotifyRemote.isAvailable()) {
    try {
      await SpotifyRemote.playPlaylistShuffled(`spotify:playlist:${id}`);
      return 'shuffled';
    } catch (error) {
      // A newer request replaced this one; that request takes care of playback.
      if ((error as { code?: string } | null)?.code === 'CANCELLED') return 'shuffled';
      console.warn('Spotify shuffle-play failed, opening the playlist instead', error);
    }
  }
  await openPlaylistInSpotify(id);
  return 'opened';
}
