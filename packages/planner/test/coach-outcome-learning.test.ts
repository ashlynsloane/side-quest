import { describe, expect, it } from 'vitest';
import type { CoachDecisionLifecycleResult, CoachDecisionOutcomeLearningInput } from '@circuit/domain';
import { learnFromCoachDecisionOutcomes } from '../src/coach-outcome-learning';

const lifecycle: CoachDecisionLifecycleResult = {
  generatedAt: '2026-07-29T12:00:00.000Z',
  records: [{
    decisionId: 'decision:1', sessionId: 'session:1', action: 'shorten', status: 'applied',
    proposedAt: '2026-07-29T09:00:00.000Z', expiresAt: '2026-08-01T09:00:00.000Z',
    resolvedAt: '2026-07-29T10:00:00.000Z', appliedPlanRevisionId: 'revision:1',
    currentExplanation: 'Capacity was constrained.', eventIds: ['event:1'],
  }],
  events: [], pendingDecisionIds: [], actionableDecisionIds: [], expiredDecisionIds: [],
  appliedPlanRevisionIds: ['revision:1'], safeguards: [],
};

function run(overrides: Partial<CoachDecisionOutcomeLearningInput> = {}) {
  return learnFromCoachDecisionOutcomes({
    generatedAt: '2026-07-30T12:00:00.000Z', lifecycle,
    observations: [{ observationId: 'outcome:1', decisionId: 'decision:1', planRevisionId: 'revision:1',
      observedAt: '2026-07-30T10:00:00.000Z', rating: 'helped', completedAsPlanned: true }],
    ...overrides,
  });
}

describe('coach outcome learning', () => {
  it('learns only from decisions that were actually applied', () => {
    const result = run();
    expect(result.helpfulDecisionIds).toEqual(['decision:1']);
    expect(result.aggregates[0]?.action).toBe('shorten');
  });

  it('rejects observations linked to a mismatched plan revision', () => {
    const result = run({ observations: [{ observationId: 'outcome:bad', decisionId: 'decision:1', planRevisionId: 'revision:other',
      observedAt: '2026-07-30T10:00:00.000Z', rating: 'hurt' }] });
    expect(result.observations).toHaveLength(0);
  });

  it('deduplicates repeated observations', () => {
    const observation = { observationId: 'outcome:1', decisionId: 'decision:1', planRevisionId: 'revision:1',
      observedAt: '2026-07-30T10:00:00.000Z', rating: 'helped' as const };
    const result = run({ priorObservations: [observation], observations: [observation] });
    expect(result.observations).toHaveLength(1);
  });

  it('does not claim reliable evidence from a single outcome', () => {
    const result = run();
    expect(result.aggregates[0]?.confidence).toBe('low');
    expect(result.insufficientEvidenceActions).toContain('shorten');
    expect(result.safeguards.join(' ')).toContain('never automatically changes');
  });
});
