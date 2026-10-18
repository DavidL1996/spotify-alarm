# Install the iOS development build from Windows (no Mac, no paid Apple account)

Expo Go can't load our own native code (AlarmKit, the Spotify iOS SDK). So we build our own
"Expo Go": a **development build** of this app. It contains all the native code, and loads the
JavaScript from your PC (`npx expo start`) just like Expo Go does.

How it works:

1. GitHub builds the app on a Mac in the cloud (GitHub Actions) and gives you an **unsigned `.ipa`** file.
2. On Windows, **Sideloadly** signs that `.ipa` with your free Apple ID and installs it on the iPhone over USB.
3. You run `npx expo start` on the PC, and the app on the phone loads your code. Editing a `.ts`/`.tsx`
   file reloads the phone, no rebuild needed.

You only need a **new build** when native things change: anything in `modules/`, a new package with
native code, `app.json` plugins/permissions, or the app icon. The workflow starts by itself when
those files change on `main`.

> Items marked **(unverified)** are things I could not test from here. Tell me if they behave differently.

---

## 1. Put the project on GitHub (one time)

1. Make a free account at <https://github.com> if you don't have one.
2. Create a new repository: **+** (top right) > **New repository**, name it `spotify-alarm`.
   - **Public** repo: GitHub Actions macOS minutes are free.
   - **Private** repo: free plan includes 2,000 minutes/month, but macOS minutes count **10x**,
     so roughly 200 macOS minutes. One iOS build takes about 15-30 minutes **(unverified, first
     build is slowest)**, so a private repo gives you maybe 6-12 builds a month. Builds only run when
     native files change, to save minutes.
   - Don't add a README/.gitignore/license on GitHub (the project already has them).
3. In a terminal in the project folder:
   ```powershell
   git remote add origin https://github.com/<your-user>/spotify-alarm.git
   git branch -M main
   git push -u origin main
   ```
   Git will open a browser window to log in the first time.

## 2. Run the build

- Pushing changes to native files on `main` starts it automatically.
- To start it by hand: on GitHub open the repo > **Actions** tab > **iOS dev build (unsigned)** >
  **Run workflow** > pick the branch > **Run workflow**.

Wait for the green check mark (about 15-30 min). The separate **CI** workflow (typecheck + lint) runs on
every push and takes 1-2 minutes.

## 3. Download the .ipa

1. Click the finished run. The **summary** shows the bundle id, any app extensions, and short install steps.
2. Scroll to **Artifacts** and download **SpotifyAlarm-dev-unsigned-&lt;number&gt;**. It's a `.zip`.
3. Unzip it. Inside is `SpotifyAlarm-dev-unsigned.ipa`.

Artifacts are deleted after 14 days. Keep a copy of the `.ipa` if you want to re-sign it later
without running the build again.

## 4. Install Sideloadly and its requirements (one time)

Sideloadly: <https://sideloadly.io>

It talks to the iPhone through Apple's drivers, which come with iTunes and iCloud. You need the
**web-download versions from apple.com, NOT the Microsoft Store versions** (the Store versions use
a different driver that Sideloadly can't use):

1. If iTunes or iCloud are installed from the Microsoft Store, uninstall them first.
2. Install **iTunes for Windows** (64-bit) from apple.com
   (on <https://www.apple.com/itunes/> pick "Windows" and look for the "other versions" /
   direct download link, not the Store button).
3. Install **iCloud for Windows** the same way, the non-Store download from apple.com.
   **(unverified: Apple keeps moving these download links; the Sideloadly site links the
   current ones in its FAQ.)**
4. Install Sideloadly and start it.
5. Connect the iPhone with a USB cable, unlock it and tap **Trust This Computer**. It should
   appear in Sideloadly's device list. (After the first time you can enable Wi-Fi sync in
   iTunes, but USB is the reliable option.)

## 5. Sign and install

1. In Sideloadly, drag `SpotifyAlarm-dev-unsigned.ipa` onto the IPA icon.
2. **Apple account**: your normal Apple ID email. You can use a separate free Apple ID just for
   this if you prefer.
3. Click **Start** and enter the Apple ID password when asked (and the 2FA code).
   Sideloadly signs the app with a free "Personal Team" certificate and installs it.
4. Leave the **Advanced options** alone for now. Don't enable "Remove app extensions" unless an
   extension is causing install errors (see Troubleshooting), because the AlarmKit part may live
   in an extension.

### Turn on Developer Mode (iOS 16+, one time)

1. After the first install attempt, go to **Settings > Privacy & Security > Developer Mode**
   (it only shows up once a developer app has been put on the phone).
