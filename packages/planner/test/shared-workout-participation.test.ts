import { describe, expect, it } from 'vitest';

import { boundedSharedWorkoutFraction } from
  '../../../apps/mobile/src/services/shared-workout-safe-fraction';

describe('shared workout completion evidence never exceeds local safe foreground time', () => {
  it('does not count an elapsed remote clock as the athlete having performed work', () => {
    expect(boundedSharedWorkoutFraction(1, 0, 1800)).toBe(0);
    expect(boundedSharedWorkoutFraction(0.75, 0, 1800)).toBe(0);
  });

  it('caps apparent completion at the locally observed safe portion', () => {
    expect(boundedSharedWorkoutFraction(1, 360, 1800)).toBeCloseTo(0.2);
    expect(boundedSharedWorkoutFraction(0.4, 900, 1800)).toBeCloseTo(0.4);
    expect(boundedSharedWorkoutFraction(0.8, 900, 1800)).toBeCloseTo(0.5);
    expect(boundedSharedWorkoutFraction(1, 2000, 1800)).toBe(1);
  });

  it('fails closed for missing, nonfinite, or negative timing inputs', () => {
    for (const input of [
      [1, -3, 1800],
      [1, NaN, 1800],
      [1, Infinity, 1800],
      [NaN, 1800, 1800],
      [1, 1800, 0],
      [1, 1800, -50],
    ] as const) {
      expect(boundedSharedWorkoutFraction(...input)).toBe(0);
    }
  });

  it('never permits a requested negative or over-100-percent dose', () => {
    expect(boundedSharedWorkoutFraction(-1, 600, 600)).toBe(0);
    expect(boundedSharedWorkoutFraction(2, 600, 600)).toBe(1);
    expect(boundedSharedWorkoutFraction(2, 180, 600)).toBeCloseTo(0.3);
  });
});
