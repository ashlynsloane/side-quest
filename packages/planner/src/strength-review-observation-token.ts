import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import type { StoredStrengthRevisionPreview } from './strength-revision-preview-sqlite';
import type { UnapprovedStrengthReviewDetail } from './strength-revision-review-detail';

/**
 * An exact, LOCAL, ephemeral version marker for a displayed review.
 * It includes raw current local SQL rows so even a change in a passing
 * readiness score (4 to 5) invalidates the viewed snapshot.
 *
 * This string is NOT a signature or attestation: the client can fabricate it.
 * It must never authorize an executable workout, and must not be logged,
 * transmitted to analytics, or persisted outside the athlete-owned device.
 */
export async function createStrengthReviewObservationToken(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  preview: StoredStrengthRevisionPreview,
  evidence: CurrentStrengthReviewEvidence,
  detail: Omit<UnapprovedStrengthReviewDetail, 'observationToken'>,
): Promise<string> {
  if (!athleteId?.trim() || preview.binding.athleteId !== athleteId
    || evidence.athleteId !== athleteId
    || detail.executableWorkoutApproved !== false
    || detail.preflight.canConfirmExecutableWorkout !== false) {
    throw new Error('Review observation has invalid athlete or execution state.');
  }
  const [symptoms, readiness, pt, plan, completed, choices] = await Promise.all([
    sql.getAll<{
      id: string; check_in_json: string; active: number; updated_at: string;
    }>(
      `SELECT id, check_in_json, active, updated_at FROM training_check_ins
       WHERE active = 1 ORDER BY updated_at DESC, id ASC`, [],
    ),
    sql.getAll<{ date: string; check_in_json: string }>(
      'SELECT date, check_in_json FROM readiness_check_ins WHERE date = ?',
      [evidence.todayLocalDate],
    ),
    sql.getAll<{ id: string; profile_json: string; updated_at: string }>(
      `SELECT id, profile_json, updated_at FROM pt_profiles
       ORDER BY updated_at DESC, id ASC LIMIT 1`, [],
    ),
    sql.getAll<{ id: string; block_json: string; updated_at: string }>(
      `SELECT id, block_json, updated_at FROM training_blocks
       ORDER BY updated_at DESC, id ASC LIMIT 1`, [],
    ),
    sql.getAll<{ id: string; planned_session_id: string | null }>(
      `SELECT id, planned_session_id FROM workout_ledger
       WHERE planned_session_id = ? ORDER BY id ASC`,
      [preview.binding.sessionId],
    ),
    sql.getAll<{
      id: string; athlete_id: string; block_id: string; session_id: string;
      event_json: string; created_at: string;
    }>(
      `SELECT id, athlete_id, block_id, session_id, event_json, created_at
       FROM daily_strength_choice_events
       WHERE athlete_id = ? AND block_id = ? AND session_id = ?
       ORDER BY created_at ASC, id ASC`,
      [athleteId, preview.binding.blockId, preview.binding.sessionId],
    ),
  ]);
  return JSON.stringify({
    schemaVersion: 1, athleteId, previewId: preview.id,
    date: evidence.todayLocalDate,
    sourceBinding: preview.binding,
    candidate: preview.candidate,
    review: detail.review,
    preflight: detail.preflight,
    trainingPolicy: detail.trainingPolicy,
    movementRestrictions: detail.movementRestrictions,
    provenance: detail.provenance,
    reconciliation: detail.reconciliation,
    displayedStatus: detail.status,
    displayedReasons: detail.reasons,
    symptoms, readiness, pt, plan, completed, choices,
  });
}
