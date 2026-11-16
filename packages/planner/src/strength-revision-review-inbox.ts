import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import { withUnapprovedStrengthReadSnapshot } from './strength-review-read-snapshot';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import { reassessStoredStrengthRevisionPreview } from './strength-revision-preview-sqlite';
import { readStrengthPreviewReviewState } from './strength-preview-review-events-sqlite';
import { readStrengthEvidenceProvenance } from './strength-evidence-provenance-sqlite';
import {
  readAthleteTrainingSafetyContext, evaluateTrainingSafetyPolicy,
} from './training-safety-context-sqlite';
import { assessStrengthMovementRestrictions } from './strength-movement-restriction-review';

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
  return withUnapprovedStrengthReadSnapshot(sql, async (snapshot) => {
  const owner = await snapshot.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    [],
  );
  if (owner?.user_id !== athleteId) {
    throw new Error('Strength preview inbox database ownership mismatch.');
  }
  // The database is already locked to this athlete. A foreign-owned
  // preview or lifecycle event inside it is corrupt, not an item to hide.
  const foreignPreview = await snapshot.getFirst<{ id: string }>(
    'SELECT id FROM strength_revision_previews WHERE athlete_id <> ? LIMIT 1',
    [athleteId],
  );
  const foreignReview = await snapshot.getFirst<{ id: string }>(
    'SELECT id FROM strength_revision_preview_review_events WHERE athlete_id <> ? LIMIT 1',
    [athleteId],
  );
  if (foreignPreview || foreignReview) {
    throw new Error('Strength preview inbox contains a wrong-owner audit record.');
  }
  const orphanReview = await snapshot.getFirst<{ id: string }>(
    `SELECT e.id FROM strength_revision_preview_review_events e
     LEFT JOIN strength_revision_previews p ON p.id = e.preview_id
     WHERE p.id IS NULL OR p.athlete_id <> e.athlete_id LIMIT 1`,
    [],
  );
  if (orphanReview) {
    throw new Error('Strength preview inbox contains an orphaned review event.');
  }
  // Provenance is append-only safety history. Orphans and cross-athlete rows
  // must fail the entire inbox, even if the affected preview is off-page.
  const corruptedLineage = await snapshot.getFirst<{ id: string }>(
    `SELECT e.id FROM strength_evidence_provenance_events e
     LEFT JOIN strength_revision_previews p ON p.id = e.preview_id
     WHERE e.athlete_id <> ? OR p.id IS NULL
       OR p.athlete_id <> e.athlete_id
     LIMIT 1`,
    [athleteId],
  );
  if (corruptedLineage) {
    throw new Error('Strength preview inbox contains an orphaned or wrong-owner evidence record.');
  }
  const safetyContext = await readAthleteTrainingSafetyContext(snapshot, athleteId);
  const safetyPolicy = evaluateTrainingSafetyPolicy(safetyContext);
  const rows = await snapshot.getAll<{ id: string }>(
    `SELECT id FROM strength_revision_previews
     ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );
  const items: UnapprovedStrengthReviewInboxItem[] = [];
  for (const row of rows) {
    const review = await readStrengthPreviewReviewState(snapshot, athleteId, row.id);
    const assessment = await reassessStoredStrengthRevisionPreview(
      snapshot, athleteId, row.id, evidence,
    );
    const preview = assessment.preview;
    const movement = assessStrengthMovementRestrictions(
      preview.candidate, safetyContext, safetyPolicy,
    );
    const movementReasons: string[] = [];
    if (movement.protectedMovements.length > 0
      && (movement.potentialConflictCount > 0
        || movement.needsIndividualReviewCount > 0)) {
      movementReasons.push(
        `Protected movement review: ${movement.potentialConflictCount} potential conflict(s), ${movement.needsIndividualReviewCount} exercise(s) requiring individual review.`,
      );
    }
    const lineage = await readStrengthEvidenceProvenance(
      snapshot, athleteId, row.id,
    );
    const lineageReasons: string[] = [];
    if (['reported_restriction', 'conflicting', 'expired'].includes(
      lineage.restriction.status,
    )) {
      lineageReasons.push('Unverified or contradictory provider restriction claims require review.');
    }
    if (['partial', 'conflicting', 'expired'].includes(lineage.coverage.status)) {
      lineageReasons.push('Training source provenance is incomplete or expired.');
    }
    const stale = assessment.status === 'stale'
      || lineageReasons.length > 0 || movementReasons.length > 0;
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
      status, stale, reasons: [
        ...assessment.reasons, ...lineageReasons, ...movementReasons,
      ],
      executableWorkoutApproved: false, requiresWriteTimeRevalidation: true,
    });
  }
  return items;
  });
}
