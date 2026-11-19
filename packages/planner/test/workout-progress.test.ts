import { describe, expect, it } from 'vitest';
import { completedWorkoutSeconds } from '../../../apps/mobile/src/services/workout-progress';

describe('partial completion duration-equivalent credit', () => {
  it('credits the saved fraction instead of the complete prescription', () => {
    expect(completedWorkoutSeconds(2400, 0.25)).toBe(600);
    expect(completedWorkoutSeconds(2400, 0.37)).toBe(888);
    expect(completedWorkoutSeconds(2400, 1)).toBe(2400);
    expect(completedWorkoutSeconds(2400, 0)).toBe(0);
  });
  it('never gives full credit for invalid, infinite or out-of-range input', () => {
    expect(completedWorkoutSeconds(2400, Number.NaN)).toBe(0);
    expect(completedWorkoutSeconds(2400, Number.POSITIVE_INFINITY)).toBe(0);
    expect(completedWorkoutSeconds(2400, -1)).toBe(0);
    expect(completedWorkoutSeconds(2400, 9)).toBe(2400);
    expect(completedWorkoutSeconds(-10, 1)).toBe(0);
    expect(completedWorkoutSeconds(0, 1)).toBe(0);
  });
});
