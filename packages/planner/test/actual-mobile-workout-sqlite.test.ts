import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManualEnduranceActivity } from '../src/manual-endurance';

/**
 * This test loads the ACTUAL mobile database service. The only replacement
 * is the Expo SQLite transport: Node's real disk-backed sqlite executes the
 * app's unchanged initialization, transaction and query SQL.
 * It is not a native Expo / physical-device test.
 */
const state = vi.hoisted(() => ({
  directory: '',
  handles: [] as Array<{ close: () => void }>,
  failNextContaining: null as string | null,
}));
// The mobile service only needs four SQL exports from the planner package.
// Use their real implementations without loading unrelated React Native UI exports.
vi.mock('@circuit/planner', async () => {
  const sql = await import('../src/training-adjustment-sqlite');
  return {
    PLAN_ADJUSTMENT_TABLE_SQL: sql.PLAN_ADJUSTMENT_TABLE_SQL,
    appendTrainingAdjustmentDecision: sql.appendTrainingAdjustmentDecision,
    readTrainingAdjustmentDecisions: sql.readTrainingAdjustmentDecisions,
    effectiveTrainingCalendarEvents: sql.effectiveTrainingCalendarEvents,
  };
});
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (choices: Record<string, unknown>) => choices.ios },
  NativeModules: {},
}));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('../../../apps/mobile/src/services/strava', () => ({
  getStravaConnection: vi.fn(async () => null),
}));
vi.mock('expo-sqlite', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  return {
    openDatabaseSync(name: string) {
      const database = new DatabaseSync(join(state.directory, name));
      state.handles.push(database);
      const run = (sql: string, args: unknown[]) => {
        if (state.failNextContaining && sql.includes(state.failNextContaining)) {
          state.failNextContaining = null;
          throw new Error('synthetic SQLite write interruption');
        }
        return database.prepare(sql).run(...(args as Array<string | number | null>));
      };
      return {
        execAsync: async (sql: string) => { database.exec(sql); },
        runAsync: async (sql: string, ...args: unknown[]) => run(sql, args),
        getFirstAsync: async (sql: string, ...args: unknown[]) =>
          database.prepare(sql).get(...(args as Array<string | number | null>)) ?? null,
        getAllAsync: async (sql: string, ...args: unknown[]) =>
          database.prepare(sql).all(...(args as Array<string | number | null>)),
        withTransactionAsync: async (fn: () => Promise<void>) => {
          database.exec('BEGIN IMMEDIATE');
          try {
            await fn();
            database.exec('COMMIT');
          } catch (error) {
            database.exec('ROLLBACK');
            throw error;
          }
        },
      };
    },
  };
});

type MobileDb = typeof import('../../../apps/mobile/src/services/database');
let service: MobileDb;
let scratch = '';
const startedAt = '2026-10-20T10:00:00.000Z';
const completedAt = '2026-10-20T11:00:00.000Z';
const stableId = 'synth-strength-1_' + startedAt;
const workout = {
  id: 'synth-strength-1',
  name: 'Synthetic bodyweight recovery session',
  source: 'manual',
  estimatedElapsedSeconds: 3600,
  stations: [],
} as unknown as Parameters<MobileDb['saveCompletedWorkout']>[0]['workout'];
const weeklyBlock = () => {
  const goal = { id: 'synthetic-goal' };
  return {
    id: 'synthetic-block', goal, createdAt: startedAt,
    weeks: [{
      id: 'synthetic-week', goal, weekStartDate: '2026-10-19',
      createdAt: startedAt,
      sessions: [{
        id: 'synthetic-planned-session', date: '2026-10-20',
        completionStatus: 'planned', workout,
      }],
    }],
  } as unknown as Parameters<MobileDb['saveTrainingBlock']>[0];
};
const save = (fraction = 0.6) => service.saveCompletedWorkout({
  workout, startedAt, completedAt, completionFraction: fraction,
  stationRounds: {},
  plannedSessionId: 'synthetic-planned-session',
  relationToPlan: 'completed_planned', idempotencyKey: stableId,
});
const sessionStatus = async () => {
  const block = await service.getLatestTrainingBlock();
  return block?.block.weeks[0]?.sessions[0]?.completionStatus;
};
const ledger = async () => service.listWorkoutLedgerEntries({ limit: 10 });

