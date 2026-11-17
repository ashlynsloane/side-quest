import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import { localCalendarDate } from './first-week-dates';
import {
  getRoutineStrengthAuthorizationReadiness,
  readAuthorizedRoutineWorkout,
  type AuthorizedStrengthWorkoutRecord,
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
    'FROM strength_workout_authorization_withdrawals WHERE session_id = ?',
    [sessionId],
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
    if (!original) {
      const orphan = await snapshot.getFirst<{ id: string }>(
        'SELECT id FROM strength_workout_authorization_withdrawals WHERE session_id = ? LIMIT 1',
        [sessionId],
      );
      if (orphan) throw new Error('Orphan routine authorization withdrawal audit detected.');
      return null;
    }
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
export interface RoutineWorkoutStartRequest {
  athleteId: string;
  sessionId: string;
  expectedAuthorizationId: string;
  evidence: CurrentStrengthReviewEvidence;
}

/**
 * An append-only record that a user REQUESTED a workout start after all
 * locally available gates were rechecked in one exclusive SQLite transaction.
 *
 * This is NOT a saved live workout checkpoint or license to start the player.
 * Never consume it as execution permission. The native launch transaction
 * still needs to combine a fresh gate and durable player activation.
 */
export const STRENGTH_START_INTENT_SQL = [
  'CREATE TABLE IF NOT EXISTS strength_workout_start_intents (',
  '  id TEXT PRIMARY KEY NOT NULL,',
  '  athlete_id TEXT NOT NULL,',
  '  session_id TEXT NOT NULL UNIQUE,',
  '  authorization_id TEXT NOT NULL,',
  '  preview_id TEXT NOT NULL,',
  '  intent_json TEXT NOT NULL,',
  '  created_at TEXT NOT NULL',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_strength_start_intent_owner',
  '  ON strength_workout_start_intents(athlete_id, session_id);',
].join('\n');

export interface RoutineStrengthStartIntent {
  schemaVersion: 1;
  id: string;
  kind: 'verified_pre_start_intent_only';
  athleteId: string;
  sessionId: string;
  authorizationId: string;
  previewId: string;
  candidateSignature: string;
  scheduledLocalDate: string;
  createdAt: string;
  athleteExplicitlyRequestedStart: true;
  playerStartAuthorized: false;
  workoutStarted: false;
  nativeActivationUnverified: true;
}

export interface RoutineStrengthStartIntentRequest extends RoutineWorkoutStartRequest {
  intentId: string;
  expectedObservationToken: string;
  athleteExplicitlyRequestedStart: true;
}

function assertStartRequest(request: RoutineWorkoutStartRequest): void {
  if (!request?.athleteId?.trim() || !request.sessionId?.trim()
    || !request.expectedAuthorizationId?.trim()
    || !request.evidence || request.evidence.athleteId !== request.athleteId) {
    throw new Error('Routine workout start review identity is incomplete.');
  }
}

/** Obtain the day from the immutable authorized plan binding, not the claim. */
function authorizedScheduledLocalDate(authorization: AuthorizedStrengthWorkoutRecord): string {
  let date: unknown;
  try {
    const binding = JSON.parse(authorization.bindingSignature) as { sourceSignature?: string };
    const source = JSON.parse(binding.sourceSignature ?? '') as { date?: unknown };
    date = source.date;
  } catch {
    throw new Error('Authorized routine workout schedule binding is unreadable.');
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    || new Date(Date.parse(date + 'T00:00:00Z')).toISOString().slice(0, 10) !== date) {
    throw new Error('Authorized routine workout schedule binding is invalid.');
  }
  return date;
}

async function readStartIntentInSnapshot(
  snapshot: TrainingAdjustmentSqlDriver,
  athleteId: string,
  sessionId: string,
  expectedAuthorizationId: string,
  expectedPreviewId: string,
  expectedSignature: string,
  expectedScheduledLocalDate: string,
): Promise<RoutineStrengthStartIntent | null> {
  const rows = await snapshot.getAll<{
    id: string; athlete_id: string; session_id: string;
    authorization_id: string; preview_id: string;
    intent_json: string; created_at: string;
  }>(
    'SELECT id, athlete_id, session_id, authorization_id, preview_id, ' +
    'intent_json, created_at FROM strength_workout_start_intents WHERE session_id = ?',
    [sessionId],
  );
  if (rows.length > 1) throw new Error('Ambiguous routine start intent history.');
  if (!rows.length) return null;
  const row = rows[0]!;
  let intent: RoutineStrengthStartIntent;
  try { intent = JSON.parse(row.intent_json) as RoutineStrengthStartIntent; }
  catch { throw new Error('Routine start intent audit is unreadable.'); }
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)
    || Object.keys(intent).sort().join('|') !== [
      'athleteExplicitlyRequestedStart', 'athleteId', 'authorizationId',
      'candidateSignature', 'createdAt', 'id', 'kind',
      'nativeActivationUnverified', 'playerStartAuthorized',
      'previewId', 'scheduledLocalDate', 'schemaVersion', 'sessionId',
      'workoutStarted',
    ].join('|')
    || intent.schemaVersion !== 1 || intent.kind !== 'verified_pre_start_intent_only'
    || intent.athleteExplicitlyRequestedStart !== true
    || intent.playerStartAuthorized !== false
    || intent.workoutStarted !== false || intent.nativeActivationUnverified !== true
    || !intent.id?.trim() || intent.id !== row.id
    || intent.athleteId !== row.athlete_id || intent.athleteId !== athleteId
    || intent.sessionId !== row.session_id || intent.sessionId !== sessionId
    || intent.authorizationId !== row.authorization_id
    || intent.authorizationId !== expectedAuthorizationId
    || intent.previewId !== row.preview_id || intent.previewId !== expectedPreviewId
    || intent.candidateSignature !== expectedSignature
    || !/^\d{4}-\d{2}-\d{2}$/.test(intent.scheduledLocalDate)
    || intent.scheduledLocalDate !== expectedScheduledLocalDate
    || intent.createdAt !== row.created_at || !validTimestamp(intent.createdAt)) {
    throw new Error('Routine start intent audit integrity mismatch.');
  }
  return intent;
}

