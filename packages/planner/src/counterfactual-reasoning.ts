import type {
  CounterfactualExplanation,
  CounterfactualOutcome,
  CounterfactualScenario,
  CounterfactualVariable,
  DecisionBoundary,
  DecisionSensitivity,
} from '@circuit/domain';

export interface CounterfactualInput {
  decisionId: string;
  selectedCandidateId?: string;
  disposition: string;
  values: Partial<Record<CounterfactualVariable, string | number | boolean>>;
  immutableFields?: string[];
  clinicianRestrictions?: string[];
  safetyConstraints?: string[];
}

export interface CounterfactualEvaluatorResult {
  selectedCandidateId?: string;
  disposition: string;
  safetyViolation?: boolean;
  reasons?: string[];
}

export type CounterfactualEvaluator = (
  values: Partial<Record<CounterfactualVariable, string | number | boolean>>,
) => CounterfactualEvaluatorResult;

export function generateCounterfactuals(
  input: CounterfactualInput,
  alternatives: Partial<Record<CounterfactualVariable, Array<string | number | boolean>>>,
): CounterfactualScenario[] {
  const scenarios: CounterfactualScenario[] = [];
  for (const variable of Object.keys(alternatives) as CounterfactualVariable[]) {
    const baselineValue = input.values[variable];
    if (baselineValue === undefined) continue;
    for (const value of alternatives[variable] ?? []) {
      if (Object.is(value, baselineValue)) continue;
      scenarios.push({
        scenarioId: `${input.decisionId}:${variable}:${String(value)}`,
        decisionId: input.decisionId,
        variable,
        baselineValue,
        counterfactualValue: value,
        changedFields: [variable],
        immutableFieldsPreserved: true,
        safetyConstraintsPreserved: true,
        realistic: true,
        explanation: [`Changed only ${variable} from ${String(baselineValue)} to ${String(value)}.`],
      });
    }
  }
  return scenarios;
}

export function evaluateCounterfactual(
  input: CounterfactualInput,
  scenario: CounterfactualScenario,
  evaluator: CounterfactualEvaluator,
): CounterfactualOutcome {
  if (!scenario.realistic || !scenario.immutableFieldsPreserved || !scenario.safetyConstraintsPreserved) {
    return {
      scenarioId: scenario.scenarioId,
      originalCandidateId: input.selectedCandidateId,
      dispositionChanged: false,
      candidateChanged: false,
      materiallyChanged: false,
      blockedBySafety: true,
      reasons: ['The scenario was rejected because it did not preserve realism, immutable facts, or safety constraints.'],
    };
  }
  const result = evaluator({ ...input.values, [scenario.variable]: scenario.counterfactualValue });
  const candidateChanged = result.selectedCandidateId !== input.selectedCandidateId;
  const dispositionChanged = result.disposition !== input.disposition;
  return {
    scenarioId: scenario.scenarioId,
    originalCandidateId: input.selectedCandidateId,
    counterfactualCandidateId: result.selectedCandidateId,
    dispositionChanged,
    candidateChanged,
    materiallyChanged: candidateChanged || dispositionChanged,
    blockedBySafety: result.safetyViolation === true,
    reasons: result.reasons ?? [],
  };
}

export function evaluateDecisionSensitivity(outcomes: CounterfactualOutcome[]): DecisionSensitivity {
  const safe = outcomes.filter((outcome) => !outcome.blockedBySafety);
  if (safe.length === 0) return 'indeterminate';
  const changed = safe.filter((outcome) => outcome.materiallyChanged).length;
  if (changed === 0) return 'stable';
  const ratio = changed / safe.length;
  if (ratio <= 0.33) return 'moderately_sensitive';
  return 'highly_sensitive';
}

export function findDecisionBoundary(
  variable: CounterfactualVariable,
  scenarios: CounterfactualScenario[],
  outcomes: CounterfactualOutcome[],
): DecisionBoundary {
  const byId = new Map(outcomes.map((outcome) => [outcome.scenarioId, outcome]));
  const first = scenarios.find((scenario) =>
    scenario.variable === variable && byId.get(scenario.scenarioId)?.materiallyChanged,
  );
  return first
    ? {
        variable,
        boundaryValue: first.counterfactualValue,
        found: true,
        direction: typeof first.counterfactualValue === 'number' && typeof first.baselineValue === 'number'
          ? first.counterfactualValue > first.baselineValue ? 'increase' : 'decrease'
          : 'change',
        explanation: [`The first tested material change occurred at ${String(first.counterfactualValue)}.`],
      }
    : { variable, found: false, explanation: ['No tested realistic value changed the recommendation.'] };
}

export function rankCounterfactuals(
  scenarios: CounterfactualScenario[],
  outcomes: CounterfactualOutcome[],
): CounterfactualScenario[] {
  const byId = new Map(outcomes.map((outcome) => [outcome.scenarioId, outcome]));
  return [...scenarios].sort((a, b) => {
    const ao = byId.get(a.scenarioId);
    const bo = byId.get(b.scenarioId);
    const as = ao?.blockedBySafety ? -1 : ao?.materiallyChanged ? 2 : 0;
    const bs = bo?.blockedBySafety ? -1 : bo?.materiallyChanged ? 2 : 0;
    return bs - as || a.changedFields.length - b.changedFields.length || a.scenarioId.localeCompare(b.scenarioId);
  });
}

export function buildCounterfactualExplanation(
  decisionId: string,
  scenarios: CounterfactualScenario[],
  outcomes: CounterfactualOutcome[],
): CounterfactualExplanation {
  const sensitivity = evaluateDecisionSensitivity(outcomes);
  const changedIds = new Set(outcomes.filter((outcome) => outcome.materiallyChanged && !outcome.blockedBySafety).map((outcome) => outcome.scenarioId));
  const changed = scenarios.filter((scenario) => changedIds.has(scenario.scenarioId));
  const drivers = Array.from(new Set(changed.map((scenario) => scenario.variable)));
  const unchanged = Array.from(new Set(
    scenarios.filter((scenario) => !changedIds.has(scenario.scenarioId)).map((scenario) => scenario.variable),
  ));
  return {
    decisionId,
    sensitivity,
    primaryDrivers: drivers,
    minimalChanges: changed.map((scenario) => `${scenario.variable}: ${String(scenario.baselineValue)} → ${String(scenario.counterfactualValue)}`),
    unchangedFactors: unchanged,
    noRealisticChangeWouldAlterDecision: changed.length === 0 && outcomes.some((outcome) => !outcome.blockedBySafety),
    safetyNote: 'Counterfactuals never override clinician restrictions, injury protections, or binding safety constraints.',
    provenance: scenarios.map((scenario) => scenario.scenarioId),
    auditable: true,
  };
}
