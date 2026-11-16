import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';
import {
  readStrengthRevisionPreview, reassessStoredStrengthRevisionPreview,
} from './strength-revision-preview-sqlite';

/**
 * Only dismisses and reopens a previously saved UNAPPROVED review preview.
 * A restore never approves, alters, or schedules any workout.
 */
export const STRENGTH_PREVIEW_REVIEW_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS strength_revision_preview_review_events (
  id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strength_preview_review_events
  ON strength_revision_preview_review_events(
    athlete_id, preview_id, created_at ASC
  );
`;

export interface StrengthPreviewReviewEvent {
  schemaVersion: 1;
  id: string;
  athleteId: string;
  previewId: string;
  bindingSignature: string;
  action: 'dismiss' | 'restore';
  createdAt: string;
  executableWorkoutApproved: false;
}

export interface StrengthPreviewReviewState {
  status: 'pending_review' | 'dismissed';
  latestEventId: string | null;
  events: StrengthPreviewReviewEvent[];
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

function validTimestamp(value: string): boolean {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

/**
 * Entire history is checked, not just the last row. A mismatched row identity,
 * future schema version, tampered binding, or impossible state transition
 * fails closed instead of silently discarding the earlier event.
 */
export async function readStrengthPreviewReviewState(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  previewId: string,
): Promise<StrengthPreviewReviewState> {
  const preview = await readStrengthRevisionPreview(sql, athleteId, previewId);
  if (!preview) throw new Error('Unapproved strength preview was not found.');
  const expectedSignature = JSON.stringify(preview.binding);
  const rows = await sql.getAll<{
    id: string; athlete_id: string; preview_id: string;
    event_json: string; created_at: string;
  }>(
    `SELECT id, athlete_id, preview_id, event_json, created_at
     FROM strength_revision_preview_review_events
     WHERE preview_id = ?
     ORDER BY created_at ASC, rowid ASC`,
    [previewId],
  );
  const events: StrengthPreviewReviewEvent[] = [];
  let status: StrengthPreviewReviewState['status'] = 'pending_review';
  let previousTimestamp: number | null = null;
  for (const row of rows) {
    let event: StrengthPreviewReviewEvent;
    try { event = JSON.parse(row.event_json) as StrengthPreviewReviewEvent; }
    catch { throw new Error('Unapproved preview review history is unreadable.'); }
    if (!event || typeof event !== 'object'
      || event.schemaVersion !== 1
      || event.id !== row.id || !event.id
      || row.athlete_id !== athleteId || event.athleteId !== athleteId
      || row.preview_id !== previewId || event.previewId !== previewId
      || event.createdAt !== row.created_at || !validTimestamp(event.createdAt)
      || event.bindingSignature !== expectedSignature
      || event.executableWorkoutApproved !== false
      || !['dismiss', 'restore'].includes(event.action)) {
      throw new Error('Unapproved preview review history has an invalid or altered event.');
    }
    const timestamp = Date.parse(event.createdAt);
    if (previousTimestamp !== null && timestamp < previousTimestamp) {
      throw new Error('Unapproved preview review history has an invalid clock order.');
    }
    previousTimestamp = timestamp;
    if (event.action === 'dismiss') {
      if (status !== 'pending_review') {
        throw new Error('Unapproved preview review history contains repeated dismissal.');
      }
      status = 'dismissed';
    } else {
      if (status !== 'dismissed') {
        throw new Error('Unapproved preview review history contains orphaned restoration.');
      }
      status = 'pending_review';
    }
    events.push(event);
  }
  return {
    status, latestEventId: events.at(-1)?.id ?? null,
    events, executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
}

/**
 * Atomically append a non-executable review-state change.
 * - Dismissal is allowed even after a preview becomes stale.
 * - Reopening requires an exact-match fresh reassessment, but still cannot
 *   authorize training, persist a workout, or convert a choice to accepted.
 * This is intentionally not exposed as a mobile action in Milestone 1.
 */
export async function appendStrengthPreviewReviewEvent(
  sql: TrainingAdjustmentSqlDriver,
  event: StrengthPreviewReviewEvent,
  currentEvidence?: CurrentStrengthReviewEvidence,
): Promise<void> {
  if (!event || event.schemaVersion !== 1 || !event.id?.trim()
    || !event.athleteId?.trim() || !event.previewId?.trim()
    || !event.bindingSignature || !validTimestamp(event.createdAt)
    || !['dismiss', 'restore'].includes(event.action)
    || event.executableWorkoutApproved !== false) {
    throw new Error('Invalid unapproved preview review event.');
  }
  await sql.transaction(async () => {
    const state = await readStrengthPreviewReviewState(
      sql, event.athleteId, event.previewId,
    );
    const preview = await readStrengthRevisionPreview(
      sql, event.athleteId, event.previewId,
    );
    if (!preview || event.bindingSignature !== JSON.stringify(preview.binding)) {
      throw new Error('Reviewed preview has changed or is absent.');
    }
    const last = state.events.at(-1);
    if (last && Date.parse(event.createdAt) < Date.parse(last.createdAt)) {
      throw new Error('Unapproved preview review event clock moved backwards.');
    }
    if (event.action === 'dismiss') {
      if (state.status !== 'pending_review') {
        throw new Error('Unapproved preview is already dismissed.');
      }
    } else {
      if (state.status !== 'dismissed') {
        throw new Error('Only a dismissed unapproved preview may be reopened.');
      }
      if (!currentEvidence || currentEvidence.athleteId !== event.athleteId) {
        throw new Error('Fresh athlete-owned review evidence is required to reopen.');
      }
      const reassessment = await reassessStoredStrengthRevisionPreview(
        sql, event.athleteId, event.previewId, currentEvidence,
      );
      if (reassessment.status !== 'reviewable_preview') {
        throw new Error('Unapproved preview is stale and cannot be reopened.');
      }
    }
    await sql.run(
      `INSERT INTO strength_revision_preview_review_events
       (id, athlete_id, preview_id, event_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [event.id, event.athleteId, event.previewId,
        JSON.stringify(event), event.createdAt],
    );
  });
}
