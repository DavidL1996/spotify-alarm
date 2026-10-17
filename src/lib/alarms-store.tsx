import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Alarm, NewAlarm } from './types';

// AsyncStorage is a simple key/value store saved on the device.
// We keep all alarms as one JSON array under a single key.
const STORAGE_KEY = 'spotify-alarm/alarms/v1';

type AlarmsContextValue = {
  alarms: Alarm[];
  loaded: boolean;
  addAlarm: (alarm: NewAlarm) => Promise<Alarm>;
  updateAlarm: (id: string, changes: Partial<NewAlarm>) => Promise<void>;
  removeAlarm: (id: string) => Promise<void>;
  getAlarm: (id: string) => Alarm | undefined;
};

const AlarmsContext = createContext<AlarmsContextValue | null>(null);

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sortByTime = (list: Alarm[]) =>
  [...list].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

/**
 * Wrap the app in this provider (done in src/app/_layout.tsx).
 * Similar to a singleton service registered in C# dependency injection.
 */
export function AlarmsProvider({ children }: { children: ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load once on startup.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setAlarms(sortByTime(JSON.parse(raw) as Alarm[]));
      } catch (error) {
        console.warn('Could not load alarms', error);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

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

  const addAlarm = useCallback(
    async (alarm: NewAlarm) => {
      const created: Alarm = { ...alarm, id: makeId() };
      await save([...alarms, created]);
      return created;
    },
    [alarms, save],
  );

  const updateAlarm = useCallback(
    async (id: string, changes: Partial<NewAlarm>) => {
      await save(alarms.map((a) => (a.id === id ? { ...a, ...changes } : a)));
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
    () => ({ alarms, loaded, addAlarm, updateAlarm, removeAlarm, getAlarm }),
    [alarms, loaded, addAlarm, updateAlarm, removeAlarm, getAlarm],
  );

  return <AlarmsContext.Provider value={value}>{children}</AlarmsContext.Provider>;
}

export function useAlarms(): AlarmsContextValue {
  const ctx = useContext(AlarmsContext);
  if (!ctx) throw new Error('useAlarms must be used inside <AlarmsProvider>');
  return ctx;
}
