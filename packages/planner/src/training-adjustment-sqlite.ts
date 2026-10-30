import type { TrainingCalendarEvent } from '@circuit/domain';
import {
  applyAcceptedPlanAdjustments,
  rawGeneratedEventSignature,
  type PlanAdjustmentEvent,
} from './training-plan-adjustments';

/**
 * Platform-neutral SQL repository, shared by Expo SQLite and the real-file
 * SQLite integration smoke test. The caller selects the athlete profile DB.
 */
export interface TrainingAdjustmentSqlDriver {
  getFirst<T>(sql: string, params: Array<string | number | null>): Promise<T | null>;
  getAll<T>(sql: string, params: Array<string | number | null>): Promise<T[]>;
  run(sql: string, params: Array<string | number | null>): Promise<void>;
  transaction(fn: () => Promise<void>): Promise<void>;
}
export const PLAN_ADJUSTMENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS training_plan_adjustment_events (
  id TEXT PRIMARY KEY NOT NULL,
  source_event_id TEXT NOT NULL,
  decision_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_adjustments_source
  ON training_plan_adjustment_events(source_event_id, created_at DESC);
`;

/**
 * Stored decisions remain inspectable even after a generated source event is
 * removed or replaced. Querying via an INNER JOIN would hide orphaned history.
 */
export function planAdjustmentDecisionsForLocalWeek(
  decisions: PlanAdjustmentEvent[], weekStartDate: string, weekEndDate: string,
): PlanAdjustmentEvent[] {
  return decisions.filter(decision => {
    try {
      const signature = JSON.parse(decision.sourceSignature) as unknown[];
      const timestamp = signature[4];
      if (typeof timestamp !== 'string') return false;
      const date = timestamp.slice(0, 10);
      return date >= weekStartDate && date <= weekEndDate;
    } catch {
      return false;
    }
  });
}

export async function readTrainingAdjustmentDecisions(
  sql: TrainingAdjustmentSqlDriver,
  window?: { from: string; to: string },
): Promise<PlanAdjustmentEvent[]> {
  const rows = window
    ? await sql.getAll<{ decision_json: string }>(
      `SELECT a.decision_json
       FROM training_plan_adjustment_events a
       JOIN training_calendar_events c ON c.id = a.source_event_id
       WHERE c.start_at >= ? AND c.start_at <= ?
       ORDER BY a.created_at ASC, a.rowid ASC`,
      [window.from, window.to],
    )
    : await sql.getAll<{ decision_json: string }>(
      'SELECT decision_json FROM training_plan_adjustment_events ORDER BY created_at ASC, rowid ASC',
      [],
    );
  // For an append-only audit, unreadable decisions are not interchangeable with
  // "no accepted changes": fail closed instead of silently hiding history.
  return rows.map((row) => {
    let value: PlanAdjustmentEvent;
    try { value = JSON.parse(row.decision_json) as PlanAdjustmentEvent; }
    catch { throw new Error('Training adjustment audit contains unreadable JSON.'); }
    if (!value || !value.id || !value.sourceEventId || !value.createdAt
      || !['accepted', 'declined', 'restored'].includes(value.decision)
      || !['shorten_20_percent', 'defer'].includes(value.action)) {
      throw new Error('Training adjustment audit has an invalid decision record.');
    }
    return value;
  });
}

export async function appendTrainingAdjustmentDecision(
  sql: TrainingAdjustmentSqlDriver,
  decision: PlanAdjustmentEvent,
): Promise<void> {
  if (!decision.id || !decision.sourceEventId
      || !['accepted', 'declined', 'restored'].includes(decision.decision)
      || !['shorten_20_percent', 'defer'].includes(decision.action)) {
    throw new Error('Invalid training adjustment decision.');
  }
  await sql.transaction(async () => {
    const row = await sql.getFirst<{ event_json: string }>(
      'SELECT event_json FROM training_calendar_events WHERE id = ?',
      [decision.sourceEventId],
    );
    if (!row) throw new Error('Generated workout no longer exists.');
    let raw: TrainingCalendarEvent;
    try { raw = JSON.parse(row.event_json) as TrainingCalendarEvent; }
    catch { throw new Error('Generated workout is unreadable.'); }
    if (raw.sourceId !== 'side_quest_generated_plan'
        || rawGeneratedEventSignature(raw) !== decision.sourceSignature) {
      throw new Error('Generated workout changed; reopen plan review.');
    }
    if (decision.decision === 'accepted' && decision.action === 'shorten_20_percent') {
      const original = Number(raw.description?.match(/Side Quest generated · (\d+) min/)?.[1]);
      const expected = Math.max(10, Math.floor(original * .8));
      if (!Number.isFinite(original) || original < 20
          || decision.proposedMinutes !== expected) {
        throw new Error('Proposed duration does not match the reviewed adjustment.');
      }
    }
    if (decision.decision === 'accepted' && decision.action === 'defer'
        && decision.proposedMinutes !== null) {
      throw new Error('A deferred session must have no planned duration.');
    }
    const prev = await sql.getFirst<{ decision_json: string }>(
      `SELECT decision_json FROM training_plan_adjustment_events
       WHERE source_event_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      [decision.sourceEventId],
    );
    if (prev) {
      let prior: PlanAdjustmentEvent;
      try { prior = JSON.parse(prev.decision_json) as PlanAdjustmentEvent; }
      catch { throw new Error('Existing adjustment audit is unreadable.'); }
      if (decision.decision === 'restored' && prior.decision !== 'accepted') {
        throw new Error('Only an accepted change may be restored.');
      }
      if (decision.decision === 'accepted' && prior.decision === 'accepted') {
        throw new Error('An accepted change already exists; restore it before changing again.');
      }
    } else if (decision.decision === 'restored') {
      throw new Error('No accepted change to restore.');
    }
    await sql.run(
      `INSERT INTO training_plan_adjustment_events
       (id, source_event_id, decision_json, created_at) VALUES (?, ?, ?, ?)`,
      [decision.id, decision.sourceEventId, JSON.stringify(decision), decision.createdAt],
    );
  });
}

export async function effectiveTrainingCalendarEvents(
  sql: TrainingAdjustmentSqlDriver, raw: TrainingCalendarEvent[],
): Promise<{ events: TrainingCalendarEvent[]; staleEventIds: string[] }> {
  if (!raw.some(event => event.sourceId === 'side_quest_generated_plan')) {
    return { events: raw, staleEventIds: [] };
  }
  const decisions = await readTrainingAdjustmentDecisions(sql);
  return applyAcceptedPlanAdjustments(raw, decisions);
}
