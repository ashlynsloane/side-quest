import { describe, expect, it } from 'vitest';
import { buildCoachingWorkflowInbox } from '../src/coaching-workflow-inbox';

describe('coaching workflow inbox', () => {
  it('keeps unresolved athlete actions in one queue', () => {
    const inbox = buildCoachingWorkflowInbox('2026-07-29T19:00:00Z', [{
      workflowItemId: 'one', decisionId: 'decision', kind: 'approval', status: 'waiting_for_athlete',
      title: 'Review schedule change', summary: 'A workout move needs approval.', createdAt: '2026-07-29T18:00:00Z',
      priority: 'high', athleteActionRequired: true, blockedByCommitmentIds: ['masters-swim'], provenance: ['decision'],
    }]);
    expect(inbox.actionRequiredItemIds).toEqual(['one']);
  });
});