/**
 * Same local evidence evaluator used by the read-only preview and exclusive
 * pre-start intent write. This function must run INSIDE the caller's owned,
 * consistent SQLite snapshot or dedicated exclusive transaction handle.
 */
async function assessStartWithinSnapshot(
  snapshot: TrainingAdjustmentSqlDriver,
  request: RoutineWorkoutStartRequest,
): Promise<RoutineWorkoutStartScreen> {
  const authorized = await readAuthorizedRoutineWorkout(
    snapshot, request.athleteId, request.sessionId,
  );
  const blockers: string[] = [];
  if (!authorized || authorized.id !== request.expectedAuthorizationId) {
    blockers.push('No matching athlete-confirmed workout authorization.');
  }
  if (!authorized) {
    const orphanWithdrawal = await snapshot.getFirst<{ id: string }>(
      'SELECT id FROM strength_workout_authorization_withdrawals WHERE session_id = ? LIMIT 1',
      [request.sessionId],
    );
    const orphanStart = await snapshot.getFirst<{ id: string }>(
      'SELECT id FROM strength_workout_start_intents WHERE session_id = ? LIMIT 1',
      [request.sessionId],
    );
    if (orphanWithdrawal || orphanStart) {
      throw new Error('Orphan routine start or withdrawal audit detected.');
    }
  }
  let observationToken: string | null = null;
  if (authorized) {
    const withdrawal = await readWithdrawalInSnapshot(
      snapshot, request.athleteId, request.sessionId, authorized.id,
    );
    if (withdrawal) blockers.push('The athlete withdrew this workout authorization.');
    const recordedIntent = await readStartIntentInSnapshot(
      snapshot, request.athleteId, request.sessionId, authorized.id,
      authorized.previewId, authorized.candidateSignature,
      authorizedScheduledLocalDate(authorized),
    );
    if (recordedIntent) {
      blockers.push('A pre-start intent already exists for this workout; reconcile it before retry.');
    }
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
}

/** Read-only local safety preview, always NOT executable. */
export async function inspectRoutineWorkoutStart(
  sql: TrainingAdjustmentSqlDriver,
  request: RoutineWorkoutStartRequest,
): Promise<RoutineWorkoutStartScreen> {
  assertStartRequest(request);
  if (typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent routine workout start snapshot is unavailable.');
  }
  return sql.readSnapshot(snapshot => assessStartWithinSnapshot(snapshot, request));
}

/**
 * Atomically revalidate the preview AND append one intent; no player launched.
 * Optimistic observation-token match prevents pressing Start against a changed
 * exercise/recovery screen. The token contains local personal context, so it
 * must never be persisted to the audit or transmitted.
 */
export async function recordRoutineStrengthStartIntent(
  sql: TrainingAdjustmentSqlDriver,
  request: RoutineStrengthStartIntentRequest,
): Promise<RoutineStrengthStartIntent> {
  assertStartRequest(request);
  if (!request.intentId?.trim() || request.intentId.length > 160
    || typeof request.expectedObservationToken !== 'string'
    || !request.expectedObservationToken.trim()
    || request.expectedObservationToken.length > 1_000_000
    || request.athleteExplicitlyRequestedStart !== true) {
    throw new Error('Explicit routine workout start request is incomplete.');
  }
  if (typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Exclusive routine workout start intent transaction is unavailable.');
  }
  const frozen = JSON.parse(JSON.stringify(request)) as RoutineStrengthStartIntentRequest;
  return sql.exclusiveTransaction(async writer =>
    (await appendVerifiedStartIntentInTransaction(writer, frozen)).intent);
}

/**
 * Transaction-internal single authoritative start verifier and audit append.
 * Both intent-only records and prepared native checkpoints share this exact gate.
 */
async function appendVerifiedStartIntentInTransaction(
  writer: TrainingAdjustmentSqlDriver,
  frozen: RoutineStrengthStartIntentRequest,
): Promise<{ intent: RoutineStrengthStartIntent; original: AuthorizedStrengthWorkoutRecord }> {
    const result = await assessStartWithinSnapshot(writer, frozen);
    if (result.observationToken !== frozen.expectedObservationToken) {
      throw new Error('Routine workout evidence changed before start intent; refresh review.');
    }
    if (result.status !== 'eligible_for_atomic_start_gate'
      || result.blockers.length || result.playerStartAuthorized !== false
      || result.workoutStarted !== false) {
      throw new Error('Routine pre-start intent held: ' + result.blockers.join(' '));
    }
    const original = await readAuthorizedRoutineWorkout(
      writer, frozen.athleteId, frozen.sessionId,
    );
    if (!original || original.id !== frozen.expectedAuthorizationId
      || original.candidateSignature !== JSON.stringify(original.workout)) {
      throw new Error('Original authorized workout changed during the start transaction.');
    }
    const intent: RoutineStrengthStartIntent = {
      schemaVersion: 1,
      id: frozen.intentId, kind: 'verified_pre_start_intent_only',
      athleteId: frozen.athleteId, sessionId: frozen.sessionId,
      authorizationId: original.id, previewId: original.previewId,
      candidateSignature: original.candidateSignature,
      scheduledLocalDate: frozen.evidence.todayLocalDate,
      createdAt: new Date().toISOString(),
      athleteExplicitlyRequestedStart: true, playerStartAuthorized: false,
      workoutStarted: false, nativeActivationUnverified: true,
    };
    await writer.run(
      'INSERT INTO strength_workout_start_intents ' +
      '(id, athlete_id, session_id, authorization_id, preview_id, intent_json, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [intent.id, intent.athleteId, intent.sessionId, intent.authorizationId,
        intent.previewId, JSON.stringify(intent), intent.createdAt],
    );
    return { intent, original };
}

