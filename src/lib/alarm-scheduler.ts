import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import * as AlarmKit from '../../modules/alarm-kit';
import { scheduleTestAlarm as scheduleTestNotification, syncAlarmNotifications } from './notifications';
import { playPlaylistShuffled } from './spotify';
import type { Alarm } from './types';

// One entry point for "make the phone ring for these alarms".
//  - iOS 26+ dev build with AlarmKit allowed → real system alarms (ring in silent mode / Focus).
//  - Otherwise (Expo Go, Android, web, older iOS, AlarmKit denied) → step-2 notifications.

export type AlarmSyncResult = {
  backend: 'alarmkit' | 'notifications';
  /** False if nothing can ring: AlarmKit not in use and notifications are blocked. */
  canRing: boolean;
  /** AlarmKit exists on this phone but the user said no (so we fell back to notifications). */
  alarmKitDenied: boolean;
};

export type { AlarmOpenedEvent } from '../../modules/alarm-kit';

/**
 * AlarmKit wants a UUID per alarm. Rather than storing a second ID, we derive one from our
 * alarm ID with a fixed hash, so the same alarm always gets the same UUID (no migration, no
 * extra storage, and sync can recognise its own alarms). Uppercase to match Swift's uuidString.
 */
export function nativeAlarmId(alarmId: string): string {
  const input = `spotify-alarm:${alarmId}`;
  // cyrb128: small, well-mixed 128-bit non-crypto hash. Collisions are irrelevant at our scale.
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('').split('');
  hex[12] = '8'; // UUID version 8 (custom)
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16); // RFC 4122 variant
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`.toUpperCase();
}

// "Test alarm" AlarmKit IDs → when they ring. Syncing leaves these alone until they've rung.
const pendingTests = new Map<string, number>();

function isPendingTest(id: string, now: number): boolean {
  const at = pendingTests.get(id);
  if (at == null) return false;
  if (at + 60_000 < now) {
    pendingTests.delete(id);
    return false;
  }
  return true;
}

type AlarmFields = Pick<Alarm, 'id' | 'label' | 'hour' | 'minute' | 'playlistId'>;

function alarmKitOptions(alarm: AlarmFields, id: string, weekdays: number[], date: number | null) {
  return {
    id,
    appAlarmId: alarm.id,
    hour: alarm.hour,
    minute: alarm.minute,
    weekdays,
    date,
    title: alarm.label || 'Alarm',
    playlistId: alarm.playlistId,
    openButtonText: alarm.playlistId ? 'Play Spotify' : 'Open',
  };
}

/** Cancel the AlarmKit alarms we own, then schedule the current list (like the notification sync). */
async function syncWithAlarmKit(alarms: Alarm[]): Promise<void> {
  const now = Date.now();
  const existing = await AlarmKit.listAlarms();
  // Don't touch an alarm that is ringing right now; cancelling it would cut it off.
  const alerting = new Set(existing.filter((a) => a.state === 'alerting').map((a) => a.id.toUpperCase()));

  for (const scheduled of existing) {
    const id = scheduled.id.toUpperCase();
    if (alerting.has(id) || isPendingTest(id, now)) continue;
    await AlarmKit.cancelAlarm(id);
  }

  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const id = nativeAlarmId(alarm.id);
    if (alerting.has(id)) continue;

    if (alarm.repeatDays.length === 0) {
      // One-time: rings at the moment the store worked out (onceAt). The store switches it off afterwards.
      if (!alarm.onceAt || alarm.onceAt <= now) continue;
      await AlarmKit.scheduleAlarm(alarmKitOptions(alarm, id, [], alarm.onceAt));
    } else {
      await AlarmKit.scheduleAlarm(alarmKitOptions(alarm, id, alarm.repeatDays, null));
    }
  }
}

async function runSync(alarms: Alarm[]): Promise<AlarmSyncResult> {
  if (!AlarmKit.isAvailable()) {
    const canRing = await syncAlarmNotifications(alarms);
    return { backend: 'notifications', canRing, alarmKitDenied: false };
  }

  let status = AlarmKit.getAuthorizationStatus();
  // Only prompt once there's something to ring (same rule as the notification permission).
  if (status === 'notDetermined' && alarms.some((a) => a.enabled)) {
    status = await AlarmKit.requestAuthorization().catch(() => status);
  }

  if (status === 'authorized') {
    try {
      await syncWithAlarmKit(alarms);
      // AlarmKit rings now, so remove the step-2 notifications to avoid ringing twice.
      await syncAlarmNotifications([]);
      return { backend: 'alarmkit', canRing: true, alarmKitDenied: false };
    } catch (error) {
      // Better a notification than silence (some alarms may then ring twice).
      console.warn('AlarmKit scheduling failed; falling back to notifications', error);
    }
  }

  const canRing = await syncAlarmNotifications(alarms);
  return { backend: 'notifications', canRing, alarmKitDenied: status === 'denied' };
}

// Syncs run one after another so two quick edits can't interleave.
let queue: Promise<unknown> = Promise.resolve();

/** Makes the phone's alarms match the alarm list. Called by the alarms store on every change. */
export function syncAlarms(alarms: Alarm[]): Promise<AlarmSyncResult> {
  const run = queue.then(() => runSync(alarms));
  queue = run.catch(() => undefined);
  return run;
}

/**
 * "Test alarm in 5 seconds": a real AlarmKit alarm when possible, else a notification.
 * Returns false if neither is allowed.
 */
export async function scheduleTestAlarm(
  alarm: Parameters<typeof scheduleTestNotification>[0],
  seconds = 5,
): Promise<boolean> {
  if (AlarmKit.isAvailable()) {
    let status = AlarmKit.getAuthorizationStatus();
    if (status === 'notDetermined') status = await AlarmKit.requestAuthorization().catch(() => status);
    if (status === 'authorized') {
      try {
        const fireAt = Date.now() + seconds * 1000;
        const id = nativeAlarmId(`test-${fireAt}`);
        pendingTests.set(id, fireAt);
        await AlarmKit.scheduleAlarm({
          ...alarmKitOptions(alarm, id, [], fireAt),
          title: `Test: ${alarm.label || 'Alarm'}`,
        });
        return true;
      } catch (error) {
        console.warn('Could not schedule AlarmKit test alarm', error);
      }
    }
  }
  return scheduleTestNotification(alarm, seconds);
}

// Ignore "Open" taps older than this (e.g. a pending one found days later).
const STALE_AFTER_MS = 10 * 60_000;

function openSpotifyForAlarm(event: AlarmKit.AlarmOpenedEvent): void {
  if (event.playlistId) playPlaylistShuffled(event.playlistId).catch(() => undefined);
}

/**
 * Runs `handler` when the user taps an AlarmKit alarm's Open button. Covers both cases:
 * app already running (event) and app launched by the tap (pending value read at startup).
 * Default: shuffle-play the alarm's playlist in Spotify (falls back to opening it).
 */
export function useAlarmKitOpenHandler(
  handler: (event: AlarmKit.AlarmOpenedEvent) => void = openSpotifyForAlarm,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!AlarmKit.isAvailable()) return;
    // The same tap can arrive as an event and as the pending value, so remember what we handled.
    const handled = new Set<number>();
    const handle = (event: AlarmKit.AlarmOpenedEvent | null) => {
      if (!event || handled.has(event.openedAt)) return;
      handled.add(event.openedAt);
      if (Date.now() - event.openedAt > STALE_AFTER_MS) return;
      handlerRef.current(event);
    };

    const subscription = AlarmKit.addAlarmOpenedListener((event) => {
      AlarmKit.consumePendingAlarmOpen();
      handle(event);
    });
    handle(AlarmKit.consumePendingAlarmOpen());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') handle(AlarmKit.consumePendingAlarmOpen());
    });
    return () => {
      subscription.remove();
      appState.remove();
    };
  }, []);
}
