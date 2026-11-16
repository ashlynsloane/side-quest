import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GeneratedWorkout, PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import type { TrainingAdjustmentSqlDriver } from '../src/training-adjustment-sqlite';
import { STRENGTH_CHOICE_AUDIT_SQL, strengthSessionSignature, type StrengthChoiceDecision } from '../src/daily-strength-decision-sqlite';
import type { CurrentStrengthReviewEvidence } from '../src/strength-revision-decision-review';
import {
  STRENGTH_PREVIEW_REVIEW_EVENTS_SQL,
  readStrengthPreviewReviewState, appendStrengthPreviewReviewEvent,
  type StrengthPreviewReviewEvent,
} from '../src/strength-preview-review-events-sqlite';
import type { StoredStrengthRevisionPreview } from '../src/strength-revision-preview-sqlite';
import { listUnapprovedStrengthReviewInbox } from '../src/strength-revision-review-inbox';
import { readUnapprovedStrengthReviewDetail } from '../src/strength-revision-review-detail';
import { createStrengthReconciliationChecklist } from '../src/strength-evidence-reconciliation';
import { withUnapprovedStrengthReadSnapshot } from '../src/strength-review-read-snapshot';
import {
  TRAINING_SAFETY_CONTEXT_SQL, readAthleteTrainingSafetyContext,
  appendTrainingSafetyContextEvent, evaluateTrainingSafetyPolicy,
  type TrainingSafetyContextEvent, type ProtectedMovement,
} from '../src/training-safety-context-sqlite';
import {
  STRENGTH_EVIDENCE_PROVENANCE_SQL,
  readStrengthEvidenceProvenance, appendStrengthEvidenceProvenance,
  type StrengthEvidenceProvenanceEvent,
} from '../src/strength-evidence-provenance-sqlite';
import { summarizeUnapprovedStrengthRevision } from '../src/strength-revision-review-summary';
import {
  STRENGTH_REVISION_PREVIEW_SQL, appendStrengthRevisionPreview,
  readStrengthRevisionPreview, reassessStoredStrengthRevisionPreview,
} from '../src/strength-revision-preview-sqlite';

