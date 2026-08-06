import { describe, expect, it } from 'vitest';
import type { CoachDecisionLifecycleInput, UnifiedCoachEngineResult } from '@circuit/domain';
import { reconcileCoachDecisionLifecycle } from '../src/coach-decision-lifecycle';

const coachResult: UnifiedCoachEngineResult = {
  generatedAt: '2026-07-29T12:00:00.000Z',
  status: 'adjustment_proposed',
  confidence: 'moderate',
  signals: [],
  decisions: [{
    decisionId: 'decision:1', sessionId: 'session:1', action: 'shorten', priority: 'high',
    confidence: 'moderate', requiresAthleteApproval: true, title: 'Shorten session',
    explanation: 'Capacity is constrained.', supportingSignalIds: [], rejectedAlternatives: [],
  }],
  protectedSessionIds: [], coachSummary: [], requiresAthleteApproval: true, safeguards: [],
};

function run(overrides: Partial<CoachDecisionLifecycleInput> = {}) {
  return reconcileCoachDecisionLifecycle({
    generatedAt: '2026-07-29T12:00:00.000Z', coachResult, ...overrides,
  });
}

describe('coach decision lifecycle', () => {
  it('creates an approval-gated pending proposal', () => {
    const result = run();
    expect(result.pendingDecisionIds).toEqual(['decision:1']);
    expect(result.events[0]?.type).toBe('proposed');
  });

  it('requires acceptance before applying a plan revision', () => {
    const initial = run();
    const ignored = run({ priorRecords: initial.records, priorEvents: initial.events,
      appliedDecisions: [{ decisionId: 'decision:1', occurredAt: '2026-07-29T13:00:00.000Z', planRevisionId: 'revision:1' }] });
    expect(ignored.records[0]?.status).toBe('pending');

    const accepted = run({ priorRecords: initial.records, priorEvents: initial.events,
      athleteResponses: [{ decisionId: 'decision:1', response: 'accept', occurredAt: '2026-07-29T12:30:00.000Z' }] });
    const applied = run({ priorRecords: accepted.records, priorEvents: accepted.events,
      appliedDecisions: [{ decisionId: 'decision:1', occurredAt: '2026-07-29T13:00:00.000Z', planRevisionId: 'revision:1' }] });
    expect(applied.records[0]?.status).toBe('applied');
    expect(applied.appliedPlanRevisionIds).toEqual(['revision:1']);
  });

  it('expires stale proposals and does not duplicate lifecycle events', () => {
    const initial = run({ proposalTtlHours: 1 });
    const expired = run({ generatedAt: '2026-07-29T14:00:00.000Z', priorRecords: initial.records, priorEvents: initial.events, proposalTtlHours: 1 });
    const repeated = run({ generatedAt: '2026-07-29T14:00:00.000Z', priorRecords: expired.records, priorEvents: expired.events, proposalTtlHours: 1 });
    expect(expired.records[0]?.status).toBe('expired');
    expect(repeated.events).toHaveLength(expired.events.length);
  });

  it('supports reversible applied plan revisions', () => {
    const initial = run();
    const accepted = run({ priorRecords: initial.records, priorEvents: initial.events,
      athleteResponses: [{ decisionId: 'decision:1', response: 'accept', occurredAt: '2026-07-29T12:30:00.000Z' }] });
    const applied = run({ priorRecords: accepted.records, priorEvents: accepted.events,
      appliedDecisions: [{ decisionId: 'decision:1', occurredAt: '2026-07-29T13:00:00.000Z', planRevisionId: 'revision:1' }] });
    const reverted = run({ priorRecords: applied.records, priorEvents: applied.events,
      revertedPlanRevisionIds: [{ planRevisionId: 'revision:1', occurredAt: '2026-07-29T13:30:00.000Z' }] });
    expect(reverted.records[0]?.status).toBe('reverted');
  });
});
