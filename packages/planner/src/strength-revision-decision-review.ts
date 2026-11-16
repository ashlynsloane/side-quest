import type { GeneratedWorkout, PlannedStrengthSession } from '@circuit/domain';
import { strengthSessionSignature, type StrengthChoiceDecision } from './daily-strength-decision-sqlite';
import { evaluateStrengthWorkoutRevision } from './strength-workout-revision-review';

export interface CurrentStrengthReviewEvidence {
  athleteId: string;
  todayLocalDate: string;
  symptoms: 'clear' | 'active' | 'unknown';
  readiness: 'reviewed_adequate' | 'recover' | 'unknown';
  providerRestrictions: 'verified_none' | 'reviewed_applicable' | 'active' | 'unknown';
  sourceCoverage: 'complete' | 'incomplete' | 'unknown';
  /** Required for a reviewable plan, never construed as a clinical clearance. */
  exerciseRestrictionsReviewed: boolean;
}

export interface StrengthRevisionDecisionReview {
  status: 'reviewable' | 'blocked';
  reasons: string[];
  sourceSignatureMatches: boolean;
  structuralReviewPassed: boolean;
  requiresAthleteApproval: true;
  requiresWriteTimeRevalidation: true;
  executableWorkoutApproved: false;
}

/**
 * Read-only integration gate. It cannot authorize an executable prescription:
 * evidence must be sourced and re-validated transactionally at the actual
 * persistence boundary, not accepted as an unverified caller assertion.
 */
export function reviewStrengthRevisionForDecision(input: {
  source: PlannedStrengthSession;
  candidate: GeneratedWorkout | null;
  decision: StrengthChoiceDecision;
  evidence: CurrentStrengthReviewEvidence;
}): StrengthRevisionDecisionReview {
  const { source, candidate, decision, evidence } = input;
  const reasons: string[] = [];
  const sourceSignatureMatches = strengthSessionSignature(source) === decision.sourceSignature;
  if (!sourceSignatureMatches || source.id !== decision.sessionId) {
    reasons.push('Source plan identity or version changed.');
  }
  if (decision.athleteId !== evidence.athleteId || !decision.athleteId) {
    reasons.push('Athlete ownership could not be reconciled.');
  }
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const millis = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(millis)
      && new Date(millis).toISOString().slice(0, 10) === value;
  };
  if (!validDate(evidence.todayLocalDate) || !validDate(source.date)
    || source.date < evidence.todayLocalDate
    || !['planned', 'modified'].includes(source.completionStatus)) {
    reasons.push('Session date or completion status does not permit review.');
  }
  if (evidence.symptoms !== 'clear') {
    reasons.push('Symptoms are active or have not been reviewed.');
  }
  if (evidence.readiness !== 'reviewed_adequate') {
    reasons.push('Readiness is insufficient or unknown.');
  }
  if (!['verified_none', 'reviewed_applicable'].includes(evidence.providerRestrictions)
    || !evidence.exerciseRestrictionsReviewed) {
    reasons.push('Exercise-level and provider restrictions require review.');
  }
  if (evidence.sourceCoverage !== 'complete') {
    reasons.push('Training evidence coverage is incomplete or unknown.');
  }
  let structuralReviewPassed = false;
  if (decision.action !== 'reduce' || decision.decision !== 'accepted') {
    reasons.push('Only a newly proposed reduction can enter exercise-level review.');
  } else if (!candidate) {
    reasons.push('No candidate executable workout is available.');
  } else if (typeof decision.proposedMinutes !== 'number'
    || !Number.isFinite(decision.proposedMinutes)
    || decision.proposedMinutes <= 0) {
    reasons.push('Planning-time ceiling is invalid.');
  } else {
    const structural = evaluateStrengthWorkoutRevision({
      original: source.workout, proposed: candidate,
      maximumMinutes: decision.proposedMinutes,
    });
    structuralReviewPassed = structural.structurallyValid;
    reasons.push(...structural.reasons);
    const expected = Math.floor(source.workout.estimatedElapsedSeconds / 60 * 0.8);
    if (!Number.isFinite(expected) || source.workout.estimatedElapsedSeconds < 1200
      || decision.proposedMinutes !== expected) {
      reasons.push('Decision is not the approved bounded time-reduction shape.');
    }
  }
  return {
    status: reasons.length === 0 ? 'reviewable' : 'blocked',
    reasons, sourceSignatureMatches, structuralReviewPassed,
    requiresAthleteApproval: true,
    requiresWriteTimeRevalidation: true,
    executableWorkoutApproved: false,
  };
}
