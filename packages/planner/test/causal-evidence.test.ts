import { describe, expect, test } from 'vitest';
import {
  assessCausalEvidence,
  createCausalQuestion,
  estimateMatchedOutcomeDifference,
  matchComparableTrainingBlocks,
} from '../src/causal-evidence';
import { createLongitudinalOutcomeWindow, createTrainingBlock } from '../src/longitudinal-learning';

const block = (id: string, value: number, phase = 'base') => createTrainingBlock({
  blockId: id,
  window: createLongitudinalOutcomeWindow({ windowId: `${id}-w`, kind: 'rolling_4_week', endAt: id.startsWith('e') ? '2026-06-01T00:00:00.000Z' : '2026-05-01T00:00:00.000Z' }),
  context: { phase, goal: '70.3', injuryState: 'healthy' },
  decisionIds: [`decision-${id}`],
  policyIds: ['protect-ride'],
  metrics: [{ key: 'ride_quality', value, observed: true, sourceIds: [`metric-${id}`] }],
});

const question = createCausalQuestion({
  questionId: 'q1',
  strategyId: 'protect-ride',
  exposure: 'lower-body strength reduced before protected ride',
  outcomeKeys: ['ride_quality'],
  targetContext: { phase: 'base', goal: '70.3' },
  createdAt: '2026-07-01T00:00:00.000Z',
});

describe('causal evidence guardrails', () => {
  test('matches comparable within-athlete blocks', () => {
    const pairs = matchComparableTrainingBlocks({ exposed: [block('e1', 2)], comparisons: [block('c1', 1)] });
    expect(pairs[0]?.comparable).toBe(true);
    expect(pairs[0]?.method).toBe('exact_context_match');
  });

  test('rejects materially mismatched contexts', () => {
    const pairs = matchComparableTrainingBlocks({ exposed: [block('e1', 2)], comparisons: [block('c1', 1, 'peak')] });
    expect(pairs[0]?.comparable).toBe(false);
  });

  test('never permits a causal claim from matched observational data', () => {
    const blocks = [block('e1', 2), block('c1', 1)];
    const pairs = matchComparableTrainingBlocks({ exposed: [blocks[0]!], comparisons: [blocks[1]!] });
    const estimate = estimateMatchedOutcomeDifference({ question, outcomeKey: 'ride_quality', pairs, blocks });
    expect(estimate.direction).toBe('beneficial');
    expect(estimate.causalClaimAllowed).toBe(false);
    expect(estimate.limitations.join(' ')).toContain('does not establish causality');
  });

  test('blocks policy promotion when assumptions or overlap are inadequate', () => {
    const assessment = assessCausalEvidence({
      assessmentId: 'a1', question,
      assumptions: [{ assumptionId: 'a', description: 'No important unmeasured confounding', testable: false, satisfied: false, evidenceIds: [] }],
      threats: [{ kind: 'confounding', severity: 'high', description: 'Training phase may confound the comparison.', mitigated: false, evidenceIds: [] }],
      matchedPairs: [], estimates: [],
    });
    expect(assessment.promotionBlocked).toBe(true);
    expect(assessment.explanation.join(' ')).toContain('Automatic policy promotion is blocked');
  });
});
