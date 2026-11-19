import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';
import { readStrengthEvidenceProvenance } from './strength-evidence-provenance-sqlite';

export const TRAINING_SAFETY_CONTEXT_SQL = `
CREATE TABLE IF NOT EXISTS training_safety_context_events (
  id TEXT PRIMARY KEY NOT NULL,
  athlete_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_safety_context_owner
  ON training_safety_context_events(athlete_id, created_at ASC);
`;

export type AthleteTrainingIntent =
  | 'general_training' | 'injury_rehabilitation' | 'return_to_sport';
export type ProtectedMovement =
  | 'impact_running' | 'loaded_spinal_rotation' | 'shoulder_loading'
  | 'deep_hip_flexion' | 'other_movement';

export interface TrainingSafetyContextEvent {
  schemaVersion: 1;
  id: string;
  athleteId: string;
  kind: 'training_intent' | 'protect_movement';
  intent: AthleteTrainingIntent | null;
  protectedMovement: ProtectedMovement | null;
  source: 'athlete_self_report';
  createdAt: string;
  executableWorkoutApproved: false;
}

export interface AthleteTrainingSafetyContext {
  schemaVersion: 1;
  athleteId: string;
  intent: AthleteTrainingIntent | 'unknown';
  activeProtectedMovements: ProtectedMovement[];
  /** A possible restriction reported in an older workout review is never ignored. */
  legacyRestrictionReported: boolean;
  ptProfile: 'active' | 'inactive' | 'missing' | 'unknown';
  symptoms: 'reported' | 'normal' | 'missing' | 'unknown';
  latestEventId: string | null;
  events: TrainingSafetyContextEvent[];
  executableWorkoutApproved: false;
}

export interface TrainingSafetyPolicy {
  schemaVersion: 1;
  track: 'routine_training_review' | 'restriction_aware_review'
    | 'rehabilitation_review' | 'training_context_needed';
  /** Ordinary, uncomplicated training does NOT require a provider document. */
  clinicianDocumentRequiredForRoutineTraining: false;
  requiresRestrictionAwareExerciseReview: boolean;
  knownRestrictionCount: number;
  reasons: string[];
  /** Planning classification only; no source/clinical validation or execution. */
  canApproveExerciseRevision: false;
  executableWorkoutApproved: false;
  restrictionMatchingImplemented: false;
}

const EVENT_KEYS = [
  'schemaVersion', 'id', 'athleteId', 'kind', 'intent', 'protectedMovement',
  'source', 'createdAt', 'executableWorkoutApproved',
].sort().join('|');
const INTENTS: AthleteTrainingIntent[] = [
  'general_training', 'injury_rehabilitation', 'return_to_sport',
];
const MOVEMENTS: ProtectedMovement[] = [
  'impact_running', 'loaded_spinal_rotation', 'shoulder_loading',
  'deep_hip_flexion', 'other_movement',
];

function validUtc(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return false;
  const canonical = new Date(millis).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
}

function validEvent(value: TrainingSafetyContextEvent): boolean {
  if (!value || typeof value !== 'object'
    || Object.keys(value).sort().join('|') !== EVENT_KEYS
    || value.schemaVersion !== 1 || typeof value.id !== 'string'
    || !value.id.trim() || value.id.length > 160
    || typeof value.athleteId !== 'string' || !value.athleteId.trim()
    || value.source !== 'athlete_self_report'
    || value.executableWorkoutApproved !== false
    || !validUtc(value.createdAt)) return false;
  if (value.kind === 'training_intent') {
    return value.protectedMovement === null
      && INTENTS.includes(value.intent as AthleteTrainingIntent);
  }
  if (value.kind === 'protect_movement') {
    return value.intent === null
      && MOVEMENTS.includes(value.protectedMovement as ProtectedMovement);
  }
  return false;
}

