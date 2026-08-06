import type {
  CoachAttentionQueueInput,
  CoachAttentionQueueItem,
  CoachAttentionQueueResult,
  CoachAttentionTiming,
  CoachPreferencePolicyDecision,
} from '@circuit/domain';

const PRIORITY_RANK = { critical: 4, high: 3, normal: 2, low: 1 } as const;

function inQuietHours(date: Date, startHour: number, endHour: number): boolean {
  const hour = date.getHours();
  return startHour === endHour
    ? false
    : startHour < endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;
}

function nextQuietEnd(date: Date, endHour: number): string {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(endHour);
  if (next <= date) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function timingFor(
  item: CoachPreferencePolicyDecision,
  quiet: boolean,
): CoachAttentionTiming {
  const decision = item.decision;
  if (item.disposition === 'blocked') return 'informational';
  if (decision.priority === 'critical') return 'now';
  if (decision.priority === 'high') return quiet ? 'today' : 'now';
  if (item.disposition === 'approval_required' || item.disposition === 'review_only') return 'today';
  return decision.priority === 'normal' ? 'later' : 'informational';
}

function itemTitle(item: CoachPreferencePolicyDecision): string {
  const action = item.decision.action;
  if (item.disposition === 'blocked') return `Blocked ${action} recommendation`;
  if (item.disposition === 'review_only') return `Review ${action} recommendation`;
  if (item.disposition === 'approval_required') return `Approve ${action} recommendation`;
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} recommendation`;
}

export function buildCoachAttentionQueue(input: CoachAttentionQueueInput): CoachAttentionQueueResult {
  const generated = new Date(input.generatedAt);
  const maxImmediate = Math.max(1, input.settings?.maxImmediatePrompts ?? 2);
  const quietStart = input.settings?.quietHours?.startHour ?? 21;
  const quietEnd = input.settings?.quietHours?.endHour ?? 7;
  const quiet = inQuietHours(generated, quietStart, quietEnd);
  const lifecycleByDecision = new Map(
    (input.lifecycle?.records ?? []).map((record) => [record.decisionId, record]),
  );

  const sorted = [...input.policy.decisions].sort((a, b) => {
    const priority = PRIORITY_RANK[b.decision.priority] - PRIORITY_RANK[a.decision.priority];
    if (priority !== 0) return priority;
    return a.decision.decisionId.localeCompare(b.decision.decisionId);
  });

  const seen = new Set<string>();
  const suppressedDuplicateDecisionIds: string[] = [];
  let immediateCount = 0;
  const items: CoachAttentionQueueItem[] = [];

  for (const policyDecision of sorted) {
    const decision = policyDecision.decision;
    const lifecycle = lifecycleByDecision.get(decision.decisionId);
    if (lifecycle && lifecycle.status !== 'pending' && lifecycle.status !== 'accepted') continue;

    const duplicateKey = `${decision.sessionId ?? 'global'}:${decision.action}`;
    if (seen.has(duplicateKey)) {
      suppressedDuplicateDecisionIds.push(decision.decisionId);
      continue;
    }
    seen.add(duplicateKey);

    let timing = timingFor(policyDecision, quiet);
    const reasons = [...policyDecision.policyReasons];
    if (timing === 'now' && immediateCount >= maxImmediate && decision.priority !== 'critical') {
      timing = 'today';
      reasons.push('Deferred to prevent multiple simultaneous coach interruptions.');
    }
    if (timing === 'now') immediateCount += 1;

    const interruptive = timing === 'now' && (!quiet || decision.priority === 'critical');
    if (quiet && decision.priority === 'critical') {
      reasons.push('Critical safety-related coaching remains interruptive during quiet hours.');
    } else if (quiet && timing === 'today') {
      reasons.push('Quiet hours defer non-critical prompts.');
    }

    items.push({
      queueItemId: `attention:${decision.decisionId}`,
      decisionId: decision.decisionId,
      sessionId: decision.sessionId,
      action: decision.action,
      timing,
      priority: decision.priority,
      disposition: policyDecision.disposition,
      title: itemTitle(policyDecision),
      summary: decision.explanation,
      dueAt: lifecycle?.expiresAt,
      interruptive,
      reasons,
    });
  }

  const ids = (timing: CoachAttentionTiming) => items.filter((item) => item.timing === timing).map((item) => item.queueItemId);
  const nextPromptAt = quiet && !items.some((item) => item.interruptive)
    ? nextQuietEnd(generated, quietEnd)
    : undefined;

  return {
    generatedAt: input.generatedAt,
    items,
    immediateItemIds: ids('now'),
    todayItemIds: ids('today'),
    deferredItemIds: ids('later'),
    informationalItemIds: ids('informational'),
    suppressedDuplicateDecisionIds,
    nextPromptAt,
    safeguards: [
      'Critical safety-related coaching is never suppressed by quiet hours or prompt limits.',
      'Prompt limits change presentation timing, not the underlying recommendation.',
      'Duplicate session-action recommendations are collapsed into one attention item.',
      'Resolved and expired lifecycle decisions are excluded from the active queue.',
      'Blocked recommendations remain visible as informational records rather than actionable changes.',
    ],
  };
}
