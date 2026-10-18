export type AlarmKitAuthorizationStatus = 'authorized' | 'denied' | 'notDetermined';

export type AlarmKitAlarmState = 'scheduled' | 'countdown' | 'paused' | 'alerting' | 'unknown';

export type ScheduleAlarmOptions = {
  /** AlarmKit alarm ID. Must be a UUID string. */
  id: string;
  /** The app's own alarm ID, returned in `onAlarmOpened`. Defaults to `id`. */
  appAlarmId?: string;
  /** 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
  /** 0 = Sunday ... 6 = Saturday. Empty = one-time alarm. */
  weekdays: number[];
  /** One-time alarms: exact time (ms timestamp). Without it, the next hour:minute is used. */
  date?: number | null;
  /** Shown on the alarm screen. */
  title: string;
  playlistId?: string | null;
  /** Label of the button that opens the app. Default "Open". */
  openButtonText?: string;
};

export type AlarmKitAlarm = { id: string; state: AlarmKitAlarmState };

/** Sent when the user taps the alarm's Open button. */
export type AlarmOpenedEvent = {
  /** The app's alarm ID (`appAlarmId`). */
  alarmId: string;
  playlistId?: string;
  /** When the button was tapped (ms timestamp). */
  openedAt: number;
};

export type AlarmKitModuleEvents = {
  onAlarmOpened(event: AlarmOpenedEvent): void;
};
