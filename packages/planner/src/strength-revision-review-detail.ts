import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import { withUnapprovedStrengthReadSnapshot } from './strength-review-read-snapshot';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import {
  reassessStoredStrengthRevisionPreview,
} from './strength-revision-preview-sqlite';
import {
  readStrengthPreviewReviewState,
  type StrengthPreviewReviewState,
} from './strength-preview-review-events-sqlite';
import {
  summarizeUnapprovedStrengthRevision,
  type StrengthRevisionReadOnlySummary,
} from './strength-revision-review-summary';
import {
  inspectStrengthApprovalPreflight, type StrengthApprovalPreflight,
} from './strength-approval-preflight';
import {
  readStrengthEvidenceProvenance, type StrengthEvidenceProvenanceLedger,
} from './strength-evidence-provenance-sqlite';
import {
  createStrengthReconciliationChecklist, type StrengthReconciliationChecklist,
} from './strength-evidence-reconciliation';
import {
  readAthleteTrainingSafetyContext, evaluateTrainingSafetyPolicy,
  type TrainingSafetyPolicy,
} from './training-safety-context-sqlite';
import {
  assessStrengthMovementRestrictions,
  type StrengthMovementRestrictionAssessment,
} from './strength-movement-restriction-review';

/**
 * One read-only athlete-owned detail assessment. The source, saved candidate,
 * review events and current SQLite evidence are all checked on a single
 * database handle. It never returns an executable workout or authorizes one.
 */
export interface UnapprovedStrengthReviewDetail {
  summary: StrengthRevisionReadOnlySummary;
  review: StrengthPreviewReviewState;
  status: 'pending_review' | 'dismissed' | 'stale';
  stale: boolean;
  reasons: string[];
  preflight: StrengthApprovalPreflight;
  provenance: StrengthEvidenceProvenanceLedger;
  reconciliation: StrengthReconciliationChecklist;
  trainingPolicy: TrainingSafetyPolicy;
  movementRestrictions: StrengthMovementRestrictionAssessment;
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

/**
 * Internal shared evaluator for a handle ALREADY guarded by an exclusive
 * SQLite transaction. Callers must not pass an ordinary mutable connection.
 * The public read method below always obtains a read snapshot first.
 */
export async function assessStrengthReviewWithinTransaction(
  snapshot: TrainingAdjustmentSqlDriver,
  athleteId: string,
  previewId: string,
  evidence: CurrentStrengthReviewEvidence,
): Promise<UnapprovedStrengthReviewDetail> {
  if (!athleteId?.trim() || !previewId?.trim()
    || evidence?.athleteId !== athleteId) {
    throw new Error('Review detail athlete or preview identity mismatch.');
  }
  const owner = await snapshot.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    [],
  );
  if (owner?.user_id !== athleteId) {
    throw new Error('Review detail database ownership mismatch.');
  }
  const assessment = await reassessStoredStrengthRevisionPreview(
    snapshot, athleteId, previewId, evidence,
  );
  const review = await readStrengthPreviewReviewState(
    snapshot, athleteId, previewId,
  );
  const summary = summarizeUnapprovedStrengthRevision(assessment.preview);
  // Compare all athlete-owned evidence inside one read snapshot. A routine
  // training intent can remove the generic *clinician paperwork requirement*,
  // but never an actual restriction or the executable approval lock.
  const trainingContext = await readAthleteTrainingSafetyContext(snapshot, athleteId);
  const trainingPolicy = evaluateTrainingSafetyPolicy(trainingContext);
  const movementRestrictions = assessStrengthMovementRestrictions(
    assessment.preview.candidate, trainingContext, trainingPolicy,
  );
  const evaluatedAtMs = Date.now();
  const preflight = await inspectStrengthApprovalPreflight(
    snapshot, assessment, review, evidence, evaluatedAtMs, trainingPolicy,
    movementRestrictions,
  );
  const provenance = await readStrengthEvidenceProvenance(
    snapshot, athleteId, previewId, evaluatedAtMs,
  );
  const reconciliation = createStrengthReconciliationChecklist(
    preflight, provenance,
  );
  const provenanceBlockers = preflight.gates.filter(gate =>
    (gate.id === 'external_provider_restrictions' || gate.id === 'source_provenance'
      || gate.id === 'movement_compatibility')
    && gate.status === 'blocked').map(gate => gate.detail);
  const stale = assessment.status === 'stale' || provenanceBlockers.length > 0;
  return {
    summary,
    review,
    status: stale ? 'stale' : review.status,
    stale,
    reasons: [...assessment.reasons, ...provenanceBlockers],
    preflight,
    provenance,
    reconciliation,
    trainingPolicy,
    movementRestrictions,
    executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
}

/**
 * Read-only historical detail. Every nested query is performed through
 * the same native-exclusive SQLite read snapshot, not the outer connection.
 */
export async function readUnapprovedStrengthReviewDetail(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  previewId: string,
  evidence: CurrentStrengthReviewEvidence,
): Promise<UnapprovedStrengthReviewDetail> {
  return withUnapprovedStrengthReadSnapshot(sql, snapshot =>
    assessStrengthReviewWithinTransaction(snapshot, athleteId, previewId, evidence),
  );
}
