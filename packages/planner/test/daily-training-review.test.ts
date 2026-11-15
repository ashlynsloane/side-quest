import { describe, expect, it } from 'vitest';
import { buildDailyTrainingReview } from '../src/daily-training-review';
import type { TrainingExposureRecord } from '../src/experimental-training-guardrails';

const planned = (id: string, date: string, sport: TrainingExposureRecord['sport'] = 'bike'):
  TrainingExposureRecord => ({
    recordId: 'calendar:' + id, canonicalActivityId: 'calendar:' + id,
    localDate: date, sport, status: 'planned',
    durationMinutes: 30, source: 'Calendar: side_quest_generated_plan',
  });
const completed = (id: string, date: string, linkedPlanRecordId?: string):
  TrainingExposureRecord => ({
    recordId: 'recorded:' + id, canonicalActivityId: 'recorded:' + id,
    localDate: date, sport: 'bike', status: 'completed',
    durationMinutes: 22, source: 'Completed activity: manual',
    linkedPlanRecordId,
  });
const review = (records: TrainingExposureRecord[], verified = false) =>
  buildDailyTrainingReview({
    records, asOfLocalDate: '2026-11-14',
    sourceCoverageVerified: verified,
  });

describe('read-only daily training feedback reconciliation', () => {
  it('keeps unmatched prior plans unverified, not automatically missed or rescheduled', () => {
    const result = review([
      planned('past', '2026-11-13'),
      planned('today', '2026-11-14'),
      planned('later', '2026-11-15'),
    ]);
    expect(result.pastUnverifiedIds).toEqual(['calendar:past']);
    expect(result.todayPlannedCount).toBe(1);
    expect(result.upcomingPlannedCount).toBe(1);
    expect(result.autoRescheduledCount).toBe(0);
    expect(result.advice).toContain('not automatically missed');
    expect(result.needsSourceReview).toBe(true);
  });
  it('an explicitly linked partial completion supersedes its plan without claiming full dose', () => {
    const result = review([
      planned('past', '2026-11-13'),
      completed('partial', '2026-11-13', 'calendar:past'),
    ]);
    expect(result.pastUnverifiedCount).toBe(0);
    expect(result.completedCount).toBe(1);
    expect(result.autoRescheduledCount).toBe(0);
  });
  it('unlinked same-sport completion does not silently satisfy an earlier plan', () => {
    const result = review([
      planned('past', '2026-11-13'), completed('different', '2026-11-13'),
    ], true);
    expect(result.pastUnverifiedCount).toBe(1);
    expect(result.completedCount).toBe(1);
    expect(result.needsSourceReview).toBe(true);
  });
  it('explicit linkage can replace a plan even when activity moves to next local day', () => {
    const result = review([
      planned('past', '2026-11-12'), completed('late', '2026-11-13', 'calendar:past'),
    ], true);
    expect(result.pastUnverifiedCount).toBe(0);
  });
  it('never interprets missing records as verified readiness', () => {
    const result = review([], true);
    expect(result.pastUnverifiedCount).toBe(0);
    expect(result.advice).toContain('does not establish readiness');
    expect(result.autoRescheduledCount).toBe(0);
  });
  it('flags truncated history and unresolved duplicate records', () => {
    const truncated = buildDailyTrainingReview({
      records: [], asOfLocalDate: '2026-11-14', sourceCoverageVerified: true,
      historyPossiblyTruncated: true,
    });
    expect(truncated.needsSourceReview).toBe(true);
    const duplicates = review([
      planned('x', '2026-11-13'),
      { ...planned('x', '2026-11-13'), recordId: 'calendar:y', possibleDuplicate: true },
    ], true);
    expect(duplicates.needsSourceReview).toBe(true);
  });
  it('rejects impossible athlete-local dates', () => {
    for (const date of ['2026-02-30', '2026-11-14T00:00Z', 'not-a-date']) {
      expect(() => buildDailyTrainingReview({
        records: [], asOfLocalDate: date, sourceCoverageVerified: false,
      })).toThrow();
    }
  });
});
