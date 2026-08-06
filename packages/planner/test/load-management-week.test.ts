import { describe, expect, it } from 'vitest';
import type { LoadManagementWeekInput } from '@circuit/domain';
import { decideLoadManagementWeek, shouldScheduleRecoveryWeek } from '../src/load-management-week';

const base: LoadManagementWeekInput = {
  weekStartDate: '2026-08-03',
  recentWeeks: [],
  upcomingSessions: [
    { sessionId: 'strength-support', discipline: 'strength', priority: 'supporting', durationMinutes: 45 },
    { sessionId: 'long-bike', discipline: 'bike', priority: 'key', durationMinutes: 180 },
  ],
};

describe('V24.8 automatic deload and consolidation weeks', () => {
  it('keeps a normal week when no recovery trigger is present', () => {
    const decision = decideLoadManagementWeek(base);
    expect(decision.kind).toBe('normal');
    expect(decision.progressionAllowed).toBe(true);
    expect(shouldScheduleRecoveryWeek(decision)).toBe(false);
  });

  it('creates a consolidation week after a progression streak', () => {
    const decision = decideLoadManagementWeek({
      ...base,
      recentWeeks: [0, 1, 2].map((index) => ({
        weekStartDate: `2026-07-${String(13 + index * 7).padStart(2, '0')}`,
        completedStrengthSessions: 3,
        plannedStrengthSessions: 3,
        progressionCount: 1,
        unfamiliarExerciseCount: 0,
      })),
    });
    expect(decision.kind).toBe('consolidation');
    expect(decision.progressionAllowed).toBe(false);
    expect(decision.sessionDurationScale).toBeLessThan(1);
  });

  it('creates a deload for structural exposure plus persistent soreness', () => {
    const decision = decideLoadManagementWeek({
      ...base,
      recentWeeks: [{
        weekStartDate: '2026-07-27',
        completedStrengthSessions: 2,
        plannedStrengthSessions: 3,
        progressionCount: 1,
        unfamiliarExerciseCount: 2,
        maximumSorenessResolvedHours: 60,
        structuralAction: 'redistribute',
      }],
    });
    expect(decision.kind).toBe('deload');
    expect(decision.noveltyBudget).toBe(0);
    expect(decision.protectedSessionIds).toContain('long-bike');
  });

  it('uses a restricted week when pain affects another workout', () => {
    const decision = decideLoadManagementWeek({
      ...base,
      recentWeeks: [{
        weekStartDate: '2026-07-27',
        completedStrengthSessions: 1,
        plannedStrengthSessions: 3,
        progressionCount: 0,
        unfamiliarExerciseCount: 0,
        painDuringOrAfter: true,
        affectedNextWorkout: true,
      }],
    });
    expect(decision.kind).toBe('restriction');
    expect(decision.mechanicalDemandScale).toBe(0.5);
    expect(decision.adjustments.find((item) => item.sessionId === 'strength-support')?.action).toBe('replace');
  });

  it('protects key sessions and reduces supporting strength first', () => {
    const decision = decideLoadManagementWeek({ ...base, athleteRequestedRecovery: true });
    expect(decision.kind).toBe('deload');
    expect(decision.adjustments.find((item) => item.sessionId === 'long-bike')?.action).toBe('keep');
    expect(decision.adjustments.find((item) => item.sessionId === 'strength-support')?.durationScale).toBeLessThan(1);
  });
});
