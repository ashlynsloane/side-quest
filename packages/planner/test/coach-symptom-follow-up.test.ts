import { describe, expect, it } from 'vitest';

import { scheduleCoachFollowUp } from '../src/coach-closed-loop';
import { buildCoachMessageAdaptation } from '../src/coach-message-adaptation';
import type { UnifiedTrainingSession } from '../src/unified-training';

function session(discipline: 'bike' | 'strength'): UnifiedTrainingSession {
  return {
    id: `${discipline}-symptom`,
    date: '2026-08-10',
    title: discipline === 'bike' ? 'Bike workout' : 'Strength workout',
    discipline,
    durationMinutes: 60,
    intensity: 'moderate',
    cardiovascularDemand: 'moderate',
    musculoskeletalDemand: 'moderate',
    lowerBodyDemand: 'moderate',
    upperBodyDemand: discipline === 'strength' ? 'moderate' : 'none',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: 2,
    priority: 'recommended',
    source: 'side_quest',
    keySession: false,
  };
}

describe('coach symptom follow-ups', () => {
  it('uses a normal-priority symptom check for menstrual symptoms without treating them as injury protection', () => {
    const planned = session('bike');
    const adaptation = buildCoachMessageAdaptation({
      message: 'I am on my period with cramps and would rather ride easy indoors.',
      session: planned,
      weekSessions: [planned],
      availableDates: ['2026-08-11'],
    });
    const option = adaptation.adjustment.options.find((item) => item.id === adaptation.adjustment.recommendedOptionId)!;
    const followUp = scheduleCoachFollowUp({
      appliedAt: '2026-08-10T12:00:00.000Z',
      sessionDate: planned.date,
      adaptation,
      option,
    });

    expect(adaptation.interpretation.painContext?.kind).toBe('menstrual');
    expect(followUp.promptKind).toBe('symptom_check');
    expect(followUp.priority).toBe('normal');
    expect(followUp.question).toContain('symptoms and function');
  });

  it('uses a normal-priority symptom check for ordinary DOMS rather than an injury safety check', () => {
    const planned = session('strength');
    const adaptation = buildCoachMessageAdaptation({
      message: 'My quads are sore from yesterday and it feels like normal DOMS.',
      session: planned,
      weekSessions: [planned],
      availableDates: ['2026-08-11'],
    });
    const option = adaptation.adjustment.options.find((item) => item.id === adaptation.adjustment.recommendedOptionId)!;
    const followUp = scheduleCoachFollowUp({
      appliedAt: '2026-08-10T12:00:00.000Z',
      sessionDate: planned.date,
      adaptation,
      option,
    });

    expect(adaptation.interpretation.painContext?.kind).toBe('post_exercise_soreness');
    expect(followUp.promptKind).toBe('symptom_check');
    expect(followUp.priority).toBe('normal');
  });
});
