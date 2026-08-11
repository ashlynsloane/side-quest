import { describe, expect, it } from 'vitest';

import { scheduleCoachFollowUp } from '../src/coach-closed-loop';
import { buildCoachMessageAdaptation } from '../src/coach-message-adaptation';
import type { UnifiedTrainingSession } from '../src/unified-training';

function bike(date: string): UnifiedTrainingSession {
  return {
    id: `bike-${date}`, date, title: 'Bike workout', discipline: 'bike', durationMinutes: 60, intensity: 'moderate',
    cardiovascularDemand: 'moderate', musculoskeletalDemand: 'moderate', lowerBodyDemand: 'moderate', upperBodyDemand: 'none',
    impact: 'none', technicalDemand: 'moderate', recoveryCost: 2, priority: 'recommended', source: 'side_quest', keySession: false,
  };
}

describe('coach follow-up scheduling', () => {
  it('waits until after a session that was moved several days into the future', () => {
    const session = bike('2026-08-10');
    const adaptation = buildCoachMessageAdaptation({
      message: 'My schedule changed. Move the ride to Friday.',
      session,
      weekSessions: [session],
      availableDates: ['2026-08-14'],
      preferredTargetDate: '2026-08-14',
    });
    const option = adaptation.adjustment.options.find((item) => item.id === adaptation.adjustment.recommendedOptionId)!;
    const followUp = scheduleCoachFollowUp({
      appliedAt: '2026-08-10T12:00:00.000Z',
      sessionDate: session.date,
      adaptation,
      option,
    });
    expect(option.targetDate).toBe('2026-08-14');
    expect(followUp.dueAt.slice(0, 10)).toBe('2026-08-14');
  });

  it('keeps a same-day protective follow-up inside the safety window', () => {
    const session = bike('2026-08-10');
    const adaptation = buildCoachMessageAdaptation({
      message: 'My knee hurts and I had to stop the ride.',
      session,
      weekSessions: [session],
      availableDates: [],
    });
    const option = adaptation.adjustment.options[0]!;
    const followUp = scheduleCoachFollowUp({
      appliedAt: '2026-08-10T12:00:00.000Z',
      sessionDate: session.date,
      adaptation,
      option,
    });
    const hours = (new Date(followUp.dueAt).getTime() - new Date('2026-08-10T12:00:00.000Z').getTime()) / 3_600_000;
    expect(hours).toBeGreaterThanOrEqual(12);
    expect(hours).toBeLessThanOrEqual(30);
  });
});
