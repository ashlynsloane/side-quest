import type {
  CoachDecisionReassessment,
  CoachDecisionReassessmentRequest,
  CoachDecisionFreshness,
  CoachReassessmentTrigger,
} from '@circuit/domain';

const HOUR_MS = 60 * 60 * 1000;

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO timestamp.`);
  return timestamp;
}

export function identifyMaterialReassessmentTriggers(
  request: CoachDecisionReassessmentRequest,
): CoachReassessmentTrigger[] {
  const configured = new Set(request.policy.materialTriggerKinds);
  return request.triggers.filter((trigger) => trigger.material || configured.has(trigger.kind));
}

export function classifyCoachDecisionFreshness(
  request: CoachDecisionReassessmentRequest,
): CoachDecisionFreshness {
  const createdAt = parseTimestamp(request.decisionCreatedAt, 'decisionCreatedAt');
  const evaluatedAt = parseTimestamp(request.evaluatedAt, 'evaluatedAt');
  if (evaluatedAt < createdAt) throw new Error('evaluatedAt cannot precede decisionCreatedAt.');

  const materialTriggers = identifyMaterialReassessmentTriggers(request);
  const invalidatingTrigger = materialTriggers.some((trigger) =>
    trigger.kind === 'symptom_change' ||
    trigger.kind === 'restriction_change' ||
    trigger.kind === 'availability_change',
  );
  if (invalidatingTrigger) return 'invalidated';

  const ageHours = (evaluatedAt - createdAt) / HOUR_MS;
  if (ageHours >= request.policy.expireAfterHours) return 'stale';
  if (materialTriggers.length > 0 || ageHours >= request.policy.reviewAfterHours) return 'review_due';
  return 'current';
}

export function calculateNextCoachDecisionReviewAt(
  request: CoachDecisionReassessmentRequest,
  freshness: CoachDecisionFreshness,
): string | undefined {
  if (freshness === 'stale' || freshness === 'invalidated') return undefined;
  const createdAt = parseTimestamp(request.decisionCreatedAt, 'decisionCreatedAt');
  return new Date(createdAt + request.policy.reviewAfterHours * HOUR_MS).toISOString();
}

export function reassessCoachDecision(
  request: CoachDecisionReassessmentRequest,
): CoachDecisionReassessment {
  if (request.policy.reviewAfterHours < 0 || request.policy.expireAfterHours <= 0) {
    throw new Error('Review and expiry windows must be positive.');
  }
  if (request.policy.expireAfterHours < request.policy.reviewAfterHours) {
    throw new Error('expireAfterHours cannot be shorter than reviewAfterHours.');
  }

  const freshness = classifyCoachDecisionFreshness(request);
  const materialTriggers = identifyMaterialReassessmentTriggers(request);
  const fullRecomputationRequired = freshness !== 'current';
  const athleteCheckInPresent = request.triggers.some((trigger) => trigger.kind === 'athlete_check_in');
  const athleteConfirmationRequired =
    freshness !== 'current' ||
    (request.policy.requireAthleteCheckInBeforeReapply && !athleteCheckInPresent);

  return {
    reassessmentId: `reassessment-${request.requestId}`,
    decisionId: request.decisionId,
    freshness,
    materialTriggerIds: materialTriggers.map((trigger) => trigger.triggerId),
    automaticReapplicationAllowed:
      freshness === 'current' &&
      !request.previouslyApplied &&
      !athleteConfirmationRequired,
    athleteConfirmationRequired,
    fullRecomputationRequired,
    nextReviewAt: calculateNextCoachDecisionReviewAt(request, freshness),
    explanation: buildCoachDecisionReassessmentExplanation(
      freshness,
      materialTriggers,
      athleteConfirmationRequired,
    ),
    provenance: [...new Set(request.triggers.flatMap((trigger) => trigger.provenance))],
    auditable: true,
  };
}

export function buildCoachDecisionReassessmentExplanation(
  freshness: CoachDecisionFreshness,
  materialTriggers: CoachReassessmentTrigger[],
  athleteConfirmationRequired: boolean,
): string[] {
  const explanation: string[] = [];
  if (freshness === 'current') explanation.push('The decision remains within its review window and no material change invalidated it.');
  if (freshness === 'review_due') explanation.push('The decision requires reassessment before the plan changes again.');
  if (freshness === 'stale') explanation.push('The decision exceeded its expiry window and cannot be reused.');
  if (freshness === 'invalidated') explanation.push('A material symptom, restriction, or availability change invalidated the prior decision.');
  if (materialTriggers.length > 0) explanation.push(`Material updates: ${materialTriggers.map((trigger) => trigger.summary).join('; ')}.`);
  if (athleteConfirmationRequired) explanation.push('Athlete confirmation is required before any resulting change is applied.');
  return explanation;
}
