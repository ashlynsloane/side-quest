import type {
  AdaptiveDecisionConfidence,
  MultiWeekOptimizationCandidate,
  MultiWeekOptimizationEvaluation,
  MultiWeekOptimizationInput,
  MultiWeekOptimizationProposal,
  OptimizationObjective,
  OptimizationObjectiveScore,
} from '@circuit/domain';

const DEFAULT_WEIGHTS: Record<OptimizationObjective, number> = {
  protect_key_sessions: 1.5,
  reduce_capacity_conflicts: 1.25,
  respect_life_constraints: 1.5,
  preserve_strength: 1,
  maintain_recovery: 1.25,
  minimize_changes: 0.75,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function allSessions(candidate: MultiWeekOptimizationCandidate) {
  return candidate.weeks.flatMap((week) => week.sessions);
}

function objective(
  objectiveName: OptimizationObjective,
  score: number,
  weight: number,
  reasons: string[],
): OptimizationObjectiveScore {
  return { objective: objectiveName, score: clamp(score), weight, reasons };
}

function evaluateCandidate(
  input: MultiWeekOptimizationInput,
  candidate: MultiWeekOptimizationCandidate,
): MultiWeekOptimizationEvaluation {
  const sessions = allSessions(candidate);
  const protectedSessions = sessions.filter((session) => session.priority === 'key' || session.priority === 'event' || !session.movable);
  const calendarProposals = candidate.calendarResult?.proposals ?? [];
  const capacityConflicts = candidate.capacityForecast?.conflicts ?? [];
  const hardCalendarChanges = calendarProposals.filter((proposal) =>
    proposal.action !== 'keep' && protectedSessions.some((session) => session.sessionId === proposal.sessionId));
  const unapprovedChanges = calendarProposals.filter((proposal) =>
    proposal.action !== 'keep' && !(candidate.athleteApprovedSessionIds ?? []).includes(proposal.sessionId));

  const weeklyLoads = candidate.weeks.map((week) => week.plannedLoad ?? week.sessions.reduce((sum, session) => sum + (session.targetLoad ?? 0), 0));
  const maximumIncrease = input.maximumWeeklyLoadIncrease ?? 0.1;
  const excessiveLoadJumps: string[] = [];
  for (let index = 1; index < weeklyLoads.length; index += 1) {
    const previous = weeklyLoads[index - 1] ?? 0;
    const current = weeklyLoads[index] ?? 0;
    if (previous > 0 && (current - previous) / previous > maximumIncrease) {
      excessiveLoadJumps.push(`Week ${index + 1} exceeds the ${(maximumIncrease * 100).toFixed(0)}% load-increase ceiling.`);
    }
  }

  const criticalConflicts = capacityConflicts.filter((conflict) => conflict.severity === 'critical');
  const meaningfulConflicts = capacityConflicts.filter((conflict) => conflict.severity === 'meaningful');
  const removedStrength = calendarProposals.filter((proposal) => proposal.action === 'remove')
    .filter((proposal) => sessions.find((session) => session.sessionId === proposal.sessionId)?.discipline === 'strength');
  const shortenedStrength = calendarProposals.filter((proposal) => proposal.action === 'shorten')
    .filter((proposal) => sessions.find((session) => session.sessionId === proposal.sessionId)?.discipline === 'strength');

  const weights = { ...DEFAULT_WEIGHTS, ...(input.objectiveWeights ?? {}) };
  const scores: OptimizationObjectiveScore[] = [
    objective('protect_key_sessions', hardCalendarChanges.length ? 0 : 100, weights.protect_key_sessions,
      hardCalendarChanges.length ? ['A protected key, event, or fixed session would be changed.'] : ['Protected sessions remain in place.']),
    objective('reduce_capacity_conflicts', 100 - criticalConflicts.length * 30 - meaningfulConflicts.length * 12,
      weights.reduce_capacity_conflicts,
      [`${criticalConflicts.length} critical and ${meaningfulConflicts.length} meaningful capacity conflicts remain.`]),
    objective('respect_life_constraints', 100 - calendarProposals.filter((proposal) => proposal.action === 'remove').length * 8,
      weights.respect_life_constraints,
      ['Calendar intelligence is used as a first-class planning constraint.']),
    objective('preserve_strength', 100 - removedStrength.length * 25 - shortenedStrength.length * 8,
      weights.preserve_strength,
      [`${removedStrength.length} strength sessions are removed and ${shortenedStrength.length} are shortened.`]),
    objective('maintain_recovery', 100 - criticalConflicts.length * 35 - excessiveLoadJumps.length * 25,
      weights.maintain_recovery,
      [...excessiveLoadJumps, 'Recovery is evaluated across the full block rather than one day at a time.']),
    objective('minimize_changes', 100 - candidate.changeCount * 6,
      weights.minimize_changes,
      [`${candidate.changeCount} calendar changes separate this candidate from the baseline.`]),
  ];

  const disqualificationReasons = [
    ...(hardCalendarChanges.length ? ['The candidate changes a protected key, event, or fixed session.'] : []),
    ...excessiveLoadJumps,
    ...(unapprovedChanges.length > (input.maximumAutomaticChanges ?? 0)
      ? ['The candidate contains calendar changes that have not been approved by the athlete.']
      : []),
  ];
  const weightedTotal = scores.reduce((sum, item) => sum + item.score * item.weight, 0);
  const weightTotal = scores.reduce((sum, item) => sum + item.weight, 0);
  return {
    candidateId: candidate.candidateId,
    totalScore: disqualificationReasons.length ? 0 : clamp(weightedTotal / weightTotal),
    objectiveScores: scores,
    disqualified: disqualificationReasons.length > 0,
    disqualificationReasons,
    protectedSessionIds: protectedSessions.map((session) => session.sessionId),
    proposedChangeSessionIds: calendarProposals.filter((proposal) => proposal.action !== 'keep').map((proposal) => proposal.sessionId),
    explanations: [
      'The block is scored across performance, recovery, life constraints, and plan stability.',
      'A higher score cannot override a hard safeguard.',
    ],
  };
}

function confidenceFor(evaluations: MultiWeekOptimizationEvaluation[]): AdaptiveDecisionConfidence {
  const eligible = evaluations.filter((item) => !item.disqualified).sort((a, b) => b.totalScore - a.totalScore);
  if (eligible.length < 2) return 'low';
  const margin = (eligible[0]?.totalScore ?? 0) - (eligible[1]?.totalScore ?? 0);
  if (margin >= 15) return 'high';
  if (margin >= 6) return 'moderate';
  return 'low';
}

export function optimizeMultiWeekBlock(
  input: MultiWeekOptimizationInput,
): MultiWeekOptimizationProposal {
  if (!input.candidates.some((candidate) => candidate.candidateId === input.baselineCandidateId)) {
    throw new Error('The baseline candidate must be included in the candidate set.');
  }
  const evaluations = input.candidates
    .map((candidate) => evaluateCandidate(input, candidate))
    .sort((left, right) => right.totalScore - left.totalScore || left.candidateId.localeCompare(right.candidateId));
  const recommended = evaluations.find((evaluation) => !evaluation.disqualified)
    ?? evaluations.find((evaluation) => evaluation.candidateId === input.baselineCandidateId)
    ?? evaluations[0];
  if (!recommended) throw new Error('At least one optimization candidate is required.');
  return {
    proposalId: `multi-week:${input.generatedAt}:${recommended.candidateId}`,
    baselineCandidateId: input.baselineCandidateId,
    recommendedCandidateId: recommended.candidateId,
    confidence: confidenceFor(evaluations),
    requiresAthleteApproval: true,
    evaluations,
    reasons: [
      `${recommended.candidateId} produced the strongest eligible whole-block score.`,
      'The recommendation balances key-session protection, recovery capacity, life constraints, strength preservation, and plan stability.',
    ],
    safeguards: [
      'No multi-week plan is applied without athlete approval.',
      'Key sessions, events, and fixed sessions cannot be displaced by optimization score.',
      'Weekly load increases remain bounded.',
      'The optimizer does not recommend calorie restriction, weight loss, or compensatory exercise.',
    ],
  };
}
