/**
 * Experimental, athlete-selected planning ceilings. NOT a validated pTSS model,
 * medical clearance, training target, or return-to-sport prescription.
 * The evaluator never rewrites a workout or automatically approves a baseline.
 */
export const EXPERIMENTAL_TRAINING_POLICY_V1 = Object.freeze({
  version: 'athlete-experimental-ramp-v1',
  runFraction: 0.10,
  cyclingFraction: 0.10,
  cyclingMaxExtraMinutes: 60,
  combinedFraction: 0.10,
  combinedMaxExtraMinutes: 60,
  adjacentLongDayMinutes: 120,
});

export type PlanningInterruptionState =
  | 'uninitialized' | 'ordinary_progression' | 'planned_recovery_or_vacation'
  | 'illness_interruption' | 'injury_or_worsening_interruption'
  | 'high_contextual_stress_interruption' | 'rehabilitation_or_return';

export type GuardrailStatus =
  | 'within_policy' | 'exceeds_policy' | 'review_required'
  | 'insufficient_data' | 'baseline_required' | 'return_plan_required';

export type TrainingSport = 'run' | 'bike' | 'swim' | 'strength' | 'rehabilitation' | 'other';

export interface ApprovedCompletedBaseline {
  id: string;
  startDate: string; // local YYYY-MM-DD, seven consecutive completed dates
  endDate: string;
  timezone: string;
  runDistanceKm: number | null;
  cyclingMinutes: number | null;
  combinedMinutes: number | null;
  sourceActivityIds: string[];
  evidenceStatus: 'complete' | 'incomplete' | 'conflicted';
  eligibility: 'approved_for_policy' | 'needs_review' | 'ineligible';
  approvedAt?: string;
  approvalNote?: string;
  symptomContextReviewed: boolean;
}

export interface FrozenTrainingAllowance {
  planningWeekStart: string; // local Monday
  baselineId: string;
  baselineStartDate: string;
  baselineEndDate: string;
  timezone: string;
  policyVersion: string;
  runDistanceCapKm: number | null;
  cyclingMinutesCap: number | null;
  combinedMinutesCap: number | null;
  frozenAt: string;
}

export interface TrainingExposureRecord {
  recordId: string;
  canonicalActivityId: string; // TP / Garmin views of the SAME activity share this
  linkedPlanRecordId?: string; // completed training replaces this planned record
  localDate: string; // date in the athlete's configured planning timezone
  sport: TrainingSport;
  status: 'planned' | 'completed';
  durationMinutes: number | null;
  runDistanceKm?: number | null;
  source: string;
  sourceIds?: string[];
  crossesLocalMidnight?: boolean; // must split first; day-spacing would be unreliable
  intensityIncrease?: boolean;
  hillIncrease?: boolean;
  newModality?: boolean;
  symptomDrivenSubstitution?: boolean;
  possibleDuplicate?: boolean;
}

export interface ExposureTotals {
  runDistanceKm: number;
  cyclingMinutes: number;
  combinedMinutes: number;
}
export interface GuardrailCheck {
  dimension: keyof ExposureTotals;
  proposed: number;
  ceiling: number | null;
  status: 'pass' | 'exceeds' | 'baseline_required' | 'insufficient_data';
}
export interface EvaluatedExposureWindow {
  startDate: string;
  endDate: string;
  kind: 'planning_week' | 'rolling_seven_days';
  baselineWeekStart: string;
  provisional: boolean;
  checks: GuardrailCheck[];
  totals: ExposureTotals;
  missingInputs: string[];
}
export interface AdjacentLongDayReview {
  firstDate: string;
  secondDate: string;
  firstMinutes: number;
  secondMinutes: number;
}
export interface TrainingGuardrailEvaluation {
  status: GuardrailStatus;
  policyVersion: string;
  planningWeekStart: string;
  windows: EvaluatedExposureWindow[];
  longDayReviews: AdjacentLongDayReview[];
  reviewItems: string[];
  missingInputs: string[];
  explanations: string[];
}

export type AllowanceFreezeResult =
  | { status: 'ready'; allowance: FrozenTrainingAllowance }
  | { status: 'baseline_required' | 'return_plan_required'; reasons: string[] };

