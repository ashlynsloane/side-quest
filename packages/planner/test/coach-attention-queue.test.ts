import { describe, expect, it } from 'vitest';
import type { CoachPreferencePolicyResult, UnifiedCoachDecision } from '@circuit/domain';
import { buildCoachAttentionQueue } from '../src/coach-attention-queue';

function decision(decisionId: string, priority: UnifiedCoachDecision['priority'], sessionId = decisionId): UnifiedCoachDecision {
  return {
    decisionId,
    sessionId,
    action: 'move',
    priority,
    confidence: 'high',
    title: `${decisionId} title`,
    explanation: `${decisionId} explanation`,
    supportingSignalIds: [],
    rejectedAlternatives: [],
    requiresAthleteApproval: true,
  };
}

function policy(decisions: UnifiedCoachDecision[]): CoachPreferencePolicyResult {
  return {
    generatedAt: '2026-07-29T15:00:00.000Z',
    autonomyLevel: 'ask_before_changes',
    decisions: decisions.map((item) => ({ decision: item, disposition: 'approval_required', policyReasons: ['Approval required.'] })),
    allowedDecisionIds: [],
    approvalRequiredDecisionIds: decisions.map((item) => item.decisionId),
    blockedDecisionIds: [],
    reviewOnlyDecisionIds: [],
    safeguards: [],
  };
}

describe('buildCoachAttentionQueue', () => {
  it('limits non-critical immediate prompts and collapses duplicate session actions', () => {
    const result = buildCoachAttentionQueue({
      generatedAt: '2026-07-29T15:00:00.000Z',
      policy: policy([
        decision('critical', 'critical', 's1'),
        decision('high-a', 'high', 's2'),
        decision('high-b', 'high', 's3'),
        decision('duplicate', 'normal', 's3'),
      ]),
      settings: { maxImmediatePrompts: 2 },
    });
    expect(result.immediateItemIds).toHaveLength(2);
    expect(result.todayItemIds).toHaveLength(1);
    expect(result.suppressedDuplicateDecisionIds).toEqual(['duplicate']);
  });

  it('defers high-priority non-critical prompts during quiet hours', () => {
    const result = buildCoachAttentionQueue({
      generatedAt: '2026-07-29T23:00:00',
      policy: policy([decision('high', 'high')]),
      settings: { quietHours: { startHour: 21, endHour: 7 } },
    });
    expect(result.immediateItemIds).toHaveLength(0);
    expect(result.todayItemIds).toHaveLength(1);
    expect(result.nextPromptAt).toBeTruthy();
  });
});
