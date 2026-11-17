import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import { localCalendarDate } from './first-week-dates';
import {
  getRoutineStrengthAuthorizationReadiness,
  readAuthorizedRoutineWorkout,
} from './strength-workout-authorization-sqlite';
import { assessStrengthReviewWithinTransaction } from './strength-revision-review-detail';

/**
 * A withdrawal is an additional immutable event, never a DELETE or UPDATE
 * of consent. It blocks subsequent starts but does not delete a workout that
 * has already been completed or erase the original authorization.
 */
export const STRENGTH_AUTHORIZATION_WITHDRAWAL_SQL = [
  'CREATE TABLE IF NOT EXISTS strength_workout_authorization_withdrawals (',
  '  id TEXT PRIMARY KEY NOT NULL,',
  '  athlete_id TEXT NOT NULL,',
  '  session_id TEXT NOT NULL,',
  '  authorization_id TEXT NOT NULL UNIQUE,',
  '  event_json TEXT NOT NULL,',
  '  created_at TEXT NOT NULL',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_strength_authorization_withdrawal_owner',
  '  ON strength_workout_authorization_withdrawals(athlete_id, session_id);',
].join('\n');

export interface RoutineAuthorizationWithdrawal {
  schemaVersion: 1;
  id: string;
  athleteId: string;
  sessionId: string;
  authorizationId: string;
  createdAt: string;
  kind: 'athlete_withdrawal';
  workoutStartedByWithdrawal: false;
}

export interface RoutineWorkoutStartScreen {
  schemaVersion: 1;
  status: 'eligible_for_atomic_start_gate' | 'hold';
  athleteId: string;
  sessionId: string;
  authorizationId: string | null;
  blockers: string[];
  observationToken: string | null;
  workoutStarted: false;
  playerStartAuthorized: false;
  requiresAtomicStartRevalidation: true;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis)
    && (new Date(millis).toISOString() === value
      || new Date(millis).toISOString().replace('.000Z', 'Z') === value);
}

async function readWithdrawalInSnapshot(
  snapshot: TrainingAdjustmentSqlDriver,
  athleteId: string,
  sessionId: string,
  authorizationId: string,
): Promise<RoutineAuthorizationWithdrawal | null> {
  const rows = await snapshot.getAll<{
    id: string; athlete_id: string; session_id: string;
    authorization_id: string; event_json: string; created_at: string;
  }>(
    'SELECT id, athlete_id, session_id, authorization_id, event_json, created_at ' +
    'FROM strength_workout_authorization_withdrawals WHERE authorization_id = ?',
    [authorizationId],
  );
  if (rows.length > 1) throw new Error('Ambiguous routine authorization withdrawal.');
  if (!rows.length) return null;
  const row = rows[0]!;
  let record: RoutineAuthorizationWithdrawal;
  try { record = JSON.parse(row.event_json) as RoutineAuthorizationWithdrawal; }
  catch { throw new Error('Routine authorization withdrawal audit is unreadable.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).sort().join('|') !== [
      'athleteId', 'authorizationId', 'createdAt', 'id', 'kind',
      'schemaVersion', 'sessionId', 'workoutStartedByWithdrawal',
    ].join('|')
    || record.schemaVersion !== 1 || record.kind !== 'athlete_withdrawal'
    || record.workoutStartedByWithdrawal !== false
    || record.id !== row.id || !record.id.trim()
    || record.athleteId !== athleteId || record.athleteId !== row.athlete_id
    || record.sessionId !== sessionId || record.sessionId !== row.session_id
    || record.authorizationId !== authorizationId
    || record.authorizationId !== row.authorization_id
    || record.createdAt !== row.created_at || !validTimestamp(record.createdAt)) {
    throw new Error('Routine authorization withdrawal audit integrity mismatch.');
  }
  return record;
}

/** Read-only audit state. This is NOT an executable start permission. */
export async function readRoutineAuthorizationWithdrawal(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  sessionId: string,
): Promise<RoutineAuthorizationWithdrawal | null> {
  if (typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent routine withdrawal read snapshot is unavailable.');
  }
  return sql.readSnapshot(async snapshot => {
    const original = await readAuthorizedRoutineWorkout(snapshot, athleteId, sessionId);
    if (!original) return null;
    return readWithdrawalInSnapshot(snapshot, athleteId, sessionId, original.id);
  });
}

