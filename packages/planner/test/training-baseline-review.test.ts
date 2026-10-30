import { describe, expect, it } from 'vitest';
import { buildTrainingWeekEvidence } from '../src/core-training-week-evidence';
import {
  approveWeekBaseline, assessSavedBaseline, assessWeekForBaseline,
  baselineSourceSignature,
  type CoverageReviewAttestation,
} from '../src/training-baseline-review';
import type { TrainingExposureRecord } from '../src/experimental-training-guardrails';

const baseAttestation: CoverageReviewAttestation = {
  allTrainingRecorded: true,
  providersAndManualLogsReviewed: true,
  duplicateRecordsReconciled: true,
  estimatedDurationsReviewed: true,
  symptomContextReviewed: true,
  planningState: 'ordinary_progression',
  clinicalContext: 'none_reported',
  notes: 'Reviewed Garmin, Side Quest strength, and any manual training.',
};
const activity = (id: string, day: string, minutes: number | null, sport: 'run' | 'bike' | 'strength' = 'bike',
  extra: Partial<TrainingExposureRecord> = {}): TrainingExposureRecord => ({
  recordId: id, canonicalActivityId: id, localDate: day, status: 'completed',
  source: 'test', sport, durationMinutes: minutes,
  ...(sport === 'run' ? { runDistanceKm: 5 } : {}),
  sourceIds: ['source:' + id], ...extra,
});
const week = (rows: TrainingExposureRecord[] = [activity('ride', '2026-10-28', 90)],
  coverage: 'verified' | 'unverified' = 'unverified') =>
  buildTrainingWeekEvidence({
    weekStartDate: '2026-10-26', timezone: 'America/Denver',
    plannedAndCompleted: rows, coverage,
  });
const params = (rows?: TrainingExposureRecord[], attestation = baseAttestation,
  nowLocalDate = '2026-11-02') => ({
  evidence: week(rows), planningWeekStart: '2026-11-02',
  nowLocalDate, reviewedAt: '2026-11-02T15:00:00Z', attestation,
});

