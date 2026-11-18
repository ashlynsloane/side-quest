import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import { localCalendarDate } from './first-week-dates';
import {
  readAuthorizedRoutineWorkout,
  getRoutineStrengthAuthorizationReadiness,
} from './strength-workout-authorization-sqlite';
import { assessStrengthReviewWithinTransaction } from './strength-revision-review-detail';
import {
  readRoutineNativeStartCheckpointWithinTransaction,
  type RoutineNativeStartCheckpoint,
} from './strength-workout-start-safety-sqlite';

/**
 * A terminal event is immutable. It prevents an old initial SQLite start
 * snapshot from ever being treated as a new workout. Keep the old snapshot
 * for audit; do not delete the athlete's completed dose.
 */
export const STRENGTH_NATIVE_START_TERMINAL_SQL = [
  'CREATE TABLE IF NOT EXISTS strength_workout_native_start_terminal_events (',
  '  id TEXT PRIMARY KEY NOT NULL,',
  '  athlete_id TEXT NOT NULL,',
  '  session_id TEXT NOT NULL UNIQUE,',
  '  authorization_id TEXT NOT NULL,',
  '  checkpoint_id TEXT NOT NULL UNIQUE,',
  '  event_json TEXT NOT NULL,',
  '  created_at TEXT NOT NULL',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_native_start_terminal_owner',
  '  ON strength_workout_native_start_terminal_events(athlete_id, session_id);',
].join('\n');

export interface RoutineNativeTerminalEvent {
  schemaVersion: 1;
  id: string;
  kind: 'routine_native_start_terminal';
  athleteId: string;
  sessionId: string;
  authorizationId: string;
  checkpointId: string;
  startedAt: string;
  createdAt: string;
  disposition: 'discarded' | 'completed';
  athleteConfirmedDiscard: boolean;
  canonicalCompletionObserved: boolean;
}

export interface RoutineActiveSafetyResult {
  schemaVersion: 1;
  athleteId: string;
  sessionId: string;
  status: 'none' | 'eligible_for_explicit_recovery' | 'hold' | 'terminal';
  blockers: string[];
  checkpoint: RoutineNativeStartCheckpoint | null;
  terminal: RoutineNativeTerminalEvent | null;
  /** A safety result is not a permanent bearer token for timer playback. */
  playerStartAuthorized: false;
  requiresContinuousRecheck: true;
}

function validUtc(value: string): boolean {
  const millis = Date.parse(value);
  return Number.isFinite(millis)
    && (new Date(millis).toISOString() === value
      || new Date(millis).toISOString().replace('.000Z', 'Z') === value);
}

async function readTerminalInTransaction(
  writer: TrainingAdjustmentSqlDriver,
  checkpoint: RoutineNativeStartCheckpoint,
): Promise<RoutineNativeTerminalEvent | null> {
  const rows = await writer.getAll<{
    id: string; athlete_id: string; session_id: string;
    authorization_id: string; checkpoint_id: string;
    event_json: string; created_at: string;
  }>(
    'SELECT id, athlete_id, session_id, authorization_id, checkpoint_id, event_json, created_at ' +
    'FROM strength_workout_native_start_terminal_events WHERE session_id = ?',
    [checkpoint.sessionId],
  );
  if (rows.length > 1) throw new Error('Ambiguous native start terminal history.');
  if (!rows.length) return null;
  const row = rows[0]!;
  let event: RoutineNativeTerminalEvent;
  try { event = JSON.parse(row.event_json) as RoutineNativeTerminalEvent; }
  catch { throw new Error('Native workout terminal history is unreadable.'); }
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || Object.keys(event).sort().join('|') !== [
      'athleteConfirmedDiscard', 'athleteId', 'authorizationId',
      'canonicalCompletionObserved', 'checkpointId', 'createdAt',
      'disposition', 'id', 'kind', 'schemaVersion', 'sessionId', 'startedAt',
    ].join('|')
    || event.schemaVersion !== 1 || event.kind !== 'routine_native_start_terminal'
    || !event.id?.trim() || event.id !== row.id
    || event.athleteId !== checkpoint.athleteId || event.athleteId !== row.athlete_id
    || event.sessionId !== checkpoint.sessionId || event.sessionId !== row.session_id
    || event.authorizationId !== checkpoint.authorizationId
    || event.authorizationId !== row.authorization_id
    || event.checkpointId !== checkpoint.id || event.checkpointId !== row.checkpoint_id
    || event.startedAt !== checkpoint.initialLiveSession.startedAt
    || event.createdAt !== row.created_at || !validUtc(event.createdAt)
    || !['discarded', 'completed'].includes(event.disposition)
    || event.athleteConfirmedDiscard !== (event.disposition === 'discarded')
    || event.canonicalCompletionObserved !== (event.disposition === 'completed')) {
    throw new Error('Native workout terminal audit integrity mismatch.');
  }
  return event;
}

