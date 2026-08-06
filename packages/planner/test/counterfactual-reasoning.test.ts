import { describe, expect, it } from 'vitest';
import {
  buildCounterfactualExplanation,
  evaluateCounterfactual,
  generateCounterfactuals,
} from '../src/counterfactual-reasoning';

describe('counterfactual reasoning', () => {
  it('changes one field at a time and identifies a material decision change', () => {
    const input = {
      decisionId: 'd1',
      selectedCandidateId: 'easy',
      disposition: 'recommend',
      values: { recovery: 2, availability_minutes: 45 },
    } as const;
    const scenarios = generateCounterfactuals(input, { recovery: [2, 4] });
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]?.changedFields).toEqual(['recovery']);
    const outcomes = scenarios.map((scenario) => evaluateCounterfactual(input, scenario, (values) => ({
      selectedCandidateId: Number(values.recovery) >= 4 ? 'normal' : 'easy',
      disposition: 'recommend',
    })));
    const explanation = buildCounterfactualExplanation('d1', scenarios, outcomes);
    expect(explanation.primaryDrivers).toContain('recovery');
    expect(explanation.noRealisticChangeWouldAlterDecision).toBe(false);
  });
});
