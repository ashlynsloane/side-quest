import type { GeneratedWorkout, PlannedStrengthSession } from '@circuit/domain';
import {
  strengthSessionSignature, type StrengthChoiceDecision,
} from './daily-strength-decision-sqlite';
import {
  reviewStrengthRevisionForDecision, type CurrentStrengthReviewEvidence,
} from './strength-revision-decision-review';

/**
 * Exact JSON identity bound to a read-only proposal. This is NOT a
 * cryptographic signature, trusted source attestation, or workout approval.
 */
export interface StrengthRevisionPreviewBinding {
  schemaVersion: 1;
  kind: 'strength_revision_preview';
  athleteId: string;
  blockId: string;
  sessionId: string;
  decisionId: string;
  localReviewDate: string;
  sourceSignature: string;
  decisionSignature: string;
  candidateSignature: string;
  evidenceSignature: string;
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

export interface StrengthRevisionBindingResult {
  valid: boolean;
  reasons: string[];
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

/**
 * Produces a preview identity only when the existing exercise-level review
 * permits further athlete consideration. It neither persists nor applies it.
 */
export function createStrengthRevisionPreviewBinding(input: {
  source: PlannedStrengthSession;
  candidate: GeneratedWorkout | null;
  decision: StrengthChoiceDecision;
  evidence: CurrentStrengthReviewEvidence;
}): StrengthRevisionPreviewBinding | null {
  const review = reviewStrengthRevisionForDecision(input);
  if (review.status !== 'reviewable' || !input.candidate) return null;
  return {
    schemaVersion: 1, kind: 'strength_revision_preview',
    athleteId: input.decision.athleteId,
    blockId: input.decision.blockId,
    sessionId: input.decision.sessionId,
    decisionId: input.decision.id,
    localReviewDate: input.evidence.todayLocalDate,
    sourceSignature: strengthSessionSignature(input.source),
    decisionSignature: JSON.stringify(input.decision),
    candidateSignature: JSON.stringify(input.candidate),
    evidenceSignature: JSON.stringify(input.evidence),
    executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
}

/**
 * Exact-match validation after reopening a review. Reuses the underlying
 * safety preflight; the caller still must resolve authoritative evidence at
 * the eventual SQLite write boundary. Never treats a match as clearance.
 */
export function verifyStrengthRevisionPreviewBinding(input: {
  binding: StrengthRevisionPreviewBinding | null;
  source: PlannedStrengthSession;
  candidate: GeneratedWorkout | null;
  decision: StrengthChoiceDecision;
  evidence: CurrentStrengthReviewEvidence;
}): StrengthRevisionBindingResult {
  const { binding, ...current } = input;
  const fresh = createStrengthRevisionPreviewBinding(current);
  const reasons: string[] = [];
  if (!binding || !fresh) {
    reasons.push('Original or current revision evidence cannot be reviewed.');
  } else {
    for (const key of Object.keys(fresh) as Array<keyof StrengthRevisionPreviewBinding>) {
      if (!Object.prototype.hasOwnProperty.call(binding, key)
        || binding[key] !== fresh[key]) {
        reasons.push('Reviewed proposal changed at ' + key + '.');
      }
    }
    if (Object.keys(binding).length !== Object.keys(fresh).length) {
      reasons.push('Reviewed proposal contains unrecognized metadata.');
    }
  }
  return {
    valid: reasons.length === 0,
    reasons,
    executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
}
