import type { GeneratedWorkout } from '@circuit/domain';
import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import { localCalendarDate } from './first-week-dates';
import {
  assessStrengthReviewWithinTransaction, type UnapprovedStrengthReviewDetail,
} from './strength-revision-review-detail';
import { readStrengthRevisionPreview } from './strength-revision-preview-sqlite';


/**
 * A distinct append-only AUTHORIZATION of an exact routine-training workout.
 * It is NOT a medical clearance, not a completed workout, and not an
 * instruction to start the next session automatically. The source plan is
 * immutable. Only an explicit athlete confirmation can create this record.
 */
export const STRENGTH_WORKOUT_AUTHORIZATION_SQL = `
CREATE TABLE IF NOT EXISTS strength_workout_authorizations (
  id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  authorization_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_strength_workout_authorized_session
  ON strength_workout_authorizations(athlete_id, block_id, session_id);
CREATE INDEX IF NOT EXISTS idx_strength_workout_authorized_preview
  ON strength_workout_authorizations(athlete_id, preview_id);
`;

export interface AthleteStrengthAuthorizationConfirmations {
  exactExercisesAndDoseReviewed: true;
  recentTrainingHistoryReviewed: true;
  noKnownUnreportedRestrictions: true;
}

export interface AuthorizedStrengthWorkoutRecord {
  schemaVersion: 1;
  id: string;
  athleteId: string;
  blockId: string;
  sessionId: string;
  previewId: string;
  createdAt: string;
  scope: 'uncomplicated_routine_training_only';
  candidateSignature: string;
  bindingSignature: string;
  workout: GeneratedWorkout;
  confirmations: AthleteStrengthAuthorizationConfirmations;
  athleteConfirmed: true;
  executableWorkoutApproved: true;
  requiresFreshStartRevalidation: true;
  automaticallyStarted: false;
  clinicianClearanceAttested: false;
}

export interface StrengthWorkoutAuthorizationResult {
  schemaVersion: 1;
  status: 'authorized_routine_workout';
  authorization: AuthorizedStrengthWorkoutRecord;
  originalPlanModified: false;
  workoutStarted: false;
  requiresFreshStartRevalidation: true;
}

export interface StrengthWorkoutAuthorizationRequest {
  athleteId: string;
  previewId: string;
  authorizationId: string;
  expectedObservationToken: string;
  evidence: CurrentStrengthReviewEvidence;
  confirmations: AthleteStrengthAuthorizationConfirmations;
}

const REQUIRED_LOCAL_GATES = [
  'source_identity', 'candidate_structure', 'session_uncompleted',
  'no_conflicting_decision', 'review_disposition',
  'symptom_check_in', 'readiness_check_in', 'local_pt_profile',
] as const;

function validUtc(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) && (
    value === new Date(date).toISOString()
    || value === new Date(date).toISOString().replace('.000Z', 'Z')
  );
}
function validConfirmations(value: unknown): value is AthleteStrengthAuthorizationConfirmations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return Object.keys(o).sort().join('|') === [
    'exactExercisesAndDoseReviewed', 'noKnownUnreportedRestrictions',
    'recentTrainingHistoryReviewed',
  ].join('|') && o.exactExercisesAndDoseReviewed === true
    && o.recentTrainingHistoryReviewed === true
    && o.noKnownUnreportedRestrictions === true;
}

function authorizationEligibility(
  detail: UnapprovedStrengthReviewDetail,
  evidence: CurrentStrengthReviewEvidence,
  now = new Date(),
): string[] {
  const reasons: string[] = [];
  if (evidence.todayLocalDate !== localCalendarDate(now)
    || detail.summary.sourceDate < evidence.todayLocalDate) {
    reasons.push('Routine authorization requires current local-day evidence and a future or current session.');
  }
  if (detail.status !== 'pending_review' || detail.stale
    || detail.review.status !== 'pending_review') {
    reasons.push('The saved draft is no longer pending current review.');
  }
  if (detail.trainingPolicy.track !== 'routine_training_review'
    || detail.trainingPolicy.knownRestrictionCount !== 0
    || detail.trainingPolicy.requiresRestrictionAwareExerciseReview !== false
    || detail.trainingPolicy.canApproveExerciseRevision !== false) {
    reasons.push('Only uncomplicated routine training can use athlete-only confirmation.');
  }
  for (const id of REQUIRED_LOCAL_GATES) {
    if (detail.preflight.gates.find(g => g.id === id)?.status !== 'local_check_passed') {
      reasons.push('Local safety gate does not pass: ' + id + '.');
    }
  }
  for (const id of ['movement_compatibility', 'external_provider_restrictions'] as const) {
    if (detail.preflight.gates.find(g => g.id === id)?.status !== 'not_applicable') {
      reasons.push('A movement or provider restriction requires separate review: ' + id + '.');
    }
  }
  // Routine athletes do not need external clinician documents. Nevertheless,
  // any source claim or missing-activity concern must be reconciled first.
  if (detail.provenance.events.length
    || detail.preflight.gates.find(g => g.id === 'source_provenance')?.status !== 'unverified') {
    reasons.push('Unresolved activity history or restriction provenance prevents routine authorization.');
  }
  if (detail.movementRestrictions.protectedMovements.length
    || !detail.movementRestrictions.findings.length
    || detail.movementRestrictions.findings.some(f =>
      f.status !== 'routine_not_applicable'
      || !f.exerciseId.trim() || !f.exerciseName.trim())) {
    reasons.push('Candidate exercise annotations need individual movement review.');
  }
  if (detail.preflight.gates.length !== 13
    || detail.preflight.gates.some(g =>
      !['local_check_passed', 'not_applicable', 'unverified',
        'not_implemented', 'blocked'].includes(g.status))
    || detail.preflight.canConfirmExecutableWorkout !== false
    || detail.executableWorkoutApproved !== false) {
    reasons.push('Unexpected or incomplete approval diagnostic.');
  }
  return reasons;
}

