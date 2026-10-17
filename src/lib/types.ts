// Core data model for an alarm.
// Think of this like a C# record/DTO: plain data, no behaviour.

/** 0 = Sunday, 1 = Monday ... 6 = Saturday (same as JavaScript's Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Alarm = {
  id: string;
  /** 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
  label: string;
  enabled: boolean;
  /** Empty array = one-time alarm (next occurrence only). */
  repeatDays: Weekday[];
  /** Spotify playlist ID, e.g. "37i9dQZF1DXcBWIGoYBM5M". Null = no playlist chosen yet. */
  playlistId: string | null;
  /** Optional friendly name the user typed for the playlist. */
  playlistName: string;
};

export type NewAlarm = Omit<Alarm, 'id'>;