beforeEach(async () => {
  vi.resetModules();
  scratch = mkdtempSync(join(tmpdir(), 'side-quest-real-mobile-sql-'));
  state.directory = scratch;
  state.handles = [];
  state.failNextContaining = null;
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
      clear: () => stored.clear(),
      key: (index: number) => [...stored.keys()][index] ?? null,
      get length() { return stored.size; },
    },
  });
  service = await import('../../../apps/mobile/src/services/database');
  await service.activateUserDatabase('synthetic-athlete-one');
});

afterEach(() => {
  state.failNextContaining = null;
  for (const handle of state.handles.splice(0)) {
    try { handle.close(); } catch { /* already closed */ }
  }
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe('actual mobile workout persistence with real disk SQLite', () => {
  it('finishes a planned workout and writes one canonical linked ledger record', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    expect(await sessionStatus()).toBe('planned');
    await save(0.6);
    const records = await ledger();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: stableId, plannedSessionId: 'synthetic-planned-session',
      relationToPlan: 'completed_planned', completionFraction: 0.6,
    });
    expect(await sessionStatus()).toBe('completed');
  });

  it('never invents completed exercise sets for an unlogged partial workout', async () => {
    const exerciseWorkout = {
      ...workout, id: 'synthetic-partial-with-exercise',
      stations: [{
        id: 'synthetic-station-1', durationSeconds: 900,
        exercises: [{
          exerciseId: 'synthetic-squat', target: 10, unit: 'reps',
          equipmentOptionId: 'bodyweight',
          exerciseSnapshot: {
            name: 'Synthetic bodyweight squat', bodyRegions: [],
            movementPatterns: ['squat'], equipmentOptions: [],
          },
        }],
      }],
    } as unknown as Parameters<MobileDb['saveCompletedWorkout']>[0]['workout'];
    await service.saveCompletedWorkout({
      workout: exerciseWorkout,
      startedAt, completedAt,
      completionFraction: 0.25, stationRounds: {},
      idempotencyKey: 'unlogged-partial',
    });
    const partial = (await ledger()).find((entry) => entry.id === 'unlogged-partial');
    expect(partial?.completionFraction).toBe(0.25);
    expect(partial?.exercises).toHaveLength(1);
    expect(partial?.exercises[0]?.sets).toEqual([]);

    await service.saveCompletedWorkout({
      workout: exerciseWorkout,
      startedAt, completedAt,
      completionFraction: 1, stationRounds: {},
      idempotencyKey: 'full-no-set-logging',
    });
    const full = (await ledger()).find((entry) => entry.id === 'full-no-set-logging');
    expect(full?.exercises[0]?.sets).toHaveLength(1);
  });

  it('repeating the same completion is idempotent and preserves partial dose', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save(0.4);
    await save(1);
    expect(await ledger()).toHaveLength(1);
    expect((await ledger())[0]?.completionFraction).toBe(0.4);
    expect(await sessionStatus()).toBe('completed');
  });

  it('rolls back both ledger and completed-workout row after an injected SQL failure', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    state.failNextContaining = 'INSERT OR REPLACE INTO workout_ledger';
    await expect(save()).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(0);
    expect(await sessionStatus()).toBe('planned');
    await save();
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('completed');
  });

  it('cold-restarts safely after an injected mid-transaction partial-save failure', async () => {
    // This is a disk-backed SQL failure and full JS module restart, NOT a
    // simulator process termination at an exact native commit instruction.
    const persistence = await import('../../../apps/mobile/src/services/active-workout-persistence');
    await service.saveTrainingBlock(weeklyBlock());
    const originalFraction = 0.41;
    const initial = persistence.createInitialLiveWorkoutSession(workout, startedAt, {
      sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
      sessionTitle: 'Planned strength', modifiedFromPlan: false,
    });
    await persistence.saveLiveWorkoutSession({
      ...initial, phase: 'rest', running: false,
      pendingCompletion: { completionFraction: originalFraction, completedAt },
    }, 'synthetic-athlete-one');

    // The completed-workout row was inserted, then the ledger insert failed.
    // The SQLite transaction must roll back ALL canonical rows before restart.
    state.failNextContaining = 'INSERT OR REPLACE INTO workout_ledger';
    await expect(save(originalFraction)).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(0);
    expect(await sessionStatus()).toBe('planned');
    for (const handle of state.handles.splice(0)) handle.close();

    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const reloaded = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const pending = await reloaded.loadLiveWorkoutSession('synthetic-athlete-one');
    expect(pending?.pendingCompletion).toEqual({
      completionFraction: originalFraction, completedAt,
    });
    expect(pending?.startedAt).toBe(startedAt);
    expect(await ledger()).toHaveLength(0);

    await save(pending!.pendingCompletion!.completionFraction);
    await save(1); // stale retry cannot silently promote 41% to 100%
    expect((await ledger()).map((entry) => entry.completionFraction))
      .toEqual([originalFraction]);
    expect(await sessionStatus()).toBe('completed');
    await reloaded.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(await reloaded.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
  });

  it('repairs plan status after a post-commit failure without duplicate workout', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(save()).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('planned');
    await save();
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('completed');
  });

  it('persists the canonical ledger and completed plan across service module restart', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save(0.5);
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await ledger())).toHaveLength(1);
    expect((await ledger())[0]?.completionFraction).toBe(0.5);
    expect(await sessionStatus()).toBe('completed');
    await save();
    expect(await ledger()).toHaveLength(1);
  });

  it('reopens an interrupted partial completion journal and repairs a committed ledger', async () => {
    const checkpoint = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const originalStart = startedAt;
    const originalCompleted = completedAt;
    const snapshot = checkpoint.createInitialLiveWorkoutSession(
      workout, originalStart,
      { sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
        sessionTitle: 'Planned session', modifiedFromPlan: false },
    );
    await service.saveTrainingBlock(weeklyBlock());
    await checkpoint.saveLiveWorkoutSession({
      ...snapshot, phase: 'rest', running: false,
      pendingCompletion: { completionFraction: 0.37, completedAt: originalCompleted },
    });
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(save(0.37)).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('planned');
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const recovered = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const pending = await recovered.loadLiveWorkoutSession();
    expect(pending?.startedAt).toBe(originalStart);
    expect(pending?.pendingCompletion).toEqual({
      completionFraction: 0.37, completedAt: originalCompleted,
    });
    await save(pending!.pendingCompletion!.completionFraction);
    expect((await ledger()).map(x => x.completionFraction)).toEqual([0.37]);
    expect(await sessionStatus()).toBe('completed');
    await recovered.clearLiveWorkoutSession();
    expect(await recovered.loadLiveWorkoutSession()).toBeNull();
  });

  it('does not overwrite an unresolved completion with a new workout or corrupt stored checkpoint', async () => {
    const checkpoint = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const sessionA = checkpoint.createInitialLiveWorkoutSession(workout, startedAt);
    const pending = {
      ...sessionA, phase: 'rest' as const, running: false,
      pendingCompletion: { completionFraction: 0.31, completedAt },
    };
    await checkpoint.saveLiveWorkoutSession(pending, 'synthetic-athlete-one');
    const storedBefore = globalThis.localStorage.getItem(
      'sidequest.live-workout.session.v1:synthetic-athlete-one',
    );
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-one'))
      .toThrow(/Finish saving the previous workout/);

    const otherWorkout = { ...workout, id: 'other-workout' };
    const replacement = checkpoint.createInitialLiveWorkoutSession(
      otherWorkout, '2026-10-21T11:00:00.000Z',
    );
    await expect(checkpoint.saveLiveWorkoutSession(replacement, 'synthetic-athlete-one'))
      .rejects.toThrow(/Conflicting pending workout completion/);
    expect(globalThis.localStorage.getItem(
      'sidequest.live-workout.session.v1:synthetic-athlete-one',
    )).toBe(storedBefore);
    // Background writes for the original session may arrive after its
    // journal is committed; they are ignored rather than wiping the dose.
    await checkpoint.saveLiveWorkoutSession(sessionA, 'synthetic-athlete-one');
    expect((await checkpoint.loadLiveWorkoutSession('synthetic-athlete-one'))
      ?.pendingCompletion?.completionFraction).toBe(0.31);

    await service.activateUserDatabase('synthetic-athlete-two');
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-two'))
      .not.toThrow();
    await checkpoint.saveLiveWorkoutSession(replacement, 'synthetic-athlete-two');
    expect((await checkpoint.loadLiveWorkoutSession('synthetic-athlete-two'))
      ?.workout.id).toBe('other-workout');

    await service.activateUserDatabase('synthetic-athlete-one');
    await checkpoint.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-one'))
      .not.toThrow();
    const corruptKey = 'sidequest.live-workout.session.v1:synthetic-athlete-one';
    globalThis.localStorage.setItem(corruptKey, '{unparseable-checkpoint');
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-one'))
      .toThrow(/data was preserved/);
    expect(globalThis.localStorage.getItem(corruptKey))
      .toBe('{unparseable-checkpoint');
    await expect(checkpoint.saveLiveWorkoutSession(replacement, 'synthetic-athlete-one'))
      .rejects.toThrow(/Existing workout checkpoint is unreadable/);
    expect(globalThis.localStorage.getItem(corruptKey))
      .toBe('{unparseable-checkpoint');
  });

  it('keeps A pending partial dose and B live workout separate across athlete switches and cold reload', async () => {
    const mobileCheckpoint = await import('../../../apps/mobile/src/services/active-workout-persistence');
    await service.saveTrainingBlock(weeklyBlock());
    const sessionA = mobileCheckpoint.createInitialLiveWorkoutSession(workout, startedAt, {
      sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
      sessionTitle: 'Athlete A planned session', modifiedFromPlan: false,
    });
    await mobileCheckpoint.saveLiveWorkoutSession({
      ...sessionA, phase: 'rest', running: false,
      pendingCompletion: { completionFraction: 0.29, completedAt },
    }, 'synthetic-athlete-one');

    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await mobileCheckpoint.loadLiveWorkoutSession()).toBeNull();
    const bWorkout = { ...workout, id: 'synthetic-strength-b', name: 'Athlete B session' };
    const bStart = '2026-10-22T10:00:00.000Z';
    const sessionB = mobileCheckpoint.createInitialLiveWorkoutSession(bWorkout, bStart);
    await mobileCheckpoint.saveLiveWorkoutSession({
      ...sessionB, phase: 'rest', running: false, remainingSeconds: 22,
    }, 'synthetic-athlete-two');
    expect((await mobileCheckpoint.loadLiveWorkoutSession())?.workout.id).toBe(bWorkout.id);
    expect((await mobileCheckpoint.loadLiveWorkoutSession())?.pendingCompletion).toBeUndefined();
    expect(await ledger()).toHaveLength(0);

    // Simulate actual app-process module reinitialization, retaining device
    // localStorage and the on-disk SQLite files for both athletes.
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-two');
    const recovered = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const bRestored = await recovered.loadLiveWorkoutSession();
    expect(bRestored?.workout.id).toBe(bWorkout.id);
    expect(bRestored?.remainingSeconds).toBe(22);

    await service.activateUserDatabase('synthetic-athlete-one');
    const aRestored = await recovered.loadLiveWorkoutSession();
    expect(aRestored?.workout.id).toBe(workout.id);
    expect(aRestored?.startedAt).toBe(startedAt);
    expect(aRestored?.planLink?.sessionId).toBe('synthetic-planned-session');
    expect(aRestored?.pendingCompletion).toEqual({
      completionFraction: 0.29, completedAt,
    });
    expect(await ledger()).toHaveLength(0);
    await save(aRestored!.pendingCompletion!.completionFraction);
    await save(1); // A second attempt must not turn the original 29% into 100%.
    expect((await ledger()).map((entry) => entry.completionFraction)).toEqual([0.29]);
    await recovered.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(await recovered.loadLiveWorkoutSession()).toBeNull();

    // B retains only B's original live work/rest checkpoint, even after A
    // finished. A sign-out removes only the active-owner pointer, not B data.
    await service.activateUserDatabase('synthetic-athlete-two');
    expect((await recovered.loadLiveWorkoutSession())?.workout.id).toBe(bWorkout.id);
    expect(await ledger()).toHaveLength(0);
    globalThis.localStorage.removeItem('sidequest.active-workout.profile-id');
    expect(await recovered.loadLiveWorkoutSession()).toBeNull();
    expect(await recovered.loadLiveWorkoutSession(null)).toBeNull();
    await expect(recovered.saveLiveWorkoutSession(sessionB, null))
      .rejects.toThrow('Cannot save an unowned live workout');
    expect((await recovered.loadLiveWorkoutSession('synthetic-athlete-two'))?.workout.id)
      .toBe(bWorkout.id);
  });

  it('resumes first-run after goal succeeded but training block failed on real SQLite', async () => {
    const onboarding = await import('../../../apps/mobile/src/services/onboarding');
    const userId = 'synthetic-athlete-one';
    onboarding.saveOnboardingState(userId, {
      ...onboarding.defaultOnboardingState(),
      strengthModelAcknowledged: true,
      privacyModelAcknowledged: true,
      firstWeekSetupStartedAt: startedAt,
    });
    const partialGoal = {
      ...weeklyBlock().goal,
      id: 'incomplete-first-week-goal',
      createdAt: startedAt,
    } as Parameters<MobileDb['savePerformanceGoal']>[0];
    await service.savePerformanceGoal(partialGoal);
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(service.saveTrainingBlock(weeklyBlock()))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await service.getLatestTrainingBlock()).toBeNull();
    for (const handle of state.handles.splice(0)) handle.close();

    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase(userId);
    const resumed = await import('../../../apps/mobile/src/services/onboarding');
    const result = await resumed.evaluateFirstRun(userId);
    expect(result.needsOnboarding).toBe(true);
    expect(result.state.firstWeekSetupStartedAt).toBe(startedAt);
    expect(result.state.firstRunBypassedAt).toBeUndefined();
    expect((await service.getLatestPerformanceGoal())?.id).toBe(partialGoal.id);
    expect(await service.getLatestTrainingBlock()).toBeNull();
  });

  it('repairs a partially saved first-week block from its original identity', async () => {
    const original = weeklyBlock();
    expect(await service.getTrainingBlockById(original.id)).toBeNull();
    state.failNextContaining = 'INSERT INTO weekly_training_plans';
    await expect(service.saveTrainingBlock(original))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    // The header committed before its weekly rows. Recover it exactly rather
    // than inserting a new seeded block with different workout IDs.
    const partiallySaved = await service.getTrainingBlockById(original.id);
    expect(partiallySaved).toEqual(original);
    expect(await service.getLatestWeeklyPlan()).toBeNull();
    await service.saveTrainingBlock(partiallySaved!);
    const restored = await service.getTrainingBlockById(original.id);
    expect(restored?.id).toBe(original.id);
    expect((await service.getLatestWeeklyPlan())?.plan.id).toBe(original.weeks[0]?.id);
    expect(await service.getTrainingBlockById('unrelated-block')).toBeNull();

    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await service.getTrainingBlockById(original.id))?.id).toBe(original.id);
    expect((await service.getLatestWeeklyPlan())?.plan.id).toBe(original.weeks[0]?.id);
  });

  it('records its verified athlete owner inside each SQLite file', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const firstName = service.getActiveDatabaseName();
    const first = new DatabaseSync(join(state.directory, firstName));
    expect(first.prepare(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    ).get()).toMatchObject({ user_id: 'synthetic-athlete-one' });
    first.close();
    await service.activateUserDatabase('synthetic-athlete-two');
    const second = new DatabaseSync(join(state.directory, service.getActiveDatabaseName()));
    expect(second.prepare(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    ).get()).toMatchObject({ user_id: 'synthetic-athlete-two' });
    second.close();
  });

  it('refuses a forged local filename claim when the SQLite file belongs to another athlete', async () => {
    const first = 'collision_a.b';
    const other = 'collision_a_b';
    await service.activateUserDatabase(first);
    const protectedName = service.getActiveDatabaseName();
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    globalThis.localStorage.setItem('circuit.database-file-owner.v1:' + protectedName, other);
    await expect(service.activateUserDatabase(other)).rejects.toThrow(/ownership mismatch/);
    expect(service.getActiveDatabaseName()).toBe(protectedName);
    expect((await ledger())).toHaveLength(1);
  });

  it('does not reassign a populated original file when localStorage ownership is lost', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    globalThis.localStorage.removeItem('circuit.original-database-owner');
    await expect(service.activateUserDatabase('synthetic-different-owner'))
      .rejects.toThrow(/ownership mismatch/);
    expect((await ledger())).toHaveLength(1);
    expect(service.getActiveDatabaseName()).toBe('circuit-generator.db');
  });

  it('does not adopt a populated legacy side-profile database without independent provenance', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const athlete = 'historical-side-profile';
    await service.activateUserDatabase(athlete);
    const protectedName = service.getActiveDatabaseName();
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    const raw = new DatabaseSync(join(state.directory, protectedName));
    raw.prepare('DELETE FROM sidequest_athlete_database_owner').run();
    raw.close();
    globalThis.localStorage.removeItem('circuit.database-file-owner.v1:' + protectedName);
    await expect(service.activateUserDatabase(athlete))
      .rejects.toThrow(/no verifiable owner/);
    expect(service.getActiveDatabaseName()).toBe(protectedName);
    // The database remains intact for a manual owner-provenance migration.
    expect((await ledger())).toHaveLength(1);
  });

  it('does not modify even one byte of a populated unowned historical SQLite file when refusing adoption', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const athlete = 'legacy_no_owner';
    const candidate = join(state.directory, 'circuit-generator-legacy_no_owner.db');
    const original = new DatabaseSync(candidate);
    original.exec(`
      CREATE TABLE historical_training (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO historical_training VALUES ('old-record', 'unknown-owner-preserve-me');
    `);
    original.close();
    const bytesBefore = readFileSync(candidate);
    const activeBefore = service.getActiveDatabaseName();

    await expect(service.activateUserDatabase(athlete))
      .rejects.toThrow(/no verifiable owner/);
    expect(service.getActiveDatabaseName()).toBe(activeBefore);
    expect(readFileSync(candidate).equals(bytesBefore)).toBe(true);

    const untouched = new DatabaseSync(candidate);
    expect(untouched.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sidequest_athlete_database_owner'",
    ).get()).toBeUndefined();
    expect(untouched.prepare(
      "SELECT value FROM historical_training WHERE id = 'old-record'",
    ).get()).toEqual({ value: 'unknown-owner-preserve-me' });
    untouched.close();
  });

  it('keeps the previous active profile selected when new owner verification fails', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    const priorName = service.getActiveDatabaseName();
    state.failNextContaining = 'INSERT INTO sidequest_athlete_database_owner';
    await expect(service.activateUserDatabase('fresh-athlete')).rejects
      .toThrow(/synthetic SQLite write interruption/);
    expect(service.getActiveDatabaseName()).toBe(priorName);
    expect(await sessionStatus()).toBe('planned');
    expect(globalThis.localStorage.getItem('sidequest.active-workout.profile-id'))
      .toBe('synthetic-athlete-one');
  });

  it('prevents two different athlete IDs that normalize to the same filename sharing data', async () => {
    // A dot and underscore both map to underscore under the original filename
    // sanitizer. Without ownership tracking, their SQLite databases collide.
    const firstId = 'local_a.b@example.invalid';
    const secondId = 'local_a_b@example.invalid';
    await service.activateUserDatabase(firstId);
    const firstName = service.getActiveDatabaseName();
    await service.saveTrainingBlock(weeklyBlock());
    await save(0.6);
    await service.activateUserDatabase(secondId);
    const secondName = service.getActiveDatabaseName();
    expect(secondName).not.toBe(firstName);
    expect(await service.getLatestTrainingBlock()).toBeNull();
    expect(await ledger()).toHaveLength(0);
    await service.activateUserDatabase(firstId);
    expect(service.getActiveDatabaseName()).toBe(firstName);
    expect((await ledger())).toHaveLength(1);
    await service.activateUserDatabase(secondId);
    expect(service.getActiveDatabaseName()).toBe(secondName);
    expect(await ledger()).toHaveLength(0);
  });

  it('keeps default equipment initialization in the verified source athlete database', async () => {
    await service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      const profiles = await service.ensureDefaultEquipmentProfiles();
      expect(profiles).toHaveLength(3);
      await service.getRecentRegionExposures();
      await service.getPreviousExerciseIds();
    });
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await service.listEquipmentProfiles()).toHaveLength(0);
    await expect(service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      await service.ensureDefaultEquipmentProfiles();
    })).rejects.toThrow('Athlete profile changed');
    expect(await service.listEquipmentProfiles()).toHaveLength(0);
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await service.listEquipmentProfiles()).toHaveLength(3);
  });

  it('rejects athlete A first-week writes if their generator resolves after activating B', async () => {
    let finishGeneration!: () => void;
    const generated = new Promise<void>((resolve) => { finishGeneration = resolve; });
    let resumed = false;
    const delayedFirstWeek = (async () => {
      await generated; // expensive first-week generation paused mid-flight
      resumed = true;
      await service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
        await service.savePerformanceGoal({
          ...weeklyBlock().goal, id: 'stale-athlete-a-goal', createdAt: startedAt,
        } as Parameters<MobileDb['savePerformanceGoal']>[0]);
        await service.saveTrainingBlock(weeklyBlock());
      });
    })();
    await service.activateUserDatabase('synthetic-athlete-two');
    finishGeneration();
    await expect(delayedFirstWeek).rejects.toThrow('Athlete profile changed');
    expect(resumed).toBe(true);
    expect(await service.getLatestPerformanceGoal()).toBeNull();
    expect(await service.getLatestTrainingBlock()).toBeNull();
    // The rejected stale result did not write into A OR B.
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await service.getLatestPerformanceGoal()).toBeNull();
    expect(await service.getLatestTrainingBlock()).toBeNull();
  });

  it('serializes a profile switch across pending goal, block and calendar writes', async () => {
    let signalGoalSaved!: () => void;
    let releaseAfterGoal!: () => void;
    const goalSaved = new Promise<void>((resolve) => { signalGoalSaved = resolve; });
    const allowBlock = new Promise<void>((resolve) => { releaseAfterGoal = resolve; });
    const goal = { ...weeklyBlock().goal, id: 'a-goal',
      createdAt: startedAt } as Parameters<MobileDb['savePerformanceGoal']>[0];
    const write = service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      await service.savePerformanceGoal(goal);
      signalGoalSaved();
      await allowBlock; // B switches while A is midway through the workflow.
      await service.saveTrainingBlock(weeklyBlock());
      await service.saveWeeklyPlan(weeklyBlock().weeks[0]!); // derived-calendar placeholder
    });
    await goalSaved;
    let switched = false;
    const switchToB = service.activateUserDatabase('synthetic-athlete-two')
      .then(() => { switched = true; });
    await Promise.resolve();
    expect(switched).toBe(false);
    releaseAfterGoal();
    await write;
    await switchToB;
    expect(switched).toBe(true);
    expect(await service.getLatestPerformanceGoal()).toBeNull();
    expect(await service.getLatestTrainingBlock()).toBeNull();
    expect(await service.getLatestWeeklyPlan()).toBeNull();
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await service.getLatestPerformanceGoal())?.id).toBe('a-goal');
    expect((await service.getLatestTrainingBlock())?.id).toBe('synthetic-block');
    expect((await service.getLatestWeeklyPlan())?.id).toBe('synthetic-week');
  });

  it('releases profile write lock after a SQLite failure, with no other athlete pollution', async () => {
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      await service.saveTrainingBlock(weeklyBlock());
    })).rejects.toThrow('synthetic SQLite write interruption');
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await service.getLatestTrainingBlock()).toBeNull();
    await service.withVerifiedAthleteDatabase('synthetic-athlete-two', async () => {
      await service.saveTrainingBlock({ ...weeklyBlock(), id: 'b-block' });
    });
    expect((await service.getLatestTrainingBlock())?.id).toBe('b-block');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await service.getLatestTrainingBlock()).toBeNull();
  });

  it('does not expose athlete A ledger or plan within athlete B profile', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await ledger()).toHaveLength(0);
    expect(await service.getLatestTrainingBlock()).toBeNull();
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('completed');
  });
});

