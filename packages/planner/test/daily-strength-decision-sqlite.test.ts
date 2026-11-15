import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import type { TrainingAdjustmentSqlDriver } from '../src/training-adjustment-sqlite';
import {
  STRENGTH_CHOICE_AUDIT_SQL,
  appendStrengthChoiceDecision, effectiveStrengthChoice,
  readStrengthChoiceAudit, strengthSessionSignature,
  type StrengthChoiceDecision,
} from '../src/daily-strength-decision-sqlite';

const all: Array<{ db: DatabaseSync; directory: string }> = [];
const rawSession = (): PlannedStrengthSession => ({
  id: 'strength-1', date: '2026-11-17', order: 0,
  title: 'Synthetic strength', purpose: 'maintenance',
  intendedLoad: 'light', focusTargets: [],
  workout: { id: 'workout-1', estimatedElapsedSeconds: 2400, stations: [] } as unknown as PlannedStrengthSession['workout'],
  rationale: 'Synthetic test', completionStatus: 'planned',
});
const blockFor = (session = rawSession()): TrainingBlockPlan => ({
  id: 'block-1', createdAt: '2026-11-01T00:00:00Z',
  goal: { id: 'goal-1' }, weeks: [{ sessions: [session] }],
} as unknown as TrainingBlockPlan);

