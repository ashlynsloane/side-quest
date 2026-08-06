import type {
  CoachContextSimilarity,
  CoachLearningContext,
  CoachLearningContextDimension,
  CoachLearningEpisode,
  CoachMetaLearningReport,
  CoachStrategyTransferAssessment,
} from '@circuit/domain';

const DIMENSIONS: CoachLearningContextDimension[] = [
  'training_phase',
  'sport_mix',
  'recovery_state',
  'schedule_pattern',
  'injury_context',
  'experience_level',
];

export function compareCoachLearningContexts(
  source: CoachLearningContext,
  target: CoachLearningContext,
): CoachContextSimilarity {
  const matchedDimensions: CoachLearningContextDimension[] = [];
  const mismatchedDimensions: CoachLearningContextDimension[] = [];
  const unknownDimensions: CoachLearningContextDimension[] = [];

  for (const dimension of DIMENSIONS) {
    const sourceValue = source.dimensions[dimension];
    const targetValue = target.dimensions[dimension];
    if (!sourceValue || !targetValue) unknownDimensions.push(dimension);
    else if (sourceValue === targetValue) matchedDimensions.push(dimension);
    else mismatchedDimensions.push(dimension);
  }

  const transferability = mismatchedDimensions.includes('injury_context')
    ? 'not_transferable'
    : unknownDimensions.length >= 3
      ? 'unknown'
      : mismatchedDimensions.length === 0 && matchedDimensions.length >= 4
        ? 'high'
        : mismatchedDimensions.length <= 2
          ? 'moderate'
          : 'low';

  return {
    sourceContextId: source.contextId,
    targetContextId: target.contextId,
    matchedDimensions,
    mismatchedDimensions,
    unknownDimensions,
    transferability,
  };
}

export function assessStrategyTransfer(
  strategyId: string,
  episodes: CoachLearningEpisode[],
  targetContext: CoachLearningContext,
): CoachStrategyTransferAssessment {
  const relevant = episodes.filter((episode) => episode.strategyId === strategyId);
  const comparisons = relevant.map((episode) => ({
    episode,
    similarity: compareCoachLearningContexts(episode.context, targetContext),
  }));
  const eligible = comparisons.filter(({ episode, similarity }) =>
    episode.athleteApproved &&
    !episode.safetyViolation &&
    episode.evidenceStrength !== 'insufficient' &&
    similarity.transferability !== 'not_transferable',
  );
  const supportingEpisodeIds = eligible
    .filter(({ episode }) => episode.outcome === 'beneficial')
    .map(({ episode }) => episode.episodeId);
  const conflictingEpisodeIds = eligible
    .filter(({ episode }) => episode.outcome === 'harmful')
    .map(({ episode }) => episode.episodeId);
  const bestSimilarity = eligible
    .map(({ similarity }) => similarity)
    .sort((a, b) => rankTransferability(b.transferability) - rankTransferability(a.transferability))[0]
    ?? compareCoachLearningContexts(relevant[0]?.context ?? targetContext, targetContext);

  const blockedBySafety = comparisons.some(({ episode }) => episode.safetyViolation);
  const recommendation = blockedBySafety || bestSimilarity.transferability === 'not_transferable'
    ? 'do_not_transfer'
    : conflictingEpisodeIds.length > 0
      ? 'retest'
      : supportingEpisodeIds.length === 0
        ? 'retest'
        : bestSimilarity.transferability === 'high'
          ? 'reuse'
          : 'adapt';
  const automaticApplicationAllowed = false;

  return {
    strategyId,
    sourceEpisodeIds: relevant.map((episode) => episode.episodeId),
    targetContextId: targetContext.contextId,
    similarity: bestSimilarity,
    recommendation,
    supportingEpisodeIds,
    conflictingEpisodeIds,
    automaticApplicationAllowed,
    athleteConfirmationRequired: recommendation !== 'do_not_transfer',
    explanation: buildTransferExplanation(recommendation, bestSimilarity, supportingEpisodeIds.length, conflictingEpisodeIds.length),
    auditable: true,
  };
}

export function buildCoachMetaLearningReport(
  episodes: CoachLearningEpisode[],
  targetContext: CoachLearningContext,
): CoachMetaLearningReport {
  const strategyIds = [...new Set(episodes.map((episode) => episode.strategyId))];
  const assessments = strategyIds.map((strategyId) => assessStrategyTransfer(strategyId, episodes, targetContext));
  return {
    reportId: `meta-learning-${targetContext.contextId}`,
    targetContextId: targetContext.contextId,
    assessments,
    reusableStrategyIds: assessments.filter((item) => item.recommendation === 'reuse').map((item) => item.strategyId),
    adaptationRequiredStrategyIds: assessments.filter((item) => item.recommendation === 'adapt' || item.recommendation === 'retest').map((item) => item.strategyId),
    blockedStrategyIds: assessments.filter((item) => item.recommendation === 'do_not_transfer').map((item) => item.strategyId),
    explanation: ['Prior coaching strategies were evaluated for context-specific transfer rather than copied automatically.'],
    governanceRequired: true,
  };
}

export function explainCoachMetaLearning(report: CoachMetaLearningReport): string[] {
  return [
    ...report.explanation,
    `${report.reusableStrategyIds.length} reusable, ${report.adaptationRequiredStrategyIds.length} requiring adaptation or retesting, and ${report.blockedStrategyIds.length} blocked.`,
  ];
}

function rankTransferability(value: CoachContextSimilarity['transferability']): number {
  return { high: 4, moderate: 3, low: 2, unknown: 1, not_transferable: 0 }[value];
}

function buildTransferExplanation(
  recommendation: CoachStrategyTransferAssessment['recommendation'],
  similarity: CoachContextSimilarity,
  supportingCount: number,
  conflictingCount: number,
): string[] {
  const messages = [
    `Context transferability is ${similarity.transferability}.`,
    `${supportingCount} supporting and ${conflictingCount} conflicting prior episode(s) were retained.`,
  ];
  if (recommendation === 'reuse') messages.push('The strategy may be proposed again, but still requires athlete confirmation and governance.');
  if (recommendation === 'adapt') messages.push('The strategy should be adapted to the current context before use.');
  if (recommendation === 'retest') messages.push('The evidence is mixed or incomplete, so the strategy should be retested rather than assumed effective.');
  if (recommendation === 'do_not_transfer') messages.push('A safety issue or material context mismatch blocks transfer.');
  return messages;
}
