import NativeAlarmKit from './src/AlarmKitModule';
import type {
  AlarmKitAlarm,
  AlarmKitAuthorizationStatus,
  AlarmOpenedEvent,
  ScheduleAlarmOptions,
} from './src/AlarmKit.types';

export * from './src/AlarmKit.types';

/** True on iOS 26+ in a build that includes this module (not Expo Go, Android or web). */
export function isAvailable(): boolean {
  try {
    return NativeAlarmKit?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

export function getAuthorizationStatus(): AlarmKitAuthorizationStatus | 'unavailable' {
  if (!NativeAlarmKit || !isAvailable()) return 'unavailable';
  return NativeAlarmKit.getAuthorizationStatus();
}

/** Shows the system prompt the first time; afterwards just returns the current state. */
export async function requestAuthorization(): Promise<AlarmKitAuthorizationStatus | 'unavailable'> {
  if (!NativeAlarmKit || !isAvailable()) return 'unavailable';
  return NativeAlarmKit.requestAuthorization();
}

function requireModule() {
  if (!NativeAlarmKit || !isAvailable()) throw new Error('AlarmKit is not available on this device');
  return NativeAlarmKit;
}

/** Schedules (or replaces, after cancelAlarm) an alarm. Resolves with the AlarmKit ID. */
export function scheduleAlarm(options: ScheduleAlarmOptions): Promise<string> {
  return requireModule().scheduleAlarm(options);
}

export function cancelAlarm(id: string): Promise<void> {
  return requireModule().cancelAlarm(id);
}

export function cancelAll(): Promise<void> {
  return requireModule().cancelAll();
}

/** Alarms AlarmKit still has for this app. Fired one-time alarms are no longer listed. */
export async function listAlarms(): Promise<AlarmKitAlarm[]> {
  if (!NativeAlarmKit || !isAvailable()) return [];
  return NativeAlarmKit.listAlarms();
}

/**
 * The last "Open" tap that hasn't been handled yet, then clears it.
 * Call at startup: when the tap cold-starts the app, it happens before JS is running.
 */
export function consumePendingAlarmOpen(): AlarmOpenedEvent | null {
  if (!NativeAlarmKit) return null;
  try {
    return NativeAlarmKit.consumePendingAlarmOpen() ?? null;
  } catch {
    return null;
  }
}

/** Fires when the user taps an alarm's Open button while the app is running. */
export function addAlarmOpenedListener(listener: (event: AlarmOpenedEvent) => void): { remove(): void } {
  if (!NativeAlarmKit) return { remove() {} };
  return NativeAlarmKit.addListener('onAlarmOpened', listener);
}
