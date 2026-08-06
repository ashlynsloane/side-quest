import type {
  AdaptiveDecisionConfidence,
  CoachDecisionAction,
  CoachDecisionOutcomeAggregate,
  CoachDecisionOutcomeLearningInput,
  CoachDecisionOutcomeLearningResult,
  CoachDecisionOutcomeObservation,
} from '@circuit/domain';

const ACTIONS: CoachDecisionAction[] = ['keep', 'move', 'shorten', 'replace', 'remove', 'recover', 'review'];

function confidenceFor(count: number): AdaptiveDecisionConfidence {
  if (count >= 8) return 'high';
  if (count >= 3) return 'moderate';
  return 'low';
}

function dedupeObservations(items: CoachDecisionOutcomeObservation[]): CoachDecisionOutcomeObservation[] {
  const map = new Map<string, CoachDecisionOutcomeObservation>();
  for (const item of items) map.set(item.observationId, item);
  return [...map.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.observationId.localeCompare(b.observationId));
}

export function learnFromCoachDecisionOutcomes(
  input: CoachDecisionOutcomeLearningInput,
): CoachDecisionOutcomeLearningResult {
  const records = new Map(input.lifecycle.records.map((record) => [record.decisionId, record]));
  const observations = dedupeObservations([...(input.priorObservations ?? []), ...input.observations])
    .filter((observation) => {
      const record = records.get(observation.decisionId);
      if (!record) return false;
      if (record.status !== 'applied' && record.status !== 'reverted') return false;
      if (observation.planRevisionId && record.appliedPlanRevisionId !== observation.planRevisionId) return false;
      return true;
    });

  const aggregates: CoachDecisionOutcomeAggregate[] = ACTIONS.flatMap((action) => {
    const actionDecisionIds = new Set(input.lifecycle.records.filter((record) => record.action === action).map((record) => record.decisionId));
    const relevant = observations.filter((observation) => actionDecisionIds.has(observation.decisionId));
    if (!relevant.length) return [];
    const helped = relevant.filter((item) => item.rating === 'helped').length;
    const neutral = relevant.filter((item) => item.rating === 'neutral').length;
    const hurt = relevant.filter((item) => item.rating === 'hurt').length;
    const unknown = relevant.filter((item) => item.rating === 'unknown').length;
    const completionKnown = relevant.filter((item) => item.completedAsPlanned !== undefined);
    const completionRate = completionKnown.length
      ? completionKnown.filter((item) => item.completedAsPlanned).length / completionKnown.length
      : undefined;
    const confidence = confidenceFor(relevant.length);
    return [{
      action,
      observations: relevant.length,
      helped,
      neutral,
      hurt,
      unknown,
      completionRate,
      confidence,
      summary: hurt > helped
        ? `${action} decisions have produced more negative than helpful outcomes so far.`
        : helped > hurt
          ? `${action} decisions have produced more helpful than negative outcomes so far.`
          : `${action} decisions do not yet show a directional outcome pattern.`,
    }];
  });

  const helpfulDecisionIds = [...new Set(observations.filter((item) => item.rating === 'helped').map((item) => item.decisionId))];
  const harmfulDecisionIds = [...new Set(observations.filter((item) => item.rating === 'hurt').map((item) => item.decisionId))];
  const insufficientEvidenceActions = ACTIONS.filter((action) => {
    const aggregate = aggregates.find((item) => item.action === action);
    return !aggregate || aggregate.observations < 3;
  });

  const coachingNotes = aggregates
    .filter((aggregate) => aggregate.observations >= 3)
    .map((aggregate) => `${aggregate.summary} Evidence confidence: ${aggregate.confidence}.`);

  return {
    generatedAt: input.generatedAt,
    observations,
    aggregates,
    helpfulDecisionIds,
    harmfulDecisionIds,
    insufficientEvidenceActions,
    coachingNotes,
    safeguards: [
      'Outcome history informs future confidence but never automatically changes the athlete plan.',
      'A single negative outcome cannot blacklist an action or discipline.',
      'Only outcomes linked to applied or reverted decisions are included.',
      'Athlete-reported reasons remain context, not proof of causation.',
      'Pain, injury, illness, and medical restrictions continue to override learned preferences.',
    ],
  };
}