/** A complete owner-locked history. Never skip a malformed or foreign row. */
export async function readAthleteTrainingSafetyContext(
  sql: TrainingAdjustmentSqlDriver,
  athleteId: string,
): Promise<AthleteTrainingSafetyContext> {
  if (!athleteId?.trim()) throw new Error('Athlete training safety owner is required.');
  const owner = await sql.getFirst<{ user_id: string }>(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1', [],
  );
  if (owner?.user_id !== athleteId) {
    throw new Error('Athlete training safety database ownership mismatch.');
  }
  const rows = await sql.getAll<{
    id: string; athlete_id: string; event_json: string; created_at: string;
  }>(
    `SELECT id, athlete_id, event_json, created_at
     FROM training_safety_context_events ORDER BY created_at ASC, rowid ASC`, [],
  );
  const events: TrainingSafetyContextEvent[] = [];
  let previousTime: number | null = null;
  for (const row of rows) {
    let event: TrainingSafetyContextEvent;
    try { event = JSON.parse(row.event_json) as TrainingSafetyContextEvent; }
    catch { throw new Error('Athlete training safety journal is unreadable.'); }
    if (!validEvent(event) || row.id !== event.id || row.athlete_id !== athleteId
      || event.athleteId !== athleteId || row.created_at !== event.createdAt) {
      throw new Error('Athlete training safety history has invalid ownership or metadata.');
    }
    const millis = Date.parse(event.createdAt);
    if (previousTime !== null && millis < previousTime) {
      throw new Error('Athlete training safety history has a backwards clock.');
    }
    previousTime = millis;
    events.push(event);
  }
  const latestMode = events.filter(e => e.kind === 'training_intent').at(-1);
  const activeProtectedMovements = Array.from(new Set(
    events.filter(e => e.kind === 'protect_movement')
      .map(e => e.protectedMovement as ProtectedMovement),
  ));
  const latestPt = await sql.getFirst<{ profile_json: string }>(
    'SELECT profile_json FROM pt_profiles ORDER BY updated_at DESC LIMIT 1', [],
  );
  let ptProfile: AthleteTrainingSafetyContext['ptProfile'] = 'missing';
  if (latestPt) {
    try {
      const parsed = JSON.parse(latestPt.profile_json) as { active?: unknown };
      ptProfile = parsed?.active === true ? 'active'
        : parsed?.active === false ? 'inactive' : 'unknown';
    } catch { ptProfile = 'unknown'; }
  }
  const latestSymptoms = await sql.getFirst<{ check_in_json: string }>(
    'SELECT check_in_json FROM training_check_ins WHERE active = 1 ORDER BY updated_at DESC LIMIT 1',
    [],
  );
  let symptoms: AthleteTrainingSafetyContext['symptoms'] = 'missing';
  if (latestSymptoms) {
    try {
      const parsed = JSON.parse(latestSymptoms.check_in_json) as {
        status?: unknown; active?: unknown; activeUntil?: unknown;
      };
      if (parsed?.active !== true || !validUtc(parsed.activeUntil)
        || Date.parse(parsed.activeUntil) <= Date.now()) {
        symptoms = 'unknown';
      } else {
        symptoms = parsed.status === 'normal' ? 'normal' : 'reported';
      }
    } catch { symptoms = 'unknown'; }
  }

  // Prior review-specific risk reports apply to the athlete across sessions.
  // A later unverified 'reported_none' CANNOT clear an earlier restriction.
  const previewRows = await sql.getAll<{ id: string; athlete_id: string }>(
    'SELECT id, athlete_id FROM strength_revision_previews', [],
  );
  let legacyRestrictionReported = false;
  for (const preview of previewRows) {
    if (preview.athlete_id !== athleteId) {
      throw new Error('Athlete training safety includes a foreign-owned preview.');
    }
    const lineage = await readStrengthEvidenceProvenance(
      sql, athleteId, preview.id,
    );
    if (lineage.events.some(event => event.kind === 'provider_restriction'
      && event.claim === 'reported_present')) {
      legacyRestrictionReported = true;
    }
  }
  const foreignLegacy = await sql.getFirst<{ id: string }>(
    `SELECT e.id FROM strength_evidence_provenance_events e
     LEFT JOIN strength_revision_previews p ON p.id = e.preview_id
     WHERE p.id IS NULL OR p.athlete_id <> e.athlete_id LIMIT 1`, [],
  );
  if (foreignLegacy) {
    throw new Error('Athlete training safety has orphaned or foreign evidence.');
  }
  return {
    schemaVersion: 1, athleteId, intent: latestMode?.intent ?? 'unknown',
    activeProtectedMovements, legacyRestrictionReported,
    ptProfile, symptoms, latestEventId: events.at(-1)?.id ?? null,
    events, executableWorkoutApproved: false,
  };
}

/**
 * Conservative TRACK classification, not exercise approval. An athlete may
 * train routinely without clinician-issued paperwork, but any historical
 * restriction dominates a later 'general training' declaration.
 */
