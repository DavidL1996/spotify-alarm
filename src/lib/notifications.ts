import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { playPlaylistShuffled } from './spotify';
import { formatTime } from './time';
import type { Alarm } from './types';

// Android groups notifications into "channels". Ours is high importance so it pops up with sound.
const CHANNEL_ID = 'alarms';

/** Extra info attached to each notification, read back when the user taps it. */
export type AlarmNotificationData = {
  alarmId: string;
  playlistId: string | null;
  /** True for the "Test alarm in 5 seconds" button. Syncing leaves these alone. */
  test?: boolean;
};

/** Call once at startup (done in src/app/_layout.tsx). */
export function configureNotifications(): void {
  // Without a handler, notifications that arrive while the app is open are not shown at all.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    // Android 13+ needs the channel to exist before it will show the permission prompt.
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Alarms',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500],
    }).catch((error) => console.warn('Could not create notification channel', error));
  }
}

/** Asks for permission the first time; afterwards just reports what the user chose. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

type AlarmContentFields = Pick<Alarm, 'id' | 'label' | 'hour' | 'minute' | 'playlistId' | 'playlistName'>;

function contentFor(alarm: AlarmContentFields, test = false): Notifications.NotificationContentInput {
  const data: AlarmNotificationData = { alarmId: alarm.id, playlistId: alarm.playlistId, test };
  return {
    title: `⏰ ${alarm.label || 'Alarm'} · ${formatTime(alarm.hour, alarm.minute)}`,
    body: alarm.playlistId
      ? `Tap to play ${alarm.playlistName || 'your playlist'} on Spotify`
      : 'Time to wake up!',
    sound: 'default',
    data,
  };
}

/** Cancels every scheduled alarm notification, except pending test alarms. */
async function cancelAlarmNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if ((request.content.data as Partial<AlarmNotificationData> | null)?.test) continue;
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
}

async function scheduleAll(alarms: Alarm[]): Promise<void> {
  // Simplest reliable approach: wipe everything and schedule again from the current alarm list.
  await cancelAlarmNotifications();

  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const content = contentFor(alarm);

    if (alarm.repeatDays.length === 0) {
      // One-time alarm: fires once at the moment worked out when it was saved.
      if (!alarm.onceAt || alarm.onceAt <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alarm.onceAt, channelId: CHANNEL_ID },
      });
      continue;
    }

    // Repeating alarm: one weekly notification per selected day.
    for (const day of alarm.repeatDays) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1, // expo-notifications counts 1 = Sunday; our Weekday has 0 = Sunday.
          hour: alarm.hour,
          minute: alarm.minute,
          channelId: CHANNEL_ID,
        },
      });
    }
  }
}

/** Fires a one-off notification a few seconds from now, so you can try an alarm without waiting. */
export async function scheduleTestAlarm(alarm: AlarmContentFields, seconds = 5): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: contentFor(alarm, true),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
  });
  return true;
}

// Syncs run one after another, so two quick edits can't interleave their cancel/schedule calls.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Makes the phone's scheduled notifications match the alarm list.
 * Returns false if the user blocked notifications (the alarms then won't ring).
 */
export function syncAlarmNotifications(alarms: Alarm[]): Promise<boolean> {
  const run = queue.then(async () => {
    if (!alarms.some((a) => a.enabled)) {
      await cancelAlarmNotifications();
      // Nothing to ring, so don't prompt yet. Only report "off" if the user actually blocked it.
      const permission = await Notifications.getPermissionsAsync();
      return permission.granted || permission.canAskAgain;
    }
    if (!(await ensureNotificationPermission())) return false;
    await scheduleAll(alarms);
    return true;
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * When the user taps an alarm notification, shuffle-play its playlist in Spotify.
 * Covers both cases: app already running, and app launched by the tap.
 */
export function useOpenSpotifyOnNotificationTap(): void {
  useEffect(() => {
    // The same tap can arrive through both paths below, so remember which ones we've handled.
    const handled = new Set<string>();

    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier + response.notification.date;
      if (handled.has(id)) return;
      handled.add(id);

      const data = response.notification.request.content.data as Partial<AlarmNotificationData>;
      if (data.playlistId) playPlaylistShuffled(data.playlistId).catch(() => undefined);
      // Clear it so the same tap isn't replayed the next time the app starts.
      Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse).catch(() => undefined);
    return () => subscription.remove();
  }, []);
}
