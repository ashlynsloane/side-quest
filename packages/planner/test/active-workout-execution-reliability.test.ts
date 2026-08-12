import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  activeWorkoutCompletionFraction,
  activeWorkoutCompletionRecordId,
  completionSaveEyebrow,
} from '../../../apps/mobile/src/services/active-workout-execution';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

describe('active workout execution reliability', () => {
  it('uses a stable completion id across retries instead of completed-at time', () => {
    const first = activeWorkoutCompletionRecordId('sq-strength:abc', '2026-08-11T20:00:00.000Z');
    const retry = activeWorkoutCompletionRecordId('sq-strength:abc', '2026-08-11T20:00:00.000Z');
    expect(first).toBe(retry);
    expect(first).toMatch(/^active_sq-strength_abc_/);
  });

  it('clamps partial completion to the performed share of planned work', () => {
    expect(activeWorkoutCompletionFraction(600, 1200)).toBe(0.5);
    expect(activeWorkoutCompletionFraction(1500, 1200)).toBe(1);
    expect(activeWorkoutCompletionFraction(-5, 1200)).toBe(0);
    expect(activeWorkoutCompletionFraction(100, 0)).toBe(0);
  });

  it('does not claim a local save succeeded while it is pending or failed', () => {
    expect(completionSaveEyebrow('saving')).toBe('SAVING WORKOUT');
    expect(completionSaveEyebrow('error')).toBe('SAVE NEEDS ATTENTION');
    expect(completionSaveEyebrow('saved')).toBe('WORKOUT SAVED');
  });

  it('makes an idempotent retry repair database side effects', () => {
    const db = source('apps/mobile/src/services/database.ts');
    expect(db).toContain('if (existing) {');
    expect(db).toContain('await rebuildDerivedTrainingMemory();');
    expect(db).toContain('await markPlannedSessionCompletedForWorkout(');
  });

  it('persists station transitions and in-workout swaps immediately', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('persistExecutionCheckpoint({');
    expect(screen).toContain('stationIndex: nextIndex');
    expect(screen).toContain('workout: result.workout');
    expect(screen).toContain("updateActiveWorkout(result.workout, { modifiedFromPlan: true })");
  });

  it('includes the current recovery log when saving a partial workout', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain("const logged = phase === 'rest' ? commitRestLog() : undefined");
    expect(screen).toContain('void persistCompletion(fraction, logged)');
  });

  it('uses one stable completion record across ledger, feedback, reflection, and social lookup', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain('idempotencyKey: completionRecordId');
    expect(screen).toContain('getWorkoutLedgerEntry(completionRecordId)');
    expect(screen).toContain('activeWorkoutCompletionRecordId(workout.id, startedAt.current)');
    expect(screen).toContain('activeWorkoutCompletionRecordId(activeWorkout.id, startedAt.current)');
  });

  it('prevents accidental route escape and returns planned completions to Week', () => {
    const layout = source('apps/mobile/src/app/_layout.tsx');
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(layout).toContain('gestureEnabled: false');
    expect(screen).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(screen).toContain("router.replace((activePlanLink ? '/(tabs)/plan' : '/') as Href)");
  });

  it('keeps a failed local save recoverable instead of clearing the checkpoint', () => {
    const screen = source('apps/mobile/src/components/active-workout-screen-v3.tsx');
    expect(screen).toContain("setCompletionSaveState('error')");
    expect(screen).toContain('savedCompletion.current = false');
    expect(screen).toContain('Retry local save');
    expect(screen).toContain("disabled={completionSaveState !== 'saved'}");
  });

  it('normalizes restored local-session fields before UI hydration', () => {
    const persistence = source('apps/mobile/src/services/active-workout-persistence.ts');
    expect(persistence).toContain('recordOrEmpty<number>(parsed.stationRounds)');
    expect(persistence).toContain('recordOrEmpty<LiveWorkoutLoggedSet[]>(parsed.exerciseSets)');
    expect(persistence).toContain("restLoadUnit: parsed.restLoadUnit === 'kg' ? 'kg' : 'lb'");
  });
});
