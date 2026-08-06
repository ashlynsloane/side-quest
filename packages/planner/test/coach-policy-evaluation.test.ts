import { describe, expect, test } from 'vitest';
import type { CoachDecisionOutcome, CoachScenarioScore } from '@circuit/domain';
import {
  assessPolicyOutcome,
  createPolicyEvaluation,
  createPolicyExperiment,
  evaluatePolicyPromotion,
  recordShadowPolicyPrediction,
  summarizePolicyPerformance,
} from '../src/coach-policy-evaluation';

const score = (scenarioId: string, utilityScore: number, rank: number): CoachScenarioScore => ({
  scenarioId,
  utilityScore,
  rank,
  eligible: true,
  recommended: rank === 1,
  tradeoffs: [],
  constraintViolations: [],
  projection: { adaptation: 70, recovery: 70, performance: 70, injuryRisk: 10, calendarFit: 70, preferenceFit: 70, disruption: 20 },
  componentScores: { adaptation: 70, recovery: 70, performance: 70, injuryRisk: 90, calendarFit: 70, preferenceFit: 70, disruption: 80 },
});

const makeEvaluation = () => createPolicyEvaluation({
  evaluationId: 'evaluation-1',
  policyRuleId: 'rule-1',
  context: { contextTags: ['protected-ride'], protectedSessionIds: ['ride'], restrictions: [], twinReliability: 'stable', evidenceQuality: 0.9 },
  baseline: score('move', 80, 1),
  shadow: score('shorten', 78, 2),
  policyAdjustedScore: 82,
  createdAt: '2026-07-29T12:00:00Z',
});

const positiveOutcome: CoachDecisionOutcome = {
  observedAt: '2026-07-30T12:00:00Z', workoutCompleted: true, protectedSessionCompleted: true,
  painIncreased: false, athleteHelpful: true, requiredAnotherAdjustment: false, notes: [],
};

describe('coach policy evaluation', () => {
  test('shadow mode preserves the baseline recommendation', () => {
    const evaluation = makeEvaluation();
    expect(evaluation.state).toBe('shadow');
    expect(evaluation.baselinePrediction.scenarioId).toBe('move');
    expect(evaluation.shadowPrediction.scenarioId).toBe('shorten');
  });

  test('unselected policy option receives no observed outcome credit', () => {
    const evaluation = recordShadowPolicyPrediction(makeEvaluation(), 'move', true, [], '2026-07-29T13:00:00Z');
    const assessment = assessPolicyOutcome({ decisionId: 'decision-1', evaluation, outcome: positiveOutcome });
    expect(assessment.classification).toBe('not_comparable');
  });

  test('one positive outcome cannot promote a policy', () => {
    const selected = recordShadowPolicyPrediction(makeEvaluation(), 'shorten', true, [], '2026-07-29T13:00:00Z');
    const assessment = assessPolicyOutcome({ decisionId: 'decision-1', evaluation: selected, outcome: positiveOutcome });
    const summary = summarizePolicyPerformance([{ ...selected, outcomes: [assessment] }]);
    expect(evaluatePolicyPromotion(summary).eligible).toBe(false);
  });

  test('repeated comparable positive outcomes permit bounded promotion', () => {
    const selected = recordShadowPolicyPrediction(makeEvaluation(), 'shorten', true, [], '2026-07-29T13:00:00Z');
    const evaluations = Array.from({ length: 6 }, (_, index) => ({
      ...selected,
      evaluationId: `evaluation-${index}`,
      outcomes: [assessPolicyOutcome({ decisionId: `decision-${index}`, evaluation: selected, outcome: positiveOutcome })],
    }));
    const decision = evaluatePolicyPromotion(summarizePolicyPerformance(evaluations));
    expect(decision.eligible).toBe(true);
    expect(decision.boundedInfluence).toBeLessThanOrEqual(0.5);
  });

  test('experiments require consent and prohibit unsafe arms', () => {
    const awaiting = createPolicyExperiment({ experimentId: 'e1', policyRuleId: 'r1', hypothesis: 'shorten or move', contextTags: [], arms: [{ armId: 'a1', scenarioId: 'shorten', label: 'Shorten', prohibited: false, prohibitionReasons: [] }], athleteConsent: false, createdAt: '2026-07-29', expiresAt: '2026-08-05', clinicianRestrictions: [] });
    expect(awaiting.status).toBe('awaiting_consent');
    const unsafe = createPolicyExperiment({ experimentId: 'e2', policyRuleId: 'r1', hypothesis: 'unsafe test', contextTags: [], arms: [{ armId: 'a2', scenarioId: 'unsafe', label: 'Ignore restriction', prohibited: true, prohibitionReasons: ['Clinician restriction'] }], athleteConsent: true, createdAt: '2026-07-29', expiresAt: '2026-08-05', clinicianRestrictions: ['No impact'] });
    expect(unsafe.status).toBe('unsafe');
  });
});