const all: Array<{ db: DatabaseSync; directory: string }> = [];
function sourceWorkout(): GeneratedWorkout {
  return {
    id: 'workout-1', name: 'Synthetic strength', createdAt: '2026-11-13T00:00:00Z',
    randomSeed: 'seed', request: {} as GeneratedWorkout['request'],
    stations: [{
      id: 'station-1', order: 0, durationSeconds: 1800,
      format: 'amrap', purpose: 'controlled movement',
      exercises: [{
        exerciseId: 'exercise-1', exerciseSnapshot: { id: 'exercise-1', name: 'Synthetic movement' },
        equipmentOptionId: 'bodyweight', prescriptionId: 'rx',
        target: 12, unit: 'total', order: 0,
      }],
    }],
    totalWorkSeconds: 1800, totalRestSeconds: 600, estimatedElapsedSeconds: 2400,
    requiredEquipment: [], targetRegions: [], recentLoadAdjustments: [], source: 'generated',
  } as unknown as GeneratedWorkout;
}
function sourceSession(): PlannedStrengthSession {
  return {
    id: 'session-1', date: '2026-11-17', order: 0,
    title: 'Synthetic strength', purpose: 'maintenance', intendedLoad: 'light',
    focusTargets: [], workout: sourceWorkout(), rationale: 'fixture',
    completionStatus: 'planned',
  };
}
function block(session = sourceSession(), id = 'block-1'): TrainingBlockPlan {
  return {
    id, createdAt: '2026-11-01T00:00:00Z', goal: { id: 'goal' },
    weeks: [{ sessions: [session] }],
  } as unknown as TrainingBlockPlan;
}
function candidate(): GeneratedWorkout {
  const original = sourceWorkout();
  return {
    ...original, estimatedElapsedSeconds: 1920,
    totalWorkSeconds: 1500, totalRestSeconds: 420,
    stations: [{ ...original.stations[0]!, durationSeconds: 1500,
      exercises: [{ ...original.stations[0]!.exercises[0]!, target: 8 }] }],
  };
}
function decision(): StrengthChoiceDecision {
  return {
    id: 'candidate-decision-1', athleteId: 'synthetic-athlete-a',
    blockId: 'block-1', sessionId: 'session-1',
    sourceSignature: strengthSessionSignature(sourceSession()),
    action: 'reduce', decision: 'accepted', proposedMinutes: 32,
    createdAt: '2026-11-15T10:00:00Z',
  };
}
function evidence(): CurrentStrengthReviewEvidence {
  return {
    athleteId: 'synthetic-athlete-a', todayLocalDate: '2026-11-15',
    symptoms: 'clear', readiness: 'reviewed_adequate',
    providerRestrictions: 'verified_none', sourceCoverage: 'complete',
    exerciseRestrictionsReviewed: true,
  };
}
function input() {
  return {
    id: 'preview-1', createdAt: '2026-11-15T11:00:00Z',
    source: sourceSession(), candidate: candidate(),
    decision: decision(), evidence: evidence(),
  };
}
function driver(db: DatabaseSync): TrainingAdjustmentSqlDriver {
  return {
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
    exclusiveTransaction: async <T>(
      fn: (writer: TrainingAdjustmentSqlDriver) => Promise<T>,
    ): Promise<T> => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const writer: TrainingAdjustmentSqlDriver = {
          getFirst: async <Row>(query: string, params: Array<string | number | null>) =>
            db.prepare(query).get(...params) as Row | null,
          getAll: async <Row>(query: string, params: Array<string | number | null>) =>
            db.prepare(query).all(...params) as Row[],
          run: async (query: string, params: Array<string | number | null>) => {
            db.prepare(query).run(...params);
          },
          transaction: async () => { throw new Error('Exclusive writer cannot nest.'); },
        };
        const result = await fn(writer);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    readSnapshot: async <T>(fn: (reader: TrainingAdjustmentSqlDriver) => Promise<T>): Promise<T> => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const reader: TrainingAdjustmentSqlDriver = {
          getFirst: async <Row>(query: string, params: Array<string | number | null>) =>
            db.prepare(query).get(...params) as Row | null,
          getAll: async <Row>(query: string, params: Array<string | number | null>) =>
            db.prepare(query).all(...params) as Row[],
          run: async () => { throw new Error('Read-only snapshot cannot write.'); },
          transaction: async () => { throw new Error('Read-only snapshot cannot nest.'); },
        };
        const result = await fn(reader);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
function open(owner = 'synthetic-athlete-a') {
  const directory = mkdtempSync(join(tmpdir(), 'sq-revision-preview-'));
  const file = join(directory, 'athlete.sqlite');
  const db = new DatabaseSync(file);
  all.push({ db, directory });
  db.exec(`
    CREATE TABLE sidequest_athlete_database_owner(singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE training_blocks(id TEXT PRIMARY KEY, block_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE workout_ledger(id TEXT PRIMARY KEY, planned_session_id TEXT);
    CREATE TABLE training_check_ins(
      id TEXT PRIMARY KEY, check_in_json TEXT NOT NULL,
      active INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE readiness_check_ins(
      date TEXT PRIMARY KEY, check_in_json TEXT NOT NULL
    );
    CREATE TABLE pt_profiles(
      id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    ${STRENGTH_REVISION_PREVIEW_SQL}
    ${STRENGTH_PREVIEW_REVIEW_EVENTS_SQL}
    ${STRENGTH_EVIDENCE_PROVENANCE_SQL}
    ${TRAINING_SAFETY_CONTEXT_SQL}
    ${STRENGTH_CHOICE_AUDIT_SQL}
  `);
  db.prepare('INSERT INTO sidequest_athlete_database_owner VALUES (?, ?)').run(1, owner);
  db.prepare('INSERT INTO training_check_ins VALUES (?, ?, ?, ?)').run(
    'checkin-1', JSON.stringify({
      status: 'normal', active: true,
      activeUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    }), 1, '2026-11-15T09:00:00Z',
  );
  db.prepare('INSERT INTO readiness_check_ins VALUES (?, ?)').run(
    '2026-11-15',
    JSON.stringify({ sleep: 4, energy: 4, muscleFreshness: 4, stress: 2, motivation: 4 }),
  );
  db.prepare('INSERT INTO pt_profiles VALUES (?, ?, ?)').run(
    'pt-1', JSON.stringify({ active: false }), '2026-11-15T09:00:00Z',
  );
  const saveBlock = (b: TrainingBlockPlan, updated = '2026-11-14T00:00:00Z') => {
    db.prepare('INSERT OR REPLACE INTO training_blocks VALUES (?, ?, ?)')
      .run(b.id, JSON.stringify(b), updated);
  };
  saveBlock(block());
  return { db, file, directory, sql: driver(db), saveBlock };
}
afterEach(() => {
  for (const { db, directory } of all.splice(0)) {
    try { db.close(); } catch { /* explicitly closed */ }
    rmSync(directory, { recursive: true, force: true });
  }
});
const count = (db: DatabaseSync, table: 'strength_revision_previews' | 'daily_strength_choice_events'
  | 'training_safety_context_events') =>
  (db.prepare('SELECT COUNT(*) AS n FROM ' + table).get() as { n: number }).n;

describe('immutable unapproved strength revision preview: actual SQLite file', () => {
  it('persists the exact candidate, leaves plan and approval journal untouched, and survives restart', async () => {
    const { db, sql, file, directory } = open();
    const before = db.prepare('SELECT block_json FROM training_blocks').get() as { block_json: string };
    const created = await appendStrengthRevisionPreview(sql, input());
    expect(created.status).toBe('unapproved');
    expect(created.executableWorkoutApproved).toBe(false);
    expect(count(db, 'strength_revision_previews')).toBe(1);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
    expect((db.prepare('SELECT block_json FROM training_blocks').get() as { block_json: string }).block_json)
      .toBe(before.block_json);
    db.close();
    const reopened = new DatabaseSync(file);
    all.push({ db: reopened, directory });
    const recovered = await readStrengthRevisionPreview(
      driver(reopened), 'synthetic-athlete-a', 'preview-1',
    );
    expect(recovered?.candidate).toEqual(candidate());
    expect(recovered?.binding).toEqual(created.binding);
    expect(recovered?.status).toBe('unapproved');
    const reassessed = await reassessStoredStrengthRevisionPreview(
      driver(reopened), 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(reassessed.status).toBe('reviewable_preview');
    expect(reassessed.executableWorkoutApproved).toBe(false);
    expect(reassessed.requiresWriteTimeRevalidation).toBe(true);
  });
  it('blocks wrong database owner or source plan changes without a preview write', async () => {
    const wrong = open('synthetic-athlete-b');
    await expect(appendStrengthRevisionPreview(wrong.sql, input()))
      .rejects.toThrow(/does not own/);
    expect(count(wrong.db, 'strength_revision_previews')).toBe(0);
    const stale = open();
    stale.saveBlock(block({ ...sourceSession(), title: 'Newly generated' }));
    await expect(appendStrengthRevisionPreview(stale.sql, input()))
      .rejects.toThrow(/changed during preview write/);
    expect(count(stale.db, 'strength_revision_previews')).toBe(0);
  });
  it('blocks obsolete source generation and already completed sessions', async () => {
    const replaced = open();
    replaced.saveBlock(block(sourceSession(), 'block-new'), '2026-11-15T12:00:00Z');
    await expect(appendStrengthRevisionPreview(replaced.sql, input()))
      .rejects.toThrow(/supersedes/);
    const completed = open();
    completed.db.prepare('INSERT INTO workout_ledger VALUES (?, ?)')
      .run('completed-1', 'session-1');
    await expect(appendStrengthRevisionPreview(completed.sql, input()))
      .rejects.toThrow(/completion record/);
    expect(count(completed.db, 'strength_revision_previews')).toBe(0);
  });
  it('rejects impossible or noncanonical preview timestamps before persistence', async () => {
    const { sql, db } = open();
    for (const createdAt of [
      '2026-02-30T11:00:00Z',
      '2026-11-15T25:00:00Z',
      '2026-11-15T11:00:00+00:00',
      '2026-11-15T11:00:00.0Z',
    ]) {
      const malformed = { ...input(), createdAt };
      await expect(appendStrengthRevisionPreview(sql, malformed))
        .rejects.toThrow(/valid timestamp/);
    }
    expect(count(db, 'strength_revision_previews')).toBe(0);
  });
  it('rejects invalid dose, changed exercises, and incomplete review evidence', async () => {
    const { db, sql } = open();
    const increased = input();
    increased.candidate.stations[0]!.exercises[0]!.target = 100;
    await expect(appendStrengthRevisionPreview(sql, increased)).rejects.toThrow(/not reviewable/);
    const unknown = input();
    unknown.evidence.sourceCoverage = 'unknown';
    await expect(appendStrengthRevisionPreview(sql, unknown)).rejects.toThrow(/not reviewable/);
    const extra = input();
    extra.decision.proposedMinutes = 50;
    await expect(appendStrengthRevisionPreview(sql, extra)).rejects.toThrow(/not reviewable/);
    expect(count(db, 'strength_revision_previews')).toBe(0);
  });
  it('reopening marks changes in plan, completed workout or review evidence stale', async () => {
    const regenerated = open();
    await appendStrengthRevisionPreview(regenerated.sql, input());
    regenerated.saveBlock(block({ ...sourceSession(), title: 'Changed' }));
    expect((await reassessStoredStrengthRevisionPreview(
      regenerated.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    )).status).toBe('stale');
    const completed = open();
    await appendStrengthRevisionPreview(completed.sql, input());
    completed.db.prepare('INSERT INTO workout_ledger VALUES (?, ?)')
      .run('ledger-1', 'session-1');
    const check = await reassessStoredStrengthRevisionPreview(
      completed.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(check.status).toBe('stale');
    expect(check.reasons.join(' ')).toMatch(/completion/);
    const newEvidence = open();
    await appendStrengthRevisionPreview(newEvidence.sql, input());
    expect((await reassessStoredStrengthRevisionPreview(
      newEvidence.sql, 'synthetic-athlete-a', 'preview-1',
      { ...evidence(), sourceCoverage: 'incomplete' },
    )).status).toBe('stale');
  });
  it('fails closed for tampered candidate, row metadata and unreadable payloads', async () => {
    for (const kind of ['candidate', 'row', 'json'] as const) {
      const { db, sql } = open();
      await appendStrengthRevisionPreview(sql, input());
      if (kind === 'candidate') {
        const stored = (db.prepare('SELECT preview_json FROM strength_revision_previews').get() as
          { preview_json: string }).preview_json;
        const parsed = JSON.parse(stored) as ReturnType<typeof input> & { status: string };
        parsed.candidate.stations[0]!.exercises[0]!.target = 900;
        db.prepare('UPDATE strength_revision_previews SET preview_json = ?')
          .run(JSON.stringify(parsed));
      } else if (kind === 'row') {
        db.prepare('UPDATE strength_revision_previews SET session_id = ?').run('different-session');
      } else {
        db.prepare('UPDATE strength_revision_previews SET preview_json = ?').run('{broken');
      }
      await expect(readStrengthRevisionPreview(
        sql, 'synthetic-athlete-a', 'preview-1',
      )).rejects.toThrow(/unreadable|integrity mismatch/);
    }
  });
  it('atomic failures and duplicate identities never overwrite an original preview', async () => {
    const { db, sql } = open();
    await expect(appendStrengthRevisionPreview({
      ...sql, run: async () => { throw new Error('injected SQLite interruption'); },
    }, input())).rejects.toThrow(/interruption/);
    expect(count(db, 'strength_revision_previews')).toBe(0);
    const before = await appendStrengthRevisionPreview(sql, input());
    const altered = input();
    altered.candidate.stations[0]!.exercises[0]!.target = 7;
    await expect(appendStrengthRevisionPreview(sql, altered)).rejects.toThrow();
    const after = await readStrengthRevisionPreview(sql, 'synthetic-athlete-a', 'preview-1');
    expect(after).toEqual(before);
    expect(count(db, 'strength_revision_previews')).toBe(1);
  });
  it('blocks conflicting accepted planning decisions at save and after reopen', async () => {
    const record = decision();
    const insert = (db: DatabaseSync) => db.prepare(`INSERT INTO daily_strength_choice_events
      (id, athlete_id, block_id, session_id, event_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      record.id, record.athleteId, record.blockId, record.sessionId,
      JSON.stringify(record), record.createdAt,
    );
    const existing = open();
    insert(existing.db);
    await expect(appendStrengthRevisionPreview(existing.sql, input()))
      .rejects.toThrow(/unresolved strength planning decision/);
    expect(count(existing.db, 'strength_revision_previews')).toBe(0);
    const newlyAccepted = open();
    const preview = await appendStrengthRevisionPreview(newlyAccepted.sql, input());
    insert(newlyAccepted.db);
    const rechecked = await reassessStoredStrengthRevisionPreview(
      newlyAccepted.sql, 'synthetic-athlete-a', preview.id, evidence(),
    );
    expect(rechecked.status).toBe('stale');
    expect(rechecked.reasons.join(' ')).toMatch(/planning decision supersedes/);
  });
  it('does not interpret a corrupt planning journal as no competing approval', async () => {
    const { db, sql } = open();
    const record = decision();
    db.prepare(`INSERT INTO daily_strength_choice_events
      (id, athlete_id, block_id, session_id, event_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      record.id, record.athleteId, record.blockId, record.sessionId,
      '{corrupt', record.createdAt,
    );
    await expect(appendStrengthRevisionPreview(sql, input()))
      .rejects.toThrow(/audit is unreadable/);
    expect(count(db, 'strength_revision_previews')).toBe(0);
  });
  it('refuses preview persistence when active PT restrictions or unknown symptoms exist', async () => {
    const activePT = open();
    activePT.db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
    await expect(appendStrengthRevisionPreview(activePT.sql, input()))
      .rejects.toThrow(/PT profile restrictions/);
    expect(count(activePT.db, 'strength_revision_previews')).toBe(0);
    const noSymptoms = open();
    noSymptoms.db.prepare('DELETE FROM training_check_ins').run();
    await expect(appendStrengthRevisionPreview(noSymptoms.sql, input()))
      .rejects.toThrow(/Current symptom check-in is missing/);
    expect(count(noSymptoms.db, 'strength_revision_previews')).toBe(0);
    const noReadiness = open();
    noReadiness.db.prepare('DELETE FROM readiness_check_ins').run();
    await expect(appendStrengthRevisionPreview(noReadiness.sql, input()))
      .rejects.toThrow(/Same-day readiness is missing/);
    expect(count(noReadiness.db, 'strength_revision_previews')).toBe(0);
  });
  it('reopening re-reads the current PT, symptom and readiness records', async () => {
    const changedPT = open();
    await appendStrengthRevisionPreview(changedPT.sql, input());
    changedPT.db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
    const ptResult = await reassessStoredStrengthRevisionPreview(
      changedPT.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(ptResult.status).toBe('stale');
    expect(ptResult.reasons.join(' ')).toMatch(/PT profile restrictions/);
    const changedSymptoms = open();
    await appendStrengthRevisionPreview(changedSymptoms.sql, input());
    changedSymptoms.db.prepare('UPDATE training_check_ins SET check_in_json = ?').run(
      JSON.stringify({
        status: 'tightness_pain', active: true,
        activeUntil: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    expect((await reassessStoredStrengthRevisionPreview(
      changedSymptoms.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    )).status).toBe('stale');
    const lowReadiness = open();
    await appendStrengthRevisionPreview(lowReadiness.sql, input());
    lowReadiness.db.prepare('UPDATE readiness_check_ins SET check_in_json = ?').run(
      JSON.stringify({ sleep: 1, energy: 1, muscleFreshness: 1, stress: 5, motivation: 1 }),
    );
    expect((await reassessStoredStrengthRevisionPreview(
      lowReadiness.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    )).status).toBe('stale');
  });
  it('expired or corrupt symptom records fail closed for new previews', async () => {
    for (const check of [
      { status: 'normal', active: true, activeUntil: '2020-01-01T00:00:00Z' },
      { status: 'normal', active: true },
      { status: 'normal', active: false, activeUntil: new Date(Date.now() + 86400000).toISOString() },
    ]) {
      const { db, sql } = open();
      db.prepare('UPDATE training_check_ins SET check_in_json = ?').run(JSON.stringify(check));
      await expect(appendStrengthRevisionPreview(sql, input()))
        .rejects.toThrow(/persisted safety evidence/);
      expect(count(db, 'strength_revision_previews')).toBe(0);
    }
  });
  it('copies the complete reviewed proposal before asynchronous caller mutations', async () => {
    const { sql } = open();
    const passed = input();
    let mutated = false;
    const changingDriver: TrainingAdjustmentSqlDriver = {
      ...sql,
      getFirst: async <T>(statement: string, params: Array<string | number | null>) => {
        if (!mutated && statement.includes('sidequest_athlete_database_owner')) {
          mutated = true;
          passed.candidate.stations[0]!.exercises[0]!.target = 900;
          passed.decision.proposedMinutes = 100;
          passed.evidence.symptoms = 'active';
        }
        return sql.getFirst<T>(statement, params);
      },
    };
    const stored = await appendStrengthRevisionPreview(changingDriver, passed);
    expect(mutated).toBe(true);
    expect(stored.candidate.stations[0]!.exercises[0]!.target).toBe(8);
    expect(stored.decision.proposedMinutes).toBe(32);
    expect(stored.evidence.symptoms).toBe('clear');
    const recovered = await readStrengthRevisionPreview(
      sql, 'synthetic-athlete-a', 'preview-1',
    );
    expect(recovered).toEqual(stored);
    expect(recovered?.executableWorkoutApproved).toBe(false);
  });
  it('wrong owner cannot read persisted previews', async () => {
    const { sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    await expect(readStrengthRevisionPreview(sql, 'other-athlete', 'preview-1'))
      .rejects.toThrow(/ownership mismatch/);
  });
});

function reviewEvent(
  preview: StoredStrengthRevisionPreview,
  action: 'dismiss' | 'restore',
  id = action + '-1',
  createdAt = action === 'dismiss'
    ? '2026-11-15T11:20:00Z' : '2026-11-15T11:30:00Z',
): StrengthPreviewReviewEvent {
  return {
    schemaVersion: 1, id, athleteId: 'synthetic-athlete-a',
    previewId: preview.id, bindingSignature: JSON.stringify(preview.binding),
    action, createdAt, executableWorkoutApproved: false,
  };
}
const reviewEventCount = (db: DatabaseSync) =>
  (db.prepare('SELECT COUNT(*) AS n FROM strength_revision_preview_review_events')
    .get() as { n: number }).n;

describe('reversible UNAPPROVED preview review lifecycle with SQLite', () => {
  it('dismisses, reopens, and reads full history after file restart with no workout approval', async () => {
    const { db, sql, file, directory } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    const initial = await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    );
    expect(initial).toMatchObject({
      status: 'pending_review', latestEventId: null,
      executableWorkoutApproved: false, requiresWriteTimeRevalidation: true,
    });
    await appendStrengthPreviewReviewEvent(sql, reviewEvent(stored, 'dismiss'));
    expect((await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    )).status).toBe('dismissed');
    db.close();
    const reopened = new DatabaseSync(file);
    all.push({ db: reopened, directory });
    const freshDriver = driver(reopened);
    await appendStrengthPreviewReviewEvent(
      freshDriver, reviewEvent(stored, 'restore'), 'dismiss-1',
    );
    const restored = await readStrengthPreviewReviewState(
      freshDriver, 'synthetic-athlete-a', stored.id,
    );
    expect(restored.status).toBe('pending_review');
    expect(restored.events.map(e => e.action)).toEqual(['dismiss', 'restore']);
    expect(restored.executableWorkoutApproved).toBe(false);
    expect((reopened.prepare('SELECT COUNT(*) AS n FROM daily_strength_choice_events')
      .get() as { n: number }).n).toBe(0);
    const persistedBlock = reopened.prepare(
      'SELECT block_json FROM training_blocks',
    ).get() as { block_json: string };
    expect(persistedBlock.block_json).toBe(JSON.stringify(block()));
  });
  it('never falls back to an interleavable transaction when exclusive write support is absent', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    await expect(appendStrengthPreviewReviewEvent(
      { ...sql, exclusiveTransaction: undefined },
      reviewEvent(stored, 'dismiss'), null,
    )).rejects.toThrow(/Exclusive strength review writes are unavailable/);
    expect(reviewEventCount(db)).toBe(0);
    expect((await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    )).status).toBe('pending_review');
  });
  it('rejects duplicate dismissal, orphan restoration and wrong athlete owner', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    await expect(appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'restore'), undefined,
    )).rejects.toThrow(/Only a dismissed/);
    await appendStrengthPreviewReviewEvent(sql, reviewEvent(stored, 'dismiss'));
    await expect(appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'dismiss', 'second-dismiss', '2026-11-15T11:25:00Z'),
    )).rejects.toThrow(/already dismissed/);
    await expect(readStrengthPreviewReviewState(
      sql, 'other-athlete', stored.id,
    )).rejects.toThrow(/ownership mismatch/);
    expect(reviewEventCount(db)).toBe(1);
  });
  it('reopens a stale draft for visibility without making it reviewable or executable', async () => {
    const { db, sql, saveBlock } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    saveBlock(block({ ...sourceSession(), title: 'Rebuilt source' }));
    await appendStrengthPreviewReviewEvent(sql, reviewEvent(stored, 'dismiss'), null);
    await appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'restore'), 'dismiss-1',
    );
    const state = await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    );
    expect(state.status).toBe('pending_review');
    const reassessed = await reassessStoredStrengthRevisionPreview(
      sql, 'synthetic-athlete-a', stored.id, evidence(),
    );
    expect(reassessed.status).toBe('stale');
    const inbox = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(),
    );
    expect(inbox[0]?.status).toBe('stale');
    expect(inbox[0]?.executableWorkoutApproved).toBe(false);
    expect(reviewEventCount(db)).toBe(2);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });
  it('reopens organizational visibility despite changed PT, symptoms and readiness, but preserves stale evidence', async () => {
    for (const change of ['pt', 'symptoms', 'readiness', 'evidence'] as const) {
      const { db, sql } = open();
      const stored = await appendStrengthRevisionPreview(sql, input());
      await appendStrengthPreviewReviewEvent(sql, reviewEvent(stored, 'dismiss'));
      if (change === 'pt') {
        db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
      } else if (change === 'symptoms') {
        db.prepare('UPDATE training_check_ins SET check_in_json = ?').run(
          JSON.stringify({
            status: 'tightness_pain', active: true,
            activeUntil: new Date(Date.now() + 86400000).toISOString(),
          }),
        );
      } else if (change === 'readiness') {
        db.prepare('UPDATE readiness_check_ins SET check_in_json = ?').run(
          JSON.stringify({ sleep: 1, energy: 1, muscleFreshness: 1, stress: 5, motivation: 1 }),
        );
      }
      const current = change === 'evidence'
        ? { ...evidence(), sourceCoverage: 'incomplete' as const } : evidence();
      await appendStrengthPreviewReviewEvent(
        sql, reviewEvent(stored, 'restore'), 'dismiss-1',
      );
      const inbox = await listUnapprovedStrengthReviewInbox(
        sql, 'synthetic-athlete-a', current,
      );
      expect(inbox[0]?.status).toBe('stale');
      expect(inbox[0]?.executableWorkoutApproved).toBe(false);
      expect(reviewEventCount(db)).toBe(2);
      expect(count(db, 'daily_strength_choice_events')).toBe(0);
    }
  });
  it('rejects outdated review actions even after a dismiss-restore cycle', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'dismiss'), null,
    );
    await appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'restore'), 'dismiss-1',
    );
    await expect(appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'dismiss', 'stale-again', '2026-11-15T11:40:00Z'),
      null,
    )).rejects.toThrow(/history changed/);
    expect(reviewEventCount(db)).toBe(2);
    await appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'dismiss', 'fresh-again', '2026-11-15T11:50:00Z'),
      'restore-1',
    );
    expect((await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    )).status).toBe('dismissed');
    expect(reviewEventCount(db)).toBe(3);
  });
  it('rejects malformed review event timestamps including normalized dates', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    for (const createdAt of [
      '2026-02-30T11:20:00Z',
      '2026-11-15T11:20:00+00:00',
      '2026-11-15T11:20:00.0Z',
    ]) {
      await expect(appendStrengthPreviewReviewEvent(
        sql, reviewEvent(stored, 'dismiss', 'bad-date', createdAt),
      )).rejects.toThrow(/Invalid unapproved preview review event/);
    }
    expect(reviewEventCount(db)).toBe(0);
  });
  it('detects forged impossible transitions, changed binding, and invalid JSON', async () => {
    for (const tamper of ['repeated', 'source', 'json'] as const) {
      const { db, sql } = open();
      const stored = await appendStrengthRevisionPreview(sql, input());
      const acceptedDismissal = reviewEvent(stored, 'dismiss');
      await appendStrengthPreviewReviewEvent(sql, acceptedDismissal);
      const forged = reviewEvent(
        stored, 'dismiss', 'forged', '2026-11-15T11:25:00Z',
      );
      if (tamper === 'source') forged.bindingSignature = 'different-binding';
      db.prepare(`INSERT INTO strength_revision_preview_review_events
        (id, athlete_id, preview_id, event_json, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        forged.id, forged.athleteId, forged.previewId,
        tamper === 'json' ? '{invalid-json' : JSON.stringify(forged), forged.createdAt,
      );
      await expect(readStrengthPreviewReviewState(
        sql, 'synthetic-athlete-a', stored.id,
      )).rejects.toThrow(/repeated dismissal|invalid or altered|unreadable/);
      await expect(appendStrengthPreviewReviewEvent(
        sql, reviewEvent(stored, 'restore'), undefined,
      )).rejects.toThrow();
      expect(reviewEventCount(db)).toBe(2);
    }
  });
  it('freezes the review audit payload before asynchronous caller mutation', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    const requested = reviewEvent(stored, 'dismiss', 'immutable-event');
    const originallySubmitted = JSON.stringify(requested);
    let mutated = false;
    const driver: TrainingAdjustmentSqlDriver = {
      ...sql,
      exclusiveTransaction: async <T>(
        operation: (writer: TrainingAdjustmentSqlDriver) => Promise<T>,
      ): Promise<T> => {
        if (!sql.exclusiveTransaction) throw new Error('Missing exclusive fixture.');
        return sql.exclusiveTransaction(writer => operation({
          ...writer,
          getFirst: async <Row>(
            query: string, params: Array<string | number | null>,
          ) => {
            if (!mutated) {
              mutated = true;
              requested.action = 'restore';
              requested.id = 'mutated-after-submit';
              requested.bindingSignature = 'forged-binding';
            }
            return writer.getFirst<Row>(query, params);
          },
        }));
      },
    };
    await appendStrengthPreviewReviewEvent(driver, requested, null);
    expect(mutated).toBe(true);
    expect((db.prepare('SELECT event_json FROM strength_revision_preview_review_events')
      .get() as { event_json: string }).event_json).toBe(originallySubmitted);
    expect((await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    )).status).toBe('dismissed');
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });
  it('injected SQL failure rolls back without changing preview or training history', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    const original = JSON.stringify(stored);
    await expect(appendStrengthPreviewReviewEvent({
      ...sql,
      exclusiveTransaction: async <T>(
        operation: (writer: TrainingAdjustmentSqlDriver) => Promise<T>,
      ): Promise<T> => {
        if (!sql.exclusiveTransaction) throw new Error('Missing exclusive fixture.');
        return sql.exclusiveTransaction(writer => operation({
          ...writer,
          run: async () => { throw new Error('injected SQLite write failure'); },
        }));
      },
    }, reviewEvent(stored, 'dismiss'))).rejects.toThrow(/injected SQLite/);
    expect(reviewEventCount(db)).toBe(0);
    expect((await readStrengthRevisionPreview(
      sql, 'synthetic-athlete-a', stored.id,
    ))).toEqual(JSON.parse(original));
    expect((await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    )).status).toBe('pending_review');
  });
});

describe('bounded owner-scoped read-only strength preview inbox', () => {
  it('lists pending and dismissed previews in newest-first order without approvals', async () => {
    const { db, sql } = open();
    const original = await appendStrengthRevisionPreview(sql, input());
    const later = input();
    later.id = 'preview-2';
    later.createdAt = '2026-11-15T12:00:00Z';
    later.decision.id = 'candidate-decision-2';
    await appendStrengthRevisionPreview(sql, later);
    const list = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(),
    );
    expect(list.map(item => item.previewId)).toEqual(['preview-2', 'preview-1']);
    expect(list.map(item => item.status)).toEqual(['needs_review', 'needs_review']);
    expect(list.every(item => item.executableWorkoutApproved === false)).toBe(true);
    await appendStrengthPreviewReviewEvent(sql, reviewEvent(original, 'dismiss'));
    const latest = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(),
    );
    expect(latest.map(item => item.status)).toEqual(['needs_review', 'dismissed']);
    expect((db.prepare('SELECT COUNT(*) AS n FROM daily_strength_choice_events')
      .get() as { n: number }).n).toBe(0);
  });
  it('paginates older drafts deterministically and rejects invalid offsets', async () => {
    const { sql } = open();
    for (let i = 0; i < 5; i += 1) {
      const proposal = input();
      proposal.id = 'paged-' + i;
      proposal.decision.id = 'decision-' + i;
      proposal.createdAt = '2026-11-15T11:0' + i + ':00Z';
      await appendStrengthRevisionPreview(sql, proposal);
    }
    const first = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(), 2, 0,
    );
    const second = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(), 2, 2,
    );
    const third = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(), 2, 4,
    );
    expect([...first, ...second, ...third].map(item => item.previewId))
      .toEqual(['paged-4', 'paged-3', 'paged-2', 'paged-1', 'paged-0']);
    for (const offset of [-1, 0.5, Infinity, Number.NaN]) {
      await expect(listUnapprovedStrengthReviewInbox(
        sql, 'synthetic-athlete-a', evidence(), 2, offset,
      )).rejects.toThrow(/offset/);
    }
  });
  it('marks superseded plans stale without hiding dismissed items or mutating records', async () => {
    const { db, sql, saveBlock } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthPreviewReviewEvent(sql, reviewEvent(stored, 'dismiss'));
    saveBlock(block({ ...sourceSession(), title: 'Regenerated' }));
    const inbox = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(),
    );
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      status: 'dismissed', stale: true,
      executableWorkoutApproved: false,
      requiresWriteTimeRevalidation: true,
    });
    expect(inbox[0]?.reasons.join(' ')).toMatch(/cannot be reviewed/);
    expect(reviewEventCount(db)).toBe(1);
  });
  it('never hides owner-tampered previews or review events from athlete history', async () => {
    const alteredPreview = open();
    await appendStrengthRevisionPreview(alteredPreview.sql, input());
    alteredPreview.db.prepare('UPDATE strength_revision_previews SET athlete_id = ?')
      .run('forged-athlete');
    await expect(readStrengthRevisionPreview(
      alteredPreview.sql, 'synthetic-athlete-a', 'preview-1',
    )).rejects.toThrow(/ownership mismatch/);
    await expect(listUnapprovedStrengthReviewInbox(
      alteredPreview.sql, 'synthetic-athlete-a', evidence(),
    )).rejects.toThrow(/wrong-owner audit record/);

    const alteredEvent = open();
    const stored = await appendStrengthRevisionPreview(alteredEvent.sql, input());
    await appendStrengthPreviewReviewEvent(
      alteredEvent.sql, reviewEvent(stored, 'dismiss'),
    );
    alteredEvent.db.prepare('UPDATE strength_revision_preview_review_events SET athlete_id = ?')
      .run('forged-athlete');
    await expect(readStrengthPreviewReviewState(
      alteredEvent.sql, 'synthetic-athlete-a', 'preview-1',
    )).rejects.toThrow(/invalid or altered event/);
    await expect(listUnapprovedStrengthReviewInbox(
      alteredEvent.sql, 'synthetic-athlete-a', evidence(),
    )).rejects.toThrow(/wrong-owner audit record/);
  });
  it('rejects wrong owner, invalid paging and corrupted history instead of omitting entries', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    await expect(listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', { ...evidence(), athleteId: 'another-athlete' },
    )).rejects.toThrow(/athlete evidence mismatch/);
    await expect(listUnapprovedStrengthReviewInbox(
      sql, 'wrong-athlete', { ...evidence(), athleteId: 'wrong-athlete' },
    )).rejects.toThrow(/database ownership mismatch/);
    for (const size of [0, -1, 51, Number.NaN, 2.5]) {
      await expect(listUnapprovedStrengthReviewInbox(
        sql, 'synthetic-athlete-a', evidence(), size,
      )).rejects.toThrow(/page size/);
    }
    expect(await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(), 1,
    )).toHaveLength(1);
    db.prepare('UPDATE strength_revision_previews SET preview_json = ?')
      .run('{unreadable');
    await expect(listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(),
    )).rejects.toThrow(/unreadable/);
  });
});

describe('read-only exact exercise dose change summary', () => {
  it('shows precise duration and repetitions differences but never clearance', async () => {
    const { sql } = open();
    const saved = await appendStrengthRevisionPreview(sql, input());
    const summary = summarizeUnapprovedStrengthRevision(saved);
    expect(summary).toMatchObject({
      previewId: 'preview-1', sourceTitle: 'Synthetic strength',
      originalSeconds: 2400, proposedSeconds: 1920,
      secondsReduced: 480, stationCountBefore: 1, stationCountAfter: 1,
      status: 'unapproved', executableWorkoutApproved: false,
      currentRestrictionsNotVerified: true,
      requiresWriteTimeRevalidation: true,
    });
    expect(summary.changes).toEqual([
      {
        kind: 'station_duration', stationId: 'station-1',
        exerciseId: null, label: 'controlled movement',
        before: 1800, after: 1500, unit: 'seconds',
      },
      {
        kind: 'exercise_target', stationId: 'station-1',
        exerciseId: 'exercise-1', label: 'Synthetic movement',
        before: 12, after: 8, unit: 'total',
      },
    ]);
  });
  it('compares omitted stations and exercises with a strict reduced-dose ceiling', async () => {
    const { sql, saveBlock } = open();
    const original = sourceSession();
    const first = original.workout.stations[0]!;
    const secondExercise = {
      ...first.exercises[0]!,
      exerciseId: 'exercise-2',
      exerciseSnapshot: { ...first.exercises[0]!.exerciseSnapshot, id: 'exercise-2',
        name: 'Synthetic second movement' },
      order: 1,
    };
    first.exercises.push(secondExercise);
    original.workout.stations.push({
      ...structuredClone(first), id: 'station-2', order: 1,
      purpose: 'secondary station', durationSeconds: 600,
      exercises: [{ ...structuredClone(secondExercise), exerciseId: 'exercise-3',
        exerciseSnapshot: { ...secondExercise.exerciseSnapshot,
          id: 'exercise-3', name: 'Synthetic third movement' }, order: 0 }],
    });
    original.workout.totalWorkSeconds = 2400;
    original.workout.estimatedElapsedSeconds = 3000;
    saveBlock(block(original));
    const revised = structuredClone(original.workout);
    revised.stations = [{
      ...structuredClone(original.workout.stations[0]!),
      exercises: [structuredClone(original.workout.stations[0]!.exercises[0]!)],
    }];
    revised.stations[0]!.exercises[0]!.target = 8;
    revised.totalWorkSeconds = 1800;
    revised.estimatedElapsedSeconds = 2400;
    const record = decision();
    record.sourceSignature = strengthSessionSignature(original);
    record.proposedMinutes = 40;
    const saved = await appendStrengthRevisionPreview(sql, {
      ...input(), source: original, candidate: revised, decision: record,
    });
    const summary = summarizeUnapprovedStrengthRevision(saved);
    expect(summary.stationCountBefore).toBe(2);
    expect(summary.stationCountAfter).toBe(1);
    expect(summary.changes.map(item => item.kind)).toContain('station_removed');
    expect(summary.changes.map(item => item.kind)).toContain('exercise_removed');
    expect(summary.changes.map(item => item.kind)).toContain('exercise_target');
    expect(summary.secondsReduced).toBe(600);
    expect(summary.executableWorkoutApproved).toBe(false);
  });
  it('shows reduced resistance with unchanged units and fails on increases', async () => {
    const { sql, saveBlock } = open();
    const original = sourceSession();
    const resistance = original.workout.stations[0]!.exercises[0]!;
    resistance.userLoadValue = 30;
    resistance.userLoadUnit = 'lb';
    saveBlock(block(original));
    const revised = structuredClone(original.workout);
    revised.stations[0]!.durationSeconds = 1500;
    revised.stations[0]!.exercises[0]!.target = 8;
    revised.stations[0]!.exercises[0]!.userLoadValue = 25;
    revised.estimatedElapsedSeconds = 1920;
    revised.totalWorkSeconds = 1500;
    revised.totalRestSeconds = 420;
    const record = decision();
    record.sourceSignature = strengthSessionSignature(original);
    const stored = await appendStrengthRevisionPreview(sql, {
      ...input(), source: original, candidate: revised, decision: record,
    });
    const summary = summarizeUnapprovedStrengthRevision(stored);
    expect(summary.changes).toContainEqual({
      kind: 'exercise_resistance', stationId: 'station-1',
      exerciseId: 'exercise-1', label: 'Synthetic movement',
      before: 30, after: 25, unit: 'lb',
    });
    const increased = structuredClone(stored);
    increased.candidate.stations[0]!.exercises[0]!.userLoadValue = 35;
    expect(() => summarizeUnapprovedStrengthRevision(increased))
      .toThrow(/does not match|unsafe/);
  });
  it('refuses to display a draft that claims execution was approved', async () => {
    const { sql } = open();
    const saved = await appendStrengthRevisionPreview(sql, input());
    const forged = structuredClone(saved);
    Object.assign(forged, { executableWorkoutApproved: true });
    expect(() => summarizeUnapprovedStrengthRevision(forged))
      .toThrow(/Only a verified, unapproved/);
  });
  it('never renders a tampered candidate or mismatched historical source', async () => {
    const { sql } = open();
    const saved = await appendStrengthRevisionPreview(sql, input());
    const alteredCandidate = structuredClone(saved);
    alteredCandidate.candidate.stations[0]!.exercises[0]!.target = 99;
    expect(() => summarizeUnapprovedStrengthRevision(alteredCandidate))
      .toThrow(/does not match|unsafe/);
    const alteredBinding = structuredClone(saved);
    alteredBinding.binding.sourceSignature = '{"unrelated":true}';
    expect(() => summarizeUnapprovedStrengthRevision(alteredBinding))
      .toThrow(/invalid|does not match/);
    const unreadableSource = structuredClone(saved);
    unreadableSource.binding.sourceSignature = '{broken';
    expect(() => summarizeUnapprovedStrengthRevision(unreadableSource))
      .toThrow(/unreadable/);
  });
});

describe('single owner-scoped read-only detail and fresh safety evidence', () => {
  it('shows exact saved dose and pending review without changing training data', async () => {
    const { db, sql } = open();
    const before = (db.prepare('SELECT block_json FROM training_blocks')
      .get() as { block_json: string }).block_json;
    await appendStrengthRevisionPreview(sql, input());
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(detail.status).toBe('pending_review');
    expect(detail.stale).toBe(false);
    expect(detail.summary.originalSeconds).toBe(2400);
    expect(detail.summary.proposedSeconds).toBe(1920);
    expect(detail.summary.changes.some(change => change.kind === 'exercise_target'))
      .toBe(true);
    expect(detail.executableWorkoutApproved).toBe(false);
    expect((db.prepare('SELECT block_json FROM training_blocks')
      .get() as { block_json: string }).block_json).toBe(before);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });
  it('retains historical exact comparison but reports changed PT/unknown evidence as stale', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
    const result = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(result.status).toBe('stale');
    expect(result.reasons.join(' ')).toMatch(/PT profile restrictions/);
    expect(result.summary.proposedSeconds).toBe(1920);
    expect(result.executableWorkoutApproved).toBe(false);

    const unknown = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', {
        ...evidence(), providerRestrictions: 'unknown',
      },
    );
    expect(unknown.status).toBe('stale');
  });
  it('rejects wrong athlete, invalid preview identity and corrupt candidate', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    await expect(readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', {
        ...evidence(), athleteId: 'different-athlete',
      },
    )).rejects.toThrow(/identity mismatch/);
    await expect(readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-b', 'preview-1', {
        ...evidence(), athleteId: 'synthetic-athlete-b',
      },
    )).rejects.toThrow(/ownership mismatch/);
    db.prepare('UPDATE strength_revision_previews SET preview_json = ?')
      .run('{invalid');
    await expect(readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    )).rejects.toThrow(/unreadable/);
  });
});

describe('consistent, read-only strength review database snapshots', () => {
  it('fails closed without an exclusive snapshot reader', async () => {
    const { sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    const unsupported = { ...sql, readSnapshot: undefined };
    await expect(readUnapprovedStrengthReviewDetail(
      unsupported, 'synthetic-athlete-a', 'preview-1', evidence(),
    )).rejects.toThrow(/Consistent strength review snapshot is unavailable/);
    await expect(listUnapprovedStrengthReviewInbox(
      unsupported, 'synthetic-athlete-a', evidence(),
    )).rejects.toThrow(/Consistent strength review snapshot is unavailable/);
  });

  it('holds one SQLite snapshot while competing PT writes are rejected, then sees new restrictions', async () => {
    const { db, sql, file } = open();
    await appendStrengthRevisionPreview(sql, input());
    const outsider = new DatabaseSync(file);
    outsider.exec('PRAGMA busy_timeout=0');
    let conflictObserved = false;
    try {
      const guarded: TrainingAdjustmentSqlDriver = {
        ...sql,
        readSnapshot: async <T>(fn: (reader: TrainingAdjustmentSqlDriver) => Promise<T>) => {
          if (!sql.readSnapshot) throw new Error('Missing test snapshot reader.');
          return sql.readSnapshot(async reader => {
            let checked = false;
            const inspected: TrainingAdjustmentSqlDriver = {
              ...reader,
              getFirst: async <Row>(query: string, params: Array<string | number | null>) => {
                if (!checked && query.includes('FROM pt_profiles')) {
                  checked = true;
                  expect(() => outsider.prepare(
                    'UPDATE pt_profiles SET profile_json = ?',
                  ).run('{"active":true}')).toThrow(/locked|busy/i);
                  conflictObserved = true;
                }
                return reader.getFirst<Row>(query, params);
              },
            };
            return fn(inspected);
          });
        },
      };
      const initial = await readUnapprovedStrengthReviewDetail(
        guarded, 'synthetic-athlete-a', 'preview-1', evidence(),
      );
      expect(conflictObserved).toBe(true);
      expect(initial.status).toBe('pending_review');
      outsider.prepare('UPDATE pt_profiles SET profile_json = ?')
        .run('{"active":true}');
      const changed = await readUnapprovedStrengthReviewDetail(
        sql, 'synthetic-athlete-a', 'preview-1', evidence(),
      );
      expect(changed.status).toBe('stale');
      expect(changed.reasons.join(' ')).toMatch(/PT profile restrictions/);
      expect((db.prepare('SELECT COUNT(*) AS n FROM daily_strength_choice_events')
        .get() as { n: number }).n).toBe(0);
    } finally {
      outsider.close();
    }
  });

  it('rejects SQL writes/nested transactions inside review snapshots and releases locks', async () => {
    const { sql, file } = open();
    await appendStrengthRevisionPreview(sql, input());
    await expect(withUnapprovedStrengthReadSnapshot(
      sql, async snapshot => snapshot.run(
        'DELETE FROM strength_revision_previews', [],
      ),
    )).rejects.toThrow(/Read-only snapshot cannot write/);
    await expect(withUnapprovedStrengthReadSnapshot(
      sql, async snapshot => snapshot.transaction(async () => {}),
    )).rejects.toThrow(/Read-only snapshot cannot nest/);
    const outsider = new DatabaseSync(file);
    try {
      // An aborted read must not leave a locked database or a hidden deletion.
      expect(outsider.prepare('SELECT COUNT(*) AS n FROM strength_revision_previews')
        .get()).toMatchObject({ n: 1 });
      outsider.prepare('UPDATE pt_profiles SET profile_json = ?')
        .run('{"active":true}');
    } finally {
      outsider.close();
    }
  });

  it('inbox and detail each invoke exactly one snapshot, never a separate live read', async () => {
    const { sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    let snapshots = 0;
    const guarded: TrainingAdjustmentSqlDriver = {
      ...sql,
      getFirst: async () => {
        throw new Error('Unprotected read outside review snapshot.');
      },
      getAll: async () => {
        throw new Error('Unprotected list outside review snapshot.');
      },
      readSnapshot: async <T>(fn: (reader: TrainingAdjustmentSqlDriver) => Promise<T>) => {
        snapshots += 1;
        if (!sql.readSnapshot) throw new Error('Missing test snapshot reader.');
        return sql.readSnapshot(fn);
      },
    };
    expect((await readUnapprovedStrengthReviewDetail(
      guarded, 'synthetic-athlete-a', 'preview-1', evidence(),
    )).status).toBe('pending_review');
    expect(snapshots).toBe(1);
    expect(await listUnapprovedStrengthReviewInbox(
      guarded, 'synthetic-athlete-a', evidence(), 1,
    )).toHaveLength(1);
    expect(snapshots).toBe(2);
  });
});

describe('non-executable strength approval prerequisite diagnostics', () => {
  it('never treats caller-asserted verified provider data as authoritative approval', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(detail.preflight.schemaVersion).toBe(1);
    expect(detail.preflight.gates).toHaveLength(12);
    expect(detail.preflight.executableWorkoutApproved).toBe(false);
    expect(detail.preflight.canConfirmExecutableWorkout).toBe(false);
    expect(detail.preflight.requiresIndependentProviderVerification).toBe(true);
    expect(detail.preflight.requiresWriteTimeRevalidation).toBe(true);
    expect(detail.preflight.gates.find(g => g.id === 'source_identity')?.status)
      .toBe('local_check_passed');
    expect(detail.preflight.gates.find(g => g.id === 'candidate_structure')?.status)
      .toBe('local_check_passed');
    expect(detail.preflight.gates.find(g => g.id === 'symptom_check_in')?.status)
      .toBe('local_check_passed');
    expect(detail.preflight.gates.find(g => g.id === 'local_pt_profile')?.status)
      .toBe('local_check_passed');
    expect(detail.preflight.gates.find(g => g.id === 'external_provider_restrictions')?.status)
      .toBe('unverified');
    expect(detail.preflight.gates.find(g => g.id === 'source_provenance')?.status)
      .toBe('unverified');
    expect(detail.preflight.gates.find(g => g.id === 'athlete_execution_confirmation')?.status)
      .toBe('not_implemented');
    expect(detail.preflight.gates.find(g => g.id === 'executable_write_authorization')?.status)
      .toBe('not_implemented');
    expect(detail.preflight.blockingGateCount).toBeGreaterThanOrEqual(4);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
    expect(count(db, 'strength_revision_previews')).toBe(1);
  });

  it('diagnoses missing and changed local symptoms, readiness and PT independently', async () => {
    for (const change of ['symptoms', 'readiness', 'pt'] as const) {
      const { db, sql } = open();
      await appendStrengthRevisionPreview(sql, input());
      if (change === 'symptoms') {
        db.prepare('DELETE FROM training_check_ins').run();
      } else if (change === 'readiness') {
        db.prepare('UPDATE readiness_check_ins SET check_in_json = ?').run(
          JSON.stringify({
            sleep: 1, energy: 1, muscleFreshness: 1, stress: 5, motivation: 1,
          }),
        );
      } else {
        db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
      }
      const detail = await readUnapprovedStrengthReviewDetail(
        sql, 'synthetic-athlete-a', 'preview-1', evidence(),
      );
      const id = change === 'symptoms' ? 'symptom_check_in'
        : change === 'readiness' ? 'readiness_check_in' : 'local_pt_profile';
      expect(detail.preflight.gates.find(g => g.id === id)?.status).toBe('blocked');
      expect(detail.preflight.executableWorkoutApproved).toBe(false);
      expect(detail.preflight.canConfirmExecutableWorkout).toBe(false);
      expect(detail.preflight.gates.find(
        g => g.id === 'external_provider_restrictions',
      )?.status).toBe('unverified');
      expect(count(db, 'daily_strength_choice_events')).toBe(0);
    }
  });

  it('reports source regeneration, existing completion, conflicting decisions and dismissal', async () => {
    const regenerated = open();
    await appendStrengthRevisionPreview(regenerated.sql, input());
    regenerated.saveBlock(block({ ...sourceSession(), title: 'A new source plan' }));
    const stale = await readUnapprovedStrengthReviewDetail(
      regenerated.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(stale.preflight.gates.find(g => g.id === 'source_identity')?.status)
      .toBe('blocked');
    expect(stale.preflight.gates.find(g => g.id === 'candidate_structure')?.status)
      .toBe('blocked');

    const completed = open();
    await appendStrengthRevisionPreview(completed.sql, input());
    completed.db.prepare('INSERT INTO workout_ledger VALUES (?, ?)')
      .run('finished-a', 'session-1');
    const previouslyCompleted = await readUnapprovedStrengthReviewDetail(
      completed.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(previouslyCompleted.preflight.gates.find(
      g => g.id === 'session_uncompleted',
    )?.status).toBe('blocked');

    const dismissed = open();
    const preview = await appendStrengthRevisionPreview(dismissed.sql, input());
    await appendStrengthPreviewReviewEvent(
      dismissed.sql, reviewEvent(preview, 'dismiss'), null,
    );
    const hidden = await readUnapprovedStrengthReviewDetail(
      dismissed.sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(hidden.preflight.gates.find(g => g.id === 'review_disposition')?.status)
      .toBe('blocked');
    expect(hidden.preflight.canConfirmExecutableWorkout).toBe(false);
  });

  it('always reports the missing executable write gate even with all available local checks', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    const read = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    const returned = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', {
        ...evidence(), todayLocalDate: '2026-11-16',
        providerRestrictions: 'reviewed_applicable', sourceCoverage: 'complete',
      },
    );
    for (const result of [read, returned]) {
      expect(result.preflight.gates.find(
        gate => gate.id === 'executable_write_authorization',
      )?.status).toBe('not_implemented');
      expect(result.preflight.executableWorkoutApproved).toBe(false);
      expect(result.preflight.canConfirmExecutableWorkout).toBe(false);
    }
    expect(count(db, 'strength_revision_previews')).toBe(1);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });
});

function reportedEvidence(
  preview: StoredStrengthRevisionPreview,
  kind: 'provider_restriction' | 'training_coverage',
  claim: StrengthEvidenceProvenanceEvent['claim'],
  id: string,
  recordedAt = '2026-11-15T12:00:00Z',
): StrengthEvidenceProvenanceEvent {
  return {
    schemaVersion: 1, id,
    athleteId: 'synthetic-athlete-a', previewId: preview.id,
    bindingSignature: JSON.stringify(preview.binding),
    kind, source: 'athlete_self_report', claim, sourceReference: null,
    observedAt: recordedAt, recordedAt, expiresAt: null,
    verification: 'unverified', executableWorkoutApproved: false,
  };
}
const provenanceRows = (db: DatabaseSync) =>
  (db.prepare('SELECT COUNT(*) AS n FROM strength_evidence_provenance_events')
    .get() as { n: number }).n;

describe('durable unverified restriction and training provenance', () => {
  it('missing source records never become independent clinical verification', async () => {
    const { sql } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    const ledger = await readStrengthEvidenceProvenance(
      sql, 'synthetic-athlete-a', preview.id,
    );
    expect(ledger.events).toEqual([]);
    expect(ledger.restriction.status).toBe('missing');
    expect(ledger.coverage.status).toBe('missing');
    expect(ledger.independentlyVerified).toBe(false);
    expect(ledger.executableWorkoutApproved).toBe(false);
  });
  it('reports an active restriction and makes detail/inbox stale without modifying exercise', async () => {
    const { sql, db } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    const originalPlan = (db.prepare('SELECT block_json FROM training_blocks')
      .get() as { block_json: string }).block_json;
    const report = reportedEvidence(
      preview, 'provider_restriction', 'reported_present', 'reported-restriction',
    );
    await appendStrengthEvidenceProvenance(sql, report, null);
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', preview.id, evidence(),
    );
    expect(detail.provenance.restriction.status).toBe('reported_restriction');
    expect(detail.provenance.restriction.independentlyVerified).toBe(false);
    expect(detail.preflight.gates.find(
      gate => gate.id === 'external_provider_restrictions',
    )?.status).toBe('blocked');
    expect(detail.stale).toBe(true);
    expect(detail.preflight.canConfirmExecutableWorkout).toBe(false);
    const inbox = await listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(),
    );
    expect(inbox[0]?.status).toBe('stale');
    expect(inbox[0]?.reasons.join(' ')).toMatch(/provider restriction claims/);
    expect(provenanceRows(db)).toBe(1);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
    expect((db.prepare('SELECT block_json FROM training_blocks')
      .get() as { block_json: string }).block_json).toBe(originalPlan);
  });
  it('flagging incomplete training coverage blocks preflight and survives file restart', async () => {
    const { sql, db, file, directory } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthEvidenceProvenance(sql, reportedEvidence(
      preview, 'training_coverage', 'partial', 'partial-coverage',
    ), null);
    db.close();
    const reopened = new DatabaseSync(file);
    all.push({ db: reopened, directory });
    const reader = driver(reopened);
    const detail = await readUnapprovedStrengthReviewDetail(
      reader, 'synthetic-athlete-a', preview.id, evidence(),
    );
    expect(detail.provenance.coverage.status).toBe('partial');
    expect(detail.provenance.coverage.eventCount).toBe(1);
    expect(detail.preflight.gates.find(g => g.id === 'source_provenance')?.status)
      .toBe('blocked');
    expect(detail.provenance.events.map(e => e.id)).toEqual(['partial-coverage']);
    expect(detail.executableWorkoutApproved).toBe(false);
  });
  it('never clears conflicting claims based on a later self-report of no restrictions', async () => {
    const { db, sql } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthEvidenceProvenance(sql, reportedEvidence(
      preview, 'provider_restriction', 'reported_present', 'restriction-on',
    ), null);
    await appendStrengthEvidenceProvenance(sql, reportedEvidence(
      preview, 'provider_restriction', 'reported_none', 'restriction-off',
      '2026-11-15T12:01:00Z',
    ), 'restriction-on');
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', preview.id, evidence(),
    );
    expect(detail.provenance.restriction.status).toBe('conflicting');
    expect(detail.preflight.gates.find(
      gate => gate.id === 'external_provider_restrictions',
    )?.status).toBe('blocked');
    expect(detail.preflight.executableWorkoutApproved).toBe(false);
    expect(provenanceRows(db)).toBe(2);
  });
  it('detects obsolete claims and refuses clinician-sounding source labels as clearance', async () => {
    const { sql, db } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    const observation = reportedEvidence(
      preview, 'provider_restriction', 'reported_none',
      'unverified-clinician-reference', '2026-10-01T12:00:00Z',
    );
    observation.source = 'document_reference';
    observation.sourceReference = 'reviewed-note-id';
    await appendStrengthEvidenceProvenance(sql, observation, null);
    const ledger = await readStrengthEvidenceProvenance(
      sql, 'synthetic-athlete-a', preview.id,
      Date.parse('2026-11-16T12:00:00Z'),
    );
    expect(ledger.restriction.status).toBe('expired');
    expect(ledger.restriction.independentlyVerified).toBe(false);
    expect(ledger.restriction.applicableRestrictionsCleared).toBe(false);
    expect(provenanceRows(db)).toBe(1);
  });
  it('rejects forgery, noncanonical timestamps, unsupported claims, and missing references', async () => {
    const { sql, db } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    for (const alter of [
      (e: StrengthEvidenceProvenanceEvent) => { e.verification = 'verified' as 'unverified'; },
      (e: StrengthEvidenceProvenanceEvent) => {
        (e as StrengthEvidenceProvenanceEvent & { independentlyVerified?: boolean })
          .independentlyVerified = true;
      },
      (e: StrengthEvidenceProvenanceEvent) => { e.executableWorkoutApproved = true as false; },
      (e: StrengthEvidenceProvenanceEvent) => { e.claim = 'claimed_complete'; },
      (e: StrengthEvidenceProvenanceEvent) => { e.recordedAt = '2026-02-30T12:00:00Z'; },
      (e: StrengthEvidenceProvenanceEvent) => { e.source = 'document_reference'; },
      (e: StrengthEvidenceProvenanceEvent) => { e.observedAt = '2026-11-16T12:00:00Z'; },
    ]) {
      const bad = reportedEvidence(preview, 'provider_restriction', 'reported_present', 'bad');
      alter(bad);
      await expect(appendStrengthEvidenceProvenance(sql, bad, null))
        .rejects.toThrow(/Invalid unverified evidence provenance/);
    }
    expect(provenanceRows(db)).toBe(0);
  });
  it('prevents lost updates and wrong-owner reads and fails closed on corrupted audit row', async () => {
    const { sql, db } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    const first = reportedEvidence(
      preview, 'training_coverage', 'partial', 'first-coverage',
    );
    await appendStrengthEvidenceProvenance(sql, first, null);
    await expect(appendStrengthEvidenceProvenance(sql, reportedEvidence(
      preview, 'training_coverage', 'claimed_complete', 'second-coverage',
      '2026-11-15T12:02:00Z',
    ), null)).rejects.toThrow(/history changed/);
    await expect(readStrengthEvidenceProvenance(
      sql, 'different-athlete', preview.id,
    )).rejects.toThrow(/ownership mismatch/);
    db.prepare('UPDATE strength_evidence_provenance_events SET athlete_id = ?')
      .run('forged-owner');
    await expect(readStrengthEvidenceProvenance(
      sql, 'synthetic-athlete-a', preview.id,
    )).rejects.toThrow(/identity or verification metadata mismatch/);
    expect(provenanceRows(db)).toBe(1);
  });
  it('rejects forged verification claims injected into a previously stored JSON event', async () => {
    for (const injection of ['verification', 'extra_field'] as const) {
      const { db, sql } = open();
      const preview = await appendStrengthRevisionPreview(sql, input());
      const event = reportedEvidence(
        preview, 'provider_restriction', 'reported_none', 'original',
      );
      await appendStrengthEvidenceProvenance(sql, event, null);
      const parsed = { ...event } as Record<string, unknown>;
      if (injection === 'verification') {
        parsed.verification = 'verified';
      } else {
        parsed.independentlyVerified = true;
      }
      db.prepare('UPDATE strength_evidence_provenance_events SET event_json = ?')
        .run(JSON.stringify(parsed));
      await expect(readStrengthEvidenceProvenance(
        sql, 'synthetic-athlete-a', preview.id,
      )).rejects.toThrow(/identity or verification metadata mismatch/);
      await expect(readUnapprovedStrengthReviewDetail(
        sql, 'synthetic-athlete-a', preview.id, evidence(),
      )).rejects.toThrow(/identity or verification metadata mismatch/);
      expect(provenanceRows(db)).toBe(1);
    }
  });
  it('atomic write interruption leaves review and training journals unchanged', async () => {
    const { db, sql } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    const interrupted: TrainingAdjustmentSqlDriver = {
      ...sql,
      exclusiveTransaction: async <T>(
        operation: (writer: TrainingAdjustmentSqlDriver) => Promise<T>,
      ): Promise<T> => {
        if (!sql.exclusiveTransaction) throw new Error('No exclusive fixture.');
        return sql.exclusiveTransaction(writer => operation({
          ...writer,
          run: async () => { throw new Error('synthetic evidence write failure'); },
        }));
      },
    };
    await expect(appendStrengthEvidenceProvenance(
      interrupted, reportedEvidence(
        preview, 'provider_restriction', 'reported_present', 'interrupted',
      ), null,
    )).rejects.toThrow(/synthetic evidence write failure/);
    expect(provenanceRows(db)).toBe(0);
    expect(count(db, 'strength_revision_previews')).toBe(1);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
    await appendStrengthEvidenceProvenance(
      sql, reportedEvidence(
        preview, 'provider_restriction', 'reported_present', 'recovered',
      ), null,
    );
    expect(provenanceRows(db)).toBe(1);
  });
  it('will not downgrade transaction isolation for a provenance write', async () => {
    const { sql, db } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    await expect(appendStrengthEvidenceProvenance(
      { ...sql, exclusiveTransaction: undefined },
      reportedEvidence(preview, 'provider_restriction', 'reported_present', 'unsafe'),
      null,
    )).rejects.toThrow(/Exclusive evidence provenance writes are unavailable/);
    expect(provenanceRows(db)).toBe(0);
  });
});

describe('fail-closed evidence reconciliation and source integrity', () => {
  it('provides a concrete checklist without treating local checks as clinical clearance', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(detail.reconciliation.schemaVersion).toBe(1);
    expect(detail.reconciliation.executableWorkoutApproved).toBe(false);
    expect(detail.reconciliation.canConfirmExecutableWorkout).toBe(false);
    expect(detail.reconciliation.clinicalSourceVerificationRequired).toBe(true);
    expect(detail.reconciliation.unresolvedCount).toBe(
      detail.preflight.blockingGateCount,
    );
    expect(detail.reconciliation.tasks.map(task => task.id)).toEqual([
      'external_provider_restrictions', 'source_provenance',
      'athlete_execution_confirmation', 'executable_write_authorization',
    ]);
    expect(detail.reconciliation.tasks.every(task =>
      task.canResolveAutomatically === false && task.nextStep.length > 25,
    )).toBe(true);
    const ledgerCount = db.prepare('SELECT COUNT(*) AS n FROM workout_ledger')
      .get() as { n: number };
    expect(ledgerCount.n).toBe(0);
  });

  it('prioritizes reported restrictions and missing source coverage without allowing a clearing self-report', async () => {
    const { sql } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthEvidenceProvenance(
      sql, reportedEvidence(
        preview, 'provider_restriction', 'reported_present', 'restriction1',
      ), null,
    );
    await appendStrengthEvidenceProvenance(
      sql, reportedEvidence(
        preview, 'provider_restriction', 'reported_none',
        'no-restrictions', '2026-11-15T12:01:00Z',
      ), 'restriction1',
    );
    await appendStrengthEvidenceProvenance(
      sql, reportedEvidence(
        preview, 'training_coverage', 'partial', 'missing-history',
        '2026-11-15T12:02:00Z',
      ), null,
    );
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(detail.provenance.restriction.status).toBe('conflicting');
    const clinician = detail.reconciliation.tasks.find(task =>
      task.id === 'external_provider_restrictions');
    expect(clinician?.kind).toBe('safety_hold');
    expect(clinician?.nextStep).toMatch(/Resolve contradictory restriction reports/);
    const coverage = detail.reconciliation.tasks.find(task =>
      task.id === 'source_provenance');
    expect(coverage?.kind).toBe('safety_hold');
    expect(coverage?.nextStep).toMatch(/missing workouts/);
    expect(detail.reconciliation.canConfirmExecutableWorkout).toBe(false);
  });

  it('highlights missing current check-ins without misclassifying them as external verification', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    db.prepare('DELETE FROM training_check_ins').run();
    db.prepare('DELETE FROM readiness_check_ins').run();
    db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    for (const id of ['symptom_check_in', 'readiness_check_in',
      'local_pt_profile']) {
      const task = detail.reconciliation.tasks.find(item => item.id === id);
      expect(task?.kind).toBe('safety_hold');
      expect(task?.canResolveAutomatically).toBe(false);
    }
    expect(detail.reconciliation.tasks.find(item =>
      item.id === 'external_provider_restrictions')?.kind).toBe('evidence_gap');
    expect(detail.reconciliation.executableWorkoutApproved).toBe(false);
  });

  it('rejects omissions, duplicated gates and forged local provider verification in the checklist', async () => {
    const { sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    const { preflight, provenance } = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    const missing = {
      ...preflight, gates: preflight.gates.slice(1),
      blockingGateCount: preflight.blockingGateCount,
    };
    expect(() => createStrengthReconciliationChecklist(missing, provenance))
      .toThrow(/incomplete safety assessment/);
    const duplicated = {
      ...preflight,
      gates: preflight.gates.map((gate, index) =>
        index === 1 ? { ...preflight.gates[0]! } : gate),
    };
    expect(() => createStrengthReconciliationChecklist(duplicated, provenance))
      .toThrow(/gate integrity mismatch/);
    const forged = {
      ...preflight,
      gates: preflight.gates.map(gate =>
        gate.id === 'external_provider_restrictions'
          ? { ...gate, status: 'local_check_passed' as const } : gate),
      blockingGateCount: preflight.blockingGateCount - 1,
    };
    expect(() => createStrengthReconciliationChecklist(forged, provenance))
      .toThrow(/cannot accept a clearance assertion/);
    const missingProof = { ...provenance, independentlyVerified: true as false };
    expect(() => createStrengthReconciliationChecklist(preflight, missingProof))
      .toThrow(/incomplete safety assessment/);
  });

  it('fails closed on orphaned review history outside the first inbox page', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    const next = input();
    next.id = 'newest-preview';
    next.decision.id = 'newest-decision';
    next.createdAt = '2026-11-15T12:15:00Z';
    await appendStrengthRevisionPreview(sql, next);
    const forged = {
      schemaVersion: 1, id: 'orphan-review-1',
      athleteId: 'synthetic-athlete-a',
      previewId: 'missing-historical-preview',
      bindingSignature: 'unknown-old-binding',
      action: 'dismiss', createdAt: '2026-11-15T12:18:00Z',
      executableWorkoutApproved: false,
    };
    db.prepare(`INSERT INTO strength_revision_preview_review_events
      (id, athlete_id, preview_id, event_json, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(
      forged.id, forged.athleteId, forged.previewId,
      JSON.stringify(forged), forged.createdAt,
    );
    await expect(listUnapprovedStrengthReviewInbox(
      sql, 'synthetic-athlete-a', evidence(), 1, 0,
    )).rejects.toThrow(/orphaned review event/);
  });

  it('refuses orphan or cross-owner provenance even when no affected preview appears in the page', async () => {
    for (const kind of ['orphan', 'wrong_owner'] as const) {
      const { db, sql } = open();
      const original = await appendStrengthRevisionPreview(sql, input());
      const newer = input();
      newer.id = 'preview-newest';
      newer.decision.id = 'decision-newest';
      newer.createdAt = '2026-11-15T12:10:00Z';
      await appendStrengthRevisionPreview(sql, newer);
      const forged = reportedEvidence(
        original, 'provider_restriction', 'reported_present',
        'forged-evidence',
      );
      const foreignPreview = kind === 'orphan' ? 'unmatched-preview' : original.id;
      db.prepare(`INSERT INTO strength_evidence_provenance_events
        (id, athlete_id, preview_id, event_json, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(
        forged.id,
        kind === 'wrong_owner' ? 'foreign-athlete' : forged.athleteId,
        foreignPreview, JSON.stringify(forged), forged.recordedAt,
      );
      await expect(listUnapprovedStrengthReviewInbox(
        sql, 'synthetic-athlete-a', evidence(), 1, 0,
      )).rejects.toThrow(/orphaned or wrong-owner evidence record/);
      const savedCount = db.prepare(
        'SELECT COUNT(*) AS n FROM strength_revision_previews',
      ).get() as { n: number };
      expect(savedCount.n).toBe(2);
    }
  });
});

function safetyEvent(
  id: string,
  kind: 'training_intent' | 'protect_movement',
  payload: 'general_training' | 'injury_rehabilitation' | 'return_to_sport'
    | ProtectedMovement,
  createdAt = '2026-11-15T12:00:00Z',
): TrainingSafetyContextEvent {
  return {
    schemaVersion: 1, id, athleteId: 'synthetic-athlete-a', kind,
    intent: kind === 'training_intent'
      ? payload as 'general_training' | 'injury_rehabilitation' | 'return_to_sport'
      : null,
    protectedMovement: kind === 'protect_movement'
      ? payload as ProtectedMovement : null,
    source: 'athlete_self_report', createdAt, executableWorkoutApproved: false,
  };
}

describe('restriction-aware routine training versus rehabilitation policy', () => {
  it('does not require clinician paperwork for an explicitly routine athlete with no known restrictions', async () => {
    const { db, sql } = open();
    const before = await readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a');
    expect(evaluateTrainingSafetyPolicy(before).track).toBe('training_context_needed');
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('intent-1', 'training_intent', 'general_training'), null,
    );
    const state = await readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a');
    const policy = evaluateTrainingSafetyPolicy(state);
    expect(state.intent).toBe('general_training');
    expect(state.activeProtectedMovements).toEqual([]);
    expect(policy.track).toBe('routine_training_review');
    expect(policy.clinicianDocumentRequiredForRoutineTraining).toBe(false);
    expect(policy.requiresRestrictionAwareExerciseReview).toBe(false);
    expect(policy.executableWorkoutApproved).toBe(false);
    expect(policy.canApproveExerciseRevision).toBe(false);
    expect(policy.restrictionMatchingImplemented).toBe(false);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
    expect(count(db, 'training_safety_context_events')).toBe(1);
  });

  it('keeps reported protected movements in force after switching back to general training', async () => {
    const { db, sql } = open();
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('rehab', 'training_intent', 'injury_rehabilitation'), null,
    );
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('spine', 'protect_movement', 'loaded_spinal_rotation',
        '2026-11-15T12:01:00Z'), 'rehab',
    );
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('general-again', 'training_intent', 'general_training',
        '2026-11-15T12:02:00Z'), 'spine',
    );
    const state = await readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a');
    const policy = evaluateTrainingSafetyPolicy(state);
    expect(state.intent).toBe('general_training');
    expect(state.activeProtectedMovements).toContain('loaded_spinal_rotation');
    expect(policy.track).toBe('restriction_aware_review');
    expect(policy.knownRestrictionCount).toBe(1);
    expect(policy.requiresRestrictionAwareExerciseReview).toBe(true);
    expect(policy.executableWorkoutApproved).toBe(false);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });

  it('treats a return-to-sport selection as rehabilitation review even without clinician documents', async () => {
    const { sql } = open();
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('sport-1', 'training_intent', 'return_to_sport'), null,
    );
    const policy = evaluateTrainingSafetyPolicy(
      await readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a'),
    );
    expect(policy.track).toBe('rehabilitation_review');
    expect(policy.clinicianDocumentRequiredForRoutineTraining).toBe(false);
    expect(policy.requiresRestrictionAwareExerciseReview).toBe(true);
    expect(policy.canApproveExerciseRevision).toBe(false);
  });

  it('never lets a healthy training selection override an existing active PT profile or symptom alert', async () => {
    for (const caseName of ['active_pt', 'active_symptoms', 'malformed_pt'] as const) {
      const { db, sql } = open();
      await appendTrainingSafetyContextEvent(
        sql, safetyEvent('general', 'training_intent', 'general_training'), null,
      );
      if (caseName === 'active_pt') {
        db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{"active":true}');
      } else if (caseName === 'active_symptoms') {
        db.prepare('UPDATE training_check_ins SET check_in_json = ?').run(
          JSON.stringify({
            status: 'new_pain', active: true,
            activeUntil: new Date(Date.now() + 86400000).toISOString(),
          }),
        );
      } else {
        db.prepare('UPDATE pt_profiles SET profile_json = ?').run('{broken');
      }
      const policy = evaluateTrainingSafetyPolicy(
        await readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a'),
      );
      expect(policy.track).toBe('restriction_aware_review');
      expect(policy.canApproveExerciseRevision).toBe(false);
    }
  });

  it('carries forward earlier workout-specific restriction reports even if no new profile restriction is entered', async () => {
    const { sql, db } = open();
    const preview = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthEvidenceProvenance(sql, reportedEvidence(
      preview, 'provider_restriction', 'reported_present', 'old-achilles-flag',
    ), null);
    await appendStrengthEvidenceProvenance(sql, reportedEvidence(
      preview, 'provider_restriction', 'reported_none', 'later-self-clearance',
      '2026-11-15T12:01:00Z',
    ), 'old-achilles-flag');
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('routine', 'training_intent', 'general_training',
        '2026-11-15T12:04:00Z'), null,
    );
    const state = await readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a');
    expect(state.legacyRestrictionReported).toBe(true);
    expect(evaluateTrainingSafetyPolicy(state).track).toBe('restriction_aware_review');
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });

  it('fails closed on stale writers, wrong-owner history and injected transaction failure', async () => {
    const { db, sql } = open();
    await appendTrainingSafetyContextEvent(sql,
      safetyEvent('first', 'training_intent', 'general_training'), null);
    await expect(appendTrainingSafetyContextEvent(sql,
      safetyEvent('stale', 'protect_movement', 'impact_running',
        '2026-11-15T12:01:00Z'), null)).rejects.toThrow(/history changed/);
    await expect(readAthleteTrainingSafetyContext(sql, 'other-athlete'))
      .rejects.toThrow(/ownership mismatch/);
    const broken: TrainingAdjustmentSqlDriver = {
      ...sql,
      exclusiveTransaction: async <T>(
        fn: (writer: TrainingAdjustmentSqlDriver) => Promise<T>,
      ) => {
        if (!sql.exclusiveTransaction) throw new Error('No transaction fixture.');
        return sql.exclusiveTransaction(writer => fn({
          ...writer, run: async () => { throw new Error('injected safety write interruption'); },
        }));
      },
    };
    await expect(appendTrainingSafetyContextEvent(broken,
      safetyEvent('interrupted', 'protect_movement', 'impact_running',
        '2026-11-15T12:02:00Z'), 'first'))
      .rejects.toThrow(/injected safety write interruption/);
    expect(count(db, 'training_safety_context_events')).toBe(1);
    await expect(appendTrainingSafetyContextEvent({
      ...sql, exclusiveTransaction: undefined,
    }, safetyEvent('unsafe', 'protect_movement', 'impact_running',
      '2026-11-15T12:03:00Z'), 'first'))
      .rejects.toThrow(/Exclusive athlete training safety writes are unavailable/);
  });

  it('rejects forged clearance fields, calendar normalization, unsupported movements and corrupted historical rows', async () => {
    const { db, sql } = open();
    for (const mutate of [
      (e: TrainingSafetyContextEvent) => { e.executableWorkoutApproved = true as false; },
      (e: TrainingSafetyContextEvent) => { e.createdAt = '2026-02-30T12:00:00Z'; },
      (e: TrainingSafetyContextEvent) => { e.protectedMovement = 'unknown_move' as ProtectedMovement; },
      (e: TrainingSafetyContextEvent) => {
        (e as TrainingSafetyContextEvent & { clinicianApproved?: boolean }).clinicianApproved = true;
      },
    ]) {
      const event = safetyEvent('bad', 'protect_movement', 'impact_running');
      mutate(event);
      await expect(appendTrainingSafetyContextEvent(sql, event, null))
        .rejects.toThrow(/Invalid athlete training safety event/);
    }
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('valid', 'protect_movement', 'impact_running'), null,
    );
    db.prepare('UPDATE training_safety_context_events SET event_json = ?')
      .run('{"clinicianApproved":true}');
    await expect(readAthleteTrainingSafetyContext(sql, 'synthetic-athlete-a'))
      .rejects.toThrow(/invalid ownership or metadata/);
    expect(count(db, 'training_safety_context_events')).toBe(1);
  });

  it('survives disk restart with protected movements and immutable intent history', async () => {
    const { db, sql, file, directory } = open();
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('first', 'training_intent', 'injury_rehabilitation'), null,
    );
    await appendTrainingSafetyContextEvent(
      sql, safetyEvent('impact', 'protect_movement', 'impact_running',
        '2026-11-15T12:01:00Z'), 'first',
    );
    db.close();
    const reopened = new DatabaseSync(file);
    all.push({ db: reopened, directory });
    const state = await readAthleteTrainingSafetyContext(
      driver(reopened), 'synthetic-athlete-a',
    );
    expect(state.events.map(event => event.id)).toEqual(['first', 'impact']);
    expect(state.activeProtectedMovements).toEqual(['impact_running']);
    expect(evaluateTrainingSafetyPolicy(state).track).toBe('rehabilitation_review');
    const persistedCount = reopened.prepare(
      'SELECT COUNT(*) AS n FROM workout_ledger',
    ).get() as { n: number };
    expect(persistedCount.n).toBe(0);
  });
});

describe('conditional clinician documentation policy without approving workout revisions', () => {
  it('marks provider paperwork not applicable for a routine athlete without known restrictions', async () => {
    const { db, sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    await appendTrainingSafetyContextEvent(sql,
      safetyEvent('routine-intent', 'training_intent', 'general_training'), null);
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(detail.trainingPolicy.track).toBe('routine_training_review');
    expect(detail.trainingPolicy.clinicianDocumentRequiredForRoutineTraining).toBe(false);
    expect(detail.preflight.gates.find(g =>
      g.id === 'external_provider_restrictions')?.status).toBe('not_applicable');
    expect(detail.preflight.requiresIndependentProviderVerification).toBe(false);
    expect(detail.reconciliation.clinicalSourceVerificationRequired).toBe(false);
    expect(detail.reconciliation.tasks.map(task => task.id))
      .not.toContain('external_provider_restrictions');
    expect(detail.reconciliation.unresolvedCount).toBe(
      detail.preflight.blockingGateCount);
    expect(detail.preflight.canConfirmExecutableWorkout).toBe(false);
    expect(detail.reconciliation.executableWorkoutApproved).toBe(false);
    expect(count(db, 'daily_strength_choice_events')).toBe(0);
  });

  it('restores provider restriction review when an active limitation is later reported', async () => {
    const { sql } = open();
    await appendStrengthRevisionPreview(sql, input());
    await appendTrainingSafetyContextEvent(sql,
      safetyEvent('general', 'training_intent', 'general_training'), null);
    await appendTrainingSafetyContextEvent(sql,
      safetyEvent('impact', 'protect_movement', 'impact_running',
        '2026-11-15T12:01:00Z'), 'general');
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', 'preview-1', evidence(),
    );
    expect(detail.trainingPolicy.track).toBe('restriction_aware_review');
    expect(detail.preflight.requiresIndependentProviderVerification).toBe(true);
    expect(detail.preflight.gates.find(g =>
      g.id === 'external_provider_restrictions')?.status).toBe('unverified');
    expect(detail.reconciliation.tasks.map(task => task.id))
      .toContain('external_provider_restrictions');
    expect(detail.preflight.executableWorkoutApproved).toBe(false);
  });

  it('does not remove the clinical requirement for routine mode when earlier drafts reported restrictions', async () => {
    const { sql } = open();
    const oldDraft = await appendStrengthRevisionPreview(sql, input());
    await appendStrengthEvidenceProvenance(sql, reportedEvidence(
      oldDraft, 'provider_restriction', 'reported_present', 'prior-hold',
    ), null);
    await appendTrainingSafetyContextEvent(sql,
      safetyEvent('general', 'training_intent', 'general_training'), null);
    const detail = await readUnapprovedStrengthReviewDetail(
      sql, 'synthetic-athlete-a', oldDraft.id, evidence(),
    );
    expect(detail.trainingPolicy.legacyRestrictionReported).toBeUndefined();
    expect(detail.trainingPolicy.track).toBe('restriction_aware_review');
    expect(detail.preflight.gates.find(g =>
      g.id === 'external_provider_restrictions')?.status).toBe('blocked');
    expect(detail.preflight.canConfirmExecutableWorkout).toBe(false);
  });
});
