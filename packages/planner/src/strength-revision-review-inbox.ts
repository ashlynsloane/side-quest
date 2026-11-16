import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import { reassessStoredStrengthRevisionPreview } from './strength-revision-preview-sqlite';
import { readStrengthPreviewReviewState } from './strength-preview-review-events-sqlite';

/** Read-only queue. No item in this list is an executable prescription. */
export interface UnapprovedStrengthReviewInboxItem {
  previewId: string;
  createdAt: string;
  blockId: string;
  sessionId: string;
  decisionId: string;
  proposedMinutes: number;
  status: 'needs_review' | 'dismissed' | 'stale';
  stale: boolean;
  reasons: string[];
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

/**
 * Query an athlete-owned bounded page and reconcile EVERY row. Errors caused
 * by corrupt previews or histories fail the whole query rather than silently
 * hiding an unsafe or unrecognized record.
 *
 * Evidence supplied by the caller is NOT verified external provider evidence.
 * 'needs_review' means the stored preview passed read-only rechecks ONLY.
 */
export async function listUnapprovedStrengthReviewInbox(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  evidence: CurrentStrengthReviewEvidence,
  pageSize = 20,
  offset = 0,
): Promise<UnapprovedStrengthReviewInboxItem[]> {
  if (!athleteId.trim() || evidence.athleteId !== athleteId) {
    throw new Error('Strength preview inbox athlete evidence mismatch.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error('Strength preview inbox page size must be between 1 and 50.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Strength preview inbox offset must be a nonnegative safe integer.');
  }
  const owner = await sql.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    [],
  );
  if (owner?.user_id !== athleteId) {
    throw new Error('Strength preview inbox database ownership mismatch.');
  }
  // The database is already locked to this athlete. A foreign-owned
  // preview or lifecycle event inside it is corrupt, not an item to hide.
  const foreignPreview = await sql.getFirst<{ id: string }>(
    'SELECT id FROM strength_revision_previews WHERE athlete_id <> ? LIMIT 1',
    [athleteId],
  );
  const foreignReview = await sql.getFirst<{ id: string }>(
    'SELECT id FROM strength_revision_preview_review_events WHERE athlete_id <> ? LIMIT 1',
    [athleteId],
  );
  if (foreignPreview || foreignReview) {
    throw new Error('Strength preview inbox contains a wrong-owner audit record.');
  }
  const rows = await sql.getAll<{ id: string }>(
    `SELECT id FROM strength_revision_previews
     ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );
  const items: UnapprovedStrengthReviewInboxItem[] = [];
  for (const row of rows) {
    const review = await readStrengthPreviewReviewState(sql, athleteId, row.id);
    const assessment = await reassessStoredStrengthRevisionPreview(
      sql, athleteId, row.id, evidence,
    );
    const preview = assessment.preview;
    const stale = assessment.status === 'stale';
    const status = review.status === 'dismissed'
      ? 'dismissed' : stale ? 'stale' : 'needs_review';
    if (typeof preview.decision.proposedMinutes !== 'number'
      || !Number.isFinite(preview.decision.proposedMinutes)
      || preview.decision.proposedMinutes <= 0) {
      throw new Error('Strength revision inbox contains an invalid dose.');
    }
    items.push({
      previewId: preview.id, createdAt: preview.createdAt,
      blockId: preview.binding.blockId, sessionId: preview.binding.sessionId,
      decisionId: preview.decision.id,
      proposedMinutes: preview.decision.proposedMinutes,
      status, stale, reasons: assessment.reasons,
      executableWorkoutApproved: false, requiresWriteTimeRevalidation: true,
    });
  }
  return items;
}
