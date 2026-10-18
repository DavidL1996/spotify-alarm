import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { AppState, type NativeEventSubscription } from 'react-native';

import * as SpotifyRemote from '../../modules/spotify-remote';
import { scheduleTestAlarm } from './alarm-scheduler';
import { formatTime } from './time';
import { isWebApiLoggedIn, listDevices, playOnPhoneShuffled } from './spotify-web';

/**
 * NIGHT MODE EXPERIMENT. Question: can the app, kept awake by silent background audio, start Spotify
 * at alarm time while the phone is locked? Everything that happens is written to a log you can read
 * in the app the next morning.
 *
 * How it works:
 * 1. Silent audio loops in the background, so iOS doesn't suspend the app. ("mixWithOthers" so it
 *    doesn't stop Spotify, and Spotify doesn't stop it.)
 * 2. While the app is open, it connects to the Spotify app once (opens Spotify, starts the playlist,
 *    pauses it) and keeps that connection.
 * 3. At alarm time it tries, in order:
 *    a. "remote": the Spotify SDK connection (or reconnect with the saved token),
 *    b. "web": Spotify's Web API, telling the iPhone's Spotify app to play (Spotify Connect).
 * 4. A normal alarm (AlarmKit, or a notification) rings a few minutes later as a backup.
 *
 * Timing: React Native's setTimeout isn't reliable while an iOS app is in the background, so we also
 * check the time on every progress update from the silent audio player. Those come from a native
 * AVPlayer timer that keeps running while audio plays. The log says which one fired.
 */

export type NightLogEntry = { at: number; message: string };

const LOG_KEY = 'spotify-alarm/night-test-log/v1';
const MAX_LOG = 500;
const TICK_MS = 5_000;
const HEARTBEAT_MS = 10 * 60_000;
const DEVICES_EVERY_MS = 30 * 60_000;

let log: NightLogEntry[] = [];
let logLoaded = false;
const listeners = new Set<(entries: NightLogEntry[]) => void>();

type Running = {
  fireAt: number;
  playlistId: string;
  fired: boolean;
  player: AudioPlayer;
  cleanups: (() => void)[];
  lastHeartbeat: number;
  lastDevices: number;
};
let running: Running | null = null;

// ---- Log -------------------------------------------------------------------------------------

async function loadLog(): Promise<void> {
  if (logLoaded) return;
  logLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    if (raw) log = [...(JSON.parse(raw) as NightLogEntry[]), ...log];
  } catch {
    // Start with an empty log.
  }
}

function emit(): void {
  for (const listener of listeners) listener(log);
}

export function addLog(message: string): void {
  log = [...log, { at: Date.now(), message }].slice(-MAX_LOG);
  emit();
  AsyncStorage.setItem(LOG_KEY, JSON.stringify(log)).catch(() => undefined);
}

export async function getNightLog(): Promise<NightLogEntry[]> {
  await loadLog();
  return log;
}

