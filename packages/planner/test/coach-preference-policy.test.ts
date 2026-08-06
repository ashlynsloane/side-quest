import { describe, expect, it } from 'vitest';
import type { CoachPreferencePolicyInput, UnifiedCoachEngineResult } from '@circuit/domain';
import { applyCoachPreferencePolicy } from '../src/coach-preference-policy';

const coachResult: UnifiedCoachEngineResult = {
  generatedAt: '2026-07-29T12:00:00.000Z', status: 'adjustment_proposed', confidence: 'moderate',
  signals: [], protectedSessionIds: [], coachSummary: [], requiresAthleteApproval: false, safeguards: [],
  decisions: [{ decisionId: 'decision:1', sessionId: 'session:1', action: 'shorten', priority: 'low',
    confidence: 'moderate', requiresAthleteApproval: false, title: 'Shorten strength', explanation: 'Capacity is constrained.',
    supportingSignalIds: [], rejectedAlternatives: [] }],
};

function run(overrides: Partial<CoachPreferencePolicyInput> = {}) {
  return applyCoachPreferencePolicy({
    generatedAt: '2026-07-29T12:00:00.000Z', coachResult,
    preferences: { autonomyLevel: 'allow_minor_changes', allowedActions: ['keep', 'move', 'shorten'],
      maximumAutomaticPriority: 'low', updatedAt: '2026-07-29T11:00:00.000Z' },
    ...overrides,
  });
}

describe('coach preference policy', () => {
  it('allows only bounded minor changes when explicitly enabled', () => {
    expect(run().allowedDecisionIds).toEqual(['decision:1']);
  });

  it('keeps all decisions advisory in advisory-only mode', () => {
    const result = run({ preferences: { autonomyLevel: 'advisory_only', allowedActions: ['shorten'], updatedAt: '2026-07-29T11:00:00.000Z' } });
    expect(result.reviewOnlyDecisionIds).toEqual(['decision:1']);
  });

  it('blocks actions outside the athlete allowlist', () => {
    const result = run({ preferences: { autonomyLevel: 'ask_before_changes', allowedActions: ['move'], updatedAt: '2026-07-29T11:00:00.000Z' } });
    expect(result.blockedDecisionIds).toEqual(['decision:1']);
  });

  it('protects athlete-designated sessions', () => {
    const result = run({ preferences: { autonomyLevel: 'allow_minor_changes', allowedActions: ['shorten'], protectedSessionIds: ['session:1'], updatedAt: '2026-07-29T11:00:00.000Z' } });
    expect(result.reviewOnlyDecisionIds).toEqual(['decision:1']);
  });
});