/**
 * Read-only eligibility guidance for the confirmation UI. This is never
 * permission to execute; the transaction repeats every check and rejects a
 * changed observation token.
 */
export function getRoutineStrengthAuthorizationReadiness(
  detail: UnapprovedStrengthReviewDetail,
  todayLocalDate = localCalendarDate(new Date()),
): { canRequestAuthorization: boolean; blockers: string[] } {
  const simulatedEvidence = { todayLocalDate } as CurrentStrengthReviewEvidence;
  const blockers = authorizationEligibility(detail, simulatedEvidence);
  return { canRequestAuthorization: blockers.length === 0, blockers };
}

function parseAuthorization(row: {
  id: string; athlete_id: string; block_id: string; session_id: string;
  preview_id: string; authorization_json: string; created_at: string;
}): AuthorizedStrengthWorkoutRecord {
  let event: AuthorizedStrengthWorkoutRecord;
  try { event = JSON.parse(row.authorization_json) as AuthorizedStrengthWorkoutRecord; }
  catch { throw new Error('Routine workout authorization history is unreadable.'); }
  const expectedKeys = [
    'athleteConfirmed', 'athleteId', 'automaticallyStarted', 'bindingSignature',
    'blockId', 'candidateSignature', 'clinicianClearanceAttested',
    'confirmations', 'createdAt', 'executableWorkoutApproved', 'id',
    'previewId', 'requiresFreshStartRevalidation', 'schemaVersion',
    'scope', 'sessionId', 'workout',
  ].sort().join('|');
  if (!event || typeof event !== 'object'
    || Object.keys(event).sort().join('|') !== expectedKeys
    || event.schemaVersion !== 1 || !event.id?.trim()
    || event.id !== row.id || event.athleteId !== row.athlete_id
    || event.blockId !== row.block_id || event.sessionId !== row.session_id
    || event.previewId !== row.preview_id || event.createdAt !== row.created_at
    || !validUtc(event.createdAt)
    || event.scope !== 'uncomplicated_routine_training_only'
    || event.athleteConfirmed !== true
    || event.executableWorkoutApproved !== true
    || event.requiresFreshStartRevalidation !== true
    || event.automaticallyStarted !== false
    || event.clinicianClearanceAttested !== false
    || !validConfirmations(event.confirmations)
    || event.candidateSignature !== JSON.stringify(event.workout)
    || !event.bindingSignature?.trim()) {
    throw new Error('Routine workout authorization audit integrity mismatch.');
  }
  return event;
}

/** This is an audit read, NOT permission to execute without fresh checks. */
export async function readAuthorizedRoutineWorkout(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  sessionId: string,
): Promise<AuthorizedStrengthWorkoutRecord | null> {
  const owner = await sql.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1', [],
  );
  if (!athleteId?.trim() || !sessionId?.trim() || owner?.user_id !== athleteId) {
    throw new Error('Routine workout authorization athlete ownership mismatch.');
  }
  const rows = await sql.getAll<{
    id: string; athlete_id: string; block_id: string; session_id: string;
    preview_id: string; authorization_json: string; created_at: string;
  }>(
    `SELECT id, athlete_id, block_id, session_id, preview_id,
       authorization_json, created_at FROM strength_workout_authorizations
       WHERE session_id = ?`,
    [sessionId],
  );
  if (rows.length > 1) throw new Error('Ambiguous authorized routine workout records.');
  if (!rows.length) return null;
  const record = parseAuthorization(rows[0]!);
  if (record.athleteId !== athleteId) {
    throw new Error('Foreign-owned routine workout authorization detected.');
  }
  const preview = await readStrengthRevisionPreview(sql, athleteId, record.previewId);
  if (!preview || preview.binding.blockId !== record.blockId
    || preview.binding.sessionId !== record.sessionId
    || JSON.stringify(preview.binding) !== record.bindingSignature
    || JSON.stringify(preview.candidate) !== record.candidateSignature) {
    throw new Error('Authorized routine workout is no longer bound to its original preview.');
  }
  return record;
}

