import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import {
  verifyStrengthRevisionPreviewBinding,
} from './strength-revision-preview-binding';
import { evaluateStrengthWorkoutRevision } from './strength-workout-revision-review';
import { readStrengthChoiceAudit } from './daily-strength-decision-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import type { StoredStrengthPreviewAssessment } from './strength-revision-preview-sqlite';
import type { StrengthPreviewReviewState } from './strength-preview-review-events-sqlite';
import {
  readStrengthEvidenceProvenance,
} from './strength-evidence-provenance-sqlite';
import type { TrainingSafetyPolicy } from './training-safety-context-sqlite';
import type { StrengthMovementRestrictionAssessment } from './strength-movement-restriction-review';

/** Read-only, non-clinical diagnostics. No combination of gates confers clearance. */
export type StrengthApprovalGateId =
  | 'source_identity' | 'candidate_structure' | 'movement_compatibility'
  | 'session_uncompleted'
  | 'no_conflicting_decision' | 'review_disposition'
  | 'symptom_check_in' | 'readiness_check_in' | 'local_pt_profile'
  | 'external_provider_restrictions' | 'source_provenance'
  | 'athlete_execution_confirmation' | 'executable_write_authorization';

export interface StrengthApprovalDiagnosticGate {
  id: StrengthApprovalGateId;
  title: string;
  status: 'local_check_passed' | 'blocked' | 'unverified'
    | 'not_implemented' | 'not_applicable';
  detail: string;
}

export interface StrengthApprovalPreflight {
  schemaVersion: 1;
  gates: StrengthApprovalDiagnosticGate[];
  blockingGateCount: number;
  /** Explicitly false regardless of the status of any individual check. */
  executableWorkoutApproved: false;
  canConfirmExecutableWorkout: false;
  requiresIndependentProviderVerification: boolean;
  requiresWriteTimeRevalidation: true;
}

function canonicalUtc(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const n = Date.parse(value);
  if (!Number.isFinite(n)) return false;
  const canonical = new Date(n).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
}

/**
 * This function MUST be called from inside the single athlete-owned read
 * snapshot used by readUnapprovedStrengthReviewDetail. It reads persisted
 * evidence rather than treating caller-supplied 'verified_none' or 'complete'
 * flags as trusted medical or training-source attestations.
 *
 * This API has no mutation/authorization method and never returns a
 * permission to start exercise or modify the training block.
 */
