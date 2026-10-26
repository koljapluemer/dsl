import { describe, expect, it } from 'vitest';
import { connectorOpacity, placeAnnotations } from './layout';

describe('document annotation layout', () => {
  it('aligns cards to anchors while preventing overlap', () => {
    expect(placeAnnotations([10, 30, 200], [50, 40, 20], 10)).toEqual([10, 70, 200]);
  });

  it('keeps every connector visible and fades with distance', () => {
    expect(connectorOpacity(0)).toBeCloseTo(0.85);
    expect(connectorOpacity(240)).toBeGreaterThan(0.1);
    expect(connectorOpacity(2000)).toBeGreaterThanOrEqual(0.1);
    expect(connectorOpacity(500)).toBeLessThan(connectorOpacity(100));
  });
});

