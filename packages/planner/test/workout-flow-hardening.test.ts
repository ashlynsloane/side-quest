import { describe, expect, it } from 'vitest';
import { validateWorkoutFlow } from '../src/workout-flow-hardening';

describe('validateWorkoutFlow', () => {
  it('passes a complete ordered workflow', () => {
    const report = validateWorkoutFlow({
      workoutId: 'w1',
      completedStages: ['generated', 'edited', 'started', 'logged', 'paused', 'resumed', 'finished', 'persisted', 'favorited', 'shared'],
      completionRecordIds: ['completion-w1'],
      now: '2026-07-29T00:00:00.000Z',
    });
    expect(report.passed).toBe(true);
  });

  it('rejects duplicate completion records', () => {
    const report = validateWorkoutFlow({ workoutId: 'w1', completedStages: ['generated', 'started', 'finished', 'persisted'], completionRecordIds: ['c1', 'c1'] });
    expect(report.duplicateCompletionDetected).toBe(true);
    expect(report.passed).toBe(false);
  });
});
