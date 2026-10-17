# Spotify Alarm — step 1

An Expo (React Native + TypeScript) app you can build on Windows and run on your iPhone through **Expo Go**. No Mac and no paid Apple account needed for this step.

What works now:
- Alarm list with on/off switches and "Rings in …" for the next alarm
- Add / edit / delete alarms: 24-hour time picker, repeat days (Mon–Sun), label
- Paste a Spotify playlist link per alarm, with a **Test: open in Spotify** button
- Alarms are saved on the phone (AsyncStorage), and the app follows light/dark mode

Not yet: the alarm doesn't actually ring. That's step 2 (`expo-notifications`) and step 3 (AlarmKit + Spotify SDK).

## Run it (Windows)

1. Install **Node.js LTS** from nodejs.org.
2. On the iPhone, install **Expo Go** from the App Store.
3. Unzip this folder, open a terminal in it, and run:
   ```powershell
   npm install
   npx expo start
   ```
4. Scan the QR code with the iPhone Camera app. It opens in Expo Go.
   - PC and phone must be on the same Wi-Fi. If it can't connect (e.g. work network), use `npx expo start --tunnel`.
5. Edit any file and save. The phone reloads instantly.

Useful commands:
```powershell
npx tsc --noEmit        # typecheck (like a C# build)
npx expo install <pkg>  # always add packages this way, it picks SDK-compatible versions
```

Recommended editor: **VS Code**.

## Project layout

```
src/
  app/                    ← Expo Router: every file here is a screen
    _layout.tsx           root navigator (Stack) + AlarmsProvider
    index.tsx             alarm list            → route "/"
    alarm/[id].tsx        add/edit form (modal) → route "/alarm/new" or "/alarm/<id>"
  components/
    AlarmRow.tsx          one row in the list
  lib/
    types.ts              Alarm model
    alarms-store.tsx      load/save alarms + useAlarms() hook
    time.ts               formatting + "next occurrence" logic
    spotify.ts            parse playlist links, open Spotify
    theme.ts              light/dark colours
```

## C# → TypeScript/React cheat sheet

| C# / .NET | Here |
| --- | --- |
| `record Alarm(...)` | `type Alarm = { ... }` in `types.ts` |
| Singleton service via DI | `AlarmsProvider` (React context) + `useAlarms()` |
| `INotifyPropertyChanged` / bound fields | `useState` — calling the setter re-renders the screen |
| `async Task` | `async` function returning `Promise` |
| XAML page | a `.tsx` file that returns JSX |
| `[Route("alarm/{id}")]` | the file `src/app/alarm/[id].tsx` |

## Next steps

- **Step 2:** `npx expo install expo-notifications`, then schedule a local notification with a custom sound for each enabled alarm. Still runs in Expo Go.
- **Step 3 (needs Apple Developer account + EAS dev build):** native module for AlarmKit + Spotify iOS SDK shuffle-play.
