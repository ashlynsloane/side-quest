import type {
  ProgressionCandidate,
  ProgressionControlDecision,
  ProgressionControlInput,
  ProgressionSelection,
  ProgressionVariable,
} from '@circuit/domain';

const VARIABLE_ORDER: ProgressionVariable[] = ['reps', 'load', 'duration', 'frequency', 'novelty', 'complexity'];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function candidateRank(candidate: ProgressionCandidate): number {
  const explicit = candidate.priority ?? 0;
  const order = VARIABLE_ORDER.indexOf(candidate.variable);
  return explicit * 100 + (order < 0 ? 0 : VARIABLE_ORDER.length - order);
}

function selection(candidate: ProgressionCandidate, direction: ProgressionSelection['direction']): ProgressionSelection {
  return {
    variable: candidate.variable,
    direction,
    currentValue: candidate.currentValue,
    targetValue: direction === 'hold' ? candidate.currentValue : candidate.proposedValue,
    rationale: candidate.rationale,
  };
}

function constrained(input: ProgressionControlInput): boolean {
  return Boolean(
    input.structuralDecision && input.structuralDecision.action !== 'proceed'
  );
}

function noveltyBlocked(input: ProgressionControlInput): boolean {
  return Boolean(
    input.noveltyDecision && input.noveltyDecision.maximumNovelExercises === 0
  );
}

function readiness(input: ProgressionControlInput): ProgressionControlDecision['readiness'] {
  const response = input.response;
  if (
    input.strengthLoadAction === 'restrict' ||
    response.painDuringOrAfter ||
    response.affectedNextWorkout ||
    response.perceivedDifficulty === 'too_hard'
  ) return 'not_ready';
  if (
    input.strengthLoadAction === 'hold' ||
    input.strengthLoadAction === 'consolidate' ||
    constrained(input) ||
    (response.sorenessResolvedHours ?? 0) > 48 ||
    !response.completedAsPlanned
  ) return 'cautious';
  return 'ready';
}

export function decideProgressionControl(input: ProgressionControlInput): ProgressionControlDecision {
  const state = readiness(input);
  const explanations: string[] = [];
  const blockedVariables: ProgressionVariable[] = [];
  const candidates = [...input.candidates].sort((left, right) => candidateRank(right) - candidateRank(left));

  if (noveltyBlocked(input)) blockedVariables.push('novelty', 'complexity');
  if (constrained(input)) blockedVariables.push('frequency', 'duration', 'load');

  if (state === 'not_ready') {
    explanations.push('Recent response or restriction signals do not support progression. Reduce the highest-demand available variable and preserve unrelated training.');
    const reducible = candidates.find((candidate) => candidate.proposedValue < candidate.currentValue)
      ?? candidates.find((candidate) => ['load', 'duration', 'frequency'].includes(candidate.variable));
    return {
      readiness: state,
      action: reducible ? 'reduce' : 'hold',
      selections: reducible ? [selection(reducible, 'reduce')] : [],
      blockedVariables: unique([...blockedVariables, ...candidates.map((candidate) => candidate.variable)]),
      explanations,
    };
  }

  if (state === 'cautious') {
    explanations.push('Hold the current dose while the athlete consolidates recent load or structural exposure.');
    return {
      readiness: state,
      action: 'hold',
      selections: [],
      blockedVariables: unique([...blockedVariables, ...candidates.map((candidate) => candidate.variable)]),
      explanations,
    };
  }

  const eligible = candidates.filter((candidate) =>
    candidate.proposedValue > candidate.currentValue && !blockedVariables.includes(candidate.variable));
  const allowTwo = Boolean(
    input.establishedBaseline &&
    input.confidence === 'high' &&
    input.response.perceivedDifficulty === 'too_easy' &&
    !constrained(input) &&
    input.strengthLoadAction === 'progress'
  );
  const selected = eligible.slice(0, allowTwo ? 2 : 1);

  if (selected.length === 0) {
    explanations.push('No eligible progression variable is available, so the current prescription should be held.');
    return { readiness: state, action: 'hold', selections: [], blockedVariables: unique(blockedVariables), explanations };
  }

  if (selected.length === 1) explanations.push('Progress one major variable at a time so the athlete response remains interpretable.');
  if (selected.length === 2) explanations.push('Two variables may progress because the athlete has a strong established baseline, high-confidence history, and an under-challenging response.');
  return {
    readiness: state,
    action: 'progress',
    selections: selected.map((candidate) => selection(candidate, 'increase')),
    blockedVariables: unique(blockedVariables),
    explanations,
  };
}

export function applyProgressionDecision(
  values: Partial<Record<ProgressionVariable, number>>,
  decision: ProgressionControlDecision,
): Partial<Record<ProgressionVariable, number>> {
  const next = { ...values };
  for (const item of decision.selections) next[item.variable] = item.targetValue;
  return next;
}