describe('explicit previous-week baseline review', () => {
  it('does not infer full source coverage from app records; manual attestation is labeled', () => {
    const result = approveWeekBaseline(params());
    expect(result.status).toBe('approved');
    if (result.status !== 'approved') return;
    expect(result.snapshot.evidenceBasis).toBe('athlete_attested_not_source_audited');
    expect(result.snapshot.baseline.sourceActivityIds).toEqual(['source:ride']);
    expect(result.snapshot.baseline.eligibility).toBe('approved_for_policy');
    expect(result.snapshot.frozenAllowance.cyclingMinutesCap).toBe(99);
    expect(result.snapshot.frozenAllowance.combinedMinutesCap).toBe(99);
    expect(result.snapshot.frozenAllowance.runDistanceCapKm).toBeNull();
    expect(result.snapshot.baseline.approvalNote).toContain('Athlete-attested');
  });
  it('will not approve an unfinished previous week or any historical peak week', () => {
    const before = assessWeekForBaseline(week(), '2026-11-02', '2026-10-30', baseAttestation);
    expect(before.issues.map(x => x.code)).toContain('unfinished_week');
    const wrong = assessWeekForBaseline(week(), '2026-11-09', '2026-11-09', baseAttestation);
    expect(wrong.issues.map(x => x.code)).toContain('wrong_week');
  });
  it('will not approve without explicit coverage and symptoms attestation', () => {
    const x = assessWeekForBaseline(week(), '2026-11-02', '2026-11-02', {
      ...baseAttestation, allTrainingRecorded: false,
      symptomContextReviewed: false,
    });
    expect(x.canApprove).toBe(false);
    expect(x.issues.map(y => y.code)).toEqual(expect.arrayContaining([
      'coverage_unattested', 'symptom_unreviewed',
    ]));
  });
  it('rejects injury, illness, rehab, high stress and unknown restrictions', () => {
    for (const planningState of ['injury_or_worsening_interruption',
      'illness_interruption', 'rehabilitation_or_return',
      'high_contextual_stress_interruption'] as const) {
      expect(approveWeekBaseline(params(undefined, {
        ...baseAttestation, planningState,
      })).status).toBe('rejected');
    }
    expect(approveWeekBaseline(params(undefined, {
      ...baseAttestation, clinicalContext: 'unknown',
    })).status).toBe('rejected');
    expect(approveWeekBaseline(params(undefined, {
      ...baseAttestation, clinicalContext: 'active',
    })).status).toBe('rejected');
  });
  it('blocks unknown training duration, unknown running distance and conflicts', () => {
    const unknown = approveWeekBaseline(params([activity('strength', '2026-10-28', null, 'strength')]));
    expect(unknown.status).toBe('rejected');
    const runMissing = approveWeekBaseline(params([
      activity('run', '2026-10-29', 40, 'run', { runDistanceKm: null }),
    ]));
    expect(runMissing.status).toBe('rejected');
    const duplicates = approveWeekBaseline(params([
      activity('garmin', '2026-10-27', 40, 'bike', { canonicalActivityId: 'one' }),
      activity('tp', '2026-10-27', 44, 'bike', { canonicalActivityId: 'one' }),
    ]));
    expect(duplicates.status).toBe('rejected');
  });
  it('requires acknowledgement of estimated logged strength durations', () => {
    const rows = [activity('strength', '2026-10-27', 41, 'strength', { durationEstimate: true })];
    const unreviewed = assessWeekForBaseline(week(rows), '2026-11-02', '2026-11-02', {
      ...baseAttestation, estimatedDurationsReviewed: false,
    });
    expect(unreviewed.issues.map(x => x.code)).toContain('estimated_duration');
    expect(approveWeekBaseline(params(rows)).status).toBe('approved');
  });
  it('does not approve a zero-training week or missing note', () => {
    const result = approveWeekBaseline(params([]));
    expect(result.status).toBe('rejected');
    const shortNote = approveWeekBaseline(params(undefined, { ...baseAttestation, notes: 'ok' }));
    expect(shortNote.status).toBe('rejected');
  });
  it('invalidates an approved snapshot after new completed activity', () => {
    const result = approveWeekBaseline(params());
    if (result.status !== 'approved') throw new Error('fixture failure');
    const same = assessSavedBaseline({
      snapshot: result.snapshot, evidence: week(),
      clinicalContext: 'none_reported', planningState: 'ordinary_progression',
    });
    expect(same.usableForPolicyComparison).toBe(true);
    const changed = assessSavedBaseline({
      snapshot: result.snapshot,
      evidence: week([activity('ride', '2026-10-28', 90), activity('run', '2026-10-29', 35, 'run')]),
      clinicalContext: 'none_reported', planningState: 'ordinary_progression',
    });
    expect(changed.usableForPolicyComparison).toBe(false);
    expect(changed.reasons.join(' ')).toContain('history changed');
  });
  it('invalidates a saved baseline if sessions move to different days with same weekly total', () => {
    const first = week([
      activity('a', '2026-10-27', 70),
      activity('b', '2026-10-29', 30),
    ]);
    const shifted = week([
      activity('a', '2026-10-28', 70),
      activity('b', '2026-10-28', 30),
    ]);
    expect(first.completed.combinedMinutes).toBe(100);
    expect(shifted.completed.combinedMinutes).toBe(100);
    expect(baselineSourceSignature(first)).not.toEqual(baselineSourceSignature(shifted));
  });
  it('prevents an approved old snapshot from overriding new clinical uncertainty', () => {
    const result = approveWeekBaseline(params());
    if (result.status !== 'approved') throw new Error('fixture failure');
    expect(assessSavedBaseline({
      snapshot: result.snapshot, evidence: week(),
      clinicalContext: 'active', planningState: 'ordinary_progression',
    }).usableForPolicyComparison).toBe(false);
  });
  it('the source signature is order-insensitive and ignores unrelated future plans', () => {
    const first = week([
      activity('a', '2026-10-28', 60),
      activity('b', '2026-10-29', 30),
    ]);
    const reversed = week([
      activity('b', '2026-10-29', 30),
      activity('a', '2026-10-28', 60),
    ]);
    expect(baselineSourceSignature(first)).toEqual(baselineSourceSignature(reversed));
  });
});
