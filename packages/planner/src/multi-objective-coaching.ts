import type {
  CoachObjective,
  CoachObjectiveOutcome,
  CoachObjectivePreference,
  CoachOptimizationCandidate,
  CoachOptimizationDecision,
  CoachParetoCandidate,
  CoachTradeoff,
} from '@circuit/domain';

const directionValue: Record<CoachObjectiveOutcome['expectedDirection'], number> = {
  worsen: -1,
  unknown: 0,
  preserve: 1,
  improve: 2,
};

function outcomeFor(candidate: CoachOptimizationCandidate, objectiveId: string): CoachObjectiveOutcome | undefined {
  return candidate.outcomes.find((outcome) => outcome.objectiveId === objectiveId);
}

export function screenOptimizationConstraints(input: {
  candidates: CoachOptimizationCandidate[];
  objectives: CoachObjective[];
}): { feasible: CoachOptimizationCandidate[]; infeasible: CoachOptimizationCandidate[] } {
  const bindingIds = new Set(input.objectives.filter((objective) => objective.importance === 'binding').map((objective) => objective.objectiveId));
  const feasible: CoachOptimizationCandidate[] = [];
  const infeasible: CoachOptimizationCandidate[] = [];
  for (const candidate of input.candidates) {
    const bindingWorsened = candidate.outcomes.some((outcome) => bindingIds.has(outcome.objectiveId) && outcome.expectedDirection === 'worsen');
    if (candidate.constraintViolations.length > 0 || !candidate.governanceApproved || bindingWorsened) infeasible.push(candidate);
    else feasible.push(candidate);
  }
  return { feasible, infeasible };
}

export function candidateDominates(a: CoachOptimizationCandidate, b: CoachOptimizationCandidate, objectives: CoachObjective[]): boolean {
  let strictlyBetter = false;
  for (const objective of objectives) {
    const av = directionValue[outcomeFor(a, objective.objectiveId)?.expectedDirection ?? 'unknown'];
    const bv = directionValue[outcomeFor(b, objective.objectiveId)?.expectedDirection ?? 'unknown'];
    if (av < bv) return false;
    if (av > bv) strictlyBetter = true;
  }
  return strictlyBetter;
}

export function detectObjectiveTradeoffs(candidate: CoachOptimizationCandidate, objectives: CoachObjective[]): CoachTradeoff[] {
  const improved = objectives.filter((objective) => outcomeFor(candidate, objective.objectiveId)?.expectedDirection === 'improve');
  const worsened = objectives.filter((objective) => outcomeFor(candidate, objective.objectiveId)?.expectedDirection === 'worsen');
  const tradeoffs: CoachTradeoff[] = [];
  for (const positive of improved) for (const negative of worsened) {
    tradeoffs.push({
      objectiveA: positive.objectiveId,
      objectiveB: negative.objectiveId,
      description: `${candidate.label} may improve ${positive.kind.replaceAll('_', ' ')} while worsening ${negative.kind.replaceAll('_', ' ')}.`,
      material: positive.importance === 'high' || negative.importance === 'high' || negative.importance === 'binding',
    });
  }
  return tradeoffs;
}

export function buildParetoFrontier(input: {
  candidates: CoachOptimizationCandidate[];
  objectives: CoachObjective[];
}): CoachParetoCandidate[] {
  const screened = screenOptimizationConstraints(input);
  return input.candidates.map((candidate) => {
    if (screened.infeasible.some((item) => item.candidateId === candidate.candidateId)) {
      return { candidateId: candidate.candidateId, status: 'infeasible', dominatedBy: [], tradeoffs: detectObjectiveTradeoffs(candidate, input.objectives) };
    }
    const dominatedBy = screened.feasible.filter((other) => other.candidateId !== candidate.candidateId && candidateDominates(other, candidate, input.objectives)).map((other) => other.candidateId);
    return {
      candidateId: candidate.candidateId,
      status: dominatedBy.length ? 'dominated' : 'pareto_optimal',
      dominatedBy,
      tradeoffs: detectObjectiveTradeoffs(candidate, input.objectives),
    };
  });
}

