/**
 * Read-only week evidence: completed work, remaining plans, unknowns.
 * Not a training target, tolerance baseline, pTSS estimate or clinical clearance.
 */
import {
  reconcileGuardrailExposure,
  type ApprovedCompletedBaseline,
  type TrainingExposureRecord,
  type TrainingSport,
} from './experimental-training-guardrails';

export interface TrainingWeekEvidenceInput {
  weekStartDate: string;
  timezone: string;
  plannedAndCompleted: TrainingExposureRecord[];
  coverage: 'unverified' | 'verified';
}
export interface WeekExposureSummary {
  runDistanceKm: number;
  cyclingMinutes: number;
  combinedMinutes: number;
  count: number;
}
export interface TrainingWeekEvidence {
  weekStartDate: string;
  weekEndDate: string;
  timezone: string;
  completed: WeekExposureSummary;
  /** Individual completed records and source IDs retained for a baseline audit. */
  completedRecordIds: string[];
  completedSourceIds: string[];
  /** Per-session details make it impossible to hide redistributed load behind equal totals. */
  completedRecordRows: Array<{
    recordId: string;
    localDate: string;
    sport: TrainingSport;
    durationMinutes: number | null;
    runDistanceKm: number | null;
    durationEstimate: boolean;
    source: string;
    sourceIds: string[];
  }>;
  remainingPlanned: WeekExposureSummary;
  plannedOrCompleted: WeekExposureSummary;
  unresolvedRecords: Array<{ recordId: string; reason: string }>;
  sourceConflicts: string[];
  missingCoverage: boolean;
  planningEvidenceStatus: 'incomplete' | 'requires_review' | 'source_verified';
  baselineApproval: 'not_assessed';
  explanation: string[];
}
const DAY_MS = 86400000;
function ordinal(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected YYYY-MM-DD');
  const n = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid local date.');
  }
  return n / DAY_MS;
}
function dateOf(n: number): string { return new Date(n * DAY_MS).toISOString().slice(0, 10); }
function validZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; }
  catch { return false; }
}
function empty(): WeekExposureSummary {
  return { runDistanceKm: 0, cyclingMinutes: 0, combinedMinutes: 0, count: 0 };
}
function add(summary: WeekExposureSummary, row: TrainingExposureRecord): void {
  summary.count += 1;
  if (typeof row.durationMinutes === 'number' && Number.isFinite(row.durationMinutes)
      && row.durationMinutes >= 0) {
    summary.combinedMinutes += row.durationMinutes;
    if (row.sport === 'bike') summary.cyclingMinutes += row.durationMinutes;
  }
  if (row.sport === 'run' && typeof row.runDistanceKm === 'number'
      && Number.isFinite(row.runDistanceKm) && row.runDistanceKm >= 0) {
    summary.runDistanceKm += row.runDistanceKm;
  }
}
function unresolved(row: TrainingExposureRecord) {
  const issues: Array<{ recordId: string; reason: string }> = [];
  if (row.durationMinutes == null || !Number.isFinite(row.durationMinutes)
      || row.durationMinutes < 0) {
    issues.push({ recordId: row.recordId, reason: 'Duration unknown, not zero.' });
  }
  if (row.sport === 'run' && (row.runDistanceKm == null
      || !Number.isFinite(row.runDistanceKm) || row.runDistanceKm < 0)) {
    issues.push({ recordId: row.recordId, reason: 'Running distance unknown.' });
  }
  if (row.crossesLocalMidnight) {
    issues.push({ recordId: row.recordId, reason: 'Split across local dates before review.' });
  }
  if (row.possibleDuplicate) {
    issues.push({ recordId: row.recordId, reason: 'Possible unmatched activity duplicate.' });
  }
  if (row.durationEstimate) {
    issues.push({ recordId: row.recordId, reason: 'Estimated duration needs confirmation.' });
  }
  return issues;
}
export function buildTrainingWeekEvidence(input: TrainingWeekEvidenceInput): TrainingWeekEvidence {
  if (!validZone(input.timezone)) throw new Error('Invalid athlete time zone.');
  const start = ordinal(input.weekStartDate);
  if (new Date(start * DAY_MS).getUTCDay() !== 1) throw new Error('Week must start Monday.');
  const weekEndDate = dateOf(start + 6);
  const rows = input.plannedAndCompleted.filter(row =>
    row.localDate >= input.weekStartDate && row.localDate <= weekEndDate);
  const reconciled = reconcileGuardrailExposure(rows);
  const completed = empty();
  const remainingPlanned = empty();
  const plannedOrCompleted = empty();
  const unresolvedRecords: TrainingWeekEvidence['unresolvedRecords'] = [];
  for (const row of reconciled.records) {
    add(plannedOrCompleted, row);
    add(row.status === 'completed' ? completed : remainingPlanned, row);
    unresolvedRecords.push(...unresolved(row));
  }
  // A same-sport planned and completed record on the same date may be two
  // separate sessions, or the same workout without explicit linkage. Do not
  // guess, merge, or call the combined total complete.
  const conflicts = [...reconciled.issues];
  for (const planned of reconciled.records.filter(r => r.status === 'planned')) {
    if (reconciled.records.some(actual => actual.status === 'completed'
      && actual.localDate === planned.localDate && actual.sport === planned.sport)) {
      conflicts.push('Review unlinked planned/completed ' + planned.sport
        + ' sessions on ' + planned.localDate);
    }
  }
  const clean = unresolvedRecords.length === 0 && conflicts.length === 0;
  const sourceVerified = input.coverage === 'verified' && clean;
  return {
    weekStartDate: input.weekStartDate, weekEndDate, timezone: input.timezone,
    completed,
    completedRecordIds: reconciled.records.filter(r => r.status === 'completed').map(r => r.recordId),
    completedSourceIds: [...new Set(reconciled.records.filter(r => r.status === 'completed')
      .flatMap(r => r.sourceIds?.length ? r.sourceIds : [r.recordId]))],
    completedRecordRows: reconciled.records.filter(r => r.status === 'completed').map(r => ({
      recordId: r.recordId, localDate: r.localDate, sport: r.sport,
      durationMinutes: r.durationMinutes,
      runDistanceKm: r.runDistanceKm ?? null,
      durationEstimate: Boolean(r.durationEstimate),
      source: r.source,
      sourceIds: [...(r.sourceIds ?? [])].sort(),
    })).sort((a, b) => a.recordId.localeCompare(b.recordId)),
    remainingPlanned, plannedOrCompleted,
    unresolvedRecords, sourceConflicts: conflicts,
    missingCoverage: input.coverage !== 'verified',
    planningEvidenceStatus: !clean ? 'incomplete'
      : sourceVerified ? 'source_verified' : 'requires_review',
    baselineApproval: 'not_assessed',
    explanation: [
      'A completed workout replaces its explicitly linked planned session.',
      'Run distance and sport-specific/combined minutes are separate measurements.',
      'Missing fields and source coverage remain unknown, never zero.',
      'Baseline eligibility and approval are separate, even when sources are complete.',
    ],
  };
}
/** The athlete-local calendar date, never inferred from the server timezone. */
export function localTrainingDate(timestamp: string, timezone: string): string {
  if (!validZone(timezone)) throw new Error('Invalid athlete time zone.');
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid activity timestamp.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
/** Activity spanning a local midnight cannot be assigned to one day for spacing checks. */
export function crossesLocalTrainingMidnight(
  startTimestamp: string, endTimestamp: string, timezone: string,
): boolean {
  const start = Date.parse(startTimestamp);
  const end = Date.parse(endTimestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Invalid training activity start or end timestamps.');
  }
  return localTrainingDate(startTimestamp, timezone)
    !== localTrainingDate(endTimestamp, timezone);
}

export function normalizeTrainingSport(discipline: string | undefined): TrainingSport {
  if (discipline === 'run' || discipline === 'bike' ||
      discipline === 'swim' || discipline === 'strength') return discipline;
  return 'other';
}

/**
 * Create a NON-APPROVED review candidate only. No input combination may
 * silently turn recorded exposure into an athlete-tolerance baseline.
 * A separate human-confirmed eligibility and source-coverage workflow is needed.
 */
export function proposeCompletedWeekBaseline(
  evidence: TrainingWeekEvidence,
): ApprovedCompletedBaseline {
  const completedIds = new Set(evidence.completedRecordIds);
  const incompleteCompleted = evidence.unresolvedRecords
    .some(issue => completedIds.has(issue.recordId));
  const complete = !evidence.missingCoverage && !incompleteCompleted
    && evidence.sourceConflicts.length === 0;
  return {
    id: 'baseline-candidate-' + evidence.weekStartDate,
    startDate: evidence.weekStartDate,
    endDate: evidence.weekEndDate,
    timezone: evidence.timezone,
    // If coverage is unknown, a zero observable subtotal is not a genuine
    // zero-completed-exposure baseline. Preserve unknown as null.
    runDistanceKm: complete ? evidence.completed.runDistanceKm : null,
    cyclingMinutes: complete ? evidence.completed.cyclingMinutes : null,
    combinedMinutes: complete ? evidence.completed.combinedMinutes : null,
    sourceActivityIds: [...evidence.completedSourceIds],
    evidenceStatus: evidence.sourceConflicts.length ? 'conflicted'
      : complete ? 'complete' : 'incomplete',
    eligibility: 'needs_review',
    symptomContextReviewed: false,
  };
}
