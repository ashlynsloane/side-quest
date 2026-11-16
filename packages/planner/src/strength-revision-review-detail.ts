import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
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
  const owner = await sql.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    [],
  );
  if (owner?.user_id !== athleteId) {
    throw new Error('Review detail database ownership mismatch.');
  }
  const assessment = await reassessStoredStrengthRevisionPreview(
    sql, athleteId, previewId, evidence,
  );
  const review = await readStrengthPreviewReviewState(
    sql, athleteId, previewId,
  );
  const summary = summarizeUnapprovedStrengthRevision(assessment.preview);
  const stale = assessment.status === 'stale';
  return {
    summary,
    review,
    status: stale ? 'stale' : review.status,
    stale,
    reasons: assessment.reasons,
    executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
}
