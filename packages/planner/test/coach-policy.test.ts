
import { describe, expect, test } from 'vitest';
import type { CoachPolicyRule, CoachScenarioScore } from '@circuit/domain';
import { applyCoachPolicy, createDefaultCoachPolicy, evaluatePolicyCandidate, resolvePolicyConflicts } from '../src/coach-policy';

const scenario: CoachScenarioScore = {
  scenarioId: 'shorten',
  utilityScore: 78,
  rank: 1,
  eligible: true,
  recommended: false,
  tradeoffs: [],
  constraintViolations: [],
  projection: {
    adaptation: 80,
    recovery: 75,
    performance: 75,
    injuryRisk: 10,
    calendarFit: 80,
    preferenceFit: 70,
    disruption: 20,
  },
  componentScores: {
    adaptation: 80,
    recovery: 75,
    performance: 75,
    injuryRisk: 90,
    calendarFit: 80,
    preferenceFit: 70,
    disruption: 80,
  },
};

const baseRule: CoachPolicyRule = {
  ruleId: 'r1', label: 'Shorten before moving', state: 'active', origin: 'observed_outcome', priority: 'physiological',
  requiredContextTags: ['protected-weekend'], action: { actionId: 'a1', scenarioId: 'shorten', actionType: 'shorten', scoreAdjustment: 20 },
  evidence: [], confidence: 'high', createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

describe('coach policy', () => {
  test('policy adjustment remains bounded and contextual', () => {
  const policy = { ...createDefaultCoachPolicy('athlete'), rules: [baseRule] };
  const applied = applyCoachPolicy(policy, { tags: ['protected-weekend'], protectedSessionIds: [], clinicianRestrictions: [], athleteRestrictions: [] }, scenario);
  expect(applied.finalScore).toBe(83);
  const unmatched = applyCoachPolicy(policy, { tags: [], protectedSessionIds: [], clinicianRestrictions: [], athleteRestrictions: [] }, scenario);
  expect(unmatched.finalScore).toBe(78);
});

test('one observation cannot activate a learned rule', () => {
  const rule = evaluatePolicyCandidate({ ...baseRule, state: 'candidate', evidence: [{ decisionId: 'd1', optionId: 'o1', outcomeDirection: 'supporting', contextTags: [], quality: 1, excluded: false }] });
  expect(rule.state).toBe('candidate');
});

test('conflicts resolve by authoritative priority', () => {
  const clinician = { ...baseRule, ruleId: 'clinician', priority: 'clinician' as const };
  const learned = { ...baseRule, ruleId: 'learned', priority: 'physiological' as const };
  const result = resolvePolicyConflicts([learned, clinician]);
  expect(result.rules[0]?.ruleId).toBe('clinician');
});
});
