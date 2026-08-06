import { describe, expect, it } from 'vitest';
import { runUnifiedCoachEngine } from '../src/unified-coach-engine';

const session = {
  sessionId: 'strength-1', weekIndex: 0, startsAt: '2026-08-01T09:00:00Z', durationMinutes: 45,
  title: 'Primary strength', discipline: 'strength', objective: 'max_strength' as const,
  role: 'key' as const, movable: true,
};

describe('runUnifiedCoachEngine', () => {
  it('keeps protected sessions behind review and athlete approval', () => {
    const result = runUnifiedCoachEngine({
      generatedAt: '2026-07-29T07:00:00Z', sessions: [session],
      capacityForecast: {
        generatedAt: '2026-07-29T07:00:00Z', horizonHours: 168, confidence: 'moderate', points: [],
        conflicts: [{ id: 'c1', affectedSessionId: 'strength-1', resource: 'lumbar', severity: 'meaningful', availableCapacity: 35, threshold: 50, at: session.startsAt, reasons: ['Lumbar capacity is projected below threshold.'] }],
        lowestCapacityByResource: { lumbar: 35 }, explanations: [],
      },
    });
    expect(result.decisions[0]?.action).toBe('review');
    expect(result.decisions[0]?.requiresAthleteApproval).toBe(true);
    expect(result.protectedSessionIds).toContain('strength-1');
  });

  it('lets safety restrictions override performance logic', () => {
    const result = runUnifiedCoachEngine({ generatedAt: '2026-07-29T07:00:00Z', sessions: [session], painOrInjuryRestriction: true });
    expect(result.status).toBe('safety_hold');
    expect(result.decisions[0]?.action).toBe('recover');
  });

  it('returns a stable plan when no material signal exists', () => {
    const result = runUnifiedCoachEngine({ generatedAt: '2026-07-29T07:00:00Z', sessions: [session] });
    expect(result.status).toBe('stable');
    expect(result.decisions).toHaveLength(0);
  });
});