export function evaluateTrainingSafetyPolicy(
  context: AthleteTrainingSafetyContext,
): TrainingSafetyPolicy {
  if (!context || context.schemaVersion !== 1
    || !context.athleteId?.trim() || context.executableWorkoutApproved !== false
    || !INTENTS.concat('unknown' as AthleteTrainingIntent).includes(
      context.intent as AthleteTrainingIntent,
    ) || !Array.isArray(context.activeProtectedMovements)
    || context.activeProtectedMovements.some(m => !MOVEMENTS.includes(m))
    || !['active', 'inactive', 'missing', 'unknown'].includes(context.ptProfile)
    || !['reported', 'normal', 'missing', 'unknown'].includes(context.symptoms)
    || typeof context.legacyRestrictionReported !== 'boolean') {
    throw new Error('Invalid athlete training safety context.');
  }
  const reasons: string[] = [];
  const protectedHistory = context.activeProtectedMovements.length > 0
    || context.legacyRestrictionReported || context.ptProfile === 'active';
  if (context.activeProtectedMovements.length) {
    reasons.push('Previously reported protected movements remain active until independently reconciled.');
  }
  if (context.legacyRestrictionReported) {
    reasons.push('An earlier workout review recorded a possible restriction that must not be silently cleared.');
  }
  if (context.ptProfile === 'active') {
    reasons.push('An active in-app PT restriction profile still applies.');
  }
  if (context.ptProfile === 'unknown') {
    reasons.push('The stored PT restriction profile cannot be interpreted.');
  }
  if (context.symptoms === 'reported') {
    reasons.push('An active symptom report requires conservative training decisions.');
  } else if (context.symptoms === 'unknown') {
    reasons.push('Current symptom status cannot be confirmed.');
  }
  if (context.intent === 'unknown') {
    reasons.push('Choose a training context before interpreting guidance.');
  }
  let track: TrainingSafetyPolicy['track'];
  if (context.intent === 'injury_rehabilitation'
    || context.intent === 'return_to_sport') {
    track = 'rehabilitation_review';
    reasons.push('Rehabilitation and return-to-sport progressions require injury-specific restrictions.');
  } else if (protectedHistory || ['reported', 'unknown'].includes(context.symptoms)
    || context.ptProfile === 'unknown') {
    track = 'restriction_aware_review';
  } else if (context.intent === 'general_training') {
    track = 'routine_training_review';
    reasons.push('No clinician-issued document is required merely to review ordinary training.');
  } else {
    track = 'training_context_needed';
  }
  return {
    schemaVersion: 1, track,
    clinicianDocumentRequiredForRoutineTraining: false,
    requiresRestrictionAwareExerciseReview: track !== 'routine_training_review',
    knownRestrictionCount: context.activeProtectedMovements.length
      + (context.legacyRestrictionReported ? 1 : 0)
      + (context.ptProfile === 'active' ? 1 : 0),
    reasons, canApproveExerciseRevision: false,
    executableWorkoutApproved: false, restrictionMatchingImplemented: false,
  };
}

/**
 * Atomic append, CAS-protected against concurrent profile updates.
 * There is intentionally NO 'remove restriction' or 'medical clearance' action.
 */
export async function appendTrainingSafetyContextEvent(
  sql: TrainingAdjustmentSqlDriver,
  event: TrainingSafetyContextEvent,
  expectedLastEventId: string | null,
): Promise<void> {
  if (!validEvent(event) || (expectedLastEventId !== null
    && (typeof expectedLastEventId !== 'string' || !expectedLastEventId.trim()))) {
    throw new Error('Invalid athlete training safety event.');
  }
  const serialized = JSON.stringify(event);
  const frozen = JSON.parse(serialized) as TrainingSafetyContextEvent;
  if (!sql.exclusiveTransaction) {
    throw new Error('Exclusive athlete training safety writes are unavailable.');
  }
  await sql.exclusiveTransaction(async writer => {
    const state = await readAthleteTrainingSafetyContext(writer, frozen.athleteId);
    if (state.latestEventId !== expectedLastEventId) {
      throw new Error('Athlete training safety history changed; refresh before saving.');
    }
    const previous = state.events.at(-1);
    if (previous && Date.parse(frozen.createdAt) < Date.parse(previous.createdAt)) {
      throw new Error('Athlete training safety event clock moved backwards.');
    }
    await writer.run(
      `INSERT INTO training_safety_context_events
       (id, athlete_id, event_json, created_at) VALUES (?, ?, ?, ?)`,
      [frozen.id, frozen.athleteId, serialized, frozen.createdAt],
    );
  });
}
