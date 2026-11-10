import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('../src/services/supabase', () => ({ supabase: null }));

import {
  createInitialLiveWorkoutSession,
  loadLiveWorkoutSession,
  saveLiveWorkoutSession,
  clearLiveWorkoutSession,
  type LiveWorkoutSessionSnapshot,
} from '../src/services/active-workout-persistence';
import {
  LEGACY_LIVE_WORKOUT_KEY, scopedLiveWorkoutStorageKey,
} from '@circuit/planner';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}
function workout(id = 'w1'): GeneratedWorkout {
  return {
    id, name: 'Strength', createdAt: '2026-11-09T16:00:00Z',
    randomSeed: 'test', request: { restSeconds: 30 },
    stations: [{ id: 'station-1', durationSeconds: 900, format: 'amrap',
      exercises: [{ exerciseId: 'core' }], purpose: 'core', order: 0 }],
    totalWorkSeconds: 900, totalRestSeconds: 0,
    estimatedElapsedSeconds: 900, targetRegions: ['core_anterior'],
  } as unknown as GeneratedWorkout;
}
let store: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  vi.unstubAllGlobals();
  store = fakeStorage();
  vi.stubGlobal('localStorage', store);
});

describe('real mobile checkpoint adapter', () => {
  it('saves and restores the exact athlete-scoped workout state', async () => {
    const snapshot = createInitialLiveWorkoutSession(
      workout(), '2026-11-09T16:00:00Z',
      { sessionId: 'plan-1', sessionDate: '2026-11-09',
        sessionTitle: 'Strength A', modifiedFromPlan: false },
    );
    const advanced: LiveWorkoutSessionSnapshot = {
      ...snapshot, stationIndex: 0, phase: 'rest', remainingSeconds: 12,
      running: false, restRounds: 2, stationRounds: { 'station-1': 2 },
    };
    await saveLiveWorkoutSession(advanced, 'athlete-1');
    expect(await loadLiveWorkoutSession('athlete-1')).toEqual(advanced);
    expect(store.data.has(scopedLiveWorkoutStorageKey('athlete-1'))).toBe(true);
  });

  it('does not leak a live workout to a second athlete or pick up an unowned legacy checkpoint', async () => {
    const snapshot = createInitialLiveWorkoutSession(workout());
    await saveLiveWorkoutSession(snapshot, 'athlete-1');
    store.setItem(LEGACY_LIVE_WORKOUT_KEY, JSON.stringify(snapshot));
    expect(await loadLiveWorkoutSession('athlete-2')).toBeNull();
    expect(await loadLiveWorkoutSession('athlete-1')).toEqual(snapshot);
  });

  it('clears one athlete without clearing another athlete\'s session', async () => {
    await saveLiveWorkoutSession(createInitialLiveWorkoutSession(workout('one')), 'one');
    await saveLiveWorkoutSession(createInitialLiveWorkoutSession(workout('two')), 'two');
    await clearLiveWorkoutSession('one');
    expect(await loadLiveWorkoutSession('one')).toBeNull();
    expect((await loadLiveWorkoutSession('two'))?.workout.id).toBe('two');
  });

  it('rejects malformed checkpoints instead of restoring half-valid state', async () => {
    const initial = createInitialLiveWorkoutSession(workout());
    const key = scopedLiveWorkoutStorageKey('athlete-1');
    for (const mutate of [
      (record: Record<string, unknown>) => { record.stationIndex = 10; },
      (record: Record<string, unknown>) => { record.remainingSeconds = -10; },
      (record: Record<string, unknown>) => { record.restRounds = 0; },
      (record: Record<string, unknown>) => { record.savedAt = 'invalid'; },
      (record: Record<string, unknown>) => { record.stationRounds = null; },
      (record: Record<string, unknown>) => { record.workout = null; },
    ]) {
      const value = structuredClone(initial) as unknown as Record<string, unknown>;
      mutate(value);
      store.setItem(key, JSON.stringify(value));
      expect(await loadLiveWorkoutSession('athlete-1')).toBeNull();
      expect(store.getItem(key)).toBeNull();
    }
  });

  it('does not claim persistence when local storage is unavailable', async () => {
    vi.stubGlobal('localStorage', undefined);
    await expect(saveLiveWorkoutSession(createInitialLiveWorkoutSession(workout()), 'athlete'))
      .rejects.toThrow('unavailable');
    await expect(loadLiveWorkoutSession('athlete')).rejects.toThrow('unavailable');
  });

  it('propagates disk-write errors rather than silently continuing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('storage quota exhausted'); },
      removeItem: () => undefined,
    });
    await expect(saveLiveWorkoutSession(createInitialLiveWorkoutSession(workout()), 'athlete'))
      .rejects.toThrow('storage quota exhausted');
  });
});