2. Turn it on. The iPhone restarts. After the restart, confirm **Turn On**.

### Trust your developer profile (one time per Apple ID)

**Settings > General > VPN & Device Management** > under "Developer App" tap your Apple ID >
**Trust "Apple Development: you@example.com"** > **Trust**.

Now the app opens from the Home Screen.

## 6. Connect the app to your PC (daily use)

1. On the PC, in the project folder:
   ```powershell
   npx expo start
   ```
   Because `expo-dev-client` is installed, the QR code now targets the development build
   instead of Expo Go. (If it still says Expo Go, press **s** in the terminal to switch.)
2. PC and iPhone must be on the **same Wi-Fi**.
3. Open **Spotify Alarm** on the phone. iOS asks to allow **Local Network** access: tap **Allow**
   (without it the app can't find your PC). The app either lists your PC's server, or you
   scan the QR code with the Camera app.
4. Edit code, save, and the phone reloads.

**Different networks / work or hotel Wi-Fi / it won't connect:** use a tunnel instead:

```powershell
npx expo start --tunnel
```

(The first time, Expo may ask to install `@expo/ngrok`. Say yes.)

Windows Firewall: the first time you run `npx expo start`, Windows may ask whether Node.js can
use the network. Allow it on **Private networks**. If you clicked "Cancel" earlier, use `--tunnel`
or allow Node.js in *Windows Security > Firewall > Allow an app through firewall*.

## 7. The 7-day limit and other free Apple ID limits

With a free Apple ID (no paid Developer Program):

- **Apps stop opening after 7 days.** The certificate expires. Your data in the app stays. Just
  re-sign: connect the phone, drag the same `.ipa` into Sideloadly, **Start**. Sideloadly can also
  auto-refresh in the background if the PC and phone are on the same network and the Sideloadly
  daemon is running **(unverified, check "Auto-refresh" in Sideloadly)**.
  An expired app will also stop ringing alarms, so refresh before you rely on it.
- **Max 3 sideloaded apps** active on the device at once per free Apple ID.
- **Max 10 App IDs per 7 days** per free Apple ID. Every app **and every app extension** inside
  it uses one App ID. Re-installing the same app with the same bundle id doesn't use new ones.
  Changing the bundle id (or having many extensions) does.
- **No paid-only capabilities.** Things like push notifications (remote, from a server), iCloud,
  and some others can't be signed with a free account. Local notifications and alarms set by the
  app itself don't need push. **(unverified: whether every capability the AlarmKit and Spotify
  modules use is allowed for free Personal Team signing. If Sideloadly reports an entitlement
  error, send me the exact message.)**

## 8. Troubleshooting

| Problem | Try this |
| --- | --- |
| Sideloadly doesn't see the iPhone | Use the apple.com (non-Store) iTunes/iCloud, unlock the phone, tap Trust, try another cable/USB port, restart Sideloadly. |
| "Unable to verify app" / app won't open | Trust the profile (step 5). Also check Developer Mode is on. Make sure the phone has internet the first time you open it. |
| App opened before but now just closes | The 7-day signature expired. Re-sign with Sideloadly. |
| "Maximum number of apps" / App ID limit errors | Delete other sideloaded apps, wait for the 7-day window, or use another free Apple ID. |
| Error mentioning an `.appex`, extension or entitlement | Copy the exact error. As a last resort, Sideloadly's *Advanced options > Remove app extensions* installs the app without its extensions (the parts that live in extensions won't work). |
| "Guru Meditation" / login errors in Sideloadly | Sign in at <https://appleid.apple.com> once in a browser, accept any new terms, then try again. App-specific passwords are **not** needed. **(unverified)** |
| App opens but shows "No development servers found" | Same Wi-Fi? Allowed **Local Network** (Settings > Privacy & Security > Local Network > Spotify Alarm)? Windows Firewall allowing Node.js? Otherwise use `npx expo start --tunnel` and scan the QR code. |
| Red screen "could not connect to development server" | `npx expo start` isn't running, or the PC's IP changed. Restart it and re-scan the QR code. |
| JS change doesn't show up | Shake the phone (or press **r** in the terminal) to reload. |
| A native change doesn't show up | You need a new build: push to `main` (or run the workflow by hand), then re-install the new `.ipa`. |
| The GitHub build fails | Open the failed run. The **Build** step prints the first errors, and an **xcodebuild-log** artifact holds the full log. |
| Want to see what changed in the build | The run's summary lists the bundle id and included app extensions. |
