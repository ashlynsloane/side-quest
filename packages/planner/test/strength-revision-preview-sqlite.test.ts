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
const count = (db: DatabaseSync, table: 'strength_revision_previews' | 'daily_strength_choice_events') =>
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
      freshDriver, reviewEvent(stored, 'restore'), evidence(),
    );
    const restored = await readStrengthPreviewReviewState(
      freshDriver, 'synthetic-athlete-a', stored.id,
    );
    expect(restored.status).toBe('pending_review');
    expect(restored.events.map(e => e.action)).toEqual(['dismiss', 'restore']);
    expect(restored.executableWorkoutApproved).toBe(false);
    expect((reopened.prepare('SELECT COUNT(*) AS n FROM daily_strength_choice_events')
      .get() as { n: number }).n).toBe(0);
    expect((reopened.prepare('SELECT block_json FROM training_blocks').get()
      as { block_json: string }).block_json).toBe(JSON.stringify(block()));
  });
  it('rejects duplicate dismissal, orphan restoration and wrong athlete owner', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    await expect(appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'restore'), evidence(),
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
  it('permits dismissal of stale source but refuses reopening without fresh review', async () => {
    const { db, sql, saveBlock } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    saveBlock(block({ ...sourceSession(), title: 'Rebuilt source' }));
    await appendStrengthPreviewReviewEvent(sql, reviewEvent(stored, 'dismiss'));
    await expect(appendStrengthPreviewReviewEvent(
      sql, reviewEvent(stored, 'restore'), evidence(),
    )).rejects.toThrow(/stale/);
    expect((await readStrengthPreviewReviewState(
      sql, 'synthetic-athlete-a', stored.id,
    )).status).toBe('dismissed');
    expect(reviewEventCount(db)).toBe(1);
  });
  it('refuses reopening on changed PT, symptoms, readiness, or incomplete coverage', async () => {
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
      await expect(appendStrengthPreviewReviewEvent(
        sql, reviewEvent(stored, 'restore'), current,
      )).rejects.toThrow(/stale/);
      expect(reviewEventCount(db)).toBe(1);
    }
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
        sql, reviewEvent(stored, 'restore'), evidence(),
      )).rejects.toThrow();
      expect(reviewEventCount(db)).toBe(2);
    }
  });
  it('injected SQL failure rolls back without changing preview or training history', async () => {
    const { db, sql } = open();
    const stored = await appendStrengthRevisionPreview(sql, input());
    const original = JSON.stringify(stored);
    await expect(appendStrengthPreviewReviewEvent({
      ...sql,
      run: async () => { throw new Error('injected SQLite write failure'); },
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
