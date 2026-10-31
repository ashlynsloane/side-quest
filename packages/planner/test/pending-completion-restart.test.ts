import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('expo-sqlite/localStorage/install', () => ({}));
// This suite only tests the live checkpoint adapter; no planner generator is called.
vi.mock('@circuit/planner', () => ({}));

import {
  createInitialLiveWorkoutSession,
  saveLiveWorkoutSession,
  loadLiveWorkoutSession,
  clearLiveWorkoutSession,
} from '../../../apps/mobile/src/services/active-workout-persistence';

const workout = {
  id: 'partial-save-recovery', name: 'Synthetic recovery session',
  stations: [], estimatedElapsedSeconds: 3600,
} as unknown as Parameters<typeof createInitialLiveWorkoutSession>[0];

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    },
  });
  globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-a');
});

describe('durable pending partial-workout completion contract', () => {
  it('roundtrips original partial fraction and timestamp through persistent storage', async () => {
    const original = createInitialLiveWorkoutSession(
      workout, '2026-10-20T10:00:00.000Z',
      { sessionId: 'session-a', sessionDate: '2026-10-20',
        sessionTitle: 'Strength', modifiedFromPlan: false },
    );
    await saveLiveWorkoutSession({
      ...original, phase: 'rest', running: false,
      pendingCompletion: {
        completionFraction: 0.37, completedAt: '2026-10-20T10:37:00.000Z',
      },
    });
    const restored = await loadLiveWorkoutSession();
    expect(restored?.pendingCompletion).toEqual({
      completionFraction: 0.37, completedAt: '2026-10-20T10:37:00.000Z',
    });
    expect(restored?.planLink?.sessionId).toBe('session-a');
    expect(restored?.startedAt).toBe('2026-10-20T10:00:00.000Z');
    expect(restored?.running).toBe(false);
  });

  it('does not let delayed periodic autosave erase pending partial completion', async () => {
    const original = createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z');
    const pending = {
      completionFraction: 0.37,
      completedAt: '2026-10-20T10:37:00.000Z',
    };
    await saveLiveWorkoutSession({ ...original, running: false, pendingCompletion: pending });
    await saveLiveWorkoutSession({ ...original, savedAt: '2026-10-20T10:38:00.000Z' });
    expect((await loadLiveWorkoutSession())?.pendingCompletion).toEqual(pending);
  });

  it('rejects conflicting completion fractions while keeping original durable record', async () => {
    const original = createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z');
    const completedAt = '2026-10-20T10:37:00.000Z';
    await saveLiveWorkoutSession({
      ...original, pendingCompletion: { completionFraction: 0.37, completedAt },
    });
    await expect(saveLiveWorkoutSession({
      ...original, pendingCompletion: { completionFraction: 1, completedAt },
    })).rejects.toThrow(/Conflicting pending workout completion/);
    expect((await loadLiveWorkoutSession())?.pendingCompletion?.completionFraction).toBe(0.37);
  });

  it('protects a pending completion from an unrelated new workout session', async () => {
    const a = createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z');
    const pending = { completionFraction: 0.25, completedAt: '2026-10-20T10:15:00.000Z' };
    await saveLiveWorkoutSession({ ...a, pendingCompletion: pending });
    const b = createInitialLiveWorkoutSession(
      { ...workout, id: 'second-workout' },
      '2026-10-20T11:00:00.000Z',
    );
    await saveLiveWorkoutSession(b);
    expect((await loadLiveWorkoutSession())?.workout.id).toBe(workout.id);
    expect((await loadLiveWorkoutSession())?.pendingCompletion).toEqual(pending);
    await expect(saveLiveWorkoutSession({
      ...b,
      pendingCompletion: { completionFraction: 0.5, completedAt: '2026-10-20T11:30:00.000Z' },
    })).rejects.toThrow(/Conflicting pending workout completion/);
    expect((await loadLiveWorkoutSession())?.pendingCompletion).toEqual(pending);
  });

  it('keeps the original completed set log immutable across repeated journal writes', async () => {
    const original = createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z');
    const pending = { completionFraction: 0.4, completedAt: '2026-10-20T10:40:00.000Z' };
    await saveLiveWorkoutSession({
      ...original, stationRounds: { first: 2 },
      running: false, pendingCompletion: pending,
    });
    await saveLiveWorkoutSession({
      ...original, stationRounds: { first: 0 },
      running: true, pendingCompletion: pending,
    });
    const recovered = await loadLiveWorkoutSession();
    expect(recovered?.stationRounds).toEqual({ first: 2 });
    expect(recovered?.running).toBe(false);
    expect(recovered?.pendingCompletion).toEqual(pending);
  });

  it('remains backward compatible with pre-journal checkpoints', async () => {
    const legacy = createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z');
    await saveLiveWorkoutSession(legacy);
    const restored = await loadLiveWorkoutSession();
    expect(restored?.workout.id).toBe('partial-save-recovery');
    expect(restored?.pendingCompletion).toBeUndefined();
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails closed on invalid pending completion fraction %s', async fraction => {
      const snapshot = createInitialLiveWorkoutSession(workout);
      await saveLiveWorkoutSession({
        ...snapshot, pendingCompletion: {
          completionFraction: fraction, completedAt: '2026-10-20T10:37:00.000Z',
        },
      });
      expect(await loadLiveWorkoutSession()).toBeNull();
    });

  it('clears a successful canonical completion checkpoint', async () => {
    const snapshot = createInitialLiveWorkoutSession(workout);
    await saveLiveWorkoutSession({
      ...snapshot, pendingCompletion: {
        completionFraction: 0.5, completedAt: '2026-10-20T10:30:00.000Z',
      },
    });
    await clearLiveWorkoutSession();
    expect(await loadLiveWorkoutSession()).toBeNull();
  });

  it('requires the active screen to restore the pending fraction, not default to full', () => {
    const screen = readFileSync(
      new URL('../../../apps/mobile/src/app/active-workout.tsx', import.meta.url), 'utf8',
    );
    expect(screen).toContain('completionFractionRef.current = snapshot.pendingCompletion.completionFraction');
    expect(screen).toContain("setPhase(snapshot.pendingCompletion ? 'complete' : snapshot.phase)");
    expect(screen).toContain('pendingCompletion: { completedAt: timestamp, completionFraction }');
    expect(screen).toContain("if (phase === 'complete') return;");
  });
});