async function completedOriginalWorkout(
  writer: TrainingAdjustmentSqlDriver,
  checkpoint: RoutineNativeStartCheckpoint,
): Promise<boolean> {
  const startedAt = checkpoint.initialLiveSession.startedAt;
  const workout = checkpoint.initialLiveSession.workout;
  const row = await writer.getFirst<{
    started_at: string; workout_json: string;
  }>(
    'SELECT started_at, workout_json FROM completed_workouts WHERE id = ?',
    [workout.id + '_' + startedAt],
  );
  if (!row) return false;
  let completedWorkout: unknown;
  try { completedWorkout = JSON.parse(row.workout_json); }
  catch { throw new Error('Completed workout identity is unreadable.'); }
  if (row.started_at !== startedAt || !completedWorkout
    || typeof completedWorkout !== 'object'
    || (completedWorkout as { id?: unknown }).id !== workout.id) {
    throw new Error('Completed workout identity does not match the original start.');
  }
  return true;
}

/** The original submitted prescription is the only recovery identity. */
export async function assessRoutineNativeActiveSafety(
  sql: TrainingAdjustmentSqlDriver,
  input: {
    athleteId: string;
    sessionId: string;
    evidence: CurrentStrengthReviewEvidence;
  },
): Promise<RoutineActiveSafetyResult> {
  if (!input?.athleteId?.trim() || !input.sessionId?.trim()
    || input.evidence?.athleteId !== input.athleteId
    || typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent athlete-owned native recovery snapshot is unavailable.');
  }
  return sql.readSnapshot(async reader => {
    const checkpoint = await readRoutineNativeStartCheckpointWithinTransaction(
      reader, input.athleteId, input.sessionId,
    );
    if (!checkpoint) {
      const orphan = await reader.getFirst<{ id: string }>(
        'SELECT id FROM strength_workout_native_start_terminal_events WHERE session_id = ? LIMIT 1',
        [input.sessionId],
      );
      if (orphan) throw new Error('Orphan routine terminal audit detected.');
      return {
        schemaVersion: 1, athleteId: input.athleteId, sessionId: input.sessionId,
        status: 'none', checkpoint: null, terminal: null, blockers: [],
        playerStartAuthorized: false, requiresContinuousRecheck: true,
      };
    }
    const terminal = await readTerminalInTransaction(reader, checkpoint);
    if (terminal) return {
      schemaVersion: 1, athleteId: input.athleteId, sessionId: input.sessionId,
      status: 'terminal', checkpoint, terminal,
      blockers: ['This original workout start is already terminal and cannot be replayed.'],
      playerStartAuthorized: false, requiresContinuousRecheck: true,
    };
    const blockers: string[] = [];
    const authorization = await readAuthorizedRoutineWorkout(
      reader, input.athleteId, input.sessionId,
    );
    if (!authorization || authorization.id !== checkpoint.authorizationId
      || authorization.candidateSignature !== checkpoint.candidateSignature) {
      blockers.push('The exact athlete-confirmed workout no longer matches the saved start.');
    }
    const withdrawals = await reader.getAll<{ id: string; athlete_id: string }>(
      'SELECT id, athlete_id FROM strength_workout_authorization_withdrawals WHERE session_id = ?',
      [input.sessionId],
    );
    if (withdrawals.length > 1 || withdrawals.some(w => w.athlete_id !== input.athleteId)) {
      throw new Error('Native workout withdrawal audit owner mismatch.');
    }
    if (withdrawals.length) {
      blockers.push('Authorization was withdrawn. Pause training and preserve any work already done.');
    }
    if (input.evidence.todayLocalDate !== localCalendarDate(new Date())
      || input.evidence.todayLocalDate !== checkpoint.initialLiveSession.planLink.sessionDate) {
      blockers.push('The workout cannot continue without a new current-day review.');
    }
    const reviewed = await assessStrengthReviewWithinTransaction(
      reader, input.athleteId, authorization!.previewId, input.evidence,
    );
    blockers.push(...getRoutineStrengthAuthorizationReadiness(
      reviewed, input.evidence.todayLocalDate,
    ).blockers);
    if (reviewed.summary.previewId !== checkpoint.initialLiveSession.planLink.sessionId
      && reviewed.summary.previewId !== authorization!.previewId) {
      blockers.push('The original reviewed workout binding cannot be reconciled.');
    }
    const canonical = await completedOriginalWorkout(reader, checkpoint);
    const completedPlan = await reader.getFirst<{ id: string }>(
      'SELECT id FROM workout_ledger WHERE planned_session_id = ? LIMIT 1',
      [input.sessionId],
    );
    if (canonical || completedPlan) {
      blockers.push('This workout is already in the completed training ledger.');
    }
    return {
      schemaVersion: 1, athleteId: input.athleteId, sessionId: input.sessionId,
      status: blockers.length ? 'hold' : 'eligible_for_explicit_recovery',
      checkpoint, terminal: null, blockers,
      playerStartAuthorized: false, requiresContinuousRecheck: true,
    };
  });
}

