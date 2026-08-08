export type CoachSemanticIntent =
  | 'report_symptom'
  | 'report_completed_training'
  | 'modify_planned_session'
  | 'ask_about_future_training'
  | 'report_schedule_constraint'
  | 'request_extra_training'
  | 'correct_previous_statement'
  | 'ask_explanation'
  | 'strategy_change'
  | 'general_update';

export type CoachConversationHorizon =
  | 'past'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'future_block'
  | 'long_term'
  | 'unknown';

export type CoachEventTemporalRole = 'completed' | 'current' | 'planned' | 'proposed';
export type CoachSemanticDiscipline = 'swim' | 'bike' | 'run' | 'strength';
export type CoachSemanticAction = 'move' | 'shorten' | 'replace' | 'skip' | 'evaluate' | 'add' | 'none';

export interface CoachSemanticTrainingEvent {
  semanticId: string;
  eventId?: string;
  discipline?: CoachSemanticDiscipline;
  temporalRole: CoachEventTemporalRole;
  date?: string;
  durationMinutes?: number;
  intensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'max' | 'unknown';
  relationToTurn?: 'symptom_source' | 'change_target' | 'comparison' | 'context';
}

export interface CoachSemanticSymptom {
  semanticId: string;
  bodyArea?: string;
  category?: 'soreness' | 'exertion' | 'menstrual' | 'musculoskeletal' | 'illness' | 'unknown';
  severity0to10?: number;
  changedMovement?: boolean;
  changedTraining?: boolean;
  stoppedTraining?: boolean;
  trajectory?: 'better' | 'same' | 'worse' | 'unknown';
  sourceEventSemanticId?: string;
}

export interface CoachSemanticRequestedChange {
  action: CoachSemanticAction;
  targetEventSemanticId?: string;
  targetEventId?: string;
  discipline?: CoachSemanticDiscipline;
  date?: string;
  durationMinutes?: number;
  intensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'max';
}

export interface CoachSemanticCorrection {
  target: 'symptom_function' | 'symptom_trajectory' | 'event_status' | 'requested_change' | 'general';
  replacesTurnId?: string;
  note?: string;
}

export interface CoachTurnFrameV2 {
  version: 2;
  turnId: string;
  intent: CoachSemanticIntent;
  horizon: CoachConversationHorizon;
  events: CoachSemanticTrainingEvent[];
  symptoms: CoachSemanticSymptom[];
  requestedChange?: CoachSemanticRequestedChange;
  correction?: CoachSemanticCorrection;
  constraints: string[];
  unresolved: string[];
  confidence: number;
  source: 'language_model' | 'deterministic_fallback' | 'test_fixture';
}

export interface CoachFrameValidationResult {
  valid: boolean;
  frame?: CoachTurnFrameV2;
  errors: string[];
}

export function validateCoachTurnFrame(input: unknown): CoachFrameValidationResult {
  const errors: string[] = [];
  const frame = input as Partial<CoachTurnFrameV2> | null | undefined;
  if (!frame || typeof frame !== 'object') return { valid: false, errors: ['Frame must be an object.'] };
  if (frame.version !== 2) errors.push('Frame version must be 2.');
  if (typeof frame.turnId !== 'string' || !frame.turnId.trim()) errors.push('turnId is required.');
  if (!isIntent(frame.intent)) errors.push('intent is invalid.');
  if (!isHorizon(frame.horizon)) errors.push('horizon is invalid.');
  if (!Array.isArray(frame.events) || !frame.events.every(isEvent)) errors.push('events must contain valid semantic events.');
  if (!Array.isArray(frame.symptoms) || !frame.symptoms.every(isSymptom)) errors.push('symptoms must contain valid semantic symptoms.');
  if (!Array.isArray(frame.constraints) || !frame.constraints.every((item) => typeof item === 'string')) errors.push('constraints must be strings.');
  if (!Array.isArray(frame.unresolved) || !frame.unresolved.every((item) => typeof item === 'string')) errors.push('unresolved must be strings.');
  if (typeof frame.confidence !== 'number' || frame.confidence < 0 || frame.confidence > 1) errors.push('confidence must be between 0 and 1.');
  if (frame.requestedChange && !isRequestedChange(frame.requestedChange)) errors.push('requestedChange is invalid.');
  if (frame.correction && !isCorrection(frame.correction)) errors.push('correction is invalid.');

  if (errors.length) return { valid: false, errors };
  const normalized = frame as CoachTurnFrameV2;
  const duplicateEventIds = duplicateValues(normalized.events.map((event) => event.semanticId));
  if (duplicateEventIds.length) errors.push(`Duplicate event semanticId: ${duplicateEventIds.join(', ')}.`);
  const duplicateSymptomIds = duplicateValues(normalized.symptoms.map((symptom) => symptom.semanticId));
  if (duplicateSymptomIds.length) errors.push(`Duplicate symptom semanticId: ${duplicateSymptomIds.join(', ')}.`);

  for (const symptom of normalized.symptoms) {
    if (symptom.sourceEventSemanticId && !normalized.events.some((event) => event.semanticId === symptom.sourceEventSemanticId)) {
      errors.push(`Symptom ${symptom.semanticId} references an event that is not present in the frame.`);
    }
  }

  const change = normalized.requestedChange;
  const target = resolveRequestedTarget(normalized);
  if (change?.targetEventSemanticId && !target) errors.push('requestedChange.targetEventSemanticId must reference an event in the frame.');
  if (change?.targetEventId && !target) errors.push('requestedChange.targetEventId must reference an event in the frame.');
  if (target?.temporalRole === 'completed' && change?.action !== 'evaluate') {
    errors.push('A completed event cannot be an editable training target.');
  }
  if (change?.durationMinutes !== undefined && (!Number.isFinite(change.durationMinutes) || change.durationMinutes <= 0 || change.durationMinutes > 1_440)) {
    errors.push('requestedChange.durationMinutes must be between 1 and 1440.');
  }

  return errors.length ? { valid: false, errors } : { valid: true, frame: normalized, errors: [] };
}

