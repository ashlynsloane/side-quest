import { describe, expect, it, vi } from 'vitest';
import {
  SYNTHETIC_RACE_BUNDLE,
  SYNTHETIC_RACE_EMAIL,
  SYNTHETIC_RACE_B_ID,
  SYNTHETIC_RACE_MAX_WAIT_MS,
  readSyntheticLocalProfileId,
  isSyntheticNativeGenerationRace,
  holdSyntheticFirstWeekBeforePersistence,
} from '../../../apps/mobile/src/services/native-qa-generation-race';
import { readFileSync } from 'node:fs';

describe('synthetic native mid-generation athlete-switch gate', () => {
  const a = { email: SYNTHETIC_RACE_EMAIL, mode: 'local' as const };

  it('is impossible to invoke on the real beta bundle even with the synthetic fixture email', () => {
    expect(isSyntheticNativeGenerationRace('com.sidequest.app', a)).toBe(false);
    expect(isSyntheticNativeGenerationRace(undefined, a)).toBe(false);
    expect(isSyntheticNativeGenerationRace('com.sidequest.synthetic.qa', {
      ...a, mode: 'cloud',
    })).toBe(false);
    expect(isSyntheticNativeGenerationRace(SYNTHETIC_RACE_BUNDLE, {
      ...a, email: 'real-athlete@example.com',
    })).toBe(false);
    expect(isSyntheticNativeGenerationRace(SYNTHETIC_RACE_BUNDLE, null)).toBe(false);
  });

  it('activates only for a known local synthetic QA identity in the isolated app bundle', () => {
    expect(isSyntheticNativeGenerationRace(SYNTHETIC_RACE_BUNDLE, a)).toBe(true);
    expect(isSyntheticNativeGenerationRace(SYNTHETIC_RACE_BUNDLE, {
      ...a, email: ' SYNTHETIC-FIRST-WEEK-RACE-A@EXAMPLE.INVALID ',
    })).toBe(true);
    expect(SYNTHETIC_RACE_MAX_WAIT_MS).toBeGreaterThanOrEqual(120_000);
  });

  it('releases pending A only after B has completed a real synthetic auth-store switch', async () => {
    vi.useFakeTimers();
    try {
      let currentProfile = 'local_synthetic-first-week-race-a@example.invalid';
      const readOwner = vi.fn(() => currentProfile);
      await holdSyntheticFirstWeekBeforePersistence(false, readOwner);
      expect(readOwner).not.toHaveBeenCalled();

      let completed = false;
      const pending = holdSyntheticFirstWeekBeforePersistence(
        true, readOwner, { pollIntervalMs: 50, timeoutMs: 2_000 },
      ).then(() => { completed = true; });
      await vi.advanceTimersByTimeAsync(250);
      expect(completed).toBe(false);
      currentProfile = SYNTHETIC_RACE_B_ID;
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(completed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed after a bounded wait if synthetic B never authenticates', async () => {
    vi.useFakeTimers();
    try {
      const pending = holdSyntheticFirstWeekBeforePersistence(
        true, () => null, { pollIntervalMs: 100, timeoutMs: 500 },
      );
      const denial = expect(pending).rejects.toThrow(/did not activate/);
      await vi.advanceTimersByTimeAsync(500);
      await denial;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads only an explicitly local stored profile and never emits the record', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null },
    });
    try {
      expect(readSyntheticLocalProfileId()).toBeNull();
      values.set('circuit.v12.beta-profile', '{invalid');
      expect(readSyntheticLocalProfileId()).toBeNull();
      values.set('circuit.v12.beta-profile', JSON.stringify({
        id: SYNTHETIC_RACE_B_ID, mode: 'cloud',
      }));
      expect(readSyntheticLocalProfileId()).toBeNull();
      values.set('circuit.v12.beta-profile', JSON.stringify({
        id: SYNTHETIC_RACE_B_ID, mode: 'local',
      }));
      expect(readSyntheticLocalProfileId()).toBe(SYNTHETIC_RACE_B_ID);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('requires the owner-guarded save to resume only after the synthetic pause', () => {
    const onboarding = readFileSync(new URL(
      '../../../apps/mobile/src/app/onboarding-first-week.tsx', import.meta.url,
    ), 'utf8');
    const hold = onboarding.indexOf('await holdSyntheticFirstWeekBeforePersistence(true)');
    const identityGate = onboarding.indexOf('if (!stillCurrent()) return;', hold);
    const ownerLock = onboarding.indexOf('const saved = await withVerifiedAthleteDatabase', hold);
    const goalSave = onboarding.indexOf('await savePerformanceGoal(canonical.goal)', hold);
    expect(hold).toBeGreaterThan(0);
    expect(identityGate).toBeGreaterThan(hold);
    expect(ownerLock).toBeGreaterThan(identityGate);
    expect(goalSave).toBeGreaterThan(ownerLock);
    expect(onboarding).toContain('Constants.expoConfig?.ios?.bundleIdentifier');
    expect(onboarding).toContain('id="sidequest-qa-switch-during-first-week-generation"'
      .replace('id=', 'testID='));
    expect(onboarding).toContain('onPress={() => void signOut()}');
  });
});
