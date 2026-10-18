import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import * as SpotifyRemote from '../../modules/spotify-remote';

/**
 * Spotify Web API (the "internet" route for the night mode experiment).
 *
 * At alarm time we ask Spotify's servers to start a playlist on the iPhone's Spotify app
 * (Spotify Connect). That doesn't need the Spotify app to be in the foreground, only to still be
 * listed as a device. Player endpoints need Spotify Premium.
 *
 * Login is OAuth "authorization code + PKCE": no client secret in the app, and we get a refresh token
 * so the overnight call doesn't need a login screen.
 * Docs: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
 *       https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
 */

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'spotify-alarm/spotify-web-token/v1';
const SCOPES = ['user-read-playback-state', 'user-modify-playback-state'];
const API = 'https://api.spotify.com/v1';

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

/** Must also be added as a Redirect URI in the Spotify Developer Dashboard (docs/spotify-setup.md). */
export const WEB_REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'spotifyalarm', path: 'spotify-web-callback' });

type StoredToken = AuthSession.TokenResponseConfig;

function clientId(): string | null {
  return SpotifyRemote.getClientId();
}

export function isWebApiConfigured(): boolean {
  return clientId() !== null;
}

export async function isWebApiLoggedIn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TOKEN_KEY)) !== null;
  } catch {
    return false;
  }
}

/** Opens Spotify's login page in a browser sheet. Resolves true when we have a token. */
export async function loginToWebApi(): Promise<boolean> {
  const id = clientId();
  if (!id) throw new Error('No Spotify Client ID in this build (see docs/spotify-setup.md).');

  const request = new AuthSession.AuthRequest({
    clientId: id,
    scopes: SCOPES,
    redirectUri: WEB_REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return false;

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: id,
      code: result.params.code,
      redirectUri: WEB_REDIRECT_URI,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(token.getRequestConfig()));
  return true;
}

export async function logoutOfWebApi(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** A valid access token, refreshing it if it has expired (access tokens last about an hour). */
async function getAccessToken(): Promise<string> {
  const raw = await AsyncStorage.getItem(TOKEN_KEY);
  if (!raw) throw new Error('Not logged in to the Spotify Web API.');
  let token = new AuthSession.TokenResponse(JSON.parse(raw) as StoredToken);

  if (token.shouldRefresh()) {
    const id = clientId();
    if (!id || !token.refreshToken) throw new Error('Spotify token expired and cannot be refreshed. Log in again.');
    const refreshed = await AuthSession.refreshAsync({ clientId: id, refreshToken: token.refreshToken }, discovery);
    // Spotify may or may not send a new refresh token; keep the old one if not.
    token = new AuthSession.TokenResponse({
      ...refreshed.getRequestConfig(),
      refreshToken: refreshed.refreshToken ?? token.refreshToken,
    });
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(token.getRequestConfig()));
  }
  return token.accessToken;
}

async function api(method: 'GET' | 'PUT' | 'POST', path: string, body?: object): Promise<Response> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  }
  return response;
}

type Device = { id: string | null; is_active: boolean; name: string; type: string };

/** Lists Spotify Connect devices, e.g. to check the iPhone is still visible overnight. */
export async function listDevices(): Promise<Device[]> {
  const response = await api('GET', '/me/player/devices');
  const json = (await response.json()) as { devices: Device[] };
  return json.devices;
}

/**
 * Starts the playlist on the iPhone's Spotify app with shuffle on, then skips once so it doesn't
 * always start on track 1. Returns a short description of what happened, for the experiment log.
 */
export async function playOnPhoneShuffled(playlistId: string): Promise<string> {
  const devices = await listDevices();
  const phone =
    devices.find((d) => d.type === 'Smartphone' && d.is_active) ??
    devices.find((d) => d.type === 'Smartphone') ??
    devices.find((d) => d.is_active);
  if (!phone?.id) {
    const seen = devices.map((d) => `${d.name} (${d.type})`).join(', ') || 'none';
    throw new Error(`iPhone not in Spotify's device list. Devices seen: ${seen}`);
  }

  const device = encodeURIComponent(phone.id);
  await api('PUT', `/me/player/play?device_id=${device}`, { context_uri: `spotify:playlist:${playlistId}` });
  await api('PUT', `/me/player/shuffle?state=true&device_id=${device}`);
  await api('POST', `/me/player/next?device_id=${device}`).catch(() => undefined);
  return `playing on "${phone.name}" (${phone.type}${phone.is_active ? ', was active' : ''})`;
}
