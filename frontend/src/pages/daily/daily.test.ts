import { describe, expect, it } from 'vitest';
import { dailyDate } from './daily';

describe('dailyDate', () => {
  it('starts the day at 4am', () => {
    expect(dailyDate(new Date(2026, 9, 28, 3, 59))).toBe('26-10-27');
    expect(dailyDate(new Date(2026, 9, 28, 4, 0))).toBe('26-10-28');
    expect(dailyDate(new Date(2026, 9, 28, 23, 59))).toBe('26-10-28');
  });

  it('steps back over month and year ends', () => {
    expect(dailyDate(new Date(2026, 2, 1, 1))).toBe('26-02-28');
    expect(dailyDate(new Date(2027, 0, 1, 0, 30))).toBe('26-12-31');
  });
});
