// Special Expo Router file (not a screen): lets us filter incoming deep links before navigation.
// https://docs.expo.dev/router/advanced/native-intent/
//
// Spotify's auth redirect (spotifyalarm://spotify-login-callback#access_token=...) is handled natively by
// modules/spotify-remote, and spotifyalarm://spotify-web-callback by expo-auth-session (src/lib/spotify-web.ts).
// Without this, Expo Router would try to open a screen with that name.
// Returning null means "don't navigate, stay where you are".
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  if (typeof path === 'string' && (path.includes('spotify-login-callback') || path.includes('spotify-web-callback'))) {
    return null;
  }
  return path;
}