/**
 * Explicit discard or canonical completion. One immutable terminal event
 * blocks seed replay even when a process dies before local checkpoint cleanup.
 * Completion must have an exact matching canonical workout ledger record.
 */
export async function finishRoutineNativeStart(
  sql: TrainingAdjustmentSqlDriver,
  input: {
    athleteId: string;
    sessionId: string;
    expectedCheckpointId: string;
    terminalId: string;
    disposition: 'discarded' | 'completed';
    athleteConfirmedDiscard: boolean;
  },
): Promise<RoutineNativeTerminalEvent> {
  if (!input?.athleteId?.trim() || !input.sessionId?.trim()
    || !input.expectedCheckpointId?.trim() || !input.terminalId?.trim()
    || input.terminalId.length > 160
    || (input.disposition !== 'discarded' && input.disposition !== 'completed')
    || input.athleteConfirmedDiscard !== (input.disposition === 'discarded')
    || typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Explicit native workout terminal request is invalid.');
  }
  const frozen = { ...input };
  return sql.exclusiveTransaction(async writer => {
    const checkpoint = await readRoutineNativeStartCheckpointWithinTransaction(
      writer, frozen.athleteId, frozen.sessionId,
    );
    if (!checkpoint || checkpoint.id !== frozen.expectedCheckpointId) {
      throw new Error('The exact original native workout checkpoint is missing or changed.');
    }
    const existing = await readTerminalInTransaction(writer, checkpoint);
    if (existing) {
      if (existing.disposition !== frozen.disposition) {
        throw new Error('Native start already closed with a different terminal outcome.');
      }
      return existing;
    }
    const completed = await completedOriginalWorkout(writer, checkpoint);
    if (frozen.disposition === 'completed' && !completed) {
      throw new Error('Cannot finalize a routine start without its canonical completed workout.');
    }
    if (frozen.disposition === 'discarded' && completed) {
      throw new Error('Cannot discard a routine workout that is already canonically completed.');
    }
    const event: RoutineNativeTerminalEvent = {
      schemaVersion: 1, id: frozen.terminalId,
      kind: 'routine_native_start_terminal',
      athleteId: frozen.athleteId, sessionId: frozen.sessionId,
      authorizationId: checkpoint.authorizationId, checkpointId: checkpoint.id,
      startedAt: checkpoint.initialLiveSession.startedAt,
      createdAt: new Date().toISOString(), disposition: frozen.disposition,
      athleteConfirmedDiscard: frozen.disposition === 'discarded',
      canonicalCompletionObserved: frozen.disposition === 'completed',
    };
    await writer.run(
      'INSERT INTO strength_workout_native_start_terminal_events ' +
      '(id, athlete_id, session_id, authorization_id, checkpoint_id, event_json, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [event.id, event.athleteId, event.sessionId, event.authorizationId,
        event.checkpointId, JSON.stringify(event), event.createdAt],
    );
    return event;
  });
}
