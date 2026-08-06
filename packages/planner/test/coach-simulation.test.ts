import type { CoachOptimizationCandidate } from '@circuit/domain';
import { describe, expect, it } from 'vitest';
import { createCoachSimulationScenario, runCoachSimulation } from '../src/coach-simulation';

const candidate: CoachOptimizationCandidate = {
  candidateId: 'keep',
  label: 'Keep session',
  outcomes: [
    {
      objectiveId: 'recovery',
      expectedDirection: 'preserve',
      magnitude: 'small',
      confidence: 'high',
      explanation: 'Preserves recovery.',
    },
  ],
  constraintViolations: [],
  governanceApproved: true,
};

describe('coach simulation', () => {
  it('selects a single robust candidate', () => {
    const scenario = createCoachSimulationScenario({ label: 'Baseline', mode: 'baseline', candidateId: 'keep', assumptions: [{ assumptionId: 'a', field: 'fatigue', value: 'normal', source: 'observed', uncertainty: 'low' }] });
    const result = runCoachSimulation([candidate], [scenario]);
    expect(result.robustCandidateIds).toEqual(['keep']);
    expect(result.selectedCandidateId).toBe('keep');
  });
  it('blocks unsafe candidates', () => {
    const unsafe: CoachOptimizationCandidate = { ...candidate, candidateId: 'unsafe', constraintViolations: ['clinician restriction'] };
    const scenario = createCoachSimulationScenario({ label: 'Stress', mode: 'stress_test', candidateId: 'unsafe', assumptions: [] });
    const result = runCoachSimulation([unsafe], [scenario]);
    expect(result.rejectedCandidateIds).toContain('unsafe');
    expect(result.automaticPlanChangeAllowed).toBe(false);
  });
  it('keeps uncertain scenarios indeterminate rather than pretending precision', () => {
    const scenario = createCoachSimulationScenario({ label: 'Unknown fatigue', mode: 'edge_case', candidateId: 'keep', assumptions: [{ assumptionId: 'a', field: 'fatigue', value: 'unknown', source: 'inferred', uncertainty: 'unknown' }] });
    const result = runCoachSimulation([candidate], [scenario]);
    expect(result.results[0]?.outcome).toBe('indeterminate');
  });
});
