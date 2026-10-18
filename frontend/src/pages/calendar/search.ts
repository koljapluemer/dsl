import { isDay, type Day } from './dates';

/** The calendar's URL search: range view (else day view), the day shown, and the range. */
export type CalendarSearch = { view?: 'range'; day?: Day; from?: Day; to?: Day };

export const validateCalendarSearch = (s: Record<string, unknown>): CalendarSearch => ({
  view: s.view === 'range' ? 'range' : undefined,
  day: isDay(s.day) ? s.day : undefined,
  from: isDay(s.from) ? s.from : undefined,
  to: isDay(s.to) ? s.to : undefined,
});
