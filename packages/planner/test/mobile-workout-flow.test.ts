import { describe, expect, it } from 'vitest';
import type { ActiveWorkoutDraft, CompletedWorkoutSummary, WorkoutRoundLog } from '@circuit/domain';
import {
  createMobileWorkoutFlow,
  finishMobileWorkoutFlow,
  openMobileRestLogging,
  pauseMobileWorkoutFlow,
  resumeMobileWorkoutFlow,
  saveMobileRestLog,
  startMobileWorkoutFlow,
} from '../src/mobile-workout-flow';

const draft: ActiveWorkoutDraft = {
  workoutId: 'w-mobile',
  title: 'Trailhead',
  status: 'draft',
  editedBeforeStart: false,
  stations: [{
    stationId: 's1',
    title: 'Climb',
    durationMinutes: 8,
    order: 1,
    exercises: [{ exerciseId: 'e1', name: 'Goblet squat', targetReps: 10, sideMode: 'total', loadUnit: 'lb', optional: false, order: 1 }],
  }],
};

const roundLog: WorkoutRoundLog = {
  roundLogId: 'r1',
  workoutId: 'w-mobile',
  stationId: 's1',
  roundNumber: 1,
  recordedDuringRest: true,
  recordedAt: '2026-07-29T22:04:00Z',
  exerciseEntries: [{ exerciseId: 'e1', completedReps: 10, load: 25, loadUnit: 'lb' }],
};

const summary: CompletedWorkoutSummary = {
  workoutId: 'w-mobile',
  originalTitle: 'Trailhead',
  displayName: 'Summit Circuit',
  completedAt: '2026-07-29T22:30:00Z',
  actualMinutes: 26,
  completedRoundLogs: 1,
  exercises: [{ exerciseId: 'e1', name: 'Goblet squat', totalReps: 10, totalSeconds: 0, latestLoad: 25, loadUnit: 'lb' }],
  muscleRegions: [],
  editedBeforeStart: false,
};

describe('mobile workout flow', () => {
  it('moves through start, rest logging, and finish', () => {
    let state = createMobileWorkoutFlow(draft);
    state = startMobileWorkoutFlow(state, '2026-07-29T22:00:00Z');
    state = openMobileRestLogging(state, roundLog);
    state = saveMobileRestLog(state, '2026-07-29T22:05:00Z');
    state = finishMobileWorkoutFlow(state, summary, '2026-07-29T22:30:00Z');
    expect(state.screen).toBe('completion_summary');
    expect(state.checkpoint?.persistenceStatus).toBe('completed');
  });

  it('pauses and resumes from the mobile flow', () => {
    let state = startMobileWorkoutFlow(createMobileWorkoutFlow(draft), '2026-07-29T22:00:00Z');
    state = pauseMobileWorkoutFlow(state, '2026-07-29T22:02:00Z');
    expect(state.screen).toBe('paused');
    state = resumeMobileWorkoutFlow(state, '2026-07-29T22:03:00Z');
    expect(state.screen).toBe('active_station');
  });

  it('does not allow finishing with an unsaved rest log', () => {
    let state = startMobileWorkoutFlow(createMobileWorkoutFlow(draft), '2026-07-29T22:00:00Z');
    state = openMobileRestLogging(state, roundLog);
    expect(() => finishMobileWorkoutFlow(state, summary, '2026-07-29T22:30:00Z')).toThrow(/pending round log/);
  });
});
