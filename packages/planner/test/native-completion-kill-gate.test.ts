import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SYNTHETIC_COMPLETION_KILL_BUNDLE,
  SYNTHETIC_COMPLETION_KILL_EMAIL,
  SYNTHETIC_COMPLETION_KILL_TIMEOUT_MS,
  isSyntheticPreSqlCompletionKill,
  holdSyntheticPreSqlCompletion,
} from '../../../apps/mobile/src/services/native-qa-completion-kill';

describe('native partial completion SIGKILL synthetic-only seam', () => {
  const fixture = { email: SYNTHETIC_COMPLETION_KILL_EMAIL, mode: 'local' as const };

  it('activates only for a known local synthetic account in a separate QA bundle', () => {
    expect(isSyntheticPreSqlCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, fixture)).toBe(true);
    expect(isSyntheticPreSqlCompletionKill('com.sidequest.app', fixture)).toBe(false);
    expect(isSyntheticPreSqlCompletionKill(undefined, fixture)).toBe(false);
    expect(isSyntheticPreSqlCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, null)).toBe(false);
    expect(isSyntheticPreSqlCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, {
      ...fixture, mode: 'cloud',
    })).toBe(false);
    expect(isSyntheticPreSqlCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, {
      ...fixture, email: 'real-user@example.com',
    })).toBe(false);
    expect(SYNTHETIC_COMPLETION_KILL_TIMEOUT_MS).toBeGreaterThan(120_000);
  });

  it('never stalls regular users and fails closed if a synthetic kill is not delivered', async () => {
    vi.useFakeTimers();
    try {
      await holdSyntheticPreSqlCompletion(false);
      const awaiting = holdSyntheticPreSqlCompletion(true, 500);
      const rejected = expect(awaiting).rejects.toThrow(/expired without OS process termination/);
      await vi.advanceTimersByTimeAsync(499);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      await expect(holdSyntheticPreSqlCompletion(true, 0)).rejects.toThrow(/Invalid synthetic/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('journals the unchanged partial fraction before exposing a real process-kill marker', () => {
    const source = readFileSync(new URL(
      '../../../apps/mobile/src/app/active-workout.tsx', import.meta.url,
    ), 'utf8');
    const journal = source.indexOf('await saveLiveWorkoutSession({', source.indexOf('async function persistCompletion('));
    const hold = source.indexOf('await holdSyntheticPreSqlCompletion(true)', journal);
    const ownerLock = source.indexOf('await withVerifiedAthleteDatabase(athleteId', journal);
    const commit = source.indexOf('await saveCompletedWorkout({', journal);
    expect(journal).toBeGreaterThan(0);
    expect(hold).toBeGreaterThan(journal);
    expect(ownerLock).toBeGreaterThan(hold);
    expect(commit).toBeGreaterThan(ownerLock);
    expect(source).toContain('pendingCompletion: { completedAt: timestamp, completionFraction }');
    expect(source).toContain('!restoredPendingCompletion.current');
    expect(source).toContain('restoredPendingCompletion.current = true');
    expect(source).toContain('sidequest-qa-completion-journal-durable-before-sql');
    expect(source).toContain('Constants.expoConfig?.ios?.bundleIdentifier');
  });
});
