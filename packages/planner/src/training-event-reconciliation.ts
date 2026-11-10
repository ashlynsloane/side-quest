import type { ActivityDose, TrainingEvent } from './daily-training-guardrails';

export interface LedgerExposure {
  ledgerId: string;
  revision: string;
  completedAt: string;
  activity: ActivityDose;
  legacyEventIds?: string[];
}

/** Deterministic event identity based on the authoritative workout ledger. */
export function ledgerEventId(ledgerId: string, revision: string): string {
  if (!ledgerId || !revision) throw new Error('Ledger ID and revision are required');
  return `completed:ledger:${ledgerId}:rev:${revision}`;
}

/**
 * Reconcile immutable audit events against the current workout-history rows.
 * Corrections and deletions append retractions; they never rewrite original
 * events. A corrected revision receives a new completion event.
 */
export function planLedgerReconciliation(
  date: string,
  ledger: readonly LedgerExposure[],
  history: readonly TrainingEvent[],
  observedAt: string,
): TrainingEvent[] {
  const currentIds = new Set(ledger.map((item) => ledgerEventId(item.ledgerId, item.revision)));
  const known = new Set(history.map((event) => event.id));
  const alreadyRetracted = new Set(history.filter((event) => event.kind === 'retracted')
    .map((event) => event.retractsEventId));
  const migratedIds = new Set(ledger.flatMap((item) => item.legacyEventIds ?? []));
  const events: TrainingEvent[] = [];
  for (const old of history) {
    if (old.kind !== 'completed' || currentIds.has(old.id) ||
        alreadyRetracted.has(old.id)) continue;
    if (!old.sourceId && !migratedIds.has(old.id)) continue;
    const id = `retracted:${old.id}`;
    if (known.has(id)) continue;
    events.push({
      id, kind: 'retracted', occurredAt: observedAt, trainingDate: date,
      retractsEventId: old.id,
      note: 'Previous activity record was edited, deleted, or migrated.',
    });
  }
  for (const entry of ledger) {
    const id = ledgerEventId(entry.ledgerId, entry.revision);
    if (known.has(id)) continue;
    events.push({
      id, kind: 'completed', occurredAt: entry.completedAt,
      trainingDate: date, sourceId: entry.ledgerId, activity: entry.activity,
    });
  }
  return events;
}
