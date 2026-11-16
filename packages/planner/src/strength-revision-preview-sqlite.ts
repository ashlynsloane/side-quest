import type { GeneratedWorkout, PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import { strengthSessionSignature, type StrengthChoiceDecision } from './daily-strength-decision-sqlite';
import {
  createStrengthRevisionPreviewBinding, verifyStrengthRevisionPreviewBinding,
  type StrengthRevisionPreviewBinding,
} from './strength-revision-preview-binding';
import type { CurrentStrengthReviewEvidence } from './strength-revision-decision-review';

/**
 * Separate append-only PREVIEW storage. Nothing in this table can authorize a
 * session, change a workout or be treated as an accepted training decision.
 */
export const STRENGTH_REVISION_PREVIEW_SQL = `
CREATE TABLE IF NOT EXISTS strength_revision_previews (
  id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strength_revision_previews_session
  ON strength_revision_previews(athlete_id, block_id, session_id, created_at DESC);
`;

export interface StoredStrengthRevisionPreview {
  id: string;
  createdAt: string;
  status: 'unapproved';
  binding: StrengthRevisionPreviewBinding;
  candidate: GeneratedWorkout;
  decision: StrengthChoiceDecision;
  evidence: CurrentStrengthReviewEvidence;
  executableWorkoutApproved: false;
}

export interface StoredStrengthPreviewAssessment {
  status: 'reviewable_preview' | 'stale';
  reasons: string[];
  sourceSession: PlannedStrengthSession | null;
  preview: StoredStrengthRevisionPreview;
  executableWorkoutApproved: false;
  requiresWriteTimeRevalidation: true;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === new Date(Date.parse(value)).toISOString();
}

function getSession(block: TrainingBlockPlan, sessionId: string): PlannedStrengthSession {
  if (!Array.isArray(block.weeks)) throw new Error('Training block sessions are unreadable.');
  const matches = block.weeks.flatMap(week => week.sessions ?? [])
    .filter(session => session.id === sessionId);
  if (matches.length !== 1) throw new Error('Source strength session is absent or ambiguous.');
  return matches[0]!;
}

function parsePreview(row: {
  id: string; athlete_id: string; block_id: string;
  session_id: string; created_at: string; preview_json: string;
}): StoredStrengthRevisionPreview {
  let preview: StoredStrengthRevisionPreview;
  try { preview = JSON.parse(row.preview_json) as StoredStrengthRevisionPreview; }
  catch { throw new Error('Stored strength revision preview is unreadable.'); }
  if (!preview || typeof preview !== 'object' || !preview.binding
    || !preview.candidate || !preview.decision || !preview.evidence
    || preview.id !== row.id || !preview.id.trim()
    || preview.createdAt !== row.created_at || !isTimestamp(preview.createdAt)
    || preview.status !== 'unapproved' || preview.executableWorkoutApproved !== false
    || preview.binding.schemaVersion !== 1
    || preview.binding.kind !== 'strength_revision_preview'
    || preview.binding.executableWorkoutApproved !== false
    || preview.binding.requiresWriteTimeRevalidation !== true
    || preview.binding.athleteId !== row.athlete_id
    || preview.binding.blockId !== row.block_id
    || preview.binding.sessionId !== row.session_id
    || preview.binding.decisionId !== preview.decision.id
    || preview.binding.localReviewDate !== preview.evidence.todayLocalDate
    || preview.decision.athleteId !== row.athlete_id
    || preview.decision.blockId !== row.block_id
    || preview.decision.sessionId !== row.session_id
    || preview.evidence.athleteId !== row.athlete_id
    || preview.binding.sourceSignature !== preview.decision.sourceSignature
    || preview.binding.decisionSignature !== JSON.stringify(preview.decision)
    || preview.binding.candidateSignature !== JSON.stringify(preview.candidate)
    || preview.binding.evidenceSignature !== JSON.stringify(preview.evidence)) {
    throw new Error('Stored strength revision preview integrity mismatch.');
  }
  return preview;
}

async function sourceInCurrentBlock(
  sql: TrainingAdjustmentSqlDriver,
  blockId: string,
  sessionId: string,
): Promise<PlannedStrengthSession> {
  const latest = await sql.getFirst<{ id: string }>(
    'SELECT id FROM training_blocks ORDER BY updated_at DESC LIMIT 1', [],
  );
  if (latest?.id !== blockId) throw new Error('A newer training block supersedes this preview.');
  const row = await sql.getFirst<{ block_json: string }>(
    'SELECT block_json FROM training_blocks WHERE id = ?', [blockId],
  );
  if (!row) throw new Error('Source training block no longer exists.');
  let block: TrainingBlockPlan;
  try { block = JSON.parse(row.block_json) as TrainingBlockPlan; }
  catch { throw new Error('Source training block is unreadable.'); }
  if (!block || block.id !== blockId) throw new Error('Source training block identity mismatch.');
  return getSession(block, sessionId);
}

/**
 * Atomically store an immutable candidate for later REVIEW ONLY.
 * The clinical sourceCoverage and provider evidence flags are caller-supplied,
 * NOT authenticated by this operation; no athlete-facing approval is enabled.
 */
export async function appendStrengthRevisionPreview(
  sql: TrainingAdjustmentSqlDriver,
  input: {
    id: string;
    createdAt: string;
    source: PlannedStrengthSession;
    candidate: GeneratedWorkout;
    decision: StrengthChoiceDecision;
    evidence: CurrentStrengthReviewEvidence;
  },
): Promise<StoredStrengthRevisionPreview> {
  if (!input.id?.trim() || !isTimestamp(input.createdAt)) {
    throw new Error('A distinct preview identity and valid timestamp are required.');
  }
  const binding = createStrengthRevisionPreviewBinding(input);
  if (!binding) throw new Error('Strength revision is not reviewable; no preview stored.');
  const preview: StoredStrengthRevisionPreview = {
    id: input.id, createdAt: input.createdAt, status: 'unapproved',
    binding, candidate: input.candidate, decision: input.decision,
    evidence: input.evidence, executableWorkoutApproved: false,
  };
  await sql.transaction(async () => {
    const owner = await sql.getFirst<{ user_id: string }>(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1', [],
    );
    if (owner?.user_id !== binding.athleteId) {
      throw new Error('Stored preview athlete does not own this database.');
    }
    const session = await sourceInCurrentBlock(sql, binding.blockId, binding.sessionId);
    if (strengthSessionSignature(session) !== binding.sourceSignature
      || !verifyStrengthRevisionPreviewBinding({
        binding, source: session, candidate: preview.candidate,
        decision: preview.decision, evidence: preview.evidence,
      }).valid) {
      throw new Error('Source session or proposed workout changed during preview write.');
    }
    const completed = await sql.getFirst<{ id: string }>(
      'SELECT id FROM workout_ledger WHERE planned_session_id = ? LIMIT 1',
      [binding.sessionId],
    );
    if (completed) throw new Error('The strength session already has a completion record.');
    await sql.run(
      `INSERT INTO strength_revision_previews
       (id, athlete_id, block_id, session_id, preview_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [preview.id, binding.athleteId, binding.blockId, binding.sessionId,
        JSON.stringify(preview), preview.createdAt],
    );
  });
  return preview;
}

export async function readStrengthRevisionPreview(
  sql: TrainingAdjustmentSqlDriver, athleteId: string, id: string,
): Promise<StoredStrengthRevisionPreview | null> {
  const owner = await sql.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1', [],
  );
  if (owner?.user_id !== athleteId) throw new Error('Strength preview athlete ownership mismatch.');
  const row = await sql.getFirst<{
    id: string; athlete_id: string; block_id: string;
    session_id: string; created_at: string; preview_json: string;
  }>(
    `SELECT id, athlete_id, block_id, session_id, created_at, preview_json
     FROM strength_revision_previews WHERE id = ? AND athlete_id = ? LIMIT 1`,
    [id, athleteId],
  );
  return row ? parsePreview(row) : null;
}

/**
 * Re-evaluate saved candidate against the current persisted source.
 * A 'reviewable_preview' result is NOT training clearance or an approval.
 * Callers cannot use it as a write-time authorization.
 */
export async function reassessStoredStrengthRevisionPreview(
  sql: TrainingAdjustmentSqlDriver, athleteId: string, id: string,
  evidence: CurrentStrengthReviewEvidence,
): Promise<StoredStrengthPreviewAssessment> {
  const preview = await readStrengthRevisionPreview(sql, athleteId, id);
  if (!preview) throw new Error('Strength revision preview was not found.');
  const reasons: string[] = [];
  let sourceSession: PlannedStrengthSession | null = null;
  try {
    sourceSession = await sourceInCurrentBlock(
      sql, preview.binding.blockId, preview.binding.sessionId,
    );
    const check = verifyStrengthRevisionPreviewBinding({
      binding: preview.binding, source: sourceSession,
      candidate: preview.candidate, decision: preview.decision, evidence,
    });
    reasons.push(...check.reasons);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : 'Source workout is unavailable.');
  }
  const completed = await sql.getFirst<{ id: string }>(
    'SELECT id FROM workout_ledger WHERE planned_session_id = ? LIMIT 1',
    [preview.binding.sessionId],
  );
  if (completed) reasons.push('Workout already has a completion record.');
  return {
    status: reasons.length === 0 ? 'reviewable_preview' : 'stale',
    reasons, sourceSession, preview, executableWorkoutApproved: false,
    requiresWriteTimeRevalidation: true,
  };
}
