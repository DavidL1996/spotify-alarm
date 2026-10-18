import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { syncAlarms } from './alarm-scheduler';
import { nextOccurrence } from './time';
import type { Alarm, NewAlarm } from './types';

// AsyncStorage is a simple key/value store saved on the device.
// We keep all alarms as one JSON array under a single key.
const STORAGE_KEY = 'spotify-alarm/alarms/v1';

type AlarmsContextValue = {
  alarms: Alarm[];
  loaded: boolean;
  /** False if the user blocked notifications (alarms can't ring). Null until we know. */
  notificationsAllowed: boolean | null;
  /** True if iOS AlarmKit alarms were turned off for this app (we fall back to notifications). */
  alarmKitDenied: boolean;
  addAlarm: (alarm: NewAlarm) => Promise<Alarm>;
  updateAlarm: (id: string, changes: Partial<NewAlarm>) => Promise<void>;
  removeAlarm: (id: string) => Promise<void>;
  getAlarm: (id: string) => Alarm | undefined;
};

const AlarmsContext = createContext<AlarmsContextValue | null>(null);

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sortByTime = (list: Alarm[]) =>
  [...list].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

/** Works out when an enabled one-time alarm rings. Call whenever an alarm is created or edited. */
const withOnceAt = (alarm: Alarm): Alarm => ({
  ...alarm,
  onceAt: alarm.enabled && alarm.repeatDays.length === 0 ? nextOccurrence(alarm).getTime() : null,
});

/**
 * Turns off one-time alarms that have already rung, like the iPhone Clock app does.
 * Also fills in onceAt for one-time alarms saved before step 2.
 * Returns the same array if nothing changed.
 */
function expireOneTimeAlarms(list: Alarm[], now = Date.now()): Alarm[] {
  let changed = false;
  const next = list.map((a) => {
    if (!a.enabled || a.repeatDays.length > 0) return a;
    if (a.onceAt == null) {
      changed = true;
      return withOnceAt(a);
    }
    if (a.onceAt <= now) {
      changed = true;
      return { ...a, enabled: false, onceAt: null };
    }
    return a;
  });
  return changed ? next : list;
}

/**
 * Wrap the app in this provider (done in src/app/_layout.tsx).
 * Similar to a singleton service registered in C# dependency injection.
 */
export function AlarmsProvider({ children }: { children: ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notificationsAllowed, setNotificationsAllowed] = useState<boolean | null>(null);
  const [alarmKitDenied, setAlarmKitDenied] = useState(false);

  // Latest list, for code that runs outside a render (the app-foreground listener below).
  const alarmsRef = useRef(alarms);
  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);

  // Every change goes through here: update state, then persist.
  const save = useCallback(async (next: Alarm[]) => {
    const sorted = sortByTime(next);
    setAlarms(sorted);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch (error) {
      console.warn('Could not save alarms', error);
    }
  }, []);

  // Load once on startup.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as Alarm[];
          const current = expireOneTimeAlarms(stored);
          if (current !== stored) await save(current);
          else setAlarms(sortByTime(stored));
        }
      } catch (error) {
        console.warn('Could not load alarms', error);
      } finally {
        setLoaded(true);
      }
    })();
  }, [save]);

  // When the app comes back to the foreground, switch off one-time alarms that rang meanwhile.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const current = expireOneTimeAlarms(alarmsRef.current);
      if (current !== alarmsRef.current) save(current);
    });
    return () => subscription.remove();
  }, [save]);

  // Keep the phone's scheduled alarms (AlarmKit or notifications) in step with the alarm list.
  useEffect(() => {
    if (!loaded) return;
    syncAlarms(alarms)
      .then((result) => {
        setNotificationsAllowed(result.canRing);
        setAlarmKitDenied(result.alarmKitDenied);
      })
      .catch((error) => console.warn('Could not schedule alarms', error));
  }, [alarms, loaded]);

  const addAlarm = useCallback(
    async (alarm: NewAlarm) => {
      const created = withOnceAt({ ...alarm, id: makeId() });
      await save([...alarms, created]);
      return created;
    },
    [alarms, save],
  );

  const updateAlarm = useCallback(
    async (id: string, changes: Partial<NewAlarm>) => {
      await save(alarms.map((a) => (a.id === id ? withOnceAt({ ...a, ...changes }) : a)));
    },
    [alarms, save],
  );

  const removeAlarm = useCallback(
    async (id: string) => {
      await save(alarms.filter((a) => a.id !== id));
    },
    [alarms, save],
  );

  const getAlarm = useCallback((id: string) => alarms.find((a) => a.id === id), [alarms]);

  const value = useMemo(
    () => ({ alarms, loaded, notificationsAllowed, alarmKitDenied, addAlarm, updateAlarm, removeAlarm, getAlarm }),
    [alarms, loaded, notificationsAllowed, alarmKitDenied, addAlarm, updateAlarm, removeAlarm, getAlarm],
  );

  return <AlarmsContext.Provider value={value}>{children}</AlarmsContext.Provider>;
}

export function useAlarms(): AlarmsContextValue {
  const ctx = useContext(AlarmsContext);
  if (!ctx) throw new Error('useAlarms must be used inside <AlarmsProvider>');
  return ctx;
}
