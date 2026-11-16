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
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

export async function readUnapprovedStrengthReviewDetail(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  previewId: string,
  evidence: CurrentStrengthReviewEvidence,
): Promise<UnapprovedStrengthReviewDetail> {
  if (!athleteId.trim() || !previewId.trim()
    || evidence.athleteId !== athleteId) {
    throw new Error('Review detail athlete or preview identity mismatch.');
  }
  return withUnapprovedStrengthReadSnapshot(sql, async (snapshot) => {
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
  const preflight = await inspectStrengthApprovalPreflight(
    snapshot, assessment, review, evidence,
  );
  const stale = assessment.status === 'stale';
  return {
    summary,
    review,
    status: stale ? 'stale' : review.status,
    stale,
    reasons: assessment.reasons,
    preflight,
    executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
  });
}