const endurance = () => createManualEnduranceActivity({
  id: 'synthetic-ride-1', name: 'Completed bike session',
  discipline: 'bike', localDate: '2026-10-20', durationMinutes: 75,
  distanceKm: null, intensity: 'easy',
  recordedAt: '2026-10-21T12:00:00.000Z',
});

describe('actual mobile endurance source integrity with real SQLite', () => {
  it('repeated import of the same completed session never duplicates exposure records', async () => {
    const first = await service.upsertEnduranceActivities([endurance()]);
    const second = await service.upsertEnduranceActivities([endurance()]);
    expect(first.insertedIds).toEqual(['synthetic-ride-1']);
    expect(second.insertedIds).toEqual([]);
    const stored = await service.listEnduranceActivities();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.movingTimeSeconds).toBe(4500);
    expect(stored[0]?.distanceMeters).toBeUndefined();
  });

  it('recovers the exact 75-minute ride with unknown distance after database restart', async () => {
    await service.upsertEnduranceActivities([endurance()]);
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const retrieved = await service.getEnduranceActivity('synthetic-ride-1');
    expect(retrieved?.name).toBe('Completed bike session');
    expect(retrieved?.discipline).toBe('bike');
    expect(retrieved?.movingTimeSeconds).toBe(75 * 60);
    expect(retrieved?.distanceMeters).toBeUndefined();
    expect((await service.listEnduranceActivities()).map(x => x.id))
      .toEqual(['synthetic-ride-1']);
    await service.upsertEnduranceActivities([endurance()]);
    expect(await service.listEnduranceActivities()).toHaveLength(1);
  });

  it('does not expose a completed ride when a different athlete becomes active', async () => {
    await service.upsertEnduranceActivities([endurance()]);
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await service.getEnduranceActivity('synthetic-ride-1')).toBeNull();
    expect(await service.listEnduranceActivities()).toHaveLength(0);
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await service.getEnduranceActivity('synthetic-ride-1'))?.movingTimeSeconds)
      .toBe(4500);
    expect((await service.listEnduranceActivities()).map(x => x.id))
      .toEqual(['synthetic-ride-1']);
  });

  it('does not double-count the same provider/source identifier under a new record ID', async () => {
    const record = endurance();
    await service.upsertEnduranceActivities([record]);
    await expect(service.upsertEnduranceActivities([
      { ...record, id: 'alternate-id-for-same-external-workout' },
    ])).rejects.toThrow();
    expect((await service.listEnduranceActivities()).map(x => x.id))
      .toEqual(['synthetic-ride-1']);
  });

  it('treats failed endurance SQL upsert as absent, then admits a single retry', async () => {
    state.failNextContaining = 'INSERT INTO endurance_activities';
    await expect(service.upsertEnduranceActivities([endurance()]))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await service.listEnduranceActivities()).toHaveLength(0);
    await service.upsertEnduranceActivities([endurance()]);
    expect(await service.listEnduranceActivities()).toHaveLength(1);
  });

  it('soft deletion removes completed activity from default views but retains audit record', async () => {
    await service.upsertEnduranceActivities([endurance()]);
    const deleted = await service.softDeleteEnduranceActivity({
      source: 'manual', externalId: 'synthetic-ride-1',
      deletedAt: '2026-10-22T12:00:00.000Z',
    });
    expect(deleted).toBe('synthetic-ride-1');
    expect(await service.listEnduranceActivities()).toHaveLength(0);
    const retained = await service.listEnduranceActivities({ includeDeleted: true });
    expect(retained).toHaveLength(1);
    expect(retained[0]?.deletedAt).toBe('2026-10-22T12:00:00.000Z');
  });
});
