import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import { readStrengthRevisionPreview } from './strength-revision-preview-sqlite';

/**
 * UNVERIFIED source-claim ledger. Nothing in this table may be interpreted
 * as authenticating a clinician, clearing exercise, or completing data sync.
 * Source references are opaque labels, not medical documents.
 */
export const STRENGTH_EVIDENCE_PROVENANCE_SQL = `
CREATE TABLE IF NOT EXISTS strength_evidence_provenance_events (
  id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strength_evidence_provenance_preview
  ON strength_evidence_provenance_events(athlete_id, preview_id, created_at ASC);
`;

export type StrengthEvidenceClaimKind = 'provider_restriction' | 'training_coverage';
export type StrengthEvidenceSource = 'athlete_self_report' | 'document_reference'
  | 'integration_reference';
export type StrengthEvidenceClaim = 'reported_present' | 'reported_none'
  | 'unknown' | 'partial' | 'claimed_complete';

export interface StrengthEvidenceProvenanceEvent {
  schemaVersion: 1;
  id: string;
  athleteId: string;
  previewId: string;
  bindingSignature: string;
  kind: StrengthEvidenceClaimKind;
  source: StrengthEvidenceSource;
  claim: StrengthEvidenceClaim;
  sourceReference: string | null;
  observedAt: string;
  recordedAt: string;
  expiresAt: string | null;
  verification: 'unverified';
  executableWorkoutApproved: false;
}

export interface StrengthEvidenceProvenanceStatus {
  kind: StrengthEvidenceClaimKind;
  status: 'missing' | 'unverified' | 'reported_restriction' | 'partial'
    | 'conflicting' | 'expired';
  eventCount: number;
  latestEventId: string | null;
  /** Never equivalent to a clinician or provider verification. */
  independentlyVerified: false;
  applicableRestrictionsCleared: false;
}

export interface StrengthEvidenceProvenanceLedger {
  events: StrengthEvidenceProvenanceEvent[];
  restriction: StrengthEvidenceProvenanceStatus;
  coverage: StrengthEvidenceProvenanceStatus;
  independentlyVerified: false;
  executableWorkoutApproved: false;
}

function utc(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return false;
  const canonical = new Date(millis).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
}

function validEvent(event: StrengthEvidenceProvenanceEvent): boolean {
  if (!event || typeof event !== 'object' || event.schemaVersion !== 1
    || typeof event.id !== 'string' || event.id.length < 1 || event.id.length > 160
    || typeof event.athleteId !== 'string' || !event.athleteId.trim()
    || typeof event.previewId !== 'string' || !event.previewId.trim()
    || typeof event.bindingSignature !== 'string' || !event.bindingSignature
    || !['provider_restriction', 'training_coverage'].includes(event.kind)
    || !['athlete_self_report', 'document_reference', 'integration_reference'].includes(event.source)
    || event.verification !== 'unverified' || event.executableWorkoutApproved !== false
    || !utc(event.recordedAt) || !utc(event.observedAt)
    || Date.parse(event.observedAt) > Date.parse(event.recordedAt)
    || (event.expiresAt !== null
      && (!utc(event.expiresAt) || Date.parse(event.expiresAt) <= Date.parse(event.observedAt)))
    || (event.sourceReference !== null
      && (typeof event.sourceReference !== 'string'
        || !event.sourceReference.trim() || event.sourceReference.length > 180))
    || (event.source !== 'athlete_self_report' && event.sourceReference === null)
    || (event.source === 'athlete_self_report' && event.sourceReference !== null)) {
    return false;
  }
  const allowed = event.kind === 'provider_restriction'
    ? ['reported_present', 'reported_none', 'unknown']
    : ['partial', 'claimed_complete', 'unknown'];
  return allowed.includes(event.claim);
}

function summarize(
  kind: StrengthEvidenceClaimKind,
  events: StrengthEvidenceProvenanceEvent[],
  nowMs: number,
): StrengthEvidenceProvenanceStatus {
  const matching = events.filter(event => event.kind === kind);
  const last = matching.at(-1);
  let status: StrengthEvidenceProvenanceStatus['status'] = 'missing';
  if (last) {
    const contradictory = matching.some(event => event.claim === 'reported_present')
      && matching.some(event => event.claim === 'reported_none');
    const expired = Date.parse(last.observedAt) + 30 * 86400_000 < nowMs
      || (last.expiresAt !== null && Date.parse(last.expiresAt) <= nowMs);
    status = contradictory ? 'conflicting'
      : kind === 'provider_restriction' && matching.some(
        event => event.claim === 'reported_present',
      ) ? 'reported_restriction'
        : kind === 'training_coverage' && matching.some(
          event => event.claim === 'partial',
        ) ? 'partial'
          : expired ? 'expired' : 'unverified';
  }
  return {
    kind, status, eventCount: matching.length,
    latestEventId: last?.id ?? null,
    independentlyVerified: false, applicableRestrictionsCleared: false,
  };
}

