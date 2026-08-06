import { describe, expect, it } from 'vitest';
import type { CoachDecisionReassessmentRequest } from '@circuit/domain';
import { reassessCoachDecision } from '../src/coach-decision-reassessment';

function request(overrides: Partial<CoachDecisionReassessmentRequest> = {}): CoachDecisionReassessmentRequest {
  return {
    requestId: 'review-1',
    decisionId: 'decision-1',
    decisionCreatedAt: '2026-07-29T12:00:00.000Z',
    evaluatedAt: '2026-07-29T18:00:00.000Z',
    previouslyApplied: false,
    triggers: [],
    policy: {
      policyId: 'default',
      reviewAfterHours: 24,
      expireAfterHours: 72,
      materialTriggerKinds: ['symptom_change', 'restriction_change', 'availability_change'],
      requireAthleteCheckInBeforeReapply: false,
    },
    ...overrides,
  };
}

describe('coach decision reassessment', () => {
  it('keeps a recent unchanged decision current', () => {
    const result = reassessCoachDecision(request());
    expect(result.freshness).toBe('current');
    expect(result.automaticReapplicationAllowed).toBe(true);
  });

  it('invalidates a prior decision after a material symptom change', () => {
    const result = reassessCoachDecision(request({
      triggers: [{
        triggerId: 'symptom-1',
        kind: 'symptom_change',
        occurredAt: '2026-07-29T17:30:00.000Z',
        material: true,
        summary: 'Pain increased during ordinary activity',
        provenance: ['athlete-check-in'],
      }],
    }));
    expect(result.freshness).toBe('invalidated');
    expect(result.fullRecomputationRequired).toBe(true);
    expect(result.automaticReapplicationAllowed).toBe(false);
  });

  it('expires decisions that exceed the policy window', () => {
    const result = reassessCoachDecision(request({ evaluatedAt: '2026-08-02T12:00:00.000Z' }));
    expect(result.freshness).toBe('stale');
  });
});
