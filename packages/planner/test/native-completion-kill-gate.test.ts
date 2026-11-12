import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SYNTHETIC_COMPLETION_KILL_BUNDLE,
  SYNTHETIC_COMPLETION_KILL_EMAIL,
  SYNTHETIC_COMPLETION_KILL_TIMEOUT_MS,
  isSyntheticPreSqlCompletionKill,
  holdSyntheticPreSqlCompletion,
  SYNTHETIC_IN_TRANSACTION_KILL_EMAIL,
  isSyntheticInTransactionCompletionKill,
  holdSyntheticInTransactionCompletion,
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

  it('blocks a real in-transaction SQL crash only for a DIFFERENT synthetic B fixture', () => {
    const inTx = { email: SYNTHETIC_IN_TRANSACTION_KILL_EMAIL, mode: 'local' as const };
    expect(isSyntheticInTransactionCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, inTx))
      .toBe(true);
    expect(isSyntheticInTransactionCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, fixture))
      .toBe(false);
    expect(isSyntheticPreSqlCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, inTx))
      .toBe(false);
    expect(isSyntheticInTransactionCompletionKill('com.sidequest.app', inTx)).toBe(false);
    expect(isSyntheticInTransactionCompletionKill(undefined, inTx)).toBe(false);
    expect(isSyntheticInTransactionCompletionKill(SYNTHETIC_COMPLETION_KILL_BUNDLE, {
      ...inTx, mode: 'cloud',
    })).toBe(false);
  });

  it('holds a genuine uncommitted INSERT and never stalls a beta workout', async () => {
    vi.useFakeTimers();
    try {
      await holdSyntheticInTransactionCompletion(false);
      const pending = holdSyntheticInTransactionCompletion(true, 100);
      const failure = expect(pending).rejects.toThrow(/uncommitted-SQL kill window expired/);
      await vi.advanceTimersByTimeAsync(100);
      await failure;
    } finally {
      vi.useRealTimers();
    }
  });

  it('positions native B crash after real SQL INSERT but before commit, with cold-retry bypass', () => {
    const db = readFileSync(new URL(
      '../../../apps/mobile/src/services/database.ts', import.meta.url,
    ), 'utf8');
    const screen = readFileSync(new URL(
      '../../../apps/mobile/src/app/active-workout.tsx', import.meta.url,
    ), 'utf8');
    const save = db.slice(db.indexOf('export async function saveCompletedWorkout('));
    const begin = save.indexOf('await db.withTransactionAsync(async () => {');
    const insert = save.indexOf('INSERT OR REPLACE INTO completed_workouts', begin);
    const hold = save.indexOf('await syntheticOnlyHoldAfterUncommittedInsert()', insert);
    const ledger = save.indexOf('INSERT OR REPLACE INTO workout_ledger', hold);
    expect(begin).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(begin);
    expect(hold).toBeGreaterThan(insert);
    expect(ledger).toBeGreaterThan(hold);
    expect(save).toContain('syntheticOnlyHoldAfterUncommittedInsert?: () => Promise<void>');
    expect(screen).toContain('isSyntheticInTransactionCompletionKill(');
    expect(screen).toContain('!restoredPendingCompletion.current');
    expect(screen).toContain('await holdSyntheticInTransactionCompletion(true)');
    expect(screen).toContain('sidequest-qa-completion-sql-uncommitted-before-commit');
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
