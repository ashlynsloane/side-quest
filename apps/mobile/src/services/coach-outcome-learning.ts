import type { CoachDecisionOutcomeLearningResult } from '@circuit/domain';

export interface CoachLearningCard {
  title: string;
  summary: string;
  evidenceLabel: string;
  helpfulCount: number;
  harmfulCount: number;
  requiresMoreHistory: boolean;
  safeguards: string[];
}

export function buildCoachLearningCard(result: CoachDecisionOutcomeLearningResult): CoachLearningCard {
  const strongest = [...result.aggregates].sort((a, b) => b.observations - a.observations)[0];
  return {
    title: 'What Side Quest is learning',
    summary: strongest
      ? strongest.summary
      : 'There is not enough applied-decision history to identify a reliable pattern yet.',
    evidenceLabel: strongest
      ? `${strongest.observations} outcome ${strongest.observations === 1 ? 'observation' : 'observations'} · ${strongest.confidence} confidence`
      : 'More history needed',
    helpfulCount: result.helpfulDecisionIds.length,
    harmfulCount: result.harmfulDecisionIds.length,
    requiresMoreHistory: result.insufficientEvidenceActions.length > 0,
    safeguards: result.safeguards,
  };
}