/** Explicit one-way withdrawal, guarded by an exclusive SQL transaction. */
export async function withdrawRoutineStrengthAuthorization(
  sql: TrainingAdjustmentSqlDriver,
  request: {
    athleteId: string;
    sessionId: string;
    expectedAuthorizationId: string;
    withdrawalId: string;
    athleteConfirmedWithdrawal: true;
  },
): Promise<RoutineAuthorizationWithdrawal> {
  if (!request?.athleteId?.trim() || !request.sessionId?.trim()
    || !request.expectedAuthorizationId?.trim()
    || !request.withdrawalId?.trim() || request.withdrawalId.length > 160
    || request.athleteConfirmedWithdrawal !== true) {
    throw new Error('Explicit athlete withdrawal confirmation is incomplete.');
  }
  if (typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Exclusive routine withdrawal transaction is unavailable.');
  }
  const frozen = { ...request };
  return sql.exclusiveTransaction(async snapshot => {
    const original = await readAuthorizedRoutineWorkout(
      snapshot, frozen.athleteId, frozen.sessionId,
    );
    if (!original || original.id !== frozen.expectedAuthorizationId) {
      throw new Error('Routine authorization identity changed before withdrawal.');
    }
    if (await readWithdrawalInSnapshot(
      snapshot, frozen.athleteId, frozen.sessionId, original.id,
    )) {
      throw new Error('Routine authorization was already withdrawn.');
    }
    const record: RoutineAuthorizationWithdrawal = {
      schemaVersion: 1, id: frozen.withdrawalId,
      athleteId: frozen.athleteId, sessionId: frozen.sessionId,
      authorizationId: original.id, createdAt: new Date().toISOString(),
      kind: 'athlete_withdrawal', workoutStartedByWithdrawal: false,
    };
    await snapshot.run(
      'INSERT INTO strength_workout_authorization_withdrawals ' +
      '(id, athlete_id, session_id, authorization_id, event_json, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
      [record.id, record.athleteId, record.sessionId,
        record.authorizationId, JSON.stringify(record), record.createdAt],
    );
    return record;
  });
}

/**
 * Fresh read-only safety screening for a proposed workout start. It is NOT
 * start authorization: an actual native player must revalidate the same
 * evidence in an atomic start transaction immediately before execution.
 * Never use this result alone to unlock workout playback.
 */
export async function inspectRoutineWorkoutStart(
  sql: TrainingAdjustmentSqlDriver,
  request: {
    athleteId: string;
    sessionId: string;
    expectedAuthorizationId: string;
    evidence: CurrentStrengthReviewEvidence;
  },
): Promise<RoutineWorkoutStartScreen> {
  if (!request?.athleteId?.trim() || !request.sessionId?.trim()
    || !request.expectedAuthorizationId?.trim()
    || request.evidence?.athleteId !== request.athleteId) {
    throw new Error('Routine workout start review identity is incomplete.');
  }
  if (typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent routine workout start snapshot is unavailable.');
  }
  return sql.readSnapshot(async snapshot => {
    const authorized = await readAuthorizedRoutineWorkout(
      snapshot, request.athleteId, request.sessionId,
    );
    const blockers: string[] = [];
    if (!authorized || authorized.id !== request.expectedAuthorizationId) {
      blockers.push('No matching athlete-confirmed workout authorization.');
    }
    let observationToken: string | null = null;
    if (authorized) {
      const withdrawal = await readWithdrawalInSnapshot(
        snapshot, request.athleteId, request.sessionId, authorized.id,
      );
      if (withdrawal) blockers.push('The athlete withdrew this workout authorization.');
      const current = await assessStrengthReviewWithinTransaction(
        snapshot, request.athleteId, authorized.previewId, request.evidence,
      );
      observationToken = current.observationToken;
      blockers.push(...getRoutineStrengthAuthorizationReadiness(
        current, request.evidence.todayLocalDate,
      ).blockers);
      if (current.summary.sourceDate !== request.evidence.todayLocalDate) {
        blockers.push('The workout can only start on its scheduled local date.');
      }
      if (request.evidence.todayLocalDate !== localCalendarDate(new Date())) {
        blockers.push('A fresh local-day check-in is required.');
      }
      if (current.summary.previewId !== authorized.previewId) {
        blockers.push('Workout review no longer identifies the confirmed preview.');
      }
    }
    return {
      schemaVersion: 1,
      status: blockers.length ? 'hold' : 'eligible_for_atomic_start_gate',
      athleteId: request.athleteId, sessionId: request.sessionId,
      authorizationId: authorized?.id ?? null,
      blockers, observationToken,
      workoutStarted: false, playerStartAuthorized: false,
      requiresAtomicStartRevalidation: true,
    };
  });
}