const DAY_MS = 86400000;

function dayNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected YYYY-MM-DD local date.');
  const [year, month, day] = date.split('-').map(Number);
  const time = Date.UTC(year!, month! - 1, day!);
  if (new Date(time).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid local calendar date: ' + date);
  }
  return Math.floor(time / DAY_MS);
}
function dateFromDay(value: number): string {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}
function monday(date: string): string {
  const day = dayNumber(date);
  const weekday = new Date(day * DAY_MS).getUTCDay();
  return dateFromDay(day - ((weekday + 6) % 7));
}
function finiteNonNegative(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function validateTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
  } catch {
    throw new Error('Unsupported planning timezone: ' + value);
  }
}
function validateBaseline(baseline: ApprovedCompletedBaseline): void {
  validateTimezone(baseline.timezone);
  if (dayNumber(baseline.endDate) - dayNumber(baseline.startDate) !== 6) {
    throw new Error('Approved baseline must be exactly seven consecutive local dates.');
  }
  for (const [name, value] of [
    ['run distance', baseline.runDistanceKm],
    ['cycling minutes', baseline.cyclingMinutes],
    ['combined minutes', baseline.combinedMinutes],
  ] as const) {
    if (value != null && !finiteNonNegative(value)) {
      throw new Error('Invalid baseline ' + name);
    }
  }
  if (!Array.isArray(baseline.sourceActivityIds)) throw new Error('Missing baseline provenance.');
}
function requiresReturnPlan(state: PlanningInterruptionState): boolean {
  return state === 'injury_or_worsening_interruption'
    || state === 'rehabilitation_or_return'
    || state === 'illness_interruption';
}

/**
 * Baseline approval must be external and explicit. No auto-selecting prior high
 * weeks, peaks, interrupted weeks, or current zero exposure.
 */
export function freezeExperimentalTrainingAllowance(input: {
  baseline: ApprovedCompletedBaseline | null;
  planningWeekStart: string;
  planningState: PlanningInterruptionState;
  frozenAt: string;
}): AllowanceFreezeResult {
  if (monday(input.planningWeekStart) !== input.planningWeekStart) {
    throw new Error('Planning week must start on Monday in athlete local time.');
  }
  if (requiresReturnPlan(input.planningState)) {
    return { status: 'return_plan_required', reasons: [
      'Ordinary progression is suspended. A separately reviewed return/rebuild plan is required.',
    ] };
  }
  if (input.planningState !== 'ordinary_progression') {
    return { status: 'baseline_required', reasons: [
      'An ordinary progression baseline is not enabled in the current planning state.',
    ] };
  }
  const b = input.baseline;
  if (!b) return { status: 'baseline_required', reasons: ['No explicitly approved completed seven-day baseline.'] };
  validateBaseline(b);
  if (b.eligibility !== 'approved_for_policy' || b.evidenceStatus !== 'complete'
      || !b.approvedAt || !b.symptomContextReviewed) {
    return { status: 'baseline_required', reasons: [
      'The completed week lacks explicit eligibility approval, sufficient evidence or symptom-context review.',
    ] };
  }
  if ([b.runDistanceKm, b.cyclingMinutes, b.combinedMinutes].some(v => v === null)) {
    return { status: 'baseline_required', reasons: [
      'Running, cycling and combined baseline measurements must be explicitly known, including zeros.',
    ] };
  }
  if (dayNumber(b.endDate) >= dayNumber(input.planningWeekStart)) {
    return { status: 'baseline_required', reasons: ['Baseline must precede the planning week.'] };
  }
  const r = b.runDistanceKm!;
  const c = b.cyclingMinutes!;
  const t = b.combinedMinutes!;
  return {
    status: 'ready',
    allowance: {
      planningWeekStart: input.planningWeekStart,
      baselineId: b.id,
      baselineStartDate: b.startDate,
      baselineEndDate: b.endDate,
      timezone: b.timezone,
      policyVersion: EXPERIMENTAL_TRAINING_POLICY_V1.version,
      runDistanceCapKm: r > 0 ? r * (1 + EXPERIMENTAL_TRAINING_POLICY_V1.runFraction) : null,
      cyclingMinutesCap: c > 0
        ? c + Math.min(EXPERIMENTAL_TRAINING_POLICY_V1.cyclingFraction * c, 60) : null,
      combinedMinutesCap: t > 0
        ? t + Math.min(EXPERIMENTAL_TRAINING_POLICY_V1.combinedFraction * t, 60) : null,
      frozenAt: input.frozenAt,
    },
  };
}

