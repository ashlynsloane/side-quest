import type {
  CoachOptimizationCandidate,
  CoachSimulationDecision,
  CoachSimulationResult,
  CoachSimulationScenario,
  CoachSimulationStressTest,
} from '@circuit/domain';

export function createCoachSimulationScenario(input: Omit<CoachSimulationScenario, 'scenarioId'> & { scenarioId?: string }): CoachSimulationScenario {
  return { ...input, scenarioId: input.scenarioId ?? `sim-${input.candidateId}-${input.mode}` };
}

export function simulateCoachCandidate(candidate: CoachOptimizationCandidate, scenario: CoachSimulationScenario): CoachSimulationResult {
  const safetyViolation = candidate.constraintViolations.some((v) => /safety|injury|clinician|restriction/i.test(v));
  const highUncertainty = scenario.assumptions.some((a) => a.uncertainty === 'high' || a.uncertainty === 'unknown');
  const worsens = candidate.outcomes.some((o) => o.expectedDirection === 'worsen' && o.magnitude !== 'small');
  const outcome = safetyViolation ? 'harmful' : worsens ? 'fragile' : highUncertainty ? 'indeterminate' : 'acceptable';
  return {
    scenarioId: scenario.scenarioId,
    candidateId: candidate.candidateId,
    outcome,
    objectiveOutcomes: candidate.outcomes,
    constraintViolations: [...candidate.constraintViolations],
    safetyViolation,
    explanation: safetyViolation
      ? ['The option violates a binding safety, clinician, or injury constraint.']
      : highUncertainty
        ? ['The result is sensitive to uncertain assumptions.']
        : ['The option remains acceptable under the tested assumptions.'],
  };
}

export function stressTestCoachCandidate(candidateId: string, results: CoachSimulationResult[]): CoachSimulationStressTest {
  const candidateResults = results.filter((result) => result.candidateId === candidateId);
  const failures = candidateResults.filter((result) => result.safetyViolation || result.outcome === 'harmful' || result.outcome === 'fragile');
  return {
    stressTestId: `stress-${candidateId}`,
    candidateId,
    testedScenarioIds: candidateResults.map((result) => result.scenarioId),
    failureScenarioIds: failures.map((result) => result.scenarioId),
    robust: candidateResults.length > 0 && failures.length === 0,
    fragileAssumptions: failures.flatMap((result) => result.explanation),
    requiresAthleteConfirmation: failures.length > 0,
  };
}

export function runCoachSimulation(candidates: CoachOptimizationCandidate[], scenarios: CoachSimulationScenario[]): CoachSimulationDecision {
  const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const results = scenarios.flatMap((scenario) => {
    const candidate = candidateMap.get(scenario.candidateId);
    return candidate ? [simulateCoachCandidate(candidate, scenario)] : [];
  });
  const stressTests = candidates.map((candidate) => stressTestCoachCandidate(candidate.candidateId, results));
  const robustCandidateIds = stressTests.filter((test) => test.robust).map((test) => test.candidateId);
  const rejectedCandidateIds = stressTests.filter((test) => test.failureScenarioIds.length > 0).map((test) => test.candidateId);
  const selectedCandidateId = robustCandidateIds.length === 1 ? robustCandidateIds[0] : undefined;
  return {
    simulationId: `coach-simulation-${Date.now()}`,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    scenarios,
    results,
    stressTests,
    robustCandidateIds,
    rejectedCandidateIds,
    selectedCandidateId,
    automaticPlanChangeAllowed: Boolean(selectedCandidateId) && rejectedCandidateIds.length === 0,
    explanation: selectedCandidateId
      ? ['One option remained robust across all tested scenarios.']
      : ['No single option was robust enough for an automatic plan change.'],
    governanceRequired: true,
    auditable: true,
  };
}

export function explainCoachSimulation(decision: CoachSimulationDecision): string[] {
  return [...decision.explanation, `${decision.robustCandidateIds.length} robust option(s); ${decision.rejectedCandidateIds.length} rejected option(s).`];
}
