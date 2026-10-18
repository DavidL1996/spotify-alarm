# Spotify setup (shuffle-play on alarm)

When you tap an alarm, the app uses the **Spotify iOS SDK** to start your playlist **with shuffle on**.
For that, Spotify needs to know about the app: you register it once in the Spotify Developer Dashboard
and paste its **Client ID** into `app.json`.

Without a Client ID (and always in Expo Go), the app falls back to just opening the playlist in Spotify.

Points marked **(unverified)** come from Spotify's docs or blog posts, but I couldn't try them myself.

## What you need

- A **Spotify Premium** account. Since February 2026, Development Mode apps need a Premium owner, allow
  **at most 5 users**, and each developer gets **one Client ID**
  ([Spotify blog, 6 Feb 2026](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)).
- The **Spotify app** installed and logged in on the iPhone.
- A **development build** of Spotify Alarm (from the GitHub Actions workflow). Expo Go can't load the SDK.

## 1. Create the app in the Spotify Developer Dashboard

1. Go to <https://developer.spotify.com/dashboard> and log in with your Spotify (Premium) account.
   Accept the Developer Terms if asked.
2. Click **Create app** and fill in:
   - **App name**: `Spotify Alarm` (shown to you on Spotify's consent screen)
   - **App description**: anything, e.g. `Personal alarm clock`
   - **Website**: optional
   - **Redirect URIs**: `spotifyalarm://spotify-login-callback` (type it exactly, lowercase, then click **Add**)
   - **Which API/SDKs are you planning to use?** tick **iOS**. (You don't need Web API or Android.)
3. Tick the terms checkbox and click **Save**.
4. Open the app's **Settings** (Edit) and, under **iOS app bundles / Bundle IDs**, add
   `com.davidljungberg.spotifyalarm`, then **Save**. **(unverified: the exact label of this field)**
5. **User Management** tab: add yourself (name + the email address of your Spotify account).
   The owner may already be allowed, but adding yourself does no harm. **(unverified)**
   Anyone else who should use the app (max 5 people) must be added here too, and needs Premium.
6. On the app's overview / Settings page, copy the **Client ID** (a 32-character hex string).
   You do **not** need the Client Secret. Never put the secret in the app.

**(unverified)** Spotify's newer redirect URI rules (April 2025) are written for HTTPS and loopback URLs.
Custom schemes like `spotifyalarm://…` are still the documented pattern for the iOS SDK (Spotify's
own quick start uses `spotify-ios-quick-start://spotify-login-callback`). The rules also say an iOS redirect
scheme shouldn't be one the app uses for other things. `spotifyalarm` is also the app's deep-link
scheme. If the dashboard rejects the URI, or login acts up, use a separate scheme instead, e.g.
`spotifyalarm-auth://spotify-login-callback`. Put it in the dashboard **and** as `redirectUri` in
`app.json` (below). The config plugin registers the new scheme for you.

## 2. Put the Client ID in the app

In `app.json`, find the `spotify-remote` plugin entry and paste the Client ID:

```json
[
  "./modules/spotify-remote/app.plugin.js",
  {
    "clientId": "0123456789abcdef0123456789abcdef"
  }
]
```

Optional: `"redirectUri": "spotifyalarm-auth://spotify-login-callback"` if you changed it above.
The default is `spotifyalarm://spotify-login-callback`.

Alternatively leave `clientId` empty and set the environment variable **`SPOTIFY_CLIENT_ID`** where
`npx expo prebuild` runs. The GitHub iOS workflow already passes it from a repository **variable**:
on GitHub go to Settings → Secrets and variables → Actions → **Variables** tab → New repository variable,
name `SPOTIFY_CLIENT_ID`. The env variable wins over `app.json`. The Client ID isn't really a secret,
so committing it in `app.json` is fine too.

The value is written to `Info.plist` during prebuild, so **changing it needs a new build**. A JS-only
reload isn't enough.

## 3. First run

1. Install the new build and create an alarm with a playlist.
2. Use **Test alarm in 5 seconds** and tap the notification.
3. The app opens Spotify. The first time, Spotify asks you to allow "Spotify Alarm" to control playback.
   Tap **Agree**. Spotify then jumps back to Spotify Alarm, and the playlist keeps playing with shuffle on.
4. Later alarms do the same thing without the consent screen: a quick hop to Spotify and back.

If something fails (not configured, not authorized, Spotify didn't respond within 90 s), the app falls back
to opening the playlist in Spotify. The reason shows in the Metro / Xcode log as
`Spotify shuffle-play failed …`.

## How the SDK is included (for reference)

- Spotify iOS SDK **v5.0.1** (`SpotifyiOS.xcframework`), pinned in
  `modules/spotify-remote/ios/SpotifyRemote.podspec`.
- During `pod install` on macOS, the podspec downloads that GitHub tag
  (`https://codeload.github.com/spotify/ios-sdk/tar.gz/refs/tags/v5.0.1`), extracts only the xcframework into
  `modules/spotify-remote/ios/Frameworks/` (git-ignored), and checks the SHA-256 of both binaries.
  CocoaPods then links and embeds it. Nothing happens on Windows, Android or in Expo Go.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Spotify shows "INVALID_CLIENT: Invalid redirect URI" | The redirect URI in the dashboard doesn't match `redirectUri` in `app.json` exactly |
| Spotify shows an error about the user not being registered | Add your Spotify account's email under **User Management** |
| It only opens the playlist, never shuffles | No Client ID in the build (check the prebuild warning), or you're in Expo Go |
| Login works but nothing plays | Spotify Free account, or Spotify isn't logged in on the phone |