interface ResolvedRecords {
  records: TrainingExposureRecord[];
  issues: string[];
}
function sameExposure(left: TrainingExposureRecord, right: TrainingExposureRecord): boolean {
  return left.localDate === right.localDate
    && left.sport === right.sport
    && left.durationMinutes === right.durationMinutes
    && (left.runDistanceKm ?? null) === (right.runDistanceKm ?? null);
}

/**
 * Only explicit canonical IDs and links prove equivalence. Never guess a
 * TP/Garmin match from similar date, title or workout duration.
 */
export function reconcileGuardrailExposure(records: TrainingExposureRecord[]): ResolvedRecords {
  const issues: string[] = [];
  const groups = new Map<string, TrainingExposureRecord[]>();
  const ids = new Set<string>();
  for (const record of records) {
    if (!record.recordId || !record.canonicalActivityId || !record.source) {
      issues.push('Incomplete record identity/provenance.');
      continue;
    }
    if (ids.has(record.recordId)) {
      issues.push('Repeated source record ID: ' + record.recordId);
      continue;
    }
    ids.add(record.recordId);
    try { dayNumber(record.localDate); } catch { issues.push('Invalid date in ' + record.recordId); }
    if (record.durationMinutes != null && !finiteNonNegative(record.durationMinutes)) {
      issues.push('Invalid duration in ' + record.recordId);
    }
    if (record.runDistanceKm != null && !finiteNonNegative(record.runDistanceKm)) {
      issues.push('Invalid run distance in ' + record.recordId);
    }
    if (record.crossesLocalMidnight) issues.push('Split cross-midnight activity: ' + record.recordId);
    if (record.possibleDuplicate) issues.push('Possible unresolved duplicated activity: ' + record.recordId);
    const items = groups.get(record.canonicalActivityId) ?? [];
    items.push(record);
    groups.set(record.canonicalActivityId, items);
  }
  const selected: TrainingExposureRecord[] = [];
  for (const [canonicalId, group] of groups) {
    const completions = group.filter(item => item.status === 'completed');
    const candidates = completions.length ? completions : group;
    const reference = candidates[0]!;
    if (candidates.some(item => !sameExposure(reference, item))) {
      issues.push('Conflicting source measurements for canonical activity: ' + canonicalId);
    }
    selected.push(reference);
  }
  // A completed session can explicitly supersede a plan with a different canonical ID.
  const completedPlanLinks = new Set(
    selected.filter(r => r.status === 'completed' && r.linkedPlanRecordId)
      .map(r => r.linkedPlanRecordId!),
  );
  return {
    records: selected.filter(r => !(r.status === 'planned' && completedPlanLinks.has(r.recordId))),
    issues: [...new Set(issues)],
  };
}

function summarize(records: TrainingExposureRecord[], from: string, to: string): {
  totals: ExposureTotals;
  missingInputs: string[];
} {
  const totals: ExposureTotals = { runDistanceKm: 0, cyclingMinutes: 0, combinedMinutes: 0 };
  const missingInputs: string[] = [];
  for (const record of records) {
    if (record.localDate < from || record.localDate > to) continue;
    if (record.durationMinutes == null || !finiteNonNegative(record.durationMinutes)) {
      missingInputs.push('Duration unavailable: ' + record.recordId);
    } else {
      totals.combinedMinutes += record.durationMinutes;
      if (record.sport === 'bike') totals.cyclingMinutes += record.durationMinutes;
    }
    if (record.sport === 'run') {
      if (record.runDistanceKm == null || !finiteNonNegative(record.runDistanceKm)) {
        missingInputs.push('Running distance unavailable: ' + record.recordId);
      } else {
        totals.runDistanceKm += record.runDistanceKm;
      }
    }
  }
  return { totals, missingInputs };
}

