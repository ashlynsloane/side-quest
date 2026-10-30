import { describe, expect, it } from 'vitest';
import {
  buildTrainingWeekEvidence, localTrainingDate, normalizeTrainingSport,
} from '../src/core-training-week-evidence';
import type { TrainingExposureRecord } from '../src/experimental-training-guardrails';

const week = '2026-08-03';
function row(
  id: string, date: string, sport: TrainingExposureRecord['sport'],
  minutes: number | null, status: TrainingExposureRecord['status'] = 'planned',
  extras: Partial<TrainingExposureRecord> = {},
): TrainingExposureRecord {
  return {
    recordId: id, canonicalActivityId: id, localDate: date, sport,
    durationMinutes: minutes, status, source: 'test',
    ...extras,
  };
}
function review(records: TrainingExposureRecord[], coverage: 'verified' | 'unverified' = 'unverified') {
  return buildTrainingWeekEvidence({
    weekStartDate: week, timezone: 'America/Denver',
    plannedAndCompleted: records, coverage,
  });
}
describe('core training week evidence', () => {
  it('does not convert athlete onboarding availability to completed training', () => {
    const result = review([]);
    expect(result.completed.combinedMinutes).toBe(0);
    expect(result.planningEvidenceStatus).toBe('requires_review');
    expect(result.missingCoverage).toBe(true);
    expect(result.baselineApproval).toBe('not_assessed');
  });
  it('retains completed versus remaining planned totals separately', () => {
    const r = review([
      row('bike', '2026-08-04', 'bike', 90, 'completed'),
      row('strength', '2026-08-05', 'strength', 40),
    ]);
    expect(r.completed.combinedMinutes).toBe(90);
    expect(r.completed.cyclingMinutes).toBe(90);
    expect(r.remainingPlanned.combinedMinutes).toBe(40);
    expect(r.plannedOrCompleted.combinedMinutes).toBe(130);
  });
  it('a completed planned strength workout replaces plan, not counted twice', () => {
    const r = review([
      row('strength-plan', '2026-08-05', 'strength', 30),
      row('workout-actual', '2026-08-05', 'strength', 42, 'completed', {
        linkedPlanRecordId: 'strength-plan',
      }),
    ]);
    expect(r.completed.count).toBe(1);
    expect(r.remainingPlanned.count).toBe(0);
    expect(r.plannedOrCompleted.combinedMinutes).toBe(42);
  });
  it('flags likely duplicate planned and completed sessions without confirmed linkage', () => {
    const result = review([
      row('unlinked-plan', '2026-08-04', 'bike', 60),
      row('unlinked-actual', '2026-08-04', 'bike', 62, 'completed'),
    ], 'verified');
    expect(result.planningEvidenceStatus).toBe('incomplete');
    expect(result.sourceConflicts.join(' ')).toContain('unlinked planned/completed bike');
    expect(result.completed.count).toBe(1);
    expect(result.remainingPlanned.count).toBe(1);
  });

  it('duplicate provider views with linked canonical ID count once', () => {
    const r = review([
      row('garmin', '2026-08-06', 'bike', 75, 'completed', {
        canonicalActivityId: 'shared', source: 'Garmin',
      }),
      row('tp', '2026-08-06', 'bike', 75, 'completed', {
        canonicalActivityId: 'shared', source: 'TrainingPeaks',
      }),
    ]);
    expect(r.completed.count).toBe(1);
    expect(r.completed.combinedMinutes).toBe(75);
  });
  it('conflicting matched provider data cannot establish a verified week', () => {
    const r = review([
      row('garmin', '2026-08-06', 'bike', 74, 'completed', {
        canonicalActivityId: 'shared', source: 'Garmin',
      }),
      row('tp', '2026-08-06', 'bike', 75, 'completed', {
        canonicalActivityId: 'shared', source: 'TrainingPeaks',
      }),
    ], 'verified');
    expect(r.planningEvidenceStatus).toBe('incomplete');
    expect(r.sourceConflicts).toHaveLength(1);
  });
  it('unknown run distance and duration remain unresolved, never implied zero', () => {
    const r = review([
      row('r', '2026-08-04', 'run', 30, 'completed'),
      row('s', '2026-08-05', 'strength', null),
    ]);
    expect(r.unresolvedRecords).toHaveLength(2);
    expect(r.planningEvidenceStatus).toBe('incomplete');
    expect(r.completed.runDistanceKm).toBe(0);
  });
  it('a data source reporting a duration estimate needs review', () => {
    const r = review([row('s', '2026-08-05', 'strength', 35, 'completed', {
      durationEstimate: true,
    })], 'verified');
    expect(r.planningEvidenceStatus).toBe('incomplete');
    expect(r.unresolvedRecords[0]?.reason).toContain('Estimated');
  });
  it('a verified clean week is still not an approved baseline', () => {
    const r = review([row('b', '2026-08-04', 'bike', 60, 'completed')], 'verified');
    expect(r.planningEvidenceStatus).toBe('source_verified');
    expect(r.baselineApproval).toBe('not_assessed');
  });
  it('rejects non-Monday weeks and invalid time zones', () => {
    expect(() => buildTrainingWeekEvidence({
      weekStartDate: '2026-08-04', timezone: 'America/Denver',
      plannedAndCompleted: [], coverage: 'verified',
    })).toThrow(/Monday/);
    expect(() => buildTrainingWeekEvidence({
      weekStartDate: week, timezone: 'Bad/TimeZone',
      plannedAndCompleted: [], coverage: 'verified',
    })).toThrow(/time zone/);
  });
  it('retains local date across UTC midnight and DST boundaries', () => {
    expect(localTrainingDate('2026-11-02T02:00:00Z', 'America/Denver'))
      .toBe('2026-11-01');
    expect(localTrainingDate('2026-08-03T00:30:00Z', 'America/Denver'))
      .toBe('2026-08-02');
  });
  it('normalizes external sport types without silently treating walks as tracked training', () => {
    expect(normalizeTrainingSport('bike')).toBe('bike');
    expect(normalizeTrainingSport('hiit')).toBe('other');
    expect(normalizeTrainingSport('unknown')).toBe('other');
  });
});
