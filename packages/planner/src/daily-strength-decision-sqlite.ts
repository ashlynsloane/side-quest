import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';

/** Separate overlay: the original generated block and workout stay immutable. */
export interface StrengthChoiceDecision {
  id: string;
  athleteId: string;
  blockId: string;
  sessionId: string;
  sourceSignature: string;
  action: 'reduce' | 'defer';
  decision: 'accepted' | 'restored';
  proposedMinutes: number | null;
  createdAt: string;
}
export interface EffectiveStrengthChoice {
  action: 'keep' | 'reduce' | 'defer';
  source: PlannedStrengthSession;
  effectivePlanningMinutes: number | null;
  stale: boolean;
}

export const STRENGTH_CHOICE_AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS daily_strength_choice_events (
  id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_strength_choice_source
  ON daily_strength_choice_events(athlete_id, block_id, session_id, created_at DESC);
`;

export function strengthSessionSignature(session: PlannedStrengthSession): string {
  // Include the full generated session: do not carry an old approval across a
  // regeneration that changes exercises, target region, date or status.
  return JSON.stringify(session);
}

function findSession(block: TrainingBlockPlan, id: string): PlannedStrengthSession | null {
  const matches = block.weeks.flatMap(week => week.sessions).filter(s => s.id === id);
  if (matches.length !== 1) throw new Error('Strength source session is absent or ambiguous.');
  return matches[0]!;
}

export async function readStrengthChoiceAudit(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  blockId: string,
  sessionId: string,
): Promise<StrengthChoiceDecision[]> {
  const rows = await sql.getAll<{ event_json: string }>(
    `SELECT event_json FROM daily_strength_choice_events
     WHERE athlete_id = ? AND block_id = ? AND session_id = ?
     ORDER BY created_at ASC, rowid ASC`,
    [athleteId, blockId, sessionId],
  );
  return rows.map(row => {
    let d: StrengthChoiceDecision;
    try { d = JSON.parse(row.event_json) as StrengthChoiceDecision; }
    catch { throw new Error('Strength adjustment audit is unreadable.'); }
    if (!d || !d.id || d.athleteId !== athleteId || d.blockId !== blockId
      || d.sessionId !== sessionId || !d.sourceSignature || !d.createdAt
      || !['accepted', 'restored'].includes(d.decision)
      || !['reduce', 'defer'].includes(d.action)
      || (d.action === 'defer' && d.proposedMinutes !== null)
      || (d.action === 'reduce' && (typeof d.proposedMinutes !== 'number'
        || !Number.isFinite(d.proposedMinutes) || d.proposedMinutes <= 0))) {
      throw new Error('Strength adjustment audit is invalid.');
    }
    return d;
  });
}

/**
 * Atomic approval/undo journal with checked embedded SQLite owner and
 * current exact session. Does NOT imply clinical authorization or change
 * workout exercise content. The caller must separately re-evaluate all
 * current health restrictions and explicit athlete intent BEFORE this call.
 */
export async function appendStrengthChoiceDecision(
  sql: TrainingAdjustmentSqlDriver,
  decision: StrengthChoiceDecision,
  input: { todayLocalDate: string; athleteConfirmed: boolean; safeToReview: boolean },
): Promise<void> {
  if (!input.athleteConfirmed || !input.safeToReview) {
    throw new Error('Fresh safety review and explicit athlete confirmation required.');
  }
  const local = Date.parse(input.todayLocalDate + 'T00:00:00Z');
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.todayLocalDate)
    || !Number.isFinite(local)
    || new Date(local).toISOString().slice(0, 10) !== input.todayLocalDate) {
    throw new Error('An exact athlete-local review date is required.');
  }
  if (!decision.id || !decision.athleteId || !decision.blockId || !decision.sessionId
    || !decision.sourceSignature || !decision.createdAt
    || !['accepted', 'restored'].includes(decision.decision)
    || !['reduce', 'defer'].includes(decision.action)) {
    throw new Error('Invalid strength decision.');
  }
  await sql.transaction(async () => {
    const owner = await sql.getFirst<{ user_id: string }>(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1', [],
    );
    if (owner?.user_id !== decision.athleteId) {
      throw new Error('Strength decision athlete ownership mismatch.');
    }
    // Re-read persisted symptom and readiness state under the same SQLite
    // transaction used for the audit append. A caller-provided approval flag
    // alone is never sufficient for a dose-reduction or restoration.
    const activeCheckIn = await sql.getFirst<{ check_in_json: string }>(
      'SELECT check_in_json FROM training_check_ins WHERE active = 1 ORDER BY updated_at DESC LIMIT 1',
      [],
    );
    let symptomHold = false;
    if (activeCheckIn) {
      let check: { status?: string };
      try { check = JSON.parse(activeCheckIn.check_in_json) as { status?: string }; }
      catch { throw new Error('Active symptom check-in is unreadable.'); }
      if (!['normal', 'muscle_soreness', 'tightness_pain', 'unable_to_train']
        .includes(check.status ?? '')) {
        throw new Error('Active symptom check-in status is unknown.');
      }
      symptomHold = check.status !== 'normal';
    }
    if ((decision.action === 'reduce' && decision.decision === 'accepted')
      || decision.decision === 'restored') {
      if (symptomHold) {
        throw new Error('An active symptom or soreness hold prevents increasing planned training.');
      }
      const readinessRow = await sql.getFirst<{ check_in_json: string }>(
        'SELECT check_in_json FROM readiness_check_ins WHERE date = ? LIMIT 1',
        [input.todayLocalDate],
      );
      if (!readinessRow) throw new Error('Current-day readiness must be reviewed before approval.');
      let readiness: Record<string, unknown>;
      try { readiness = JSON.parse(readinessRow.check_in_json) as Record<string, unknown>; }
      catch { throw new Error('Current-day readiness check-in is unreadable.'); }
      const fields = ['sleep', 'energy', 'muscleFreshness', 'stress', 'motivation'];
      if (fields.some(field => typeof readiness[field] !== 'number'
          || !Number.isFinite(readiness[field]) || readiness[field] < 1
          || readiness[field] > 5)) {
        throw new Error('Current-day readiness check-in is invalid.');
      }
      const score = (Number(readiness.sleep) + Number(readiness.energy)
        + Number(readiness.muscleFreshness) + 6 - Number(readiness.stress)
        + Number(readiness.motivation)) / 5;
      if (score < 2.4) {
        throw new Error('Current recovery-level readiness prohibits training approval.');
      }
    }
    const newest = await sql.getFirst<{ id: string }>(
      'SELECT id FROM training_blocks ORDER BY updated_at DESC LIMIT 1', [],
    );
    if (newest?.id !== decision.blockId) {
      throw new Error('Training block is no longer the active latest plan.');
    }
    const ledger = await sql.getFirst<{ id: string }>(
      'SELECT id FROM workout_ledger WHERE planned_session_id = ? LIMIT 1',
      [decision.sessionId],
    );
    if (ledger) {
      throw new Error('A completed workout already references this planned session.');
    }
    const row = await sql.getFirst<{ block_json: string }>(
      'SELECT block_json FROM training_blocks WHERE id = ?', [decision.blockId],
    );
    if (!row) throw new Error('Training block no longer exists.');
    let block: TrainingBlockPlan;
    try { block = JSON.parse(row.block_json) as TrainingBlockPlan; }
    catch { throw new Error('Training block is unreadable.'); }
    if (!block || block.id !== decision.blockId) {
      throw new Error('Training block identity mismatch.');
    }
    const session = findSession(block, decision.sessionId);
    if (!session || strengthSessionSignature(session) !== decision.sourceSignature
      || session.completionStatus === 'completed' || session.completionStatus === 'skipped'
      || session.date < input.todayLocalDate) {
      throw new Error('Strength session changed, closed, or is already past.');
    }
    const original = session.workout.estimatedElapsedSeconds / 60;
    if (!Number.isFinite(original) || original <= 0) {
      throw new Error('Original strength session duration unknown.');
    }
    if (decision.action === 'defer' && decision.proposedMinutes !== null) {
      throw new Error('Deferred session cannot retain a prescribed duration.');
    }
    if (decision.action === 'reduce') {
      const expected = Math.floor(original * 0.8);
      if (original < 20 || decision.proposedMinutes !== expected
        || expected <= 0 || expected >= original) {
        throw new Error('Unreviewed strength dose or invalid duration increase.');
      }
    }
    const previous = (await readStrengthChoiceAudit(
      sql, decision.athleteId, decision.blockId, decision.sessionId,
    )).at(-1);
    if (decision.decision === 'restored') {
      if (!previous || previous.decision !== 'accepted'
        || previous.sourceSignature !== decision.sourceSignature
        || previous.action !== decision.action
        || previous.proposedMinutes !== decision.proposedMinutes) {
        throw new Error('Only the current unchanged approved choice can be restored.');
      }
    } else if (previous?.decision === 'accepted') {
      throw new Error('An accepted strength choice already exists; restore it first.');
    }
    if (previous && decision.createdAt < previous.createdAt) {
      throw new Error('Strength adjustment decision clock moved backwards.');
    }
    await sql.run(
      `INSERT INTO daily_strength_choice_events
       (id, athlete_id, block_id, session_id, event_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [decision.id, decision.athleteId, decision.blockId, decision.sessionId,
        JSON.stringify(decision), decision.createdAt],
    );
  });
}

export function effectiveStrengthChoice(
  session: PlannedStrengthSession, decisions: StrengthChoiceDecision[],
): EffectiveStrengthChoice {
  const latest = decisions.at(-1);
  const original = Number.isFinite(session.workout.estimatedElapsedSeconds)
    ? session.workout.estimatedElapsedSeconds / 60 : null;
  if (!latest || latest.decision === 'restored') {
    return { source: session, action: 'keep', effectivePlanningMinutes: original, stale: false };
  }
  if (latest.sourceSignature !== strengthSessionSignature(session)
    || (latest.action === 'reduce' && (original === null || original < 20
      || latest.proposedMinutes !== Math.floor(original * 0.8)))
    || (latest.action === 'defer' && latest.proposedMinutes !== null)) {
    return { source: session, action: 'keep', effectivePlanningMinutes: original, stale: true };
  }
  return {
    source: session, action: latest.action,
    effectivePlanningMinutes: latest.action === 'defer' ? null : latest.proposedMinutes,
    stale: false,
  };
}
