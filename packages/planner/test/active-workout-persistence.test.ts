import { describe, expect, it } from 'vitest';
import type { ActiveWorkoutDraft } from '@circuit/domain';
import { commitActiveWorkoutCompletion, createActiveWorkoutCheckpoint, pauseActiveWorkoutCheckpoint, restoreActiveWorkoutCheckpoint, resumeActiveWorkoutCheckpoint, saveActiveWorkoutCheckpoint } from '../src/active-workout-persistence';

const draft: ActiveWorkoutDraft = { workoutId: 'w1', title: 'Trailhead', status: 'active', editedBeforeStart: false, startedAt: '2026-07-29T18:00:00Z', stations: [{ stationId: 's1', title: 'One', durationMinutes: 8, order: 1, exercises: [{ exerciseId: 'e1', name: 'Goblet squat', targetReps: 10, sideMode: 'total', loadUnit: 'lb', optional: false, order: 1 }] }] };

describe('active workout persistence', () => {
  it('pauses and resumes without losing elapsed time', () => {
    const initial = createActiveWorkoutCheckpoint({ draft, elapsedSeconds: 125, savedAt: '2026-07-29T18:03:00Z' });
    const paused = pauseActiveWorkoutCheckpoint(initial, '2026-07-29T18:04:00Z');
    const resumed = resumeActiveWorkoutCheckpoint(paused, '2026-07-29T18:05:00Z');
    expect(resumed.elapsedSeconds).toBe(125);
    expect(resumed.persistenceStatus).toBe('active');
    expect(resumed.revision).toBe(3);
  });

  it('pauses a running timer when recovering after interruption', () => {
    const initial = createActiveWorkoutCheckpoint({ draft, savedAt: '2026-07-29T18:03:00Z' });
    const restored = restoreActiveWorkoutCheckpoint(JSON.stringify(initial));
    expect(restored.recoveredAfterInterruption).toBe(true);
    expect(restored.checkpoint.timerState).toBe('paused');
  });

  it('rejects stale writes', () => {
    const initial = createActiveWorkoutCheckpoint({ draft, savedAt: '2026-07-29T18:03:00Z' });
    expect(() => saveActiveWorkoutCheckpoint(initial, { elapsedSeconds: 10 }, '2026-07-29T18:04:00Z', 0)).toThrow(/stale/);
  });

  it('commits completion idempotently', () => {
    const initial = createActiveWorkoutCheckpoint({ draft, savedAt: '2026-07-29T18:03:00Z' });
    const first = commitActiveWorkoutCompletion(initial, '2026-07-29T18:30:00Z');
    const second = commitActiveWorkoutCompletion(first.checkpoint, '2026-07-29T18:31:00Z');
    expect(first.alreadyCommitted).toBe(false);
    expect(second.alreadyCommitted).toBe(true);
    expect(second.completionRecordId).toBe(first.completionRecordId);
  });
});