/**
 * Historical start-intent read. A persisted intent is never a valid start
 * token, proof of playback, or permission to skip current restrictions.
 */
export async function readRoutineStrengthStartIntent(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  sessionId: string,
): Promise<RoutineStrengthStartIntent | null> {
  if (!athleteId?.trim() || !sessionId?.trim()
    || typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent routine start intent history snapshot is unavailable.');
  }
  return sql.readSnapshot(async snapshot => {
    const original = await readAuthorizedRoutineWorkout(snapshot, athleteId, sessionId);
    if (!original) {
      const orphan = await snapshot.getFirst<{ id: string }>(
        'SELECT id FROM strength_workout_start_intents WHERE session_id = ? LIMIT 1',
        [sessionId],
      );
      if (orphan) throw new Error('Orphan routine start intent audit detected.');
      return null;
    }
    return readStartIntentInSnapshot(
      snapshot, athleteId, sessionId, original.id,
      original.previewId, original.candidateSignature,
      authorizedScheduledLocalDate(original),
    );
  });
}


/**
 * A fail-closed, append-only recovery seed for a single explicitly requested
 * routine workout. Created in the SAME SQLite transaction as the matching
 * start intent. The React player is not mounted or running at commit time.
 */
export const STRENGTH_NATIVE_START_CHECKPOINT_SQL = [
  'CREATE TABLE IF NOT EXISTS strength_workout_native_start_checkpoints (',
  '  id TEXT PRIMARY KEY NOT NULL,',
  '  athlete_id TEXT NOT NULL,',
  '  session_id TEXT NOT NULL UNIQUE,',
  '  authorization_id TEXT NOT NULL UNIQUE,',
  '  intent_id TEXT NOT NULL UNIQUE,',
  '  checkpoint_json TEXT NOT NULL,',
  '  created_at TEXT NOT NULL',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_strength_native_start_checkpoint_owner',
  '  ON strength_workout_native_start_checkpoints(athlete_id, session_id);',
].join('\n');

