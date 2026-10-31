import { describe, expect, it } from 'vitest';
import { until } from './learn';

describe('until', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

  it('rounds down to the largest unit', () => {
    expect([-5, 0.5, 10, 90, 60 * 24 * 3, 60 * 24 * 65, 60 * 24 * 550].map((m) => until(at(m), now)))
      .toEqual(['<1m', '<1m', '10m', '1h', '3d', '2mo', '1.5y']);
  });
});
