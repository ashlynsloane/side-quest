import { describe, expect, it } from 'vitest';
import {
  EXPERIMENTAL_TRAINING_POLICY_V1 as POLICY,
  evaluateExperimentalTrainingGuardrails,
  freezeExperimentalTrainingAllowance,
  reconcileGuardrailExposure,
  type ApprovedCompletedBaseline,
  type FrozenTrainingAllowance,
  type TrainingExposureRecord,
} from '../src/experimental-training-guardrails';

const MILE = 1.609344;
const approved: ApprovedCompletedBaseline = {
  id: 'approved-2026-07-27',
  startDate: '2026-07-27',
  endDate: '2026-08-02',
  timezone: 'America/Denver',
  runDistanceKm: 20 * MILE,
  cyclingMinutes: 480,
  combinedMinutes: 720,
  sourceActivityIds: ['run-original', 'bike-original', 'strength-original'],
  evidenceStatus: 'complete',
  eligibility: 'approved_for_policy',
  approvedAt: '2026-08-02T22:00:00Z',
  symptomContextReviewed: true,
  approvalNote: 'Explicitly reviewed completed seven-day period.',
};

function frozen(weekStart: string, baseline = approved): FrozenTrainingAllowance {
  const result = freezeExperimentalTrainingAllowance({
    baseline, planningWeekStart: weekStart,
    planningState: 'ordinary_progression',
    frozenAt: '2026-08-03T08:00:00Z',
  });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Unexpected baseline state');
  return result.allowance;
}
function dates(): string[] {
  const begin = Date.parse('2026-07-28T00:00:00Z');
  return Array.from({ length: 19 }, (_, i) =>
    new Date(begin + i * 86400000).toISOString().slice(0, 10));
}
function activity(
  recordId: string,
  localDate: string,
  sport: TrainingExposureRecord['sport'],
  durationMinutes: number | null,
  runDistanceKm?: number | null,
  extra: Partial<TrainingExposureRecord> = {},
): TrainingExposureRecord {
  return {
    recordId, canonicalActivityId: recordId, localDate, sport,
    durationMinutes, status: 'planned', source: 'Side Quest',
    ...(runDistanceKm === undefined ? {} : { runDistanceKm }),
    ...extra,
  };
}
const nextWeek = frozen('2026-08-10', {
  ...approved, id: 'approved-2026-08-03',
  startDate: '2026-08-03', endDate: '2026-08-09',
  approvedAt: '2026-08-09T23:00:00Z',
});
const thisWeek = frozen('2026-08-03');
function evaluate(
  activities: TrainingExposureRecord[],
  overrides: Partial<Parameters<typeof evaluateExperimentalTrainingGuardrails>[0]> = {},
) {
  return evaluateExperimentalTrainingGuardrails({
    planningWeekStart: '2026-08-03', timezone: 'America/Denver',
    planningState: 'ordinary_progression',
    frozenAllowances: [thisWeek, nextWeek],
    coveredLocalDates: dates(), activities,
    ...overrides,
  });
}

