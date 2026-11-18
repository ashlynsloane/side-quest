import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { boundedSharedWorkoutFraction } from
  '../../../apps/mobile/src/services/shared-workout-safe-fraction';

describe('shared workout completion evidence never exceeds local safe foreground time', () => {
  it('does not count an elapsed remote clock as the athlete having performed work', () => {
    expect(boundedSharedWorkoutFraction(1, 0, 1800)).toBe(0);
    expect(boundedSharedWorkoutFraction(0.75, 0, 1800)).toBe(0);
  });

  it('caps apparent completion at the locally observed safe portion', () => {
    expect(boundedSharedWorkoutFraction(1, 360, 1800)).toBeCloseTo(0.2);
    expect(boundedSharedWorkoutFraction(0.4, 900, 1800)).toBeCloseTo(0.4);
    expect(boundedSharedWorkoutFraction(0.8, 900, 1800)).toBeCloseTo(0.5);
    expect(boundedSharedWorkoutFraction(1, 2000, 1800)).toBe(1);
  });

  it('fails closed for missing, nonfinite, or negative timing inputs', () => {
    for (const input of [
      [1, -3, 1800],
      [1, NaN, 1800],
      [1, Infinity, 1800],
      [NaN, 1800, 1800],
      [1, 1800, 0],
      [1, 1800, -50],
    ] as const) {
      expect(boundedSharedWorkoutFraction(input[0], input[1], input[2])).toBe(0);
    }
  });

  it('never permits a requested negative or over-100-percent dose', () => {
    expect(boundedSharedWorkoutFraction(-1, 600, 600)).toBe(0);
    expect(boundedSharedWorkoutFraction(2, 600, 600)).toBe(1);
    expect(boundedSharedWorkoutFraction(2, 180, 600)).toBeCloseTo(0.3);
  });
});


describe('shared workout app safety wiring source contract (not device execution)', () => {
  const preview = readFileSync(
    new URL('../../../apps/mobile/src/app/workout-preview.tsx', import.meta.url),
    'utf8',
  );
  const room = readFileSync(
    new URL('../../../apps/mobile/src/app/workout-room.tsx', import.meta.url),
    'utf8',
  );
  const live = readFileSync(
    new URL('../../../apps/mobile/src/app/together-session.tsx', import.meta.url),
    'utf8',
  );

  it('checks local safety before a host can create or start a shared workout', () => {
    const previewGate = preview.indexOf('inspectGenericWorkoutSafety(user.id)');
    const create = preview.indexOf('await createWorkoutRoom(');
    expect(previewGate).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(previewGate);
    expect(room).toContain('await requireSharedWorkoutSafety()');
    expect(room).toContain('await setWorkoutRoomReady(');
    expect(room).toContain('await startWorkoutRoom(');
  });

  it('holds this participant independently and suppresses remote-clock auto completion on hold', () => {
    expect(live).toContain('inspectGenericWorkoutSafety(user.id)');
    expect(live).toContain("safetyStatus === 'hold'");
    expect(live).toContain("safetyStatus === 'clear'");
    expect(live).toContain('boundedSharedWorkoutFraction(');
    expect(live).toContain("status === 'active'");
    expect(live).toContain('foregroundRef.current = false');
  });

  it('does not call a shared workout saved before the local canonical SQLite write returns', () => {
    const ledgerWrite = live.indexOf('await saveCompletedWorkout({');
    const saved = live.indexOf('persisted.current = true;');
    expect(ledgerWrite).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(ledgerWrite);
    expect(live).toContain('if (await persist(fraction)) router.replace(');
    expect(live).toContain("if (await persist(1)) router.replace(");
  });
});
