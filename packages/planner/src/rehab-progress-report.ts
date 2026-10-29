/**
 * Side Quest rehabilitation report data model.
 *
 * Produces deterministic, provenance-preserving report data.
 * This is not a diagnosis, causal inference, medical clearance, or PDF renderer.
 * Records remain in the caller's storage; this module performs no I/O.
 */
export const REHAB_REPORT_SCHEMA_VERSION = 'rehab-report.v1.0.0' as const;

export type RehabObservationSource = 'athlete' | 'clinician' | 'device' | 'imported' | 'derived';
export type RehabMetricUnit =
  | '0-10' | 'minutes' | 'seconds' | 'repetitions' | 'lb' | 'kg'
  | 'percent' | 'distance_m' | 'other';

export interface RehabMetricObservation {
  id: string;
  caseId: string;
  observedAt: string;
  /** Stable specific measure, e.g. "walking_pain", "morning_stiffness". */
  metricKey: string;
  unit: RehabMetricUnit;
  value: number;
  /** Different tasks/protocols are not silently pooled. */
  contextKey?: string;
  source: RehabObservationSource;
  sourceRecordId?: string;
  note?: string;
}

export type RehabTimelineEventKind =
  | 'injury_onset' | 'trauma' | 'flare' | 'clinical_visit'
  | 'restriction_changed' | 'diagnosis_updated' | 'protocol_changed'
  | 'training_modified' | 'milestone' | 'other';

export interface RehabTimelineEvent {
  id: string;
  caseIds: string[];
  occurredAt: string;
  kind: RehabTimelineEventKind;
  description: string;
  source: RehabObservationSource;
  sourceRecordId?: string;
}

/** A thin link to existing Side Quest workout ledger/endurance records. */
export interface RehabTrainingReference {
  id: string;
  occurredAt: string;
  sourceRecordId: string;
  kind: 'strength' | 'endurance' | 'rehab' | 'other';
  durationMinutes?: number;
  /** Explicit association only; never inferred from temporal proximity. */
  relatedCaseIds: string[];
  source: RehabObservationSource;
}

export interface RehabReportRange {
  startAt: string;
  endAt: string;
}

export interface RehabReportInput {
  caseId: string;
  range: RehabReportRange;
  observations: RehabMetricObservation[];
  events: RehabTimelineEvent[];
  training: RehabTrainingReference[];
  /** Explicit opt-in to include unrelated training history. */
  includeUnlinkedTraining?: boolean;
}

export interface RehabMetricSeries {
  metricKey: string;
  contextKey?: string;
  unit: RehabMetricUnit;
  pointCount: number;
  points: RehabMetricObservation[];
  firstValue: number | null;
  lastValue: number | null;
  /** An observed arithmetic difference, not automatically an improvement. */
  observedDelta: number | null;
}

export interface RehabReportData {
  schemaVersion: typeof REHAB_REPORT_SCHEMA_VERSION;
  caseId: string;
  range: RehabReportRange;
  series: RehabMetricSeries[];
  events: RehabTimelineEvent[];
  training: RehabTrainingReference[];
  observationCount: number;
  eventCount: number;
  trainingRecordCount: number;
  warnings: string[];
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}
function inWindow(date: string, start: number, end: number): boolean {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) && parsed >= start && parsed <= end;
}
function assertUniqueIds(items: Array<{ id: string }>, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id) throw new Error(label + ' contains a blank ID.');
    if (seen.has(item.id)) throw new Error(label + ' contains a duplicate ID: ' + item.id);
    seen.add(item.id);
  }
}
function chronological<T extends { id: string }>(
  items: T[], getTime: (item: T) => string,
): T[] {
  return [...items].sort((a, b) =>
    Date.parse(getTime(a)) - Date.parse(getTime(b)) || a.id.localeCompare(b.id)
  );
}

/**
 * Safely extracts a condition-scoped report from historical observations.
 * Missing days are missing, not zero-pain days or missed workouts.
 * No causal attribution to a workout or protocol is performed.
 */
export function buildRehabReportData(input: RehabReportInput): RehabReportData {
  if (!input.caseId) throw new Error('caseId must be provided.');
  if (!validDate(input.range.startAt) || !validDate(input.range.endAt)) {
    throw new Error('A valid startAt and endAt are required.');
  }
  const start = Date.parse(input.range.startAt);
  const end = Date.parse(input.range.endAt);
  if (start > end) throw new Error('Report startAt cannot exceed endAt.');
  assertUniqueIds(input.observations, 'observations');
  assertUniqueIds(input.events, 'events');
  assertUniqueIds(input.training, 'training');

  for (const o of input.observations) {
    if (!o.caseId || !o.metricKey || !validDate(o.observedAt)
        || !Number.isFinite(o.value)) {
      throw new Error('Observation must have caseId, metricKey, valid time, and finite value.');
    }
    if (o.unit === '0-10' && (o.value < 0 || o.value > 10)) {
      throw new Error('0-10 observations must remain within their defined scale.');
    }
  }
  const observations = chronological(
    input.observations.filter(o => o.caseId === input.caseId
      && inWindow(o.observedAt, start, end)),
    o => o.observedAt,
  );
  const groupMap = new Map<string, RehabMetricObservation[]>();
  for (const o of observations) {
    const key = JSON.stringify([o.metricKey, o.unit, o.contextKey ?? null]);
    const group = groupMap.get(key) ?? [];
    group.push(o);
    groupMap.set(key, group);
  }
  const series: RehabMetricSeries[] = [...groupMap.values()].map(points => {
    const first = points[0]!;
    return {
      metricKey: first.metricKey,
      contextKey: first.contextKey,
      unit: first.unit,
      pointCount: points.length,
      points,
      firstValue: first.value,
      lastValue: points[points.length - 1]!.value,
      observedDelta: points.length > 1
        ? points[points.length - 1]!.value - first.value
        : null,
    };
  }).sort((a, b) =>
    a.metricKey.localeCompare(b.metricKey)
    || (a.contextKey ?? '').localeCompare(b.contextKey ?? '')
    || a.unit.localeCompare(b.unit),
  );
  const events = chronological(
    input.events.filter(event => event.caseIds.includes(input.caseId)
      && inWindow(event.occurredAt, start, end)),
    e => e.occurredAt,
  );
  const training = chronological(
    input.training.filter(record => inWindow(record.occurredAt, start, end)
      && (input.includeUnlinkedTraining === true
        || record.relatedCaseIds.includes(input.caseId))),
    t => t.occurredAt,
  );
  const warnings = [
    'Descriptive report only: associations and treatment effects are not established.',
    'Missing check-ins are not assumed to represent zero pain or inactivity.',
    'Different metric definitions, units, or task contexts are not pooled.',
    'This report is not a medical assessment or a return-to-sport clearance.',
  ];
  if (!observations.length) warnings.push('No observations found for this injury and date range.');
  if (!training.length) warnings.push('No included training records found in this date range.');
  return {
    schemaVersion: REHAB_REPORT_SCHEMA_VERSION,
    caseId: input.caseId,
    range: {...input.range},
    series, events, training,
    observationCount: observations.length,
    eventCount: events.length,
    trainingRecordCount: training.length,
    warnings,
  };
}
