import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TrainingCalendarEvent } from '@circuit/domain';
import {
  PLAN_ADJUSTMENT_TABLE_SQL, appendTrainingAdjustmentDecision,
  readTrainingAdjustmentDecisions, effectiveTrainingCalendarEvents,
  type TrainingAdjustmentSqlDriver,
} from '../src/training-adjustment-sqlite';
import { rawGeneratedEventSignature, type PlanAdjustmentEvent } from '../src/training-plan-adjustments';

const folders: string[] = [];
const connections: DatabaseSync[] = [];
const base: TrainingCalendarEvent = {
  id: 'generated-bike', sourceId: 'side_quest_generated_plan',
  title: 'Endurance ride', discipline: 'bike', allDay: true,
  startAt: '2026-11-04T12:00:00.000Z',
  endAt: '2026-11-04T15:00:00.000Z',
  description: 'Side Quest generated · 180 min · easy',
};
function open(file: string) {
  const db = new DatabaseSync(file);
  connections.push(db);
  db.exec(`CREATE TABLE IF NOT EXISTS training_calendar_events
    (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL,
    event_json TEXT NOT NULL, start_at TEXT NOT NULL);
    ${PLAN_ADJUSTMENT_TABLE_SQL}`);
  const driver: TrainingAdjustmentSqlDriver = {
    getFirst: async <T>(q: string, p: Array<string | number | null>) =>
      (db.prepare(q).get(...p) as T | undefined) ?? null,
    getAll: async <T>(q: string, p: Array<string | number | null>) =>
      db.prepare(q).all(...p) as T[],
    run: async (q: string, p: Array<string | number | null>) => {
      db.prepare(q).run(...p);
    },
    transaction: async (f: () => Promise<void>) => {
      db.exec('BEGIN IMMEDIATE');
      try { await f(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, driver };
}
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sq-journey-'));
  folders.push(dir);
  return { file: join(dir, 'profile.sqlite'), ...open(join(dir, 'profile.sqlite')) };
}
function put(db: DatabaseSync, raw: TrainingCalendarEvent) {
  db.prepare(`INSERT OR REPLACE INTO training_calendar_events
    (id, source_id, event_json, start_at) VALUES (?, ?, ?, ?)`)
    .run(raw.id, raw.sourceId, JSON.stringify(raw), raw.startAt);
}
function decision(id: string, choice: PlanAdjustmentEvent['decision'],
  raw = base): PlanAdjustmentEvent {
  return {
    id, sourceEventId: raw.id, sourceSignature: rawGeneratedEventSignature(raw),
    decision: choice, action: 'shorten_20_percent', proposedMinutes: 144,
    createdAt: '2026-11-02T12:00:00.000Z',
  };
}
afterEach(() => {
  for (const db of connections.splice(0)) {
    try { db.close(); } catch { /* may have closed for restart */ }
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
describe('automated athlete journey: real SQLite save/restart/failure', () => {
  it('accepts, persists across restart, restores, and preserves immutable source', async () => {
    const a = setup(); put(a.db, base);
    await appendTrainingAdjustmentDecision(a.driver, decision('accept', 'accepted'));
    expect((await effectiveTrainingCalendarEvents(a.driver, [base]))
      .events[0]?.description).toContain('144 min');
    a.db.close();
    const b = open(a.file);
    expect((await effectiveTrainingCalendarEvents(b.driver, [base]))
      .events[0]?.description).toContain('144 min');
    await appendTrainingAdjustmentDecision(b.driver, decision('restore', 'restored'));
    b.db.close();
    const c = open(a.file);
    expect((await effectiveTrainingCalendarEvents(c.driver, [base])).events).toEqual([base]);
    expect((await readTrainingAdjustmentDecisions(c.driver)).map(x => x.decision))
      .toEqual(['accepted', 'restored']);
    const row = c.db.prepare('SELECT event_json FROM training_calendar_events WHERE id = ?')
      .get(base.id) as { event_json: string };
    expect(JSON.parse(row.event_json)).toEqual(base);
  });
  it('rejects failed persistence without declaring a successful adjustment', async () => {
    const a = setup(); put(a.db, base);
    const failing: TrainingAdjustmentSqlDriver = {
      ...a.driver,
      run: async () => { throw new Error('synthetic disk failure'); },
    };
    await expect(appendTrainingAdjustmentDecision(failing, decision('accept', 'accepted')))
      .rejects.toThrow('synthetic disk failure');
    expect(await readTrainingAdjustmentDecisions(a.driver)).toEqual([]);
    await appendTrainingAdjustmentDecision(a.driver, decision('retry', 'accepted'));
    expect(await readTrainingAdjustmentDecisions(a.driver)).toHaveLength(1);
  });
  it('rejects replay of accepted dose without adding another event', async () => {
    const a = setup(); put(a.db, base);
    await appendTrainingAdjustmentDecision(a.driver, decision('first', 'accepted'));
    await expect(appendTrainingAdjustmentDecision(a.driver, decision('second', 'accepted')))
      .rejects.toThrow(/already exists/);
    expect(await readTrainingAdjustmentDecisions(a.driver)).toHaveLength(1);
  });
  it('does not replay stale decisions onto regenerated workouts', async () => {
    const a = setup(); put(a.db, base);
    await appendTrainingAdjustmentDecision(a.driver, decision('first', 'accepted'));
    const changed = { ...base, title: 'Regenerated endurance ride' };
    put(a.db, changed);
    const visible = await effectiveTrainingCalendarEvents(a.driver, [changed]);
    expect(visible.events).toEqual([changed]);
    expect(visible.staleEventIds).toContain(base.id);
    await expect(appendTrainingAdjustmentDecision(a.driver, decision('restore', 'restored')))
      .rejects.toThrow(/changed/);
  });
  it('keeps athlete profile database decisions isolated', async () => {
    const a = setup(); put(a.db, base);
    const b = setup(); put(b.db, base);
    await appendTrainingAdjustmentDecision(a.driver, decision('a', 'accepted'));
    expect((await effectiveTrainingCalendarEvents(a.driver, [base]))
      .events[0]?.description).toContain('144 min');
    expect((await effectiveTrainingCalendarEvents(b.driver, [base])).events).toEqual([base]);
    expect(await readTrainingAdjustmentDecisions(b.driver)).toEqual([]);
  });
});
