import { describe, expect, it } from 'vitest';
import { evaluateTrainingAddition } from '../src/daily-training-guardrails';
import { ledgerEventId, planLedgerReconciliation } from '../src/training-event-reconciliation';

const dose = { activity: 'strength', minutes: 20, regions: ['general' as const] };
const date = '2026-11-09';
const at = '2026-11-09T20:00:00Z';
const ledger = { ledgerId: 'w-1', revision: 'revision-1', completedAt: '2026-11-09T18:00:00Z', activity: dose };
const ceiling = { date, planned: [{ ...dose, minutes: 40 }], recovery: { general: 'stable' as const },
  recoveryObservedAt: { general: at }, restrictUnplanned: true };

describe('authoritative workout-ledger reconciliation', () => {
  it('creates a completed exposure only from an actual ledger row', () => {
    const pending = planLedgerReconciliation(date, [ledger], [], at);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.kind).toBe('completed');
    expect(pending[0]?.id).toBe(ledgerEventId('w-1', 'revision-1'));
  });
  it('is idempotent when the same ledger revision is read again', () => {
    const history = planLedgerReconciliation(date, [ledger], [], at);
    expect(planLedgerReconciliation(date, [ledger], history, at)).toEqual([]);
  });
  it('retracts old dose and records revised dose after an edit', () => {
    const history = planLedgerReconciliation(date, [ledger], [], at);
    const changed = { ...ledger, revision: 'revision-2', activity: { ...dose, minutes: 12 } };
    const events = planLedgerReconciliation(date, [changed], history, at);
    expect(events.map((x) => x.kind)).toEqual(['retracted', 'completed']);
    const combined = [...history, ...events];
    expect(evaluateTrainingAddition(ceiling,
      { activity: 'strength', minutes: 20, regions: ['general'], scheduled: true }, combined).decision).toBe('allow');
    expect(evaluateTrainingAddition(ceiling,
      { activity: 'strength', minutes: 29, regions: ['general'], scheduled: true }, combined).decision).toBe('modify');
  });
  it('retracts a completed activity removed from the ledger', () => {
    const history = planLedgerReconciliation(date, [ledger], [], at);
    const events = planLedgerReconciliation(date, [], history, at);
    expect(events.map((x) => x.kind)).toEqual(['retracted']);
    expect(evaluateTrainingAddition(ceiling,
      { activity: 'strength', minutes: 40, regions: ['general'], scheduled: true }, [...history, ...events]).decision).toBe('allow');
  });
  it('migrates legacy completion IDs without double-counting', () => {
    const legacy = { id: 'completed:workout:2026-11-09T18:00:00Z', kind: 'completed' as const,
      occurredAt: ledger.completedAt, trainingDate: date, activity: dose };
    const changes = planLedgerReconciliation(date,
      [{ ...ledger, legacyEventIds: [legacy.id] }], [legacy], at);
    expect(changes.map((x) => x.kind)).toEqual(['retracted','completed']);
  });
});
