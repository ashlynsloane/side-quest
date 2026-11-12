import { describe, expect, it, vi } from 'vitest';
import {
  SYNTHETIC_RACE_BUNDLE,
  SYNTHETIC_RACE_EMAIL,
  SYNTHETIC_RACE_HOLD_MS,
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
    expect(SYNTHETIC_RACE_HOLD_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('holds before persistence only when QA gating is enabled', async () => {
    vi.useFakeTimers();
    try {
      await holdSyntheticFirstWeekBeforePersistence(false);
      let completed = false;
      const pending = holdSyntheticFirstWeekBeforePersistence(true, 500)
        .then(() => { completed = true; });
      await vi.advanceTimersByTimeAsync(499);
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(completed).toBe(true);
    } finally {
      vi.useRealTimers();
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
