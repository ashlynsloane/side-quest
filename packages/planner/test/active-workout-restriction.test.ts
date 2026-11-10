import { describe, expect, it } from 'vitest';
import type { TrainingCheckIn } from '@circuit/domain';
import { requiresActiveWorkoutPause } from '../src/active-workout-restriction';

function checkIn(status: TrainingCheckIn['status'], severity: TrainingCheckIn['severity']): TrainingCheckIn {
  return {
    id: 'active', status, severity, affectedRegions: [], aggravatedMovementTags: [],
    active: true, createdAt: '2026-11-09T20:00:00Z', activeUntil: '2026-11-10T20:00:00Z',
  };
}
describe('active-session symptom restrictions', () => {
  it('pauses for an explicit no-training check-in', () => {
    expect(requiresActiveWorkoutPause(checkIn('unable_to_train', 1))).toBe(true);
  });
  it('pauses for significant newly reported pain', () => {
    expect(requiresActiveWorkoutPause(checkIn('tightness_pain', 4))).toBe(true);
    expect(requiresActiveWorkoutPause(checkIn('tightness_pain', 5))).toBe(true);
  });
  it('does not stop for unrelated low-severity or inactive reports', () => {
    expect(requiresActiveWorkoutPause(checkIn('normal', 3))).toBe(false);
    expect(requiresActiveWorkoutPause(checkIn('tightness_pain', 2))).toBe(false);
    expect(requiresActiveWorkoutPause({ ...checkIn('unable_to_train', 5), active: false })).toBe(false);
    expect(requiresActiveWorkoutPause(null)).toBe(false);
  });
});