function evaluateWindow(
  startDate: string,
  endDate: string,
  kind: EvaluatedExposureWindow['kind'],
  resolved: ResolvedRecords,
  allowance: FrozenTrainingAllowance | undefined,
  incompleteDates: Set<string>,
): EvaluatedExposureWindow {
  const { totals, missingInputs } = summarize(resolved.records, startDate, endDate);
  const gaps = [...missingInputs, ...resolved.issues];
  for (let n = dayNumber(startDate); n <= dayNumber(endDate); n += 1) {
    const day = dateFromDay(n);
    if (incompleteDates.has(day)) gaps.push('Coverage unconfirmed: ' + day);
  }
  if (!allowance) gaps.push('Frozen allowance unavailable for week ending ' + endDate);
  const dimensions: Array<keyof ExposureTotals> = [
    'runDistanceKm', 'cyclingMinutes', 'combinedMinutes',
  ];
  const checks: GuardrailCheck[] = dimensions.map(dimension => {
    const ceiling = allowance
      ? dimension === 'runDistanceKm' ? allowance.runDistanceCapKm
        : dimension === 'cyclingMinutes' ? allowance.cyclingMinutesCap
          : allowance.combinedMinutesCap
      : null;
    const proposed = totals[dimension];
    const invalid = gaps.some(msg => msg.startsWith('Coverage unconfirmed')
      || msg.startsWith('Conflicting') || msg.startsWith('Invalid')
      || msg.startsWith('Possible') || msg.startsWith('Split')
      || msg.startsWith('Incomplete')
      || msg.startsWith('Repeated')
      || (dimension === 'runDistanceKm' && msg.startsWith('Running distance'))
      || (dimension === 'cyclingMinutes' && msg.startsWith('Duration unavailable'))
      || (dimension === 'combinedMinutes' && msg.startsWith('Duration unavailable')));
    let status: GuardrailCheck['status'];
    if (ceiling !== null && proposed > ceiling + 1e-9) status = 'exceeds';
    else if (!allowance || invalid) status = 'insufficient_data';
    else if (ceiling === null && proposed > 0) status = 'baseline_required';
    else status = 'pass';
    return { dimension, proposed, ceiling, status };
  });
  return {
    startDate, endDate, kind, baselineWeekStart: monday(endDate),
    provisional: !allowance,
    checks, totals, missingInputs: [...new Set(gaps)],
  };
}