/**
 * Structurally identical to the mobile LiveWorkoutSessionSnapshot initial
 * schema. Always paused on disk; the player may only run once a separate
 * hydration/activation flow has verified and restored it.
 */
export interface RoutineInitialLiveWorkoutCheckpoint {
  schemaVersion: 1;
  savedAt: string;
  workout: AuthorizedStrengthWorkoutRecord['workout'];
  startedAt: string;
  stationIndex: 0;
  phase: 'work';
  remainingSeconds: number;
  running: false;
  stationRounds: Record<string, number>;
  exerciseLoads: Record<string, never>;
  exerciseSets: Record<string, never>;
  restEntries: Record<string, never>;
  restRounds: 1;
  restLoadUnit: 'lb';
  planLink: {
    sessionId: string;
    sessionDate: string;
    sessionTitle: string;
    modifiedFromPlan: boolean;
  };
}

export interface RoutineNativeStartCheckpoint {
  schemaVersion: 1;
  id: string;
  kind: 'prepared_native_player_checkpoint';
  athleteId: string;
  sessionId: string;
  authorizationId: string;
  intentId: string;
  candidateSignature: string;
  createdAt: string;
  initialLiveSession: RoutineInitialLiveWorkoutCheckpoint;
  requiresPlayerHydration: true;
  playerPlaybackStarted: false;
}

export interface RoutineNativeStartCheckpointRequest
  extends RoutineStrengthStartIntentRequest {
  checkpointId: string;
}

function reconstructInitialLiveSession(
  authorized: AuthorizedStrengthWorkoutRecord,
  startedAt: string,
): RoutineInitialLiveWorkoutCheckpoint {
  let source: { id?: unknown; title?: unknown; date?: unknown; workout?: unknown };
  try {
    const binding = JSON.parse(authorized.bindingSignature) as { sourceSignature?: string };
    source = JSON.parse(binding.sourceSignature ?? '') as typeof source;
  } catch {
    throw new Error('Original planned workout start binding is unreadable.');
  }
  if (source?.id !== authorized.sessionId
    || typeof source.title !== 'string' || !source.title.trim()
    || source.date !== authorizedScheduledLocalDate(authorized)
    || typeof source.workout !== 'object' || !source.workout) {
    throw new Error('Original planned workout start binding is inconsistent.');
  }
  const workout = authorized.workout;
  if (authorized.candidateSignature !== JSON.stringify(workout)
    || !workout.id?.trim() || !workout.stations?.length
    || !Number.isFinite(workout.stations[0]!.durationSeconds)
    || workout.stations[0]!.durationSeconds <= 0) {
    throw new Error('Authorized workout cannot produce an initial native player checkpoint.');
  }
  return {
    schemaVersion: 1, savedAt: startedAt,
    workout, startedAt, stationIndex: 0, phase: 'work',
    remainingSeconds: workout.stations[0]!.durationSeconds,
    running: false, stationRounds: {},
    exerciseLoads: {}, exerciseSets: {}, restEntries: {},
    restRounds: 1, restLoadUnit: 'lb',
    planLink: {
      sessionId: authorized.sessionId, sessionDate: source.date as string,
      sessionTitle: source.title,
      modifiedFromPlan: authorized.candidateSignature !== JSON.stringify(source.workout),
    },
  };
}

