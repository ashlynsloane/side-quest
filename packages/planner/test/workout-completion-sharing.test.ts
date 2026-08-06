import { describe, expect, it } from 'vitest';
import {
  buildWorkoutShareCard,
  completeActiveWorkout,
  generateWorkoutDisplayName,
  saveCompletedWorkoutReference,
} from '../src/workout-completion-sharing';

const draft = {
  workoutId: 'w1', title: 'Generated workout', status: 'active' as const, editedBeforeStart: true,
  stations: [{ stationId: 's1', title: 'Station 1', durationMinutes: 8, order: 1, exercises: [
    { exerciseId: 'e1', name: 'Goblet squat', targetReps: 10, sideMode: 'total' as const, loadUnit: 'lb' as const, optional: false, order: 1 },
  ] }],
};

it('creates a stable memorable workout name', () => {
  expect(generateWorkoutDisplayName({ workoutId: 'w1', tone: 'playful' }))
    .toBe(generateWorkoutDisplayName({ workoutId: 'w1', tone: 'playful' }));
});

it('completes, shares privately by default, and saves the completed version', () => {
  const summary = completeActiveWorkout({
    draft,
    progress: { workoutId: 'w1', completedRoundLogs: 2, exerciseTotals: [{ exerciseId: 'e1', totalReps: 20, totalSeconds: 0, latestLoad: 25, loadUnit: 'lb' }] },
    logs: [
      { roundLogId: 'r1', workoutId: 'w1', stationId: 's1', roundNumber: 1, recordedDuringRest: true, recordedAt: '2026-07-29T10:00:00Z', exerciseEntries: [] },
      { roundLogId: 'r2', workoutId: 'w1', stationId: 's1', roundNumber: 2, recordedDuringRest: true, recordedAt: '2026-07-29T10:05:00Z', exerciseEntries: [] },
    ],
    completedAt: '2026-07-29T10:10:00Z', actualMinutes: 30, displayName: 'Good Chaos',
    muscleRegions: [{ regionId: 'quads', label: 'Quads', view: 'front', contribution: 'primary' }],
  });
  const card = buildWorkoutShareCard({ summary, generatedAt: '2026-07-29T10:11:00Z', preferences: {
    audience: 'friends', includeDuration: true, includeExerciseNames: false, includeRoundCount: true,
    includeWeights: false, includeMuscleMap: true, includeAthleteNote: false,
  } });
  expect(card.weightsIncluded).toBe(false);
  expect(card.exerciseNames).toEqual([]);
  expect(card.muscleRegions).toHaveLength(1);
  expect(saveCompletedWorkoutReference({ summary, savedAt: '2026-07-29T10:12:00Z' }).completedVersion).toBe(true);
});

it('rejects duplicate round logs', () => {
  expect(() => completeActiveWorkout({
    draft, progress: { workoutId: 'w1', completedRoundLogs: 2, exerciseTotals: [] },
    logs: [
      { roundLogId: 'same', workoutId: 'w1', stationId: 's1', roundNumber: 1, recordedDuringRest: true, recordedAt: 'x', exerciseEntries: [] },
      { roundLogId: 'same', workoutId: 'w1', stationId: 's1', roundNumber: 2, recordedDuringRest: true, recordedAt: 'y', exerciseEntries: [] },
    ], completedAt: 'z', actualMinutes: 20, displayName: 'Test', muscleRegions: [],
  })).toThrow('Duplicate round logs');
});
