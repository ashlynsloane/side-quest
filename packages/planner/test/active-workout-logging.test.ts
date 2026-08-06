import { describe, expect, it } from 'vitest';
import type { ActiveWorkoutDraft } from '@circuit/domain';
import {
  addOptionalExerciseBeforeStart,
  editActiveWorkoutBeforeStart,
  recordRoundDuringRest,
  startActiveWorkout,
  summarizeActiveWorkoutProgress,
} from '../src/active-workout-logging';

const draft: ActiveWorkoutDraft = {
  workoutId: 'hotel-quest', title: 'Hotel Hallway Heist', status: 'draft', editedBeforeStart: false,
  stations: [{ stationId: 's1', title: 'Strength circuit', durationMinutes: 12, order: 1, exercises: [
    { exerciseId: 'goblet-squat', name: 'Goblet squat', targetReps: 8, sideMode: 'total', loadUnit: 'lb', optional: false, order: 1 },
    { exerciseId: 'row', name: 'One-arm row', targetReps: 8, sideMode: 'per_side', loadUnit: 'lb', optional: false, order: 2 },
  ] }],
};

describe('active workout logging', () => {
  it('edits station time and per-exercise reps before start', () => {
    const edited = editActiveWorkoutBeforeStart(draft, [
      { stationId: 's1', durationMinutes: 8 },
      { stationId: 's1', exerciseId: 'row', targetReps: 10 },
    ]);
    expect(edited.stations[0]?.durationMinutes).toBe(8);
    expect(edited.stations[0]?.exercises[1]?.targetReps).toBe(10);
  });

  it('adds an optional finisher before start', () => {
    const edited = addOptionalExerciseBeforeStart(draft, 's1', { exerciseId:'plank', name:'Plank', targetSeconds:60, sideMode:'time', loadUnit:'bodyweight' });
    expect(edited.stations[0]?.exercises[2]?.optional).toBe(true);
  });

  it('records reps and load by exercise during rest', () => {
    const active = startActiveWorkout(draft, '2026-07-29T20:00:00Z');
    const log = recordRoundDuringRest({ draft: active, stationId:'s1', roundNumber:1, recordedAt:'2026-07-29T20:04:00Z', entries:[
      { exerciseId:'goblet-squat', completedReps:9, load:25, loadUnit:'lb' },
      { exerciseId:'row', completedReps:10, load:20, loadUnit:'lb' },
    ] });
    expect(log.recordedDuringRest).toBe(true);
    expect(log.exerciseEntries).toHaveLength(2);
    const progress = summarizeActiveWorkoutProgress(draft.workoutId, [log]);
    expect(progress.exerciseTotals.find((entry) => entry.exerciseId === 'row')?.totalReps).toBe(10);
  });
});