async function readNativeCheckpointInSnapshot(
  snapshot: TrainingAdjustmentSqlDriver,
  authorized: AuthorizedStrengthWorkoutRecord,
  matchingIntent: RoutineStrengthStartIntent | null,
): Promise<RoutineNativeStartCheckpoint | null> {
  const rows = await snapshot.getAll<{
    id: string; athlete_id: string; session_id: string;
    authorization_id: string; intent_id: string;
    checkpoint_json: string; created_at: string;
  }>(
    'SELECT id, athlete_id, session_id, authorization_id, intent_id, ' +
    'checkpoint_json, created_at FROM strength_workout_native_start_checkpoints WHERE session_id = ?',
    [authorized.sessionId],
  );
  if (rows.length > 1) throw new Error('Ambiguous native workout start checkpoint.');
  if (!rows.length) return null;
  const row = rows[0]!;
  let record: RoutineNativeStartCheckpoint;
  try { record = JSON.parse(row.checkpoint_json) as RoutineNativeStartCheckpoint; }
  catch { throw new Error('Native start checkpoint audit is unreadable.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).sort().join('|') !== [
      'athleteId', 'authorizationId', 'candidateSignature', 'createdAt',
      'id', 'initialLiveSession', 'intentId', 'kind', 'playerPlaybackStarted',
      'requiresPlayerHydration', 'schemaVersion', 'sessionId',
    ].join('|')
    || record.schemaVersion !== 1 || record.kind !== 'prepared_native_player_checkpoint'
    || record.requiresPlayerHydration !== true || record.playerPlaybackStarted !== false
    || !record.id?.trim() || record.id !== row.id
    || record.athleteId !== authorized.athleteId || record.athleteId !== row.athlete_id
    || record.sessionId !== authorized.sessionId || record.sessionId !== row.session_id
    || record.authorizationId !== authorized.id || record.authorizationId !== row.authorization_id
    || record.intentId !== row.intent_id || record.intentId !== matchingIntent?.id
    || record.candidateSignature !== authorized.candidateSignature
    || record.createdAt !== row.created_at || !validTimestamp(record.createdAt)
    || record.createdAt !== matchingIntent?.createdAt
    || JSON.stringify(record.initialLiveSession) !== JSON.stringify(
      reconstructInitialLiveSession(authorized, record.createdAt)
    )) {
    throw new Error('Native start checkpoint audit integrity mismatch.');
  }
  return record;
}

/**
 * Atomic safety-to-recovery-seed boundary. The intent and player's initial
 * paused snapshot are committed together or neither is committed. This does
 * not start timers, render exercises, or hydrate React/localStorage.
 */
export async function commitRoutineNativeStartCheckpoint(
  sql: TrainingAdjustmentSqlDriver,
  request: RoutineNativeStartCheckpointRequest,
): Promise<RoutineNativeStartCheckpoint> {
  assertStartRequest(request);
  if (!request.checkpointId?.trim() || request.checkpointId.length > 160
    || !request.intentId?.trim() || request.intentId.length > 160
    || !request.expectedObservationToken?.trim()
    || request.athleteExplicitlyRequestedStart !== true
    || typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Explicit atomic native checkpoint request is incomplete.');
  }
  const frozen = JSON.parse(JSON.stringify(request)) as RoutineNativeStartCheckpointRequest;
  return sql.exclusiveTransaction(async writer => {
    const { intent, original } = await appendVerifiedStartIntentInTransaction(writer, frozen);
    const record: RoutineNativeStartCheckpoint = {
      schemaVersion: 1, id: frozen.checkpointId,
      kind: 'prepared_native_player_checkpoint',
      athleteId: frozen.athleteId, sessionId: frozen.sessionId,
      authorizationId: original.id, intentId: intent.id,
      candidateSignature: original.candidateSignature, createdAt: intent.createdAt,
      initialLiveSession: reconstructInitialLiveSession(original, intent.createdAt),
      requiresPlayerHydration: true, playerPlaybackStarted: false,
    };
    await writer.run(
      'INSERT INTO strength_workout_native_start_checkpoints ' +
      '(id, athlete_id, session_id, authorization_id, intent_id, checkpoint_json, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [record.id, record.athleteId, record.sessionId, record.authorizationId,
        record.intentId, JSON.stringify(record), record.createdAt],
    );
    return record;
  });
}

/** Read-only recovery seed. A caller must NOT treat it as proof of playback. */
export async function readRoutineNativeStartCheckpoint(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  sessionId: string,
): Promise<RoutineNativeStartCheckpoint | null> {
  if (!athleteId?.trim() || !sessionId?.trim()
    || typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent native start checkpoint audit snapshot is unavailable.');
  }
  return sql.readSnapshot(async snapshot => {
    const original = await readAuthorizedRoutineWorkout(snapshot, athleteId, sessionId);
    if (!original) {
      const orphan = await snapshot.getFirst<{ id: string }>(
        'SELECT id FROM strength_workout_native_start_checkpoints WHERE session_id = ? LIMIT 1',
        [sessionId],
      );
      if (orphan) throw new Error('Orphan native start checkpoint audit detected.');
      return null;
    }
    const intent = await readStartIntentInSnapshot(
      snapshot, athleteId, sessionId, original.id,
      original.previewId, original.candidateSignature,
      authorizedScheduledLocalDate(original),
    );
    return readNativeCheckpointInSnapshot(snapshot, original, intent);
  });
}