describe('experimental athlete-selected planning policy', () => {
  it('retains exact agreed defaults, not trained or inferred coefficients', () => {
    expect(POLICY.runFraction).toBe(.10);
    expect(POLICY.cyclingFraction).toBe(.10);
    expect(POLICY.cyclingMaxExtraMinutes).toBe(60);
    expect(POLICY.combinedFraction).toBe(.10);
    expect(POLICY.combinedMaxExtraMinutes).toBe(60);
    expect(POLICY.adjacentLongDayMinutes).toBe(120);
  });

  it('freezes 20 mi / 8 h cycling / 12 h combined to 22 mi / 8 h 48 / 13 h', () => {
    expect(thisWeek.runDistanceCapKm! / MILE).toBeCloseTo(22, 10);
    expect(thisWeek.cyclingMinutesCap).toBe(528);
    expect(thisWeek.combinedMinutesCap).toBe(780);
    expect(thisWeek.baselineId).toBe(approved.id);
  });

  it('absolute 60 minute cycling limit binds at 12 cycling hours', () => {
    const result = frozen('2026-08-03', {
      ...approved, cyclingMinutes: 720,
    });
    expect(result.cyclingMinutesCap).toBe(780);
  });

  it('prevents a legal run and bike increase from exceeding shared minutes', () => {
    const r = evaluate([
      activity('other', '2026-08-04', 'other', 720),
      activity('run', '2026-08-05', 'run', 20, 2 * MILE),
      activity('bike', '2026-08-06', 'bike', 48),
    ]);
    const calendar = r.windows.find(w => w.kind === 'planning_week')!;
    expect(calendar.checks.find(c => c.dimension === 'runDistanceKm')?.status).toBe('pass');
    expect(calendar.checks.find(c => c.dimension === 'cyclingMinutes')?.status).toBe('pass');
    expect(calendar.checks.find(c => c.dimension === 'combinedMinutes')?.status).toBe('exceeds');
    expect(calendar.totals.combinedMinutes).toBe(788);
    expect(r.status).toBe('exceeds_policy');
  });

  it('reconciles duplicate providers and completed workouts replacing plans', () => {
    const a = [
      activity('planned', '2026-08-04', 'bike', 150, undefined,
        { canonicalActivityId: 'one-session' }),
      activity('garmin-copy', '2026-08-04', 'bike', 160, undefined,
        { canonicalActivityId: 'one-session', status: 'completed', source: 'Garmin',
          linkedPlanRecordId: 'planned' }),
      activity('tp-copy', '2026-08-04', 'bike', 160, undefined,
        { canonicalActivityId: 'one-session', status: 'completed', source: 'TrainingPeaks',
          linkedPlanRecordId: 'planned' }),
    ];
    const reconciled = reconcileGuardrailExposure(a);
    expect(reconciled.issues).toEqual([]);
    expect(reconciled.records).toHaveLength(1);
    expect(reconciled.records[0]?.status).toBe('completed');
    expect(evaluate(a).windows[0]?.totals.combinedMinutes).toBe(160);
  });

  it('completed workouts replace a linked plan even when canonical IDs differ', () => {
    const result = reconcileGuardrailExposure([
      activity('plan', '2026-08-04', 'run', 35, 5),
      activity('actual', '2026-08-04', 'run', 38, 5.2,
        { status: 'completed', linkedPlanRecordId: 'plan', source: 'Garmin' }),
    ]);
    expect(result.records.map(a => a.recordId)).toEqual(['actual']);
  });

  it('marks conflicting provider measurements insufficient, never silently chooses', () => {
    const result = evaluate([
      activity('garmin', '2026-08-04', 'bike', 80, undefined,
        { status: 'completed', source: 'Garmin', canonicalActivityId: 'workout-X' }),
      activity('tp', '2026-08-04', 'bike', 60, undefined,
        { status: 'completed', source: 'TrainingPeaks', canonicalActivityId: 'workout-X' }),
    ]);
    expect(result.status).toBe('insufficient_data');
    expect(result.missingInputs.join(' ')).toContain('Conflicting source');
  });

  it('unknown planned duration is incomplete, not counted as zero or green', () => {
    const result = evaluate([activity('no-duration', '2026-08-05', 'strength', null)]);
    expect(result.status).toBe('insufficient_data');
  });

  it('unknown running distance cannot confirm running compliance', () => {
    const result = evaluate([activity('no-run-distance', '2026-08-05', 'run', 30)]);
    expect(result.status).toBe('insufficient_data');
  });

  it('missing coverage cannot yield a passing status', () => {
    const result = evaluate([], { coveredLocalDates: dates().slice(2) });
    expect(result.status).toBe('insufficient_data');
    expect(result.missingInputs.join(' ')).toContain('Coverage unconfirmed');
  });

  it('a week crossing Sunday/Monday cannot evade rolling 7-day enforcement', () => {
    const result = evaluate([
      activity('sun', '2026-08-09', 'other', 700),
      activity('mon', '2026-08-10', 'bike', 200),
    ]);
    expect(result.windows[0]!.checks.find(c => c.dimension === 'combinedMinutes')?.status).toBe('pass');
    const roll = result.windows.find(w => w.kind === 'rolling_seven_days'
      && w.endDate === '2026-08-10')!;
    expect(roll.totals.combinedMinutes).toBe(900);
    expect(roll.checks.find(c => c.dimension === 'combinedMinutes')?.status).toBe('exceeds');
    expect(result.status).toBe('exceeds_policy');
  });

  it('missing next-week frozen allowance makes boundary checks provisional', () => {
    const result = evaluate([], { frozenAllowances: [thisWeek] });
    expect(result.status).toBe('insufficient_data');
    expect(result.windows.some(w => w.provisional)).toBe(true);
  });

  it('flags 120 + 120 adjacent minutes, even across Sunday and Monday', () => {
    const result = evaluate([
      activity('sun', '2026-08-09', 'bike', 120),
      activity('mon', '2026-08-10', 'strength', 120),
    ]);
    expect(result.longDayReviews.some(a => a.firstDate === '2026-08-09'
      && a.secondDate === '2026-08-10')).toBe(true);
    expect(result.status).toBe('review_required');
  });

  it('does not flag 119 + 120 minutes', () => {
    const result = evaluate([
      activity('sun', '2026-08-09', 'bike', 119),
      activity('mon', '2026-08-10', 'strength', 120),
    ]);
    expect(result.longDayReviews).toHaveLength(0);
    expect(result.status).toBe('within_policy');
  });

  it('sums multiple sessions within each day for long-day review', () => {
    const result = evaluate([
      activity('a', '2026-08-04', 'bike', 90),
      activity('b', '2026-08-04', 'strength', 30),
      activity('c', '2026-08-05', 'run', 120, 5 * MILE),
    ]);
    expect(result.longDayReviews).toHaveLength(1);
    expect(result.longDayReviews[0]?.firstDate).toBe('2026-08-04');
  });

  it('zero running baseline does not authorize a return to running', () => {
    const baseline = frozen('2026-08-03', { ...approved, runDistanceKm: 0 });
    const result = evaluate([activity('new-run', '2026-08-04', 'run', 20, 2)], {
      frozenAllowances: [baseline, { ...nextWeek, runDistanceCapKm: null }],
    });
    expect(result.status).toBe('baseline_required');
    expect(result.windows[0]!.checks.find(c => c.dimension === 'runDistanceKm')?.status)
      .toBe('baseline_required');
  });

  it('requires an explicit eligible baseline, not a recent high-volume week', () => {
    const result = freezeExperimentalTrainingAllowance({
      baseline: { ...approved, eligibility: 'needs_review' },
      planningWeekStart: '2026-08-03', planningState: 'ordinary_progression',
      frozenAt: '2026-08-03T08:00:00Z',
    });
    expect(result.status).toBe('baseline_required');
  });

  it('does not reactivate a historical peak week as an ordinary baseline', () => {
    const result = freezeExperimentalTrainingAllowance({
      baseline: approved, planningWeekStart: '2026-08-10',
      planningState: 'ordinary_progression',
      frozenAt: '2026-08-10T08:00:00Z',
    });
    expect(result.status).toBe('baseline_required');
  });

  it('holds progression after injury or during illness without auto-return', () => {
    for (const planningState of [
      'injury_or_worsening_interruption', 'rehabilitation_or_return', 'illness_interruption',
    ] as const) {
      expect(freezeExperimentalTrainingAllowance({
        baseline: approved, planningWeekStart: '2026-08-03', planningState,
        frozenAt: '2026-08-03T08:00:00Z',
      }).status).toBe('return_plan_required');
      expect(evaluate([], { planningState }).status).toBe('return_plan_required');
    }
  });

  it('high stress and an active clinician restriction prevent ordinary status', () => {
    expect(evaluate([], { planningState: 'high_contextual_stress_interruption' }).status)
      .toBe('review_required');
    expect(evaluate([], { clinicalConstraintActive: true }).status).toBe('review_required');
  });

  it('flags intensity, hills, novelty and pain-related substitutions separately', () => {
    const result = evaluate([
      activity('hill-run', '2026-08-05', 'run', 20, 2, {
        hillIncrease: true, intensityIncrease: true, newModality: true,
        symptomDrivenSubstitution: true,
      }),
    ]);
    expect(result.status).toBe('review_required');
    expect(result.reviewItems).toHaveLength(4);
  });

  it('does not convert unused allowance into a training debt or target', () => {
    const r = evaluate([]);
    expect(r.status).toBe('within_policy');
    expect(r.explanations.join(' ')).toContain('not training targets');
    expect(r.windows[0]?.totals.combinedMinutes).toBe(0);
  });

  it('does not trust duplicate-like activities that lack confirmed matching IDs', () => {
    const result = evaluate([
      activity('a', '2026-08-04', 'bike', 40, undefined, { possibleDuplicate: true }),
      activity('b', '2026-08-04', 'bike', 40),
    ]);
    expect(result.status).toBe('insufficient_data');
  });
});
