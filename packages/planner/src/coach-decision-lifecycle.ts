import type {
  CoachDecisionLifecycleEvent,
  CoachDecisionLifecycleInput,
  CoachDecisionLifecycleRecord,
  CoachDecisionLifecycleResult,
  UnifiedCoachDecision,
} from '@circuit/domain';

const DEFAULT_TTL_HOURS = 72;

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function eventId(decisionId: string, type: CoachDecisionLifecycleEvent['type'], at: string): string {
  return `coach-lifecycle:${decisionId}:${type}:${at}`;
}

function latestEvent(events: CoachDecisionLifecycleEvent[]): CoachDecisionLifecycleEvent | undefined {
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1);
}

function initialRecord(decision: UnifiedCoachDecision, proposedAt: string, ttlHours: number): CoachDecisionLifecycleRecord {
  return {
    decisionId: decision.decisionId,
    sessionId: decision.sessionId,
    action: decision.action,
    status: 'pending',
    proposedAt,
    expiresAt: addHours(proposedAt, ttlHours),
    currentExplanation: decision.explanation,
    eventIds: [],
  };
}

export function reconcileCoachDecisionLifecycle(
  input: CoachDecisionLifecycleInput,
): CoachDecisionLifecycleResult {
  const ttlHours = Math.max(1, input.proposalTtlHours ?? DEFAULT_TTL_HOURS);
  const records = new Map((input.priorRecords ?? []).map((record) => [record.decisionId, { ...record, eventIds: [...record.eventIds] }]));
  const events = [...(input.priorEvents ?? [])];

  for (const decision of input.coachResult.decisions) {
    if (records.has(decision.decisionId)) continue;
    const record = initialRecord(decision, input.coachResult.generatedAt, ttlHours);
    const proposed: CoachDecisionLifecycleEvent = {
      eventId: eventId(decision.decisionId, 'proposed', input.coachResult.generatedAt),
      decisionId: decision.decisionId,
      occurredAt: input.coachResult.generatedAt,
      type: 'proposed',
      actor: 'coach_engine',
      reason: decision.explanation,
    };
    record.eventIds.push(proposed.eventId);
    records.set(record.decisionId, record);
    events.push(proposed);
  }

  const append = (record: CoachDecisionLifecycleRecord, event: CoachDecisionLifecycleEvent) => {
    if (events.some((existing) => existing.eventId === event.eventId)) return;
    events.push(event);
    record.eventIds.push(event.eventId);
  };

  for (const response of input.athleteResponses ?? []) {
    const record = records.get(response.decisionId);
    if (!record || record.status !== 'pending') continue;
    const type = response.response === 'accept' ? 'accepted' : 'declined';
    append(record, {
      eventId: eventId(record.decisionId, type, response.occurredAt),
      decisionId: record.decisionId,
      occurredAt: response.occurredAt,
      type,
      actor: 'athlete',
      reason: response.reason,
    });
    record.status = type;
    record.resolvedAt = response.occurredAt;
  }

  for (const applied of input.appliedDecisions ?? []) {
    const record = records.get(applied.decisionId);
    if (!record || record.status !== 'accepted') continue;
    append(record, {
      eventId: eventId(record.decisionId, 'applied', applied.occurredAt),
      decisionId: record.decisionId,
      occurredAt: applied.occurredAt,
      type: 'applied',
      actor: 'system',
      planRevisionId: applied.planRevisionId,
    });
    record.status = 'applied';
    record.resolvedAt = applied.occurredAt;
    record.appliedPlanRevisionId = applied.planRevisionId;
  }

  for (const reverted of input.revertedPlanRevisionIds ?? []) {
    for (const record of records.values()) {
      if (record.status !== 'applied' || record.appliedPlanRevisionId !== reverted.planRevisionId) continue;
      append(record, {
        eventId: eventId(record.decisionId, 'reverted', reverted.occurredAt),
        decisionId: record.decisionId,
        occurredAt: reverted.occurredAt,
        type: 'reverted',
        actor: 'athlete',
        planRevisionId: reverted.planRevisionId,
        reason: reverted.reason,
      });
      record.status = 'reverted';
      record.resolvedAt = reverted.occurredAt;
    }
  }

  for (const record of records.values()) {
    if (record.status !== 'pending' || record.expiresAt > input.generatedAt) continue;
    append(record, {
      eventId: eventId(record.decisionId, 'expired', input.generatedAt),
      decisionId: record.decisionId,
      occurredAt: input.generatedAt,
      type: 'expired',
      actor: 'system',
      reason: 'The proposal expired before athlete approval and must be regenerated from current evidence.',
    });
    record.status = 'expired';
    record.resolvedAt = input.generatedAt;
  }

  const resultRecords = [...records.values()].sort((a, b) => a.proposedAt.localeCompare(b.proposedAt));
  const resultEvents = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));

  // Ensure persisted records remain consistent with their event histories.
  for (const record of resultRecords) {
    const history = resultEvents.filter((event) => event.decisionId === record.decisionId);
    const latest = latestEvent(history);
    if (latest) record.currentExplanation = latest.reason ?? record.currentExplanation;
  }

  return {
    generatedAt: input.generatedAt,
    records: resultRecords,
    events: resultEvents,
    pendingDecisionIds: resultRecords.filter((record) => record.status === 'pending').map((record) => record.decisionId),
    actionableDecisionIds: resultRecords.filter((record) => record.status === 'accepted').map((record) => record.decisionId),
    expiredDecisionIds: resultRecords.filter((record) => record.status === 'expired').map((record) => record.decisionId),
    appliedPlanRevisionIds: [...new Set(resultRecords.flatMap((record) => record.status === 'applied' && record.appliedPlanRevisionId ? [record.appliedPlanRevisionId] : []))],
    safeguards: [
      'A proposal cannot be applied before explicit athlete acceptance.',
      'Expired proposals must be regenerated from current evidence before use.',
      'Declined decisions are not silently re-applied.',
      'Every applied plan change retains a reversible revision identifier.',
      'Repeated lifecycle inputs are idempotent and do not duplicate events.',
    ],
  };
}
