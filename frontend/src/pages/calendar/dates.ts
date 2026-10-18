import type { When } from '@/api/types';

/** Calendar days are ISO `YYYY-MM-DD` strings; they compare and sort as strings. */
export type Day = string;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const fromDate = (d: Date): Day => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** local midnight, built from components so DST can't shift the day */
const toDate = (day: Day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };

export const isDay = (s: unknown): s is Day => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDate(toDate(s)) === s;

export const today = (): Day => fromDate(new Date());

export const addDays = (day: Day, n: number): Day => { const d = toDate(day); return fromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };

/** 1 = Mon .. 7 = Sun */
export const weekday = (day: Day) => toDate(day).getDay() || 7;

/** The Sunday on or before `day`: weeks start on Sunday. */
export const startOfWeek = (day: Day) => addDays(day, -(weekday(day) % 7));

/** `from` to `to`, inclusive. */
export function daysBetween(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** e.g. `Fri, 29 Aug 2026` */
export const formatDayHeading = (day: Day) => `${WEEKDAYS[weekday(day) - 1]}, ${formatShortDate(day)}`;

/** e.g. `29 Aug 2026` */
export const formatShortDate = (day: Day) => { const [y, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/** The item language's `yy-mm-dd`. */
export const toDsl = (day: Day) => day.slice(2);

export const occursOn = (when: When, day: Day) =>
  'appointment' in when ? when.appointment === day : weekday(day) === when.recurring && (!when.until || day <= when.until);
