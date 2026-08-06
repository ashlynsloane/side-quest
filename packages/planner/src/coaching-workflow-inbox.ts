import type { CoachingWorkflowInbox, CoachingWorkflowItem } from '@circuit/domain';

const priorityRank = { critical: 4, high: 3, normal: 2, low: 1 } as const;

export function buildCoachingWorkflowInbox(generatedAt: string, items: CoachingWorkflowItem[]): CoachingWorkflowInbox {
  const active = items
    .filter((item) => item.status !== 'resolved' && item.status !== 'expired')
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.createdAt.localeCompare(b.createdAt));
  return {
    generatedAt,
    items: active,
    actionRequiredItemIds: active.filter((item) => item.athleteActionRequired).map((item) => item.workflowItemId),
    waitingItemIds: active.filter((item) => item.status.startsWith('waiting_for_')).map((item) => item.workflowItemId),
    informationalItemIds: active.filter((item) => !item.athleteActionRequired && item.status === 'open').map((item) => item.workflowItemId),
    safeguards: [
      'Protected recurring commitments are hard constraints unless the athlete explicitly unlocks or cancels them.',
      'Optimization may search around a protected commitment but may not displace it for a higher score.',
      'Safety and clinician-review items remain visible until resolved.',
      'Appeals, reassessments, expirations, and approvals share one traceable workflow.',
    ],
  };
}
