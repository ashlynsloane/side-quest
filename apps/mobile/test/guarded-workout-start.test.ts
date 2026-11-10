import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';
import type { TrainingGuardrailResult } from '@circuit/planner';
import {
  createGuardedWorkoutStartGate,
  type GuardedStartDependencies,
} from '../src/services/guarded-workout-start';

const workout = { id: 'w1', estimatedElapsedSeconds: 1200 } as GeneratedWorkout;
const allowed: TrainingGuardrailResult = {
  decision: 'allow', reasons: [], requiresReassessment: false,
};
const pending = () => {
  let done!: () => void;
  const promise = new Promise<void>((resolve) => { done = resolve; });
  return { promise, done };
};
let athlete: string | null;
let active: boolean;
let hydratedFor: string | null;
let audit: string[];
let deps: GuardedStartDependencies;
let gate: ReturnType<typeof createGuardedWorkoutStartGate>;

beforeEach(() => {
  athlete = 'A'; active = false; hydratedFor = 'A'; audit = [];
  gate = createGuardedWorkoutStartGate();
  deps = {
    activeAthleteId: () => athlete,
    restoredForAthlete: (id) => id === hydratedFor,
    hasActiveSession: () => active,
    assess: vi.fn(async ({ userId }) => {
      audit.push(`assess:${userId}`);
      return { authorized: true, result: allowed };
    }),
    createSnapshot: vi.fn(() => ({ workout, startedAt: new Date().toISOString() }) as never),
    persist: vi.fn(async (_snapshot, userId) => { audit.push(`persist:${userId}`); }),
    discardPersisted: vi.fn(async (userId) => { audit.push(`discard:${userId}`); }),
    onStarted: vi.fn(() => { audit.push('active'); active = true; }),
  };
});

describe('actual workout-provider start boundary', () => {
  it('audits then saves checkpoint before marking session active', async () => {
    expect((await gate.begin(workout, null, undefined, deps)).started).toBe(true);
    expect(audit).toEqual(['assess:A','persist:A','active']);
    expect(gate.isPending()).toBe(false);
  });
  it('never opens a second workout when another is already active', async () => {
    active = true;
    const result = await gate.begin(workout, null, undefined, deps);
    expect(result.started).toBe(false);
    expect(deps.assess).not.toHaveBeenCalled();
  });
  it('requires the authenticated athlete\'s restoration to complete', async () => {
    hydratedFor = null;
    const result = await gate.begin(workout, null, undefined, deps);
    expect(result.started).toBe(false);
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it('rejects concurrent double taps before a slow assessment returns', async () => {
    const wait = pending();
    deps.assess = vi.fn(async () => {
      audit.push('assess:A');
      await wait.promise;
      return { authorized: true, result: allowed };
    });
    const first = gate.begin(workout, null, undefined, deps);
    expect(gate.isPending()).toBe(true);
    const second = await gate.begin(workout, null, undefined, deps);
    expect(second.started).toBe(false);
    wait.done();
    expect((await first).started).toBe(true);
    expect(deps.assess).toHaveBeenCalledTimes(1);
    expect(deps.persist).toHaveBeenCalledTimes(1);
  });
  it('cannot persist authorization after the athlete changes mid-assessment', async () => {
    const wait = pending();
    deps.assess = vi.fn(async () => {
      await wait.promise;
      return { authorized: true, result: allowed };
    });
    const first = gate.begin(workout, null, undefined, deps);
    athlete = 'B'; hydratedFor = 'B';
    wait.done();
    expect((await first).started).toBe(false);
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.onStarted).not.toHaveBeenCalled();
  });
  it('discards an in-flight stale checkpoint after the profile changes during save', async () => {
    const wait = pending();
    deps.persist = vi.fn(async () => {
      audit.push('persist:A');
      await wait.promise;
    });
    const first = gate.begin(workout, null, undefined, deps);
    await Promise.resolve();
    athlete = 'B'; hydratedFor = 'B';
    wait.done();
    const result = await first;
    expect(result.started).toBe(false);
    expect(audit).toContain('discard:A');
    expect(deps.onStarted).not.toHaveBeenCalled();
  });
  it('propagates failed persistence instead of claiming workout started', async () => {
    deps.persist = vi.fn(async () => { throw new Error('disk full'); });
    await expect(gate.begin(workout, null, undefined, deps)).rejects.toThrow('disk full');
    expect(deps.onStarted).not.toHaveBeenCalled();
    expect(gate.isPending()).toBe(false);
  });
  it('does not save or start on a denied guardrail assessment', async () => {
    deps.assess = vi.fn(async () => ({
      authorized: false,
      result: { decision: 'stop' as const, reasons: ['pain'], requiresReassessment: true },
    }));
    const result = await gate.begin(workout, null, 'override pain', deps);
    expect(result.started).toBe(false);
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it('passes the exact planned session ID and override reason into the authorization', async () => {
    await gate.begin(workout, {
      sessionId: 'session-42', sessionDate: '2026-11-10',
      sessionTitle: 'Strength A', modifiedFromPlan: false,
    }, 'reviewed', deps);
    expect(deps.assess).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'A', sessionId: 'session-42', overrideReason: 'reviewed',
    }));
  });
});
