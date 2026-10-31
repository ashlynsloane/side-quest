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