/** 
 * Atomic, explicit athlete authorization of a routine workout version.
 * This does not change the generated source plan, auto-start the session,
 * clear rehabilitation restrictions, or authorize later drifted versions.
 */
export async function authorizeRoutineStrengthWorkout(
  sql: TrainingAdjustmentSqlDriver,
  request: StrengthWorkoutAuthorizationRequest,
): Promise<StrengthWorkoutAuthorizationResult> {
  const { athleteId, previewId, authorizationId, expectedObservationToken,
    evidence, confirmations } = request;
  if (!athleteId?.trim() || !previewId?.trim()
    || !authorizationId?.trim() || authorizationId.length > 160
    || !validConfirmations(confirmations)
    || !evidence || evidence.athleteId !== athleteId
    || typeof expectedObservationToken !== 'string'
    || !expectedObservationToken.trim()
    || expectedObservationToken.length > 1_000_000) {
    throw new Error('Explicit routine workout athlete confirmation is incomplete.');
  }
  if (typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Exclusive routine workout authorization transaction is unavailable.');
  }
  const frozen = JSON.parse(JSON.stringify(request)) as StrengthWorkoutAuthorizationRequest;
  return sql.exclusiveTransaction(async txn => {
    // Same evaluator as read-only detail and dry run. Every read is made
    // through the transaction-scoped handle; no separate connection reads.
    const readOnly: TrainingAdjustmentSqlDriver = {
      getFirst: (query, params) => txn.getFirst(query, params),
      getAll: (query, params) => txn.getAll(query, params),
      run: async () => { throw new Error('Authorization assessment cannot write.'); },
      transaction: async () => { throw new Error('Authorization assessment cannot nest.'); },
    };
    const reviewed = await assessStrengthReviewWithinTransaction(
      readOnly, frozen.athleteId, frozen.previewId, frozen.evidence,
    );
    if (reviewed.observationToken !== frozen.expectedObservationToken) {
      throw new Error('Strength review changed since confirmation; refresh and review exact dose.');
    }
    const reasons = authorizationEligibility(reviewed, frozen.evidence);
    if (reasons.length) throw new Error('Routine workout authorization blocked: ' + reasons.join(' '));
    const preview = await readStrengthRevisionPreview(
      readOnly, frozen.athleteId, frozen.previewId,
    );
    if (!preview || JSON.stringify(preview.candidate)
      !== preview.binding.candidateSignature) {
      throw new Error('Authorized candidate workout source is missing or changed.');
    }
    const orphanWithdrawal = await txn.getFirst<{ id: string }>(
      'SELECT id FROM strength_workout_authorization_withdrawals WHERE session_id = ? LIMIT 1',
      [preview.binding.sessionId],
    );
    if (orphanWithdrawal) {
      throw new Error('Unreconciled prior withdrawal blocks fresh authorization.');
    }
    const orphanStartIntent = await txn.getFirst<{ id: string }>(
      'SELECT id FROM strength_workout_start_intents WHERE session_id = ? LIMIT 1',
      [preview.binding.sessionId],
    );
    if (orphanStartIntent) {
      throw new Error('Unreconciled prior start intent blocks fresh authorization.');
    }
    const existing = await txn.getAll<{ id: string; athlete_id: string }>(
      `SELECT id, athlete_id FROM strength_workout_authorizations
       WHERE session_id = ? OR preview_id = ? LIMIT 2`,
      [preview.binding.sessionId, previewId],
    );
    if (existing.some(row => row.athlete_id !== athleteId)) {
      throw new Error('Foreign-owned routine authorization detected in athlete database.');
    }
    if (existing.length) {
      throw new Error('Routine workout version has already been authorized; no duplicate execution approval.');
    }
    const createdAt = new Date().toISOString();
    const record: AuthorizedStrengthWorkoutRecord = {
      schemaVersion: 1, id: frozen.authorizationId,
      athleteId: frozen.athleteId, previewId: frozen.previewId,
      blockId: preview.binding.blockId, sessionId: preview.binding.sessionId,
      createdAt, scope: 'uncomplicated_routine_training_only',
      bindingSignature: JSON.stringify(preview.binding),
      candidateSignature: JSON.stringify(preview.candidate),
      workout: preview.candidate,
      confirmations: frozen.confirmations,
      athleteConfirmed: true,
      executableWorkoutApproved: true,
      requiresFreshStartRevalidation: true,
      automaticallyStarted: false,
      clinicianClearanceAttested: false,
    };
    await txn.run(
      `INSERT INTO strength_workout_authorizations
        (id, athlete_id, block_id, session_id, preview_id,
         authorization_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.athleteId, record.blockId, record.sessionId,
        record.previewId, JSON.stringify(record), record.createdAt],
    );
    return {
      schemaVersion: 1, status: 'authorized_routine_workout',
      authorization: record, originalPlanModified: false,
      workoutStarted: false, requiresFreshStartRevalidation: true,
    };
  });
}