export function subscribeNightLog(listener: (entries: NightLogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function clearNightLog(): Promise<void> {
  log = [];
  emit();
  await AsyncStorage.removeItem(LOG_KEY).catch(() => undefined);
}

const errorText = (error: unknown) => {
  const e = error as { code?: string; message?: string } | null;
  return [e?.code, e?.message].filter(Boolean).join(': ') || String(error);
};

// ---- Experiment ------------------------------------------------------------------------------

export function isNightTestRunning(): boolean {
  return running !== null;
}

export function nightTestFireAt(): number | null {
  return running?.fireAt ?? null;
}

export type NightTestOptions = {
  playlistId: string;
  /** Minutes from now until Spotify should start. */
  minutes: number;
  /** The backup alarm rings this many minutes after that. */
  backupMinutes?: number;
};

export async function startNightTest({ playlistId, minutes, backupMinutes = 3 }: NightTestOptions): Promise<void> {
  await loadLog();
  if (running) await stopNightTest('restarted');

  const fireAt = Date.now() + minutes * 60_000;
  const fire = new Date(fireAt);
  addLog(`=== Night test started. Spotify should start at ${formatTime(fire.getHours(), fire.getMinutes())}.`);

  // 1. Silent background audio keeps the app running.
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers' });
  const player = createAudioPlayer(require('../../assets/silence.wav'), { updateInterval: TICK_MS });
  player.loop = true;
  player.play();
  addLog('Silent background audio started.');

  const state: Running = {
    fireAt,
    playlistId,
    fired: false,
    player,
    cleanups: [],
    lastHeartbeat: Date.now(),
    lastDevices: 0,
  };
  running = state;

  // The player can report "not playing" for a moment when the loop restarts, so only treat it as
  // stopped if that's still true on the next update.
  let notPlayingUpdates = 0;
  let reportedStopped = false;
  // AudioPlayer's addListener comes from its base class in expo-modules-core, which TypeScript can't
  // resolve from expo-audio in this install (it's nested under node_modules/expo). It's there at runtime.
  const emitter = player as unknown as {
    addListener(event: 'playbackStatusUpdate', listener: (status: AudioStatus) => void): { remove(): void };
  };
  const statusSub = emitter.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (running !== state) return;
    if (status.playing) {
      notPlayingUpdates = 0;
      if (reportedStopped) addLog('Silent audio playing again.');
      reportedStopped = false;
    } else if (++notPlayingUpdates >= 2) {
      if (!reportedStopped) addLog('Silent audio STOPPED (phone call or another app?). Restarting it.');
      reportedStopped = true;
      player.play();
    }
    tick(state, 'audio timer');
  });
  state.cleanups.push(() => statusSub.remove());

  const timeout = setTimeout(() => tick(state, 'setTimeout'), Math.max(0, fireAt - Date.now()));
  state.cleanups.push(() => clearTimeout(timeout));

  const appStateSub: NativeEventSubscription = AppState.addEventListener('change', (next) =>
    addLog(`App is now ${next}.`),
  );
  state.cleanups.push(() => appStateSub.remove());

  const connectionSub = SpotifyRemote.addConnectionListener(({ connected, error }) =>
    addLog(connected ? 'Spotify SDK: connected.' : `Spotify SDK: DISCONNECTED${error ? ` (${error})` : ''}.`),
  );
  if (connectionSub) state.cleanups.push(() => connectionSub.remove());

  // 2. Backup alarm, in case Spotify doesn't start.
  try {
    const backupAt = new Date(fireAt + backupMinutes * 60_000);
    const ok = await scheduleTestAlarm(
      {
        id: 'night-test',
        label: 'Night test backup',
        hour: backupAt.getHours(),
        minute: backupAt.getMinutes(),
        playlistId,
        playlistName: '',
      },
      Math.round((backupAt.getTime() - Date.now()) / 1000),
    );
    addLog(ok ? `Backup alarm set for ${formatTime(backupAt.getHours(), backupAt.getMinutes())}.` : 'Backup alarm NOT set (permission off).');
  } catch (error) {
    addLog(`Backup alarm failed: ${errorText(error)}`);
  }

  // 3. Connect to the Spotify app now, while we're allowed to open it.
  if (SpotifyRemote.isAvailable()) {
    addLog('Spotify SDK: opening Spotify to connect...');
    try {
      await SpotifyRemote.connectForNight(`spotify:playlist:${playlistId}`);
      addLog('Spotify SDK: ready (playlist loaded with shuffle on, paused).');
    } catch (error) {
      addLog(`Spotify SDK: setup failed: ${errorText(error)}`);
    }
  } else {
    addLog('Spotify SDK: not available in this build (no Client ID, or Expo Go).');
  }
  addLog((await isWebApiLoggedIn()) ? 'Web API: logged in.' : 'Web API: not logged in, that route will be skipped.');
  addLog('Now lock the phone and leave the app in the background (do not swipe it away).');
}

function tick(state: Running, trigger: string): void {
  if (running !== state) return;
  const now = Date.now();

  if (!state.fired && now >= state.fireAt) {
    state.fired = true;
    const late = Math.round((now - state.fireAt) / 1000);
    addLog(`Alarm time reached via ${trigger} (${late}s late), app is ${AppState.currentState}.`);
    void fireSpotify(state);
    return;
  }

  if (now - state.lastHeartbeat >= HEARTBEAT_MS) {
    state.lastHeartbeat = now;
    void heartbeat(state, trigger);
  }
}

async function heartbeat(state: Running, trigger: string): Promise<void> {
  const connected = await SpotifyRemote.isConnected().catch(() => false);
  addLog(`Still alive (${trigger}), app ${AppState.currentState}, Spotify SDK ${connected ? 'connected' : 'not connected'}.`);

  if (Date.now() - state.lastDevices >= DEVICES_EVERY_MS && (await isWebApiLoggedIn())) {
    state.lastDevices = Date.now();
    try {
      const devices = await listDevices();
      addLog(`Web API devices: ${devices.map((d) => `${d.name} (${d.type}${d.is_active ? ', active' : ''})`).join(', ') || 'none'}.`);
    } catch (error) {
      addLog(`Web API devices failed: ${errorText(error)}`);
    }
  }
}

async function fireSpotify(state: Running): Promise<void> {
  const uri = `spotify:playlist:${state.playlistId}`;
  let worked = false;

  if (SpotifyRemote.isAvailable()) {
    try {
      await SpotifyRemote.playIfConnected(uri);
      addLog('RESULT remote: Spotify is playing (shuffle on).');
      worked = true;
    } catch (error) {
      addLog(`RESULT remote: failed: ${errorText(error)}`);
    }
  }

  if (!worked && (await isWebApiLoggedIn())) {
    try {
      addLog(`RESULT web: ${await playOnPhoneShuffled(state.playlistId)}.`);
      worked = true;
    } catch (error) {
      addLog(`RESULT web: failed: ${errorText(error)}`);
    }
  }

  addLog(worked ? '=== Spotify started. Did you hear it?' : '=== Nothing worked. The backup alarm should ring.');
  await stopNightTest();
}

export async function stopNightTest(reason?: string): Promise<void> {
  const state = running;
  if (!state) return;
  running = null;
  for (const cleanup of state.cleanups) cleanup();
  state.player.pause();
  state.player.remove();
  if (reason) addLog(`Night test stopped (${reason}).`);
}
