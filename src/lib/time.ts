import type { Alarm, Weekday } from './types';

/** Swedish/European week order: Monday first. */
export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const DAY_SHORT: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

const pad = (n: number) => n.toString().padStart(2, '0');

/** 24-hour clock, e.g. "06:45". */
export function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

export function describeRepeat(days: Weekday[]): string {
  if (days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  const weekdays: Weekday[] = [1, 2, 3, 4, 5];
  if (days.length === 5 && weekdays.every((d) => set.has(d))) return 'Weekdays';
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_SHORT[d])
    .join(', ');
}

/** The next moment this alarm would ring, counted from `from`. */
export function nextOccurrence(alarm: Pick<Alarm, 'hour' | 'minute' | 'repeatDays'>, from = new Date()): Date {
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(alarm.hour, alarm.minute, 0, 0);
    if (candidate <= from) continue;
    if (alarm.repeatDays.length === 0) return candidate;
    if (alarm.repeatDays.includes(candidate.getDay() as Weekday)) return candidate;
  }
  // Unreachable for valid input, but keeps TypeScript happy.
  return from;
}

/** "Rings in 7 h 12 min" style text. */
export function describeTimeUntil(target: Date, from = new Date()): string {
  const totalMinutes = Math.max(0, Math.round((target.getTime() - from.getTime()) / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes || parts.length === 0) parts.push(`${minutes} min`);
  return `Rings in ${parts.join(' ')}`;
}