describe('live workout profile isolation and owner-only migration', () => {
  it('never displays another athlete pending completion on profile switch', async () => {
    const checkpointA = createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z');
    await saveLiveWorkoutSession({
      ...checkpointA,
      pendingCompletion: {
        completionFraction: 0.4, completedAt: '2026-10-20T10:25:00.000Z',
      },
    });
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-b');
    expect(await loadLiveWorkoutSession()).toBeNull();
    const checkpointB = createInitialLiveWorkoutSession(
      { ...workout, id: 'athlete-b-workout' }, '2026-10-21T10:00:00.000Z',
    );
    await saveLiveWorkoutSession(checkpointB);
    expect((await loadLiveWorkoutSession())?.workout.id).toBe('athlete-b-workout');
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-a');
    expect((await loadLiveWorkoutSession())?.pendingCompletion?.completionFraction).toBe(0.4);
    await clearLiveWorkoutSession();
    expect(await loadLiveWorkoutSession()).toBeNull();
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-b');
    expect((await loadLiveWorkoutSession())?.workout.id).toBe('athlete-b-workout');
  });

  it('explicit athlete identity prevents a delayed write from leaking after switch', async () => {
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-b');
    await saveLiveWorkoutSession(
      createInitialLiveWorkoutSession(workout, '2026-10-20T10:00:00.000Z'),
      'athlete-a',
    );
    expect(await loadLiveWorkoutSession()).toBeNull();
    expect((await loadLiveWorkoutSession('athlete-a'))?.workout.id)
      .toBe('partial-save-recovery');
  });

  it('explicit null identity never accesses the previous athlete even before key cleanup', async () => {
    const saved = createInitialLiveWorkoutSession(workout);
    await saveLiveWorkoutSession(saved, 'athlete-a');
    // Simulate a UI callback running between account sign-out and storage cleanup.
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-a');
    expect(await loadLiveWorkoutSession(null)).toBeNull();
    await expect(saveLiveWorkoutSession(saved, null)).rejects.toThrow(/unowned/);
    await clearLiveWorkoutSession(null);
    expect((await loadLiveWorkoutSession('athlete-a'))?.workout.id).toBe(workout.id);
  });

  it('sign-out does not expose or erase another athlete checkpoint', async () => {
    await saveLiveWorkoutSession(createInitialLiveWorkoutSession(workout));
    globalThis.localStorage.removeItem('sidequest.active-workout.profile-id');
    expect(await loadLiveWorkoutSession()).toBeNull();
    await expect(saveLiveWorkoutSession(createInitialLiveWorkoutSession(workout)))
      .rejects.toThrow(/unowned/);
    await clearLiveWorkoutSession();
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-a');
    expect((await loadLiveWorkoutSession())?.workout.id).toBe('partial-save-recovery');
  });

  it('migrates legacy unscoped checkpoint only for the original database owner', async () => {
    const checkpoint = createInitialLiveWorkoutSession(workout);
    globalThis.localStorage.setItem('circuit.original-database-owner', 'athlete-a');
    globalThis.localStorage.setItem('sidequest.live-workout.session.v1', JSON.stringify(checkpoint));
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-b');
    expect(await loadLiveWorkoutSession()).toBeNull();
    expect(globalThis.localStorage.getItem('sidequest.live-workout.session.v1')).not.toBeNull();
    globalThis.localStorage.setItem('sidequest.active-workout.profile-id', 'athlete-a');
    expect((await loadLiveWorkoutSession())?.workout.id).toBe('partial-save-recovery');
    expect(globalThis.localStorage.getItem('sidequest.live-workout.session.v1')).toBeNull();
  });
});
