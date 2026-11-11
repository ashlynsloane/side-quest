import { describe, expect, it, vi } from 'vitest';
import type { WorkoutLedgerEntry } from '../../../apps/mobile/src/services/database';

vi.mock('react-native', () => ({ Share: { share: vi.fn() } }));

import {
  DEFAULT_WORKOUT_SHARE_OPTIONS,
  buildLedgerWorkoutSummary,
  workoutShareMessage,
} from '../../../apps/mobile/src/services/workout-summary';

function syntheticEntry(override: Partial<WorkoutLedgerEntry> = {}): WorkoutLedgerEntry {
  return {
    id: 'synthetic-strength-1',
    name: 'Synthetic strength',
    source: 'side_quest',
    startedAt: '2026-11-10T10:00:00.000Z',
    // A long pause must not be credited as a full day of exercise.
    completedAt: '2026-11-11T10:00:00.000Z',
    completionFraction: 0.25,
    workout: {
      totalWorkSeconds: 2400,
      stations: [],
      requiredEquipment: [],
    } as unknown as NonNullable<WorkoutLedgerEntry['workout']>,
    exercises: [],
    stationRounds: {},
    relationToPlan: 'unrelated',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    ...override,
  };
}

describe('historical workout duration provenance', () => {
  it('credits the original planned work fraction, never wall-clock paused time', () => {
    const summary = buildLedgerWorkoutSummary(syntheticEntry());
    expect(summary.durationMinutes).toBe(10);
    expect(summary.durationBasis).toBe('planned_equivalent');
    const text = workoutShareMessage(summary, DEFAULT_WORKOUT_SHARE_OPTIONS);
    expect(text).toContain('~10 min planned work equivalent');
    expect(text).not.toContain('1440 min');
  });

  it('does not fabricate a duration for history with no original workout plan', () => {
    const summary = buildLedgerWorkoutSummary(syntheticEntry({ workout: undefined }));
    expect(summary.durationMinutes).toBe(0);
    expect(summary.durationBasis).toBe('unknown');
    expect(workoutShareMessage(summary, DEFAULT_WORKOUT_SHARE_OPTIONS))
      .toContain('Duration not recorded');
  });

  it('treats zero or invalid completion as missing duration evidence', () => {
    for (const fraction of [0, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const summary = buildLedgerWorkoutSummary(
        syntheticEntry({ completionFraction: fraction }),
      );
      expect(summary.durationMinutes).toBe(0);
      expect(summary.durationBasis).toBe('unknown');
    }
  });

  it('caps the planned equivalent at the original prescription', () => {
    const summary = buildLedgerWorkoutSummary(
      syntheticEntry({ completionFraction: 1.5 }),
    );
    expect(summary.durationMinutes).toBe(40);
    expect(summary.durationBasis).toBe('planned_equivalent');
  });

  it('supports legacy explicitly measured summaries without an estimate label', () => {
    const summary = buildLedgerWorkoutSummary(syntheticEntry());
    summary.durationMinutes = 23;
    summary.durationBasis = 'measured';
    expect(workoutShareMessage(summary, DEFAULT_WORKOUT_SHARE_OPTIONS))
      .toContain('23 min ·');
    expect(workoutShareMessage(summary, DEFAULT_WORKOUT_SHARE_OPTIONS))
      .not.toContain('planned work equivalent');
  });
});
