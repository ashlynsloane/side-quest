import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
vi.mock('expo-sqlite/localStorage/install', () => ({}));
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
