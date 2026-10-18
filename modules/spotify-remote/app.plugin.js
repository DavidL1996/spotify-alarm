// Config plugin for the local spotify-remote module. Runs during `npx expo prebuild`.
// Usage in app.json:  ["./modules/spotify-remote/app.plugin.js", { "clientId": "<Spotify Client ID>" }]
// The SPOTIFY_CLIENT_ID environment variable overrides the app.json value (handy for CI).
// The Client ID is not a secret (this flow has no client secret), but keeping it out of git is fine too.
const { withInfoPlist, WarningAggregator } = require('expo/config-plugins');

const DEFAULT_REDIRECT_URI = 'spotifyalarm://spotify-login-callback';

function withSpotifyRemote(config, props = {}) {
  const clientId = (process.env.SPOTIFY_CLIENT_ID || props.clientId || '').trim();
  const redirectUri = (props.redirectUri || DEFAULT_REDIRECT_URI).trim();

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(redirectUri);
  if (!schemeMatch) {
    throw new Error(`spotify-remote: redirectUri must look like "myscheme://callback", got "${redirectUri}"`);
  }
  const scheme = schemeMatch[1];

  if (!clientId) {
    WarningAggregator.addWarningIOS(
      'spotify-remote',
      'No Spotify Client ID set (plugin option "clientId" or SPOTIFY_CLIENT_ID). Shuffle-play is disabled; the app falls back to opening the playlist. See docs/spotify-setup.md.'
    );
  }

  return withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;

    // Read by ios/SpotifyRemoteController.swift.
    plist.SpotifyClientID = clientId;
    plist.SpotifyRedirectURL = redirectUri;

    // Needed for canOpenURL("spotify:") and by the SDK to open the Spotify app.
    const queries = Array.isArray(plist.LSApplicationQueriesSchemes) ? plist.LSApplicationQueriesSchemes : [];
    if (!queries.includes('spotify')) queries.push('spotify');
    plist.LSApplicationQueriesSchemes = queries;

    // The redirect URI's scheme must be a registered URL scheme. Expo already adds `expo.scheme`;
    // only add a URL type if it's missing (e.g. a custom redirectUri).
    const urlTypes = Array.isArray(plist.CFBundleURLTypes) ? plist.CFBundleURLTypes : [];
    const registered = urlTypes.some(
      (type) => Array.isArray(type.CFBundleURLSchemes) && type.CFBundleURLSchemes.includes(scheme)
    );
    if (!registered) urlTypes.push({ CFBundleURLSchemes: [scheme] });
    plist.CFBundleURLTypes = urlTypes;

    return cfg;
  });
}

module.exports = withSpotifyRemote;
