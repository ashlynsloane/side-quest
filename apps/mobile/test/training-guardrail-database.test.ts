import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyTrainingCeiling } from '@circuit/planner';

// This is a real SQLite SQL/transaction test, not a mocked result map.
// Node 22's built-in SQLite engine is adapted to the small async Expo-SQLite
// interface so schema constraints, UPSERT, idempotency and ROLLBACK execute.
const state = vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  });
  return { database: null as null | { exec(sql: string): void },
    failRecoveryEventWrites: false };
});
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('expo-sqlite', async () => {
  const { DatabaseSync } = await import('node:' + 'sqlite');
  const database = new DatabaseSync(':memory:');
  state.database = database;
  const adapter = {
    execAsync: async (sql: string) => { database.exec(sql); },
    getFirstAsync: async (sql: string, ...args: Array<string | number>) =>
      database.prepare(sql).get(...args),
    getAllAsync: async (sql: string, ...args: Array<string | number>) =>
      database.prepare(sql).all(...args),
    runAsync: async (sql: string, ...args: Array<string | number>) => {
      if (state.failRecoveryEventWrites &&
          /INSERT INTO training_guardrail_events/.test(sql)) {
        throw new Error('injected event insert failure');
      }
      return database.prepare(sql).run(...args);
    },
    withExclusiveTransactionAsync: async (callback: (db: unknown) => Promise<unknown>) => {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(adapter);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    withTransactionAsync: async (callback: () => Promise<unknown>) => {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { openDatabaseSync: () => adapter };
});

import {
  initializeDatabase,
  getStoredDailyTrainingCeiling,
  storeDailyTrainingCeiling,
  saveObservedTrainingRecovery,
  appendStoredTrainingGuardrailEvent,
  listStoredTrainingGuardrailEvents,
  listWorkoutLedgerEntriesForGuardrails,
  listEnduranceActivitiesForGuardrails,
  exportLocalData,
  deleteAllLocalData,
} from '../src/services/database';

const day = '2026-11-09';
function ceiling(minutes = 30): DailyTrainingCeiling {
  return {
    date: day,
    planned: [{ activity: 'strength', sessionId: 'S1', minutes, regions: ['general'] }],
    recovery: { general: 'uncertain', achilles: 'uncertain' },
    restrictUnplanned: true,
  };
}
function database() {
  if (!state.database) throw new Error('test SQLite database has not initialized');
  return state.database;
}
beforeAll(async () => { await initializeDatabase(); });
beforeEach(async () => {
  state.failRecoveryEventWrites = false;
  await deleteAllLocalData();
});

describe('guardrail SQLite integration', () => {
  it('persists per-athlete daily ceilings with insert-only and explicitly authorized update', async () => {
    await storeDailyTrainingCeiling('athlete-1', ceiling(30));
    await storeDailyTrainingCeiling('athlete-1', ceiling(60));
    await storeDailyTrainingCeiling('athlete-2', ceiling(60));
    expect((await getStoredDailyTrainingCeiling('athlete-1', day))?.planned[0]?.minutes).toBe(30);
    expect((await getStoredDailyTrainingCeiling('athlete-2', day))?.planned[0]?.minutes).toBe(60);
    await storeDailyTrainingCeiling('athlete-1', ceiling(20), true);
    expect((await getStoredDailyTrainingCeiling('athlete-1', day))?.planned[0]?.minutes).toBe(20);
  });

  it('atomically persists only explicitly checked regions, preserving the plan and another region', async () => {
    await storeDailyTrainingCeiling('athlete-1', ceiling(35));
    await saveObservedTrainingRecovery('athlete-1', day, { achilles: 'stable' });
    const saved = await getStoredDailyTrainingCeiling('athlete-1', day);
    expect(saved?.planned[0]?.minutes).toBe(35);
    expect(saved?.recovery.general).toBe('uncertain');
    expect(saved?.recovery.achilles).toBe('stable');
    expect(saved?.recoveryObservedAt?.achilles).toBeTruthy();
    expect(saved?.recoveryObservedAt?.general).toBeUndefined();
    const entries = await listStoredTrainingGuardrailEvents('athlete-1', day);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('recovery');
  });

  it('rolls back the recovery update when its audit event cannot be committed', async () => {
    await storeDailyTrainingCeiling('athlete-1', ceiling(35));
    state.failRecoveryEventWrites = true;
    await expect(saveObservedTrainingRecovery('athlete-1', day, {
      achilles: 'stable',
    })).rejects.toThrow('injected event insert failure');
    state.failRecoveryEventWrites = false;
    const stored = await getStoredDailyTrainingCeiling('athlete-1', day);
    expect(stored?.recovery.achilles).toBe('uncertain');
    expect(stored?.recoveryObservedAt?.achilles).toBeUndefined();
    expect(await listStoredTrainingGuardrailEvents('athlete-1', day)).toEqual([]);
  });

  it('deduplicates persisted audit events and isolates athletes', async () => {
    const event = {
      id: 'assessment-1', kind: 'assessment' as const, occurredAt: '2026-11-09T15:00:00Z',
    };
    await appendStoredTrainingGuardrailEvent('athlete-1', event, day);
    await appendStoredTrainingGuardrailEvent('athlete-1', event, day);
    await appendStoredTrainingGuardrailEvent('athlete-2', event, day);
    expect(await listStoredTrainingGuardrailEvents('athlete-1', day)).toHaveLength(1);
    expect(await listStoredTrainingGuardrailEvents('athlete-2', day)).toHaveLength(1);
  });

  it('fails closed when the saved daily ceiling cannot be parsed', async () => {
    database().exec(`INSERT INTO daily_training_ceilings
      (athlete_id, training_date, ceiling_json, created_at, updated_at)
      VALUES ('athlete-1', '${day}', '{broken', 'now', 'now')`);
    await expect(getStoredDailyTrainingCeiling('athlete-1', day)).rejects.toThrow('unreadable');
  });

  it('fails closed on corrupted audit history rather than dropping a potentially completed workout', async () => {
    database().exec(`INSERT INTO training_guardrail_events
      (athlete_id, id, training_date, kind, occurred_at, event_json)
      VALUES ('athlete-1', 'event-1', '${day}', 'completed', '2026-11-09T16:00:00Z', '{broken')`);
    await expect(listStoredTrainingGuardrailEvents('athlete-1', day)).rejects.toThrow('unreadable');
  });

  it('strictly rejects an invalid workout-ledger row', async () => {
    database().exec(`INSERT INTO workout_ledger
      (id, source, name, exercises_json, started_at, completed_at,
       completion_fraction, station_rounds_json, relation_to_plan, created_at, updated_at)
      VALUES ('w-1', 'generated', 'bad', '[]', '2026-11-09T15:00:00Z',
       '2026-11-09T16:00:00Z', -0.3, '{}', 'unrelated', 'now', 'now')`);
    await expect(listWorkoutLedgerEntriesForGuardrails({
      from: '2026-11-09T00:00:00Z', to: '2026-11-10T00:00:00Z',
    })).rejects.toThrow('unreadable');
  });

  it('strictly rejects a malformed imported endurance activity', async () => {
    database().exec(`INSERT INTO endurance_activities
      (id, source, external_id, activity_json, start_at, updated_at)
      VALUES ('ride-1', 'strava', 'external-1', '{broken', '2026-11-09T12:00:00Z', 'now')`);
    await expect(listEnduranceActivitiesForGuardrails({
      from: '2026-11-09T00:00:00Z', to: '2026-11-10T00:00:00Z',
    })).rejects.toThrow('unreadable');
  });

  it('includes ceilings and events in privacy export and delete-all', async () => {
    await storeDailyTrainingCeiling('athlete-1', ceiling());
    await appendStoredTrainingGuardrailEvent('athlete-1', {
      id: 'urge-1', kind: 'urge', occurredAt: '2026-11-09T20:00:00Z',
    }, day);
    const exported = await exportLocalData();
    expect(exported.daily_training_ceilings).toHaveLength(1);
    expect(exported.training_guardrail_events).toHaveLength(1);
    await deleteAllLocalData();
    expect(await getStoredDailyTrainingCeiling('athlete-1', day)).toBeNull();
    expect(await listStoredTrainingGuardrailEvents('athlete-1', day)).toEqual([]);
  });
});