export function resolveRequestedTarget(frame: CoachTurnFrameV2): CoachSemanticTrainingEvent | undefined {
  const change = frame.requestedChange;
  if (!change) return undefined;
  if (change.targetEventSemanticId) return frame.events.find((event) => event.semanticId === change.targetEventSemanticId);
  if (change.targetEventId) return frame.events.find((event) => event.eventId === change.targetEventId);
  return undefined;
}

function isIntent(value: unknown): value is CoachSemanticIntent {
  return value === 'report_symptom' || value === 'report_completed_training' || value === 'modify_planned_session'
    || value === 'ask_about_future_training' || value === 'report_schedule_constraint' || value === 'request_extra_training'
    || value === 'correct_previous_statement' || value === 'ask_explanation' || value === 'strategy_change' || value === 'general_update';
}

function isHorizon(value: unknown): value is CoachConversationHorizon {
  return value === 'past' || value === 'today' || value === 'tomorrow' || value === 'this_week'
    || value === 'future_block' || value === 'long_term' || value === 'unknown';
}

function isEvent(value: unknown): value is CoachSemanticTrainingEvent {
  const event = value as Partial<CoachSemanticTrainingEvent> | null | undefined;
  return Boolean(
    event?.semanticId
    && (event.temporalRole === 'completed' || event.temporalRole === 'current' || event.temporalRole === 'planned' || event.temporalRole === 'proposed')
    && (event.date === undefined || isIsoDate(event.date))
    && (event.durationMinutes === undefined || (Number.isFinite(event.durationMinutes) && event.durationMinutes > 0 && event.durationMinutes <= 1_440)),
  );
}

function isSymptom(value: unknown): value is CoachSemanticSymptom {
  const symptom = value as Partial<CoachSemanticSymptom> | null | undefined;
  return Boolean(
    symptom?.semanticId
    && (symptom.severity0to10 === undefined || (Number.isFinite(symptom.severity0to10) && symptom.severity0to10 >= 0 && symptom.severity0to10 <= 10)),
  );
}

function isRequestedChange(value: unknown): value is CoachSemanticRequestedChange {
  const change = value as Partial<CoachSemanticRequestedChange> | null | undefined;
  return Boolean(
    change
    && (change.action === 'move' || change.action === 'shorten' || change.action === 'replace' || change.action === 'skip' || change.action === 'evaluate' || change.action === 'add' || change.action === 'none')
    && (change.date === undefined || isIsoDate(change.date)),
  );
}

function isCorrection(value: unknown): value is CoachSemanticCorrection {
  const correction = value as Partial<CoachSemanticCorrection> | null | undefined;
  return Boolean(
    correction
    && (correction.target === 'symptom_function' || correction.target === 'symptom_trajectory' || correction.target === 'event_status' || correction.target === 'requested_change' || correction.target === 'general'),
  );
}

function isIsoDate(value: string): boolean {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00Z`).getTime());
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
