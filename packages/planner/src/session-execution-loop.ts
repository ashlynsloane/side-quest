import type {
  PostSessionCoachSummary,
  SessionExecutionRecord,
  SessionReadinessAssessment,
  SessionReadinessInput,
} from '@circuit/domain';

export function assessSessionReadiness(input: SessionReadinessInput): SessionReadinessAssessment {
  const reasons: string[] = [];
  let recommendation: SessionReadinessAssessment['recommendation'] = 'proceed';
  let requiresClinicalReview = false;

  if (input.pain === 'high') {
    recommendation = 'review_required';
    requiresClinicalReview = true;
    reasons.push('High pain requires review before structured training.');
  } else if (input.pain === 'moderate') {
    recommendation = 'recover';
    reasons.push('Moderate pain makes the planned session inappropriate without modification.');
  } else if (!input.environmentFeasible || !input.equipmentAvailable) {
    recommendation = 'substitute';
    reasons.push('The planned session is not feasible with the current environment or equipment.');
  } else if (input.availableMinutes < input.plannedMinutes) {
    recommendation = input.availableMinutes >= Math.max(15, Math.round(input.plannedMinutes * 0.5)) ? 'shorten' : 'delay';
    reasons.push('Available time is shorter than the planned session.');
  } else if (input.soreness === 'high' || input.energy === 'low') {
    recommendation = 'shorten';
    reasons.push('Current recovery signals support reducing the session dose.');
  } else {
    reasons.push('No material constraint requires changing the planned session.');
  }

  if (input.protected && recommendation === 'delay') {
    recommendation = 'shorten';
    reasons.push('The protected time remains fixed; shortening is preferred to moving it automatically.');
  }

  const headlines: Record<SessionReadinessAssessment['recommendation'], string> = {
    proceed: 'Proceed as planned',
    shorten: 'Keep the intent, shorten the session',
    substitute: 'Use a feasible substitute',
    delay: 'Consider delaying this flexible session',
    recover: 'Choose recovery instead',
    review_required: 'Pause for review',
  };

  return {
    sessionId: input.sessionId,
    recommendation,
    headline: headlines[recommendation],
    reasons,
    requiresAthleteApproval: recommendation !== 'proceed',
    requiresClinicalReview,
    generatedAt: input.checkedAt,
    auditable: true,
  };
}

export function summarizeSessionExecution(record: SessionExecutionRecord): PostSessionCoachSummary {
  const observations: string[] = [];
  let nextAction: PostSessionCoachSummary['nextAction'] = 'none';

  if (record.status === 'completed') observations.push('The session was completed.');
  if (record.status === 'modified') observations.push('The athlete modified the session during execution.');
  if (record.status === 'stopped') observations.push('The session was stopped before completion.');
  if (record.status === 'skipped') observations.push('The session was skipped without being treated as a failure.');
  if (record.actualMinutes !== undefined) observations.push(`Recorded duration: ${record.actualMinutes} minutes.`);
  if (record.modificationSummary) observations.push(record.modificationSummary);

  if (record.painDuring === 'high') {
    nextAction = 'clinical_review';
    observations.push('High pain during the session requires review before further loading.');
  } else if (record.painDuring === 'moderate' || record.status === 'stopped') {
    nextAction = 'offer_plan_change';
    observations.push('A follow-up plan adjustment may be appropriate, but none has been applied automatically.');
  } else if (record.perceivedEffort === 'very_hard' || record.status === 'modified') {
    nextAction = 'monitor';
    observations.push('The next recovery signal should be checked before changing the plan.');
  }

  const headline = nextAction === 'clinical_review'
    ? 'Training should pause for review'
    : nextAction === 'offer_plan_change'
      ? 'Review the next planned session'
      : nextAction === 'monitor'
        ? 'Monitor recovery before the next session'
        : record.status === 'completed'
          ? 'Session complete; no schedule change recommended'
          : 'Execution recorded';

  return {
    executionId: record.executionId,
    headline,
    observations,
    nextAction,
    planChangeApplied: false,
    requiresAthleteApproval: nextAction === 'offer_plan_change',
    auditable: true,
  };
}
