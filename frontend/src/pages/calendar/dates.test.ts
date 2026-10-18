import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatDayHeading, isDay, occursOn, startOfWeek, toDsl, weekday } from './dates';

describe('dates', () => {
  it('steps across months, years and DST', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('starts weeks on Sunday', () => {
    expect(weekday('2026-08-29')).toBe(6);
    expect(startOfWeek('2026-08-29')).toBe('2026-08-23');
    expect(startOfWeek('2026-08-23')).toBe('2026-08-23');
    expect(daysBetween('2026-08-30', '2026-09-01')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  it('formats and validates', () => {
    expect(formatDayHeading('2026-08-29')).toBe('Sat, 29 Aug 2026');
    expect(toDsl('2026-08-29')).toBe('26-08-29');
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
  });

  it('places appointments and recurring items', () => {
    expect(occursOn({ appointment: '2026-08-29' }, '2026-08-29')).toBe(true);
    expect(occursOn({ appointment: '2026-08-29' }, '2026-08-30')).toBe(false);
    expect(occursOn({ recurring: 1, until: '2026-03-30' }, '2026-03-30')).toBe(true);
    expect(occursOn({ recurring: 1, until: '2026-03-30' }, '2026-04-06')).toBe(false);
    expect(occursOn({ recurring: 7, until: null }, '2026-08-23')).toBe(true);
  });
});
