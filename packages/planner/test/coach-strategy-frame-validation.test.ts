import { describe, expect, it } from 'vitest';

import { validateCoachTurnFrame } from '../src/coach-semantic-frame';

function base() {
  return {
    version: 2 as const,
    turnId: 'strategy-validation',
    intent: 'strategy_change' as const,
    horizon: 'long_term' as const,
    events: [],
    symptoms: [],
    constraints: [],
    unresolved: [],
    confidence: 0.9,
    source: 'test_fixture' as const,
  };
}

describe('Strategy Coach semantic frame validation', () => {
  it('rejects an empty strategy object rather than treating strategy_change as meaningful', () => {
    const result = validateCoachTurnFrame({
      ...base(),
      strategyChange: { disciplineObjectives: {} },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('strategy_change requires meaningful strategy details or unresolved fields.');
  });

  it('accepts a meaningful discipline strategy', () => {
    const result = validateCoachTurnFrame({
      ...base(),
      strategyChange: {
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
        tradeoffTolerance: 'moderate_tradeoff',
      },
    });
    expect(result.valid).toBe(true);
  });

  it('allows an unresolved strategy turn to request clarification without inventing facts', () => {
    const result = validateCoachTurnFrame({
      ...base(),
      strategyChange: undefined,
      unresolved: ['which discipline should receive priority'],
    });
    expect(result.valid).toBe(true);
  });
});
