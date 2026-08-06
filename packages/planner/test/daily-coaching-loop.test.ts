import { describe, expect, it } from 'vitest';
import type { DailyCoachSession, DailyCoachSignal } from '@circuit/domain';
import { buildAdaptiveCheckIns, buildDailyCoachBrief, buildDailyCoachDecision } from '../src/daily-coaching-loop';

const sessions: DailyCoachSession[] = [
  { sessionId: 'masters', title: 'Masters swimming', sport: 'swim', localDate: '2026-08-04', localStartTime: '07:00', durationMinutes: 60, protected: true, priorityRank: 1 },
  { sessionId: 'ride', title: 'Endurance ride', sport: 'bike', localDate: '2026-08-04', localStartTime: '17:00', durationMinutes: 60, protected: false, priorityRank: 2 },
];

describe('daily coaching loop', () => {
  it('keeps protected commitments at the top of the daily brief', () => {
    const brief = buildDailyCoachBrief({ briefId:'brief', athleteId:'athlete', localDate:'2026-08-04', generatedAt:'2026-08-04T05:00:00Z', sessions });
    expect(brief.priorities[0]?.kind).toBe('protect');
    expect(brief.priorities[0]?.sessionId).toBe('masters');
  });
  it('offers multiple recovery paths after a disruption without moving protected sessions', () => {
    const signals: DailyCoachSignal[] = [{ signalId:'closed', kind:'pool_closure', occurredAt:'2026-08-04T06:00:00Z', sessionId:'masters' }];
    const decision = buildDailyCoachDecision('decision', signals, sessions);
    expect(decision.options.map((option)=>option.optionId)).toEqual(expect.arrayContaining(['move','shorten','skip']));
    expect(decision.requiresAthleteApproval).toBe(true);
  });
  it('asks contextual check-ins only when a signal makes them useful', () => {
    const checks = buildAdaptiveCheckIns([{ signalId:'pain', kind:'pain', occurredAt:'2026-08-04T06:00:00Z', severity:'high' }]);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.requiredBeforeDecision).toBe(true);
  });
});