export async function inspectStrengthApprovalPreflight(
  sql: TrainingAdjustmentSqlDriver,
  assessment: StoredStrengthPreviewAssessment,
  review: StrengthPreviewReviewState,
  evidence: CurrentStrengthReviewEvidence,
  nowMs = Date.now(),
  trainingPolicy?: TrainingSafetyPolicy,
  movementAssessment?: StrengthMovementRestrictionAssessment,
): Promise<StrengthApprovalPreflight> {
  if (!Number.isFinite(nowMs)
    || evidence.athleteId !== assessment.preview.binding.athleteId
    || review.executableWorkoutApproved !== false
    || assessment.executableWorkoutApproved !== false) {
    throw new Error('Unapproved strength diagnostic input integrity mismatch.');
  }
  const preview = assessment.preview;
  const gates: StrengthApprovalDiagnosticGate[] = [];
  const add = (
    id: StrengthApprovalGateId,
    title: string,
    status: StrengthApprovalDiagnosticGate['status'],
    detail: string,
  ) => gates.push({ id, title, status, detail });

  const source = assessment.sourceSession;
  const bindingValid = !!source && verifyStrengthRevisionPreviewBinding({
    binding: preview.binding, source, candidate: preview.candidate,
    decision: preview.decision, evidence: preview.evidence,
  }).valid;
  add('source_identity', 'Original workout and source version',
    bindingValid ? 'local_check_passed' : 'blocked',
    bindingValid
      ? 'The stored proposal still matches the local source record; it is not a medical clearance.'
      : 'The source workout is missing, changed, or cannot be reconciled. A new review is required.');

  const structural = bindingValid && source
    ? evaluateStrengthWorkoutRevision({
      original: source.workout, proposed: preview.candidate,
      maximumMinutes: preview.decision.proposedMinutes ?? 0,
    })
    : null;
  add('candidate_structure', 'Exact exercise-dose comparison',
    structural?.structurallyValid ? 'local_check_passed' : 'blocked',
    structural?.structurallyValid
      ? 'No unreviewed increase was detected by the structural validator; clinical restrictions remain unverified.'
      : 'The proposed exercise dose could not be safely compared to the current source.');

  // Physical movement compatibility is a separate gate from structural
  // reductions: fewer reps/seconds cannot resolve a contraindicated exercise.
  // These are catalog-tag warnings, never verified clinical clearance.
  if (movementAssessment && (
    movementAssessment.executableWorkoutApproved !== false
    || movementAssessment.canApplyWorkout !== false
    || movementAssessment.matchingIsClinicalClearance !== false
    || !Array.isArray(movementAssessment.findings)
    || !Number.isSafeInteger(movementAssessment.potentialConflictCount)
    || !Number.isSafeInteger(movementAssessment.needsIndividualReviewCount)
    || movementAssessment.potentialConflictCount !==
      movementAssessment.findings.filter(f => f.status === 'potential_conflict').length
    || movementAssessment.needsIndividualReviewCount !==
      movementAssessment.findings.filter(f => f.status === 'needs_individual_review').length
    || movementAssessment.track !== trainingPolicy?.track
  )) {
    throw new Error('Movement restriction diagnostic integrity mismatch.');
  }
  const movementConflicts = movementAssessment?.potentialConflictCount ?? 0;
  const movementNeedsReview = movementAssessment?.needsIndividualReviewCount ?? 0;
  const protectedCount = movementAssessment?.protectedMovements.length ?? 0;
  const movementBlocked = protectedCount > 0
    && (movementConflicts > 0 || movementNeedsReview > 0);
  const movementNotApplicable = movementAssessment?.track === 'routine_training_review'
    && protectedCount === 0 && movementNeedsReview === 0
    && movementConflicts === 0;
  add('movement_compatibility', 'Protected-movement exercise compatibility',
    movementBlocked ? 'blocked'
      : movementNotApplicable ? 'not_applicable' : 'unverified',
    movementBlocked
      ? `The candidate has ${movementConflicts} potential exercise conflict(s) and ${movementNeedsReview} exercise(s) requiring individual review. Reducing dose does not remove a restriction.`
      : movementNotApplicable
        ? 'No protected movement was recorded for ordinary training; this does not establish exercise safety.'
        : protectedCount > 0
          ? 'No tagged conflict detected, but this does not verify clinical compatibility with protected movements.'
          : 'Movement-specific compatibility needs individual context or complete exercise annotations; clinical clearance is not established.');

  const completed = await sql.getFirst<{ id: string }>(
    'SELECT id FROM workout_ledger WHERE planned_session_id = ? LIMIT 1',
    [preview.binding.sessionId],
  );
  add('session_uncompleted', 'Session completion history',
    completed ? 'blocked' : 'local_check_passed',
    completed
      ? 'This planned session has a completion record; do not reuse the proposal.'
      : 'No linked completion was found locally; missing imports may still exist.');

  const choices = await readStrengthChoiceAudit(
    sql, preview.binding.athleteId, preview.binding.blockId, preview.binding.sessionId,
  );
  const conflictingChoice = choices.at(-1)?.decision === 'accepted';
  add('no_conflicting_decision', 'Competing strength decision',
    conflictingChoice ? 'blocked' : 'local_check_passed',
    conflictingChoice
      ? 'An existing accepted planning decision must be reconciled before any new proposal.'
      : 'No unresolved accepted planning choice was found in this athlete database.');

  add('review_disposition', 'Draft review-list state',
    review.status === 'dismissed' ? 'blocked' : 'local_check_passed',
    review.status === 'dismissed'
      ? 'This draft was dismissed from pending review.'
      : 'The draft is visible for consideration only, not approved for training.');

  const checkinRow = await sql.getFirst<{ check_in_json: string }>(
    'SELECT check_in_json FROM training_check_ins WHERE active = 1 ORDER BY updated_at DESC LIMIT 1',
    [],
  );
  let symptomClear = false;
  if (checkinRow) {
    try {
      const check = JSON.parse(checkinRow.check_in_json) as {
        status?: unknown; active?: unknown; activeUntil?: unknown;
      };
      symptomClear = check?.status === 'normal' && check.active === true
        && canonicalUtc(check.activeUntil) && Date.parse(check.activeUntil) > nowMs;
    } catch { symptomClear = false; }
  }
  add('symptom_check_in', 'Active symptom check-in',
    symptomClear ? 'local_check_passed' : 'blocked',
    symptomClear
      ? 'The local active check-in is normal and unexpired; external injury constraints remain controlling.'
      : 'A normal, active, unexpired symptom check-in was not verified. Review current symptoms.');

  const readinessRow = await sql.getFirst<{ check_in_json: string }>(
    'SELECT check_in_json FROM readiness_check_ins WHERE date = ? LIMIT 1',
    [evidence.todayLocalDate],
  );
  let readinessAdequate = false;
  if (readinessRow) {
    try {
      const read = JSON.parse(readinessRow.check_in_json) as Record<string, unknown>;
      const fields = ['sleep', 'energy', 'muscleFreshness', 'stress', 'motivation'] as const;
      if (read && fields.every(field => typeof read[field] === 'number'
        && Number.isFinite(read[field]) && Number(read[field]) >= 1
        && Number(read[field]) <= 5)) {
        const score = (Number(read.sleep) + Number(read.energy)
          + Number(read.muscleFreshness) + 6 - Number(read.stress)
          + Number(read.motivation)) / 5;
        readinessAdequate = score >= 2.4;
      }
    } catch { readinessAdequate = false; }
  }
  add('readiness_check_in', 'Readiness for ' + evidence.todayLocalDate,
    readinessAdequate ? 'local_check_passed' : 'blocked',
    readinessAdequate
      ? 'The in-app readiness values meet the existing planning threshold, not a medical threshold.'
      : 'Required same-day readiness values are absent, malformed, or indicate recovery.');

  const ptRow = await sql.getFirst<{ profile_json: string }>(
    'SELECT profile_json FROM pt_profiles ORDER BY updated_at DESC LIMIT 1', [],
  );
  let ptInactive = false;
  if (ptRow) {
    try {
      const pt = JSON.parse(ptRow.profile_json) as { active?: unknown };
      ptInactive = pt?.active === false;
    } catch { ptInactive = false; }
  }
  add('local_pt_profile', 'Stored PT profile',
    ptInactive ? 'local_check_passed' : 'blocked',
    ptInactive
      ? 'The latest in-app profile is marked inactive. This does not verify the absence of outside restrictions.'
      : 'The in-app PT profile is missing, unreadable, or has active/unknown restrictions.');

  // Unverified source references can reveal extra blockers or contradictions;
  // they can NEVER satisfy an independent clinician/provenance requirement.
  const provenance = await readStrengthEvidenceProvenance(
    sql, preview.binding.athleteId, preview.id, nowMs,
  );
  const r = provenance.restriction;
  const c = provenance.coverage;
  const restrictionBlocked = ['reported_restriction', 'conflicting', 'expired'].includes(r.status);
  // An explicitly routine, unrestricted athlete does NOT require a clinician
  // document merely to participate in ordinary training. The track is read
  // from an athlete-owned history across all drafts, not from a caller's
  // self-asserted 'verified_none' flag.
  const ordinaryNoProviderRequirement =
    trainingPolicy?.track === 'routine_training_review'
    && trainingPolicy.knownRestrictionCount === 0
    && trainingPolicy.requiresRestrictionAwareExerciseReview === false
    && !restrictionBlocked;
  add('external_provider_restrictions', 'Independent provider restriction review',
    ordinaryNoProviderRequirement ? 'not_applicable'
      : restrictionBlocked ? 'blocked' : 'unverified',
    ordinaryNoProviderRequirement
      ? 'Clinician paperwork is not required for uncomplicated routine training. This particular exercise revision remains unapproved.'
      : r.status === 'reported_restriction'
      ? 'A restriction has been reported; it remains unresolved until independently reviewed.'
      : r.status === 'conflicting'
        ? 'Conflicting restriction claims were recorded. Neither claim constitutes clearance.'
        : r.status === 'expired'
          ? 'The last restriction observation is stale or expired. Obtain current verified restrictions.'
          : r.eventCount
            ? 'Restriction information is self-reported or only referenced; no authenticated provider review exists.'
            : 'No authenticated clinician restriction source or exercise-specific clearance is connected.');
  const coverageBlocked = ['partial', 'conflicting', 'expired'].includes(c.status);
  add('source_provenance', 'Training and injury evidence coverage',
    coverageBlocked ? 'blocked' : 'unverified',
    c.status === 'partial'
      ? 'An incomplete training or injury source was reported; missing activity may change the dose.'
      : c.status === 'expired'
        ? 'The source observation is stale or expired; current training coverage is unknown.'
        : c.eventCount
          ? 'A training source was described, but its completeness is not independently verified.'
          : 'The saved coverage flag is caller-supplied; authoritative source coverage is unverified.');
  add('athlete_execution_confirmation', 'Explicit executable-workout confirmation',
    'not_implemented',
    'This screen offers draft organization only; no exercise-execution consent is collected.');
  add('executable_write_authorization', 'Atomic executable-workout approval',
    'not_implemented',
    'No trusted write-time clinical clearance and executable exercise transaction exists.');

  return {
    schemaVersion: 1,
    gates,
    blockingGateCount: gates.filter(gate =>
      gate.status !== 'local_check_passed' && gate.status !== 'not_applicable').length,
    executableWorkoutApproved: false, canConfirmExecutableWorkout: false,
    requiresIndependentProviderVerification: !ordinaryNoProviderRequirement,
    requiresWriteTimeRevalidation: true,
  };
}