export function rankParetoCandidates(input: {
  frontier: CoachParetoCandidate[];
  candidates: CoachOptimizationCandidate[];
  preferences: CoachObjectivePreference[];
}): string[] {
  const eligible = input.frontier.filter((item) => item.status === 'pareto_optimal').map((item) => item.candidateId);
  const preferences = [...input.preferences].sort((a, b) => a.rank - b.rank);
  return eligible.sort((aId, bId) => {
    const a = input.candidates.find((item) => item.candidateId === aId)!;
    const b = input.candidates.find((item) => item.candidateId === bId)!;
    for (const preference of preferences) {
      const delta = directionValue[outcomeFor(b, preference.objectiveId)?.expectedDirection ?? 'unknown'] - directionValue[outcomeFor(a, preference.objectiveId)?.expectedDirection ?? 'unknown'];
      if (delta !== 0) return delta;
    }
    return aId.localeCompare(bId);
  });
}

export function selectMultiObjectiveCandidate(input: {
  candidates: CoachOptimizationCandidate[];
  objectives: CoachObjective[];
  preferences: CoachObjectivePreference[];
  uncertaintyStable: boolean;
  athleteConfirmed?: boolean;
}): CoachOptimizationDecision {
  const screened = screenOptimizationConstraints({ candidates: input.candidates, objectives: input.objectives });
  const frontier = buildParetoFrontier({ candidates: input.candidates, objectives: input.objectives });
  const paretoFrontierIds = frontier.filter((item) => item.status === 'pareto_optimal').map((item) => item.candidateId);
  const ranked = rankParetoCandidates({ frontier, candidates: input.candidates, preferences: input.preferences });
  const hasDeclaredPreferences = input.preferences.some((preference) => preference.declared && (preference.source === 'athlete' || preference.source === 'clinician'));
  const unresolvedTradeoffs = frontier.filter((item) => item.status === 'pareto_optimal').flatMap((item) => item.tradeoffs.filter((tradeoff) => tradeoff.material));
  const requiresAthleteChoice = paretoFrontierIds.length > 1 && (!hasDeclaredPreferences || unresolvedTradeoffs.length > 0) && input.athleteConfirmed !== true;
  const selectedCandidateId = ranked[0];
  const automaticPlanChangeAllowed = Boolean(selectedCandidateId) && input.uncertaintyStable && !requiresAthleteChoice && screened.feasible.some((item) => item.candidateId === selectedCandidateId);
  return {
    optimizationId: `optimization:${input.candidates.map((candidate) => candidate.candidateId).sort().join(':')}`,
    selectedCandidateId,
    feasibleCandidateIds: screened.feasible.map((candidate) => candidate.candidateId),
    paretoFrontierIds,
    candidates: frontier,
    objectives: input.objectives.map((objective) => ({ ...objective, evidenceIds: [...objective.evidenceIds] })),
    preferences: input.preferences.map((preference) => ({ ...preference })),
    unresolvedTradeoffs,
    requiresAthleteChoice,
    automaticPlanChangeAllowed,
    explanation: [
      `${screened.feasible.length} of ${input.candidates.length} options satisfy binding constraints and governance.`,
      `${paretoFrontierIds.length} option${paretoFrontierIds.length === 1 ? '' : 's'} remain on the tradeoff frontier.`,
      requiresAthleteChoice ? 'The remaining tradeoff requires athlete choice rather than an automatic plan change.' : 'Declared priorities resolve the remaining tradeoff.',
      'Objectives remain visible separately; Side Quest does not hide them inside one opaque score.',
    ],
    governanceRequired: true,
    auditable: true,
  };
}

export function buildMultiObjectiveExplanation(decision: CoachOptimizationDecision): string[] {
  return [...decision.explanation, ...decision.unresolvedTradeoffs.map((tradeoff) => tradeoff.description)];
}