function open(athlete = 'synthetic-athlete-a') {
  const directory = mkdtempSync(join(tmpdir(), 'sq-strength-approval-'));
  const db = new DatabaseSync(join(directory, 'athlete.sqlite'));
  all.push({ db, directory });
  db.exec(`
    CREATE TABLE sidequest_athlete_database_owner(singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL);
    INSERT INTO sidequest_athlete_database_owner VALUES (1, '${athlete}');
    CREATE TABLE training_blocks(id TEXT PRIMARY KEY, block_json TEXT NOT NULL);
    ${STRENGTH_CHOICE_AUDIT_SQL}
  `);
  const driver: TrainingAdjustmentSqlDriver = {
    getFirst: async <T>(sql: string, params: Array<string | number | null>) =>
      db.prepare(sql).get(...params) as T | null,
    getAll: async <T>(sql: string, params: Array<string | number | null>) =>
      db.prepare(sql).all(...params) as T[],
    run: async (sql: string, params: Array<string | number | null>) => {
      db.prepare(sql).run(...params);
    },
    transaction: async (fn: () => Promise<void>) => {
      db.exec('BEGIN IMMEDIATE');
      try { await fn(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  const saveBlock = (block: TrainingBlockPlan) => {
    db.prepare('INSERT OR REPLACE INTO training_blocks VALUES (?, ?)').run(
      block.id, JSON.stringify(block),
    );
  };
  saveBlock(blockFor());
  return { db, driver, saveBlock };
}
afterEach(() => {
  for (const { db, directory } of all.splice(0)) {
    try { db.close(); } catch { /* closed explicitly */ }
    rmSync(directory, { recursive: true, force: true });
  }
});
function decision(action: 'reduce' | 'defer', choice: 'accepted' | 'restored' = 'accepted',
  id = 'approve'): StrengthChoiceDecision {
  const session = rawSession();
  return {
    id, athleteId: 'synthetic-athlete-a', blockId: 'block-1',
    sessionId: session.id, sourceSignature: strengthSessionSignature(session),
    action, decision: choice, proposedMinutes: action === 'reduce' ? 32 : null,
    createdAt: '2026-11-14T10:00:00Z',
  };
}
const review = { todayLocalDate: '2026-11-14', athleteConfirmed: true, safeToReview: true };

describe('real SQLite atomic strength approval and undo journal', () => {
  it('accepts a bounded reduction, keeps original workout untouched and restores it', async () => {
    const { driver, db } = open();
    const before = (db.prepare('SELECT block_json FROM training_blocks').get() as {block_json:string}).block_json;
    await appendStrengthChoiceDecision(driver, decision('reduce'), review);
    const saved = await readStrengthChoiceAudit(driver, 'synthetic-athlete-a', 'block-1', 'strength-1');
    expect(saved).toHaveLength(1);
    expect(effectiveStrengthChoice(rawSession(), saved).effectivePlanningMinutes).toBe(32);
    expect((db.prepare('SELECT block_json FROM training_blocks').get() as {block_json:string}).block_json).toBe(before);
    await appendStrengthChoiceDecision(driver, decision('reduce', 'restored', 'undo'), review);
    const history = await readStrengthChoiceAudit(driver, 'synthetic-athlete-a', 'block-1', 'strength-1');
    expect(history.map(item => item.decision)).toEqual(['accepted', 'restored']);
    expect(effectiveStrengthChoice(rawSession(), history).effectivePlanningMinutes).toBe(40);
  });
  it('defers without deleting the source and can undo', async () => {
    const { driver } = open();
    await appendStrengthChoiceDecision(driver, decision('defer'), review);
    const audit = await readStrengthChoiceAudit(driver, 'synthetic-athlete-a', 'block-1', 'strength-1');
    expect(effectiveStrengthChoice(rawSession(), audit).action).toBe('defer');
    expect(effectiveStrengthChoice(rawSession(), audit).effectivePlanningMinutes).toBeNull();
    await appendStrengthChoiceDecision(driver, decision('defer', 'restored', 'undo'), review);
    expect(effectiveStrengthChoice(rawSession(), await readStrengthChoiceAudit(
      driver, 'synthetic-athlete-a', 'block-1', 'strength-1',
    )).action).toBe('keep');
  });
  it('rejects wrong owner, changed workout and already completed sessions with zero audit writes', async () => {
    for (const mutation of ['owner', 'exercise', 'completed'] as const) {
      const { driver, saveBlock } = open(mutation === 'owner' ? 'synthetic-athlete-b' : 'synthetic-athlete-a');
      if (mutation === 'exercise') saveBlock(blockFor({
        ...rawSession(), workout: {
          ...rawSession().workout, id: 'regenerated',
        },
      }));
      if (mutation === 'completed') saveBlock(blockFor({
        ...rawSession(), completionStatus: 'completed',
      }));
      await expect(appendStrengthChoiceDecision(driver, decision('reduce'), review)).rejects.toThrow();
      expect(await readStrengthChoiceAudit(
        driver, 'synthetic-athlete-a', 'block-1', 'strength-1',
      )).toEqual([]);
    }
  });
  it('fails closed on absence of explicit approval, safe review or future session date', async () => {
    const { driver } = open();
    for (const candidate of [
      { ...review, athleteConfirmed: false },
      { ...review, safeToReview: false },
      { ...review, todayLocalDate: '2026-11-18' },
    ]) {
      await expect(appendStrengthChoiceDecision(driver, decision('reduce'), candidate)).rejects.toThrow();
    }
    expect(await readStrengthChoiceAudit(driver, 'synthetic-athlete-a', 'block-1', 'strength-1')).toEqual([]);
  });
  it('rejects dose increase, wrong percentage, duplicate acceptance and invalid undo atomically', async () => {
    const { driver } = open();
    await expect(appendStrengthChoiceDecision(driver, {
      ...decision('reduce'), proposedMinutes: 41,
    }, review)).rejects.toThrow();
    await expect(appendStrengthChoiceDecision(driver, decision('reduce', 'restored'), review))
      .rejects.toThrow(/Only the current/);
    await appendStrengthChoiceDecision(driver, decision('reduce'), review);
    await expect(appendStrengthChoiceDecision(driver, decision('reduce', 'accepted', 'again'), review))
      .rejects.toThrow(/already exists/);
    await expect(appendStrengthChoiceDecision(driver, decision('defer', 'restored', 'wrong-undo'), review))
      .rejects.toThrow(/Only the current/);
    expect(await readStrengthChoiceAudit(driver, 'synthetic-athlete-a', 'block-1', 'strength-1'))
      .toHaveLength(1);
  });
  it('marks old approvals stale if generator changes rather than applying them', async () => {
    const { driver } = open();
    await appendStrengthChoiceDecision(driver, decision('reduce'), review);
    const audit = await readStrengthChoiceAudit(driver, 'synthetic-athlete-a', 'block-1', 'strength-1');
    const changed = { ...rawSession(), title: 'New synthetic strength' };
    expect(effectiveStrengthChoice(changed, audit)).toMatchObject({
      stale: true, action: 'keep', effectivePlanningMinutes: 40,
    });
  });
});
