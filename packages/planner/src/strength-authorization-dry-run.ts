import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import {
  assessStrengthReviewWithinTransaction, type UnapprovedStrengthReviewDetail,
} from './strength-revision-review-detail';
import type { StrengthApprovalGateId } from './strength-approval-preflight';

/**
 * Explicit, non-executable authorization simulation. Uses the SAME evidence
 * evaluator as the read-only UI, re-reading its sources INSIDE a fresh
 * exclusive SQLite transaction. No candidate is applied, no workout is
 * saved and no athlete consent is inferred.
 */
export interface StrengthAuthorizationDryRunResult {
  schemaVersion: 1;
  kind: 'non_executable_authorization_dry_run';
  athleteId: string;
  previewId: string;
  changedSinceViewed: boolean;
  current: UnapprovedStrengthReviewDetail;
  blockingGateIds: StrengthApprovalGateId[];
  executableWorkoutApproved: false;
  canConfirmExecutableWorkout: false;
  workoutPersisted: false;
  athleteExecutionConsentCollected: false;
  requiresWriteTimeRevalidation: true;
}

export async function inspectStrengthAuthorizationDryRun(
  sql: TrainingAdjustmentSqlDriver,
  request: {
    athleteId: string;
    previewId: string;
    evidence: CurrentStrengthReviewEvidence;
    expectedObservationToken: string;
  },
): Promise<StrengthAuthorizationDryRunResult> {
  const { athleteId, previewId, evidence, expectedObservationToken } = request;
  if (!athleteId?.trim() || !previewId?.trim()
    || !evidence || evidence.athleteId !== athleteId
    || typeof expectedObservationToken !== 'string'
    || !expectedObservationToken.trim()
    || expectedObservationToken.length > 1_000_000) {
    throw new Error('Invalid unapproved strength authorization dry-run request.');
  }
  if (typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Exclusive SQLite evidence revalidation is unavailable.');
  }
  return sql.exclusiveTransaction(async transaction => {
    // Force the shared evaluator to run read-only even though the
    // exclusive transaction itself has a write-capable native handle.
    const readOnly: TrainingAdjustmentSqlDriver = {
      getFirst: (query, params) => transaction.getFirst(query, params),
      getAll: (query, params) => transaction.getAll(query, params),
      run: async () => {
        throw new Error('Strength authorization dry run cannot write SQL.');
      },
      transaction: async () => {
        throw new Error('Strength authorization dry run cannot nest transactions.');
      },
    };
    const current = await assessStrengthReviewWithinTransaction(
      readOnly, athleteId, previewId, evidence,
    );
    const blockingGateIds = current.preflight.gates
      .filter(gate => gate.status !== 'local_check_passed'
        && gate.status !== 'not_applicable')
      .map(gate => gate.id);
    if (blockingGateIds.length !== current.preflight.blockingGateCount
      || current.reconciliation.unresolvedCount !== blockingGateIds.length
      || current.executableWorkoutApproved !== false
      || current.preflight.canConfirmExecutableWorkout !== false
      || current.movementRestrictions.canApplyWorkout !== false) {
      throw new Error('Dry-run safety gate reconciliation mismatch.');
    }
    return {
      schemaVersion: 1, kind: 'non_executable_authorization_dry_run',
      athleteId, previewId,
      changedSinceViewed: expectedObservationToken !== current.observationToken,
      current, blockingGateIds,
      executableWorkoutApproved: false, canConfirmExecutableWorkout: false,
      workoutPersisted: false, athleteExecutionConsentCollected: false,
      requiresWriteTimeRevalidation: true,
    };
  });
}
