import type { CoachSimulationDecision, CoachSimulationStressTest } from '@circuit/domain';

export interface CoachSimulationCard { title: string; body: string; status: 'robust' | 'fragile' | 'needs_choice'; }
export interface CoachStressTestCard { title: string; body: string; failedScenarios: number; }

export function buildCoachSimulationCard(decision: CoachSimulationDecision): CoachSimulationCard {
  if (decision.selectedCandidateId) return { title: 'Robust across scenarios', body: 'This option held up across the tested assumptions.', status: 'robust' };
  if (decision.rejectedCandidateIds.length > 0) return { title: 'Sensitive to assumptions', body: 'Some reasonable scenarios produced a worse or unsafe result.', status: 'fragile' };
  return { title: 'Your choice matters', body: 'More than one option remains reasonable after simulation.', status: 'needs_choice' };
}

export function buildCoachStressTestCard(test: CoachSimulationStressTest): CoachStressTestCard {
  return {
    title: test.robust ? 'Stress test passed' : 'Stress test needs review',
    body: test.robust ? 'The option remained acceptable in every tested scenario.' : 'Review the assumptions that caused the option to fail.',
    failedScenarios: test.failureScenarioIds.length,
  };
}
