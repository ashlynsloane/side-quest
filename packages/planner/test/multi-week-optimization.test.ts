import { describe, expect, it } from 'vitest';
import type { MultiWeekOptimizationCandidate, MultiWeekOptimizationInput } from '@circuit/domain';
import { optimizeMultiWeekBlock } from '../src/multi-week-optimization';

function candidate(candidateId: string, changeCount = 0): MultiWeekOptimizationCandidate {
  return {
    candidateId,
    changeCount,
    weeks: [{
      weekIndex: 0,
      startsOn: '2026-08-03',
      phase: 'build',
      plannedLoad: 100,
      sessions: [{
        sessionId: `${candidateId}-strength`,
        weekIndex: 0,
        originalStartsAt: '2026-08-03T17:00:00.000Z',
        startsAt: '2026-08-03T17:00:00.000Z',
        durationMinutes: 45,
        title: 'Strength',
        discipline: 'strength',
        priority: 'supporting',
        movable: true,
        targetLoad: 30,
      }],
    }],
  };
}

const base: MultiWeekOptimizationInput = {
  generatedAt: '2026-07-29T12:00:00.000Z',
  baselineCandidateId: 'baseline',
  candidates: [candidate('baseline'), candidate('better', 1)],
};

describe('multi-week optimization', () => {
  it('prefers a block with fewer serious capacity conflicts', () => {
    const conflicted = candidate('baseline');
    conflicted.capacityForecast = {
      generatedAt: base.generatedAt,
      horizonHours: 168,
      points: [],
      conflicts: [{
        id: 'critical-1',
        at: '2026-08-05T17:00:00.000Z',
        resource: 'lumbar',
        availableCapacity: 30,
        threshold: 55,
        severity: 'critical',
        reasons: ['Stacked load'],
      }],
      lowestCapacityByResource: { lumbar: 30 },
      confidence: 'high',
      explanations: [],
    };
    const result = optimizeMultiWeekBlock({ ...base, candidates: [conflicted, candidate('better', 1)] });
    expect(result.recommendedCandidateId).toBe('better');
  });

  it('disqualifies a candidate that changes a protected key session', () => {
    const unsafe = candidate('unsafe');
    unsafe.weeks[0]!.sessions[0] = { ...unsafe.weeks[0]!.sessions[0]!, priority: 'key' };
    unsafe.calendarResult = {
      generatedAt: base.generatedAt,
      proposals: [{
        proposalId: 'move-key',
        sessionId: 'unsafe-strength',
        action: 'move',
        originalStartsAt: '2026-08-03T17:00:00.000Z',
        proposedStartsAt: '2026-08-04T17:00:00.000Z',
        confidence: 'high',
        requiresAthleteApproval: true,
        reasons: [],
        affectedConstraintIds: [],
        forecastConflictIds: [],
      }],
      unchangedSessionIds: [],
      protectedSessionIds: ['unsafe-strength'],
      explanations: [],
    };
    const result = optimizeMultiWeekBlock({ ...base, candidates: [candidate('baseline'), unsafe] });
    expect(result.evaluations.find((item) => item.candidateId === 'unsafe')?.disqualified).toBe(true);
  });

  it('rejects excessive week-to-week load jumps', () => {
    const unsafe = candidate('unsafe-load');
    unsafe.weeks.push({ ...unsafe.weeks[0]!, weekIndex: 1, startsOn: '2026-08-10', plannedLoad: 125, sessions: [] });
    const result = optimizeMultiWeekBlock({ ...base, candidates: [candidate('baseline'), unsafe] });
    expect(result.evaluations.find((item) => item.candidateId === 'unsafe-load')?.disqualified).toBe(true);
  });

  it('never applies a multi-week plan without athlete approval', () => {
    const result = optimizeMultiWeekBlock(base);
    expect(result.requiresAthleteApproval).toBe(true);
    expect(result.safeguards.join(' ').toLowerCase()).toContain('athlete approval');
  });
});
