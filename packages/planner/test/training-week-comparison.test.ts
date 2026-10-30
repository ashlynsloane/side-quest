import { describe, expect, it } from 'vitest';
import { buildTrainingWeekEvidence } from '../src/core-training-week-evidence';
import { comparePlannedWeekWithFrozenLimits } from '../src/training-week-comparison';
import type {
  FrozenTrainingAllowance, TrainingExposureRecord,
} from '../src/experimental-training-guardrails';

const allowance: FrozenTrainingAllowance = {
  planningWeekStart: '2026-11-02',
  baselineId: 'approved-completed-week',
  baselineStartDate: '2026-10-26', baselineEndDate: '2026-11-01',
  timezone: 'America/Denver', policyVersion: 'athlete-experimental-ramp-v1',
  runDistanceCapKm: 16.5, cyclingMinutesCap: 330, combinedMinutesCap: 660,
  frozenAt: '2026-11-02T07:00:00Z',
};
const row = (id: string, sport: TrainingExposureRecord['sport'],
  minutes: number | null, km?: number | null,
  extra: Partial<TrainingExposureRecord> = {}): TrainingExposureRecord => ({
  recordId: id, canonicalActivityId: id, localDate: '2026-11-03',
  sport, status: 'planned', source: 'test fixture',
  durationMinutes: minutes, ...(km === undefined ? {} : { runDistanceKm: km }),
  ...extra,
});
const review = (rows: TrainingExposureRecord[], coverage: 'verified' | 'unverified' = 'unverified') =>
  comparePlannedWeekWithFrozenLimits(buildTrainingWeekEvidence({
    weekStartDate: '2026-11-02', timezone: 'America/Denver',
    plannedAndCompleted: rows, coverage,
  }), allowance);

describe('proposed week versus experimental frozen ceilings', () => {
  it('shows separate numerical constraints without a fitness/clearance claim', () => {
    const r = review([row('bike', 'bike', 300), row('run', 'run', 120, 15)]);
    expect(r.comparisons.map(x => x.status)).toEqual([
      'below_ceiling_provisional', 'below_ceiling_provisional', 'below_ceiling_provisional',
    ]);
    expect(r.message).toContain('no remaining-minute target or medical clearance');
    expect(r.evidenceStatus).toBe('partial_records');
  });
  it('detects combined-only overload when running and cycling each fit', () => {
    const r = review([
      row('run', 'run', 210, 14),
      row('bike', 'bike', 320),
      row('strength', 'strength', 160),
    ]);
    expect(r.comparisons[0]?.status).toBe('below_ceiling_provisional');
    expect(r.comparisons[1]?.status).toBe('below_ceiling_provisional');
    expect(r.comparisons[2]?.status).toBe('over_ceiling');
    expect(r.anyOverage).toBe(true);
    expect(r.comparisons[2]?.differenceFromCeiling).toBe(-30);
  });
  it('unknown run distance never becomes a green run-distance result', () => {
    const r = review([row('run', 'run', 30, null)]);
    expect(r.comparisons[0]?.status).toBe('uncertain');
    expect(r.unresolvedActivities.some(x => x.includes('Running distance'))).toBe(true);
  });
  it('unknown planned duration cannot confirm combined time', () => {
    const r = review([row('strength', 'strength', null)]);
    expect(r.comparisons[2]?.status).toBe('uncertain');
  });
  it('ambiguous duplicate views produce a possible, not definitive, overage', () => {
    const r = review([
      row('garmin-view', 'bike', 210, undefined, {
        status: 'completed', canonicalActivityId: 'garmin', possibleDuplicate: true,
      }),
      row('manual-view', 'bike', 210, undefined, {
        status: 'completed', canonicalActivityId: 'manual', possibleDuplicate: true,
      }),
    ]);
    expect(r.comparisons[1]?.status).toBe('possible_overage');
    expect(r.anyUnknown).toBe(true);
  });
  it('no existing running baseline does not authorize an increased running plan', () => {
    const r = comparePlannedWeekWithFrozenLimits(buildTrainingWeekEvidence({
      weekStartDate: '2026-11-02', timezone: 'America/Denver', coverage: 'unverified',
      plannedAndCompleted: [row('run', 'run', 25, 4)],
    }), { ...allowance, runDistanceCapKm: null });
    expect(r.comparisons[0]?.status).toBe('no_approved_progression');
    expect(r.comparisons[0]?.differenceFromCeiling).toBeNull();
  });
  it('refuses another week or timezone allowance', () => {
    const evidence = buildTrainingWeekEvidence({
      weekStartDate: '2026-11-02', timezone: 'America/Denver',
      plannedAndCompleted: [], coverage: 'unverified',
    });
    expect(() => comparePlannedWeekWithFrozenLimits(evidence, {
      ...allowance, planningWeekStart: '2026-11-09',
    })).toThrow(/week or time zone/);
  });
});
