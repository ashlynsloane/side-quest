import { describe, expect, it } from 'vitest';
import type { StrengthLoadBaseline, StrengthSessionResponse, StrengthTrainingHistoryEntry } from '@circuit/domain';
import { evaluateStrengthLoad, scaleWorkMinutes } from '../src/strength-load-management';

const baseline: StrengthLoadBaseline = {
  consistencyLastSixWeeks: 'one_per_week',
  establishedSessionsPerWeek: 1,
  desiredSessionsPerWeek: 4,
  assessedAt: '2026-07-28T00:00:00.000Z',
};

describe('V24.2 strength load ramping', () => {
  it('caps a one-day baseline at two sessions instead of granting four', () => {
    const decision = evaluateStrengthLoad({
      requestedSessions: 4,
      weekStartDate: '2026-07-28',
      baseline,
    });
    expect(decision.action).toBe('hold');
    expect(decision.allowedSessions).toBe(2);
    expect(decision.allowRepProgression).toBe(false);
    expect(decision.reduceNovelty).toBe(true);
  });

  it('does not apply a conservative default when no baseline evidence exists', () => {
    const decision = evaluateStrengthLoad({ requestedSessions: 4, weekStartDate: '2026-07-28' });
    expect(decision.action).toBe('progress');
    expect(decision.allowedSessions).toBe(4);
    expect(decision.reasons).toEqual([]);
  });

  it('turns widespread soreness into automatic consolidation', () => {
    const responses: StrengthSessionResponse[] = [{
      id: 'response_1',
      completedAt: '2026-07-26T12:00:00.000Z',
      recordedAt: '2026-07-27T12:00:00.000Z',
      classification: 'unusually_sore',
      sorenessDistribution: 'widespread',
      affectedNextWorkout: true,
    }];
    const decision = evaluateStrengthLoad({
      requestedSessions: 4,
      weekStartDate: '2026-07-28',
      baseline,
      responses,
    });
    expect(decision.action).toBe('consolidate');
    expect(decision.allowedSessions).toBe(2);
    expect(decision.durationMultiplier).toBe(0.67);
  });

  it('restricts to a minimum exposure when pain affects daily activity or later training', () => {
    const responses: StrengthSessionResponse[] = [{
      id: 'response_2',
      completedAt: '2026-07-26T12:00:00.000Z',
      recordedAt: '2026-07-27T12:00:00.000Z',
      classification: 'pain_or_discomfort',
      severity: 4,
      affectedDailyActivity: true,
      affectedNextWorkout: true,
    }];
    const decision = evaluateStrengthLoad({
      requestedSessions: 3,
      weekStartDate: '2026-07-28',
      baseline,
      responses,
    });
    expect(decision.action).toBe('restrict');
    expect(decision.allowedSessions).toBe(1);
    expect(decision.durationMultiplier).toBe(0.5);
  });

  it('detects a recent frequency spike from completed history', () => {
    const history: StrengthTrainingHistoryEntry[] = [
      '2026-07-20', '2026-07-22', '2026-07-24', '2026-07-26',
    ].map((date, index) => ({
      id: `history_${index}`,
      completedAt: `${date}T12:00:00.000Z`,
      durationMinutes: 40,
      source: 'side_quest' as const,
    }));
    const decision = evaluateStrengthLoad({
      requestedSessions: 4,
      weekStartDate: '2026-07-28',
      baseline,
      history,
    });
    expect(decision.action).toBe('consolidate');
    expect(decision.allowedSessions).toBeLessThanOrEqual(2);
  });

  it('maps duration reductions to generator-supported session lengths', () => {
    expect(scaleWorkMinutes(48, 0.8)).toBe(40);
    expect(scaleWorkMinutes(40, 0.8)).toBe(32);
    expect(scaleWorkMinutes(32, 0.5)).toBe(24);
  });
});
