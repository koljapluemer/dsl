import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CalendarEntry } from '@/api/types';
import { occursOn, type Day } from './dates';

/** Every item that falls on some day; under `items`, so writes and undo refetch it. */
export const calendarQuery = queryOptions({ queryKey: ['items', 'calendar'], queryFn: () => api<CalendarEntry[]>('GET', '/api/calendar') });

/** The entries on `day`, by heading. */
export const entriesOn = (entries: CalendarEntry[], day: Day) =>
  entries.filter((e) => occursOn(e.when, day)).sort((a, b) => a.heading.localeCompare(b.heading));