/**
 * Caller must run this through an owner-scoped snapshot when combining with
 * workout review. Invalid rows are errors, never silently ignored.
 */
export async function readStrengthEvidenceProvenance(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
  previewId: string,
  nowMs = Date.now(),
): Promise<StrengthEvidenceProvenanceLedger> {
  if (!Number.isFinite(nowMs) || !athleteId?.trim() || !previewId?.trim()) {
    throw new Error('Invalid evidence provenance read request.');
  }
  const preview = await readStrengthRevisionPreview(sql, athleteId, previewId);
  if (!preview) throw new Error('Evidence provenance preview is absent.');
  const signature = JSON.stringify(preview.binding);
  const rows = await sql.getAll<{
    id: string; athlete_id: string; preview_id: string;
    event_json: string; created_at: string;
  }>(
    `SELECT id, athlete_id, preview_id, event_json, created_at
     FROM strength_evidence_provenance_events
     WHERE preview_id = ? ORDER BY created_at ASC, rowid ASC`,
    [previewId],
  );
  let previousTime: number | null = null;
  const events: StrengthEvidenceProvenanceEvent[] = [];
  for (const row of rows) {
    let event: StrengthEvidenceProvenanceEvent;
    try { event = JSON.parse(row.event_json) as StrengthEvidenceProvenanceEvent; }
    catch { throw new Error('Evidence provenance journal contains unreadable JSON.'); }
    if (!validEvent(event) || row.id !== event.id
      || row.athlete_id !== athleteId || event.athleteId !== athleteId
      || row.preview_id !== previewId || event.previewId !== previewId
      || row.created_at !== event.recordedAt
      || event.bindingSignature !== signature) {
      throw new Error('Evidence provenance journal identity or verification metadata mismatch.');
    }
    const time = Date.parse(event.recordedAt);
    if (previousTime !== null && time < previousTime) {
      throw new Error('Evidence provenance journal has a backwards timestamp.');
    }
    previousTime = time;
    events.push(event);
  }
  return {
    events,
    restriction: summarize('provider_restriction', events, nowMs),
    coverage: summarize('training_coverage', events, nowMs),
    independentlyVerified: false, executableWorkoutApproved: false,
  };
}

/**
 * Append athlete-visible unverified observations, not clinician clearances.
 * The caller's last-seen kind event prevents lost updates when multiple
 * review screens are open. No workout, approved decision or source plan
 * is written by this function.
 */
export async function appendStrengthEvidenceProvenance(
  sql: TrainingAdjustmentSqlDriver,
  event: StrengthEvidenceProvenanceEvent,
  expectedLastEventId: string | null,
): Promise<void> {
  if (!validEvent(event) || (expectedLastEventId !== null
    && (typeof expectedLastEventId !== 'string' || !expectedLastEventId.trim()))) {
    throw new Error('Invalid unverified evidence provenance event.');
  }
  const serialized = JSON.stringify(event);
  const frozen = JSON.parse(serialized) as StrengthEvidenceProvenanceEvent;
  if (typeof sql.exclusiveTransaction !== 'function') {
    throw new Error('Exclusive evidence provenance writes are unavailable.');
  }
  await sql.exclusiveTransaction(async writer => {
    const ledger = await readStrengthEvidenceProvenance(
      writer, frozen.athleteId, frozen.previewId,
    );
    const current = frozen.kind === 'provider_restriction'
      ? ledger.restriction.latestEventId : ledger.coverage.latestEventId;
    if (current !== expectedLastEventId) {
      throw new Error('Evidence provenance history changed; refresh and retry.');
    }
    if (frozen.bindingSignature !== JSON.stringify(
      (await readStrengthRevisionPreview(
        writer, frozen.athleteId, frozen.previewId,
      ))?.binding,
    )) {
      throw new Error('Evidence provenance binding changed.');
    }
    const latest = ledger.events.at(-1);
    if (latest && Date.parse(frozen.recordedAt) < Date.parse(latest.recordedAt)) {
      throw new Error('Evidence provenance timestamp moved backwards.');
    }
    await writer.run(
      `INSERT INTO strength_evidence_provenance_events
       (id, athlete_id, preview_id, event_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [frozen.id, frozen.athleteId, frozen.previewId, serialized, frozen.recordedAt],
    );
  });
}