export function evaluateExperimentalTrainingGuardrails(input: {
  planningWeekStart: string;
  timezone: string;
  planningState: PlanningInterruptionState;
  frozenAllowances: FrozenTrainingAllowance[];
  activities: TrainingExposureRecord[];
  /** Every calendar date checked must be explicitly covered by reconciled history
   * or an intentionally complete future plan. Missing dates cannot yield a green pass.
   */
  coveredLocalDates: string[];
  clinicalConstraintActive?: boolean;
}): TrainingGuardrailEvaluation {
  validateTimezone(input.timezone);
  if (monday(input.planningWeekStart) !== input.planningWeekStart) {
    throw new Error('Planning week must start on local Monday.');
  }
  const from = dayNumber(input.planningWeekStart);
  const allowanceByWeek = new Map<string, FrozenTrainingAllowance>();
  const missing: string[] = [];
  for (const item of input.frozenAllowances) {
    if (item.timezone !== input.timezone
        || item.policyVersion !== EXPERIMENTAL_TRAINING_POLICY_V1.version
        || item.planningWeekStart !== monday(item.planningWeekStart)) {
      missing.push('Invalid or incompatible frozen allowance: ' + item.planningWeekStart);
    } else {
      if (allowanceByWeek.has(item.planningWeekStart)) {
        missing.push('Multiple frozen allowances for ' + item.planningWeekStart);
      }
      allowanceByWeek.set(item.planningWeekStart, item);
    }
  }
  const covered = new Set(input.coveredLocalDates);
  const incompleteDates = new Set<string>();
  for (let d = from - 6; d <= from + 12; d += 1) {
    const date = dateFromDay(d);
    if (!covered.has(date)) incompleteDates.add(date);
  }
  const reconciled = reconcileGuardrailExposure(input.activities);
  const windows: EvaluatedExposureWindow[] = [];
  const currentAllowance = allowanceByWeek.get(input.planningWeekStart);
  windows.push(evaluateWindow(input.planningWeekStart, dateFromDay(from + 6),
    'planning_week', reconciled, currentAllowance, incompleteDates));
  // The requested Monday-Sunday plan affects rolling windows ending this week,
  // and windows ending through the following Sunday, including the week boundary.
  for (let offset = 0; offset <= 12; offset += 1) {
    const endDate = dateFromDay(from + offset);
    windows.push(evaluateWindow(dateFromDay(from + offset - 6), endDate,
      'rolling_seven_days', reconciled, allowanceByWeek.get(monday(endDate)), incompleteDates));
  }
  const longDayReviews: AdjacentLongDayReview[] = [];
  for (let offset = -6; offset < 12; offset += 1) {
    const firstDate = dateFromDay(from + offset);
    const secondDate = dateFromDay(from + offset + 1);
    const left = summarize(reconciled.records, firstDate, firstDate);
    const right = summarize(reconciled.records, secondDate, secondDate);
    if (!incompleteDates.has(firstDate) && !incompleteDates.has(secondDate)
      && left.missingInputs.length === 0 && right.missingInputs.length === 0
      && left.totals.combinedMinutes >= EXPERIMENTAL_TRAINING_POLICY_V1.adjacentLongDayMinutes
      && right.totals.combinedMinutes >= EXPERIMENTAL_TRAINING_POLICY_V1.adjacentLongDayMinutes) {
      longDayReviews.push({
        firstDate, secondDate, firstMinutes: left.totals.combinedMinutes,
        secondMinutes: right.totals.combinedMinutes,
      });
    }
  }
  const reviewItems = [
    ...new Set([
      ...input.activities.filter(a => a.intensityIncrease).map(a => 'Intensity change: ' + a.recordId),
      ...input.activities.filter(a => a.hillIncrease).map(a => 'Hill exposure change: ' + a.recordId),
      ...input.activities.filter(a => a.newModality).map(a => 'New training modality: ' + a.recordId),
      ...input.activities.filter(a => a.symptomDrivenSubstitution)
        .map(a => 'Symptom-driven substitution: ' + a.recordId),
      ...longDayReviews.map(a => 'Adjacent days >=120 minutes: ' + a.firstDate + ' / ' + a.secondDate),
    ]),
  ];
  missing.push(...reconciled.issues);
  for (const window of windows) missing.push(...window.missingInputs);
  const uniqueMissing = [...new Set(missing)];
  const allChecks = windows.flatMap(w => w.checks);
  let status: GuardrailStatus;
  if (requiresReturnPlan(input.planningState)) status = 'return_plan_required';
  else if (input.planningState === 'uninitialized') status = 'baseline_required';
  else if (input.clinicalConstraintActive || input.planningState !== 'ordinary_progression') {
    status = 'review_required';
  } else if (allChecks.some(c => c.status === 'exceeds')) status = 'exceeds_policy';
  else if (allChecks.some(c => c.status === 'baseline_required')) status = 'baseline_required';
  else if (uniqueMissing.length > 0 || allChecks.some(c => c.status === 'insufficient_data')) {
    status = 'insufficient_data';
  } else if (reviewItems.length > 0) status = 'review_required';
  else status = 'within_policy';
  return {
    status, policyVersion: EXPERIMENTAL_TRAINING_POLICY_V1.version,
    planningWeekStart: input.planningWeekStart, windows,
    longDayReviews: longDayReviews.filter((item, index, all) =>
      all.findIndex(other => other.firstDate === item.firstDate) === index),
    reviewItems, missingInputs: uniqueMissing,
    explanations: [
      'Experimental upper planning ceilings, not training targets or established safe thresholds.',
      'Every proposed session counts once across its sport-specific and shared duration budgets.',
      'Progression never follows automatically from unused allowance or previous peak training.',
      ...(status === 'return_plan_required'
        ? ['Ordinary progression is suspended. A separately reviewed return plan is required.']
        : []),
      ...(status === 'insufficient_data'
        ? ['Data or future frozen ceilings are incomplete. Compliance cannot be confirmed.']
        : []),
      ...(input.clinicalConstraintActive
        ? ['Clinical constraints take precedence over experimental progression allowances.']
        : []),
    ],
  };
}
