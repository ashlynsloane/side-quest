import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';
import { createGuardedWorkoutStartGate } from '../src/services/guarded-workout-start';

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('../src/services/supabase', () => ({ supabase: null }));
import {
  clearLiveWorkoutSession,
  createInitialLiveWorkoutSession,
  loadLiveWorkoutSession,
  saveLiveWorkoutSession,
} from '../src/services/active-workout-persistence';

const workout = {
  id: 'lifecycle-w1', name: 'Strength', estimatedElapsedSeconds: 1200,
  stations: [{ id: 's1', durationSeconds: 1200, exercises: [{ exerciseId: 'e1' }] }],
  targetRegions: ['general'],
} as unknown as GeneratedWorkout;

const approved = {
  authorized: true,
  result: { decision: 'allow' as const, reasons: [], requiresReassessment: false },
};

let data: Map<string, string>;
let identity: string;
let restoringFor: string | null;
let active: GeneratedWorkout | null;

beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  identity = 'athlete-A';
  restoringFor = 'athlete-A';
  active = null;
});

function dependencies() {
  return {
    activeAthleteId: () => identity,
    restoredForAthlete: (id: string) => id === restoringFor,
    hasActiveSession: () => active !== null,
    assess: vi.fn(async () => approved),
    createSnapshot: (w: GeneratedWorkout) =>
      createInitialLiveWorkoutSession(w, '2026-11-10T16:00:00Z'),
    persist: saveLiveWorkoutSession,
    discardPersisted: clearLiveWorkoutSession,
    onStarted: (w: GeneratedWorkout) => { active = w; },
  };
}

describe('workout start, interruption and restored navigation boundary', () => {
  it('restores an authorized live session after an app process restart', async () => {
    const gate = createGuardedWorkoutStartGate();
    const deps = dependencies();
    expect((await gate.begin(workout, null, undefined, deps)).started).toBe(true);
    const stored = await loadLiveWorkoutSession('athlete-A');
    expect(stored?.workout.id).toBe('lifecycle-w1');
    // Simulate app process interruption: no in-memory active workout survives.
    active = null;
    const restored = await loadLiveWorkoutSession('athlete-A');
    active = restored?.workout ?? null;
    expect(active?.id).toBe('lifecycle-w1');
    expect((await createGuardedWorkoutStartGate().begin(workout, null, undefined, deps)).started)
      .toBe(false);
  });

  it('keeps separate athlete histories after switching profiles on a shared device', async () => {
    const gate = createGuardedWorkoutStartGate();
    expect((await gate.begin(workout, null, undefined, dependencies())).started).toBe(true);
    identity = 'athlete-B';
    restoringFor = 'athlete-B';
    active = await loadLiveWorkoutSession('athlete-B').then((v) => v?.workout ?? null);
    expect(active).toBeNull();
    expect((await loadLiveWorkoutSession('athlete-A'))?.workout.id).toBe('lifecycle-w1');
    expect((await gate.begin({ ...workout, id: 'lifecycle-w2' }, null, undefined, dependencies())).started)
      .toBe(true);
    expect((await loadLiveWorkoutSession('athlete-B'))?.workout.id).toBe('lifecycle-w2');
  });

  it('never exposes an active session when checkpoint storage fails', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('device full'); },
      removeItem: () => undefined,
    });
    await expect(createGuardedWorkoutStartGate().begin(workout, null, undefined, dependencies()))
      .rejects.toThrow('device full');
    expect(active).toBeNull();
  });

  it('once a session is removed, it no longer appears after a simulated restart', async () => {
    await createGuardedWorkoutStartGate().begin(workout, null, undefined, dependencies());
    await clearLiveWorkoutSession('athlete-A');
    active = null;
    expect(await loadLiveWorkoutSession('athlete-A')).toBeNull();
  });

  it('treats corrupted checkpoints as absent rather than restoring invalid timer state', async () => {
    await createGuardedWorkoutStartGate().begin(workout, null, undefined, dependencies());
    const [key] = data.keys();
    expect(key).toBeTruthy();
    data.set(key!, '{"schemaVersion":1,"workout":{"id":"lifecycle-w1"},"running":true}');
    active = null;
    expect(await loadLiveWorkoutSession('athlete-A')).toBeNull();
  });
});
