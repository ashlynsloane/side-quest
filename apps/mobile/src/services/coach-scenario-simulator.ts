import type {
  CoachScenarioCandidate,
  CoachScenarioSimulatorInput,
  CoachScenarioSimulatorResult,
} from '@circuit/domain';
import { simulateCoachScenarios } from '@circuit/planner';

export interface CoachScenarioCard {
  scenarioId: string;
  title: string;
  description: string;
  rank: number;
  utilityPercent: number;
  recommended: boolean;
  eligible: boolean;
  tradeoffs: string[];
  constraintViolations: string[];
}

export function buildCoachScenarioResult(
  input: CoachScenarioSimulatorInput,
): CoachScenarioSimulatorResult {
  return simulateCoachScenarios(input);
}

export function buildCoachScenarioCards(
  candidates: CoachScenarioCandidate[],
  result: CoachScenarioSimulatorResult,
): CoachScenarioCard[] {
  const candidateById = new Map(candidates.map((candidate) => [candidate.scenarioId, candidate]));
  return result.scenarios.map((scenario) => {
    const candidate = candidateById.get(scenario.scenarioId);
    return {
      scenarioId: scenario.scenarioId,
      title: candidate?.title ?? scenario.scenarioId,
      description: candidate?.description ?? '',
      rank: scenario.rank,
      utilityPercent: Math.round(scenario.utilityScore * 100),
      recommended: scenario.recommended,
      eligible: scenario.eligible,
      tradeoffs: scenario.tradeoffs,
      constraintViolations: scenario.constraintViolations,
    };
  });
}
