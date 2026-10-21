import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CalendarEntry } from '@/api/types';
import { occursOn, type Day } from './dates';

/** Every item that falls on some day; under `items`, so writes and undo refetch it. */
export const calendarQuery = queryOptions({ queryKey: ['items', 'calendar'], queryFn: () => api<CalendarEntry[]>('GET', '/api/calendar') });

/** The text's first line, the heading (as a note's text starts with its body). */
const heading = (e: CalendarEntry) => e.text.trim().split('\n')[0];

/** The entries on `day`, by heading. */
export const entriesOn = (entries: CalendarEntry[], day: Day) =>
  entries.filter((e) => occursOn(e.when, day)).sort((a, b) => heading(a).localeCompare(heading(b)));
