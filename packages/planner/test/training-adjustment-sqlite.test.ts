import { afterEach, describe, expect, it } from 'vitest';
import {
  DatabaseSync,
} from 'node:sqlite';
import {
  copyFileSync, mkdtempSync, rmSync, existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TrainingCalendarEvent } from '@circuit/domain';
import {
  PLAN_ADJUSTMENT_TABLE_SQL, appendTrainingAdjustmentDecision,
  readTrainingAdjustmentDecisions, effectiveTrainingCalendarEvents,
  planAdjustmentDecisionsForLocalWeek,
  type TrainingAdjustmentSqlDriver,
} from '../src/training-adjustment-sqlite';
import {
  rawGeneratedEventSignature, type PlanAdjustmentEvent,
} from '../src/training-plan-adjustments';

const directories: string[] = [];
const connected: DatabaseSync[] = [];
function setup(name = 'athlete'): { db: DatabaseSync; file: string; driver: TrainingAdjustmentSqlDriver } {
  const dir = mkdtempSync(join(tmpdir(), 'sq-training-test-'));
  directories.push(dir);
  const file = join(dir, name + '.sqlite');
  return open(file);
}
function open(file: string) {
  const db = new DatabaseSync(file);
  connected.push(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_calendar_events (
      id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL,
      event_json TEXT NOT NULL, start_at TEXT NOT NULL
    );
    ${PLAN_ADJUSTMENT_TABLE_SQL}
  `);
  const driver: TrainingAdjustmentSqlDriver = {
    getFirst: async <T>(query: string, params: Array<string | number | null>) =>
      (db.prepare(query).get(...params) as T | undefined) ?? null,
    getAll: async <T>(query: string, params: Array<string | number | null>) =>
      db.prepare(query).all(...params) as T[],
    run: async (query: string, params: Array<string | number | null>) => {
      db.prepare(query).run(...params);
    },
    transaction: async (fn: () => Promise<void>) => {
      db.exec('BEGIN IMMEDIATE');
      try { await fn(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, driver, file };
}
afterEach(() => {
  for (const db of connected.splice(0)) {
    try { db.close(); } catch { /* already closed */ }
  }
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
const generated: TrainingCalendarEvent = {
  id: 'sq-plan-bike',
  sourceId: 'side_quest_generated_plan',
  title: 'Easy bike session',
  startAt: '2026-11-04T12:00:00.000Z',
  endAt: '2026-11-04T15:00:00.000Z',
  allDay: true,
  discipline: 'bike',
  description: 'Side Quest generated · 180 min · easy',
};
const external: TrainingCalendarEvent = {
  ...generated,
  id: 'trainingpeaks-workout',
  sourceId: 'trainingpeaks_ics',
  title: 'External commitment',
};
function rawWrite(db: DatabaseSync, event: TrainingCalendarEvent): void {
  db.prepare(`INSERT INTO training_calendar_events
    (id, source_id, event_json, start_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET event_json = excluded.event_json, start_at = excluded.start_at`)
    .run(event.id, event.sourceId, JSON.stringify(event), event.startAt);
}
function rawGet(db: DatabaseSync, id = generated.id): TrainingCalendarEvent {
  const row = db.prepare('SELECT event_json FROM training_calendar_events WHERE id = ?')
    .get(id) as { event_json: string };
  return JSON.parse(row.event_json) as TrainingCalendarEvent;
}
function decide(id: string, decision: PlanAdjustmentEvent['decision'],
  action: PlanAdjustmentEvent['action'] = 'shorten_20_percent',
  minutes: number | null = 144,
  raw = generated): PlanAdjustmentEvent {
  return {
    id, sourceEventId: raw.id, sourceSignature: rawGeneratedEventSignature(raw),
    action, decision, proposedMinutes: minutes, createdAt: '2026-11-02T12:00:00.000Z',
  };
}
describe('real-file SQLite training adjustment release gate', () => {
  it('accept → effective calendar → file-close/reopen → restore → file-close/reopen', async () => {
    const { db, file, driver } = setup();
    rawWrite(db, generated);
    rawWrite(db, external);
    await appendTrainingAdjustmentDecision(driver, decide('one', 'accepted'));
    const displayed = await effectiveTrainingCalendarEvents(driver, [rawGet(db), rawGet(db, external.id)]);
    expect(displayed.events[0]?.description).toContain('144 min');
    expect(displayed.events[1]).toEqual(external);
    expect(rawGet(db)).toEqual(generated);
    db.close();

    const second = open(file);
    const saved = await readTrainingAdjustmentDecisions(second.driver);
    expect(saved).toHaveLength(1);
    expect((await effectiveTrainingCalendarEvents(second.driver, [rawGet(second.db)]))
      .events[0]?.description).toContain('144 min');
    await appendTrainingAdjustmentDecision(second.driver, decide('undo', 'restored'));
    expect((await effectiveTrainingCalendarEvents(second.driver, [rawGet(second.db)])).events)
      .toEqual([generated]);
    second.db.close();

    const third = open(file);
    expect((await readTrainingAdjustmentDecisions(third.driver))
      .map(e => e.decision)).toEqual(['accepted', 'restored']);
    expect(rawGet(third.db)).toEqual(generated);
    expect((await effectiveTrainingCalendarEvents(third.driver, [rawGet(third.db)])).events)
      .toEqual([generated]);
  });
  it('defer never deletes raw training, and a decline leaves it visible', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    await appendTrainingAdjustmentDecision(
      driver, decide('defer', 'accepted', 'defer', null),
    );
    expect((await effectiveTrainingCalendarEvents(driver, [rawGet(db)])).events).toEqual([]);
    expect(rawGet(db)).toEqual(generated);
    await appendTrainingAdjustmentDecision(driver, decide('restore', 'restored', 'defer', null));
    expect((await effectiveTrainingCalendarEvents(driver, [rawGet(db)])).events)
      .toEqual([generated]);
    await appendTrainingAdjustmentDecision(driver, decide('decline', 'declined'));
    expect((await effectiveTrainingCalendarEvents(driver, [rawGet(db)])).events)
      .toEqual([generated]);
    expect((await readTrainingAdjustmentDecisions(driver)).length).toBe(3);
  });
  it('two athlete SQLite databases cannot read each other’s accepted overlays', async () => {
    const first = setup('profile-a');
    const second = setup('profile-b');
    rawWrite(first.db, generated);
    rawWrite(second.db, generated);
    await appendTrainingAdjustmentDecision(first.driver, decide('accepted-a', 'accepted'));
    expect((await effectiveTrainingCalendarEvents(first.driver, [rawGet(first.db)]))
      .events[0]?.description).toContain('144 min');
    expect((await effectiveTrainingCalendarEvents(second.driver, [rawGet(second.db)])).events)
      .toEqual([generated]);
    expect(await readTrainingAdjustmentDecisions(second.driver)).toEqual([]);
  });
  it('a closed SQLite database can be copied/restored without losing adjustment history', async () => {
    const first = setup();
    rawWrite(first.db, generated);
    await appendTrainingAdjustmentDecision(first.driver, decide('accepted', 'accepted'));
    first.db.close();
    const backup = first.file + '.backup.sqlite';
    copyFileSync(first.file, backup);
    expect(existsSync(backup)).toBe(true);
    const restored = open(backup);
    const result = await effectiveTrainingCalendarEvents(restored.driver, [rawGet(restored.db)]);
    expect(result.events[0]?.description).toContain('144 min');
    expect((await readTrainingAdjustmentDecisions(restored.driver))).toHaveLength(1);
  });
  it('rejects changed generator versions without overwriting the saved original', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    await appendTrainingAdjustmentDecision(driver, decide('accepted', 'accepted'));
    const regenerated = { ...generated, title: 'New long bike session' };
    rawWrite(db, regenerated);
    const result = await effectiveTrainingCalendarEvents(driver, [rawGet(db)]);
    expect(result.events).toEqual([regenerated]);
    expect(result.staleEventIds).toEqual([generated.id]);
    await expect(appendTrainingAdjustmentDecision(driver, decide('stale-restore', 'restored')))
      .rejects.toThrow(/changed/);
    expect(await readTrainingAdjustmentDecisions(driver)).toHaveLength(1);
  });
  it('rejects external calendar changes and invalid or inflated adjusted durations', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    rawWrite(db, external);
    await expect(appendTrainingAdjustmentDecision(driver, decide('external', 'accepted',
      'shorten_20_percent', 144, external))).rejects.toThrow(/changed/);
    await expect(appendTrainingAdjustmentDecision(driver, decide('inflated', 'accepted',
      'shorten_20_percent', 190))).rejects.toThrow(/reviewed adjustment/);
    await expect(appendTrainingAdjustmentDecision(driver, decide('invalid-defer', 'accepted',
      'defer', 140))).rejects.toThrow(/no planned duration/);
    expect(await readTrainingAdjustmentDecisions(driver)).toEqual([]);
  });
  it('rollback leaves accepted decision intact when a duplicate write fails', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    await appendTrainingAdjustmentDecision(driver, decide('accepted', 'accepted'));
    await expect(appendTrainingAdjustmentDecision(driver,
      decide('second', 'accepted'))).rejects.toThrow(/already exists/);
    await expect(appendTrainingAdjustmentDecision(driver, decide('accepted', 'restored')))
      .rejects.toThrow();
    expect((await readTrainingAdjustmentDecisions(driver))).toHaveLength(1);
    expect((await effectiveTrainingCalendarEvents(driver, [rawGet(db)]))
      .events[0]?.description).toContain('144 min');
  });
  it('rejects corrupt event audit rather than silently showing an unadjusted plan', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    db.prepare(`INSERT INTO training_plan_adjustment_events
      (id, source_event_id, decision_json, created_at) VALUES (?, ?, ?, ?)`)
      .run('corrupt', generated.id, '{broken', '2026-11-02T12:00:00Z');
    await expect(readTrainingAdjustmentDecisions(driver)).rejects.toThrow(/unreadable JSON/);
    await expect(effectiveTrainingCalendarEvents(driver, [rawGet(db)]))
      .rejects.toThrow(/unreadable JSON/);
  });
  it('keeps the original week audit visible when regeneration removes the source event', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    await appendTrainingAdjustmentDecision(driver, decide('accepted', 'accepted'));
    db.prepare('DELETE FROM training_calendar_events WHERE id = ?').run(generated.id);
    const allDecisions = await readTrainingAdjustmentDecisions(driver);
    expect(planAdjustmentDecisionsForLocalWeek(allDecisions,
      '2026-11-02', '2026-11-08')).toHaveLength(1);
    expect(planAdjustmentDecisionsForLocalWeek(allDecisions,
      '2026-11-09', '2026-11-15')).toHaveLength(0);
  });
  it('filters decisions by the raw event week without deleting older audit records', async () => {
    const { db, driver } = setup();
    rawWrite(db, generated);
    await appendTrainingAdjustmentDecision(driver, decide('accepted', 'accepted'));
    const outside = await readTrainingAdjustmentDecisions(driver, {
      from: '2026-11-09T00:00:00.000Z',
      to: '2026-11-16T00:00:00.000Z',
    });
    expect(outside).toHaveLength(0);
    const inside = await readTrainingAdjustmentDecisions(driver, {
      from: '2026-11-02T00:00:00.000Z',
      to: '2026-11-09T00:00:00.000Z',
    });
    expect(inside).toHaveLength(1);
  });
});
