import { describe, expect, it } from 'vitest';

import {
  buildWholeAthleteWeek,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week-rhythm';

function input(weekStartDate: string, previousWeek: WholeAthleteWeeklyPlannerInput['previousWeek'] = []): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate,
    availableMinutes: 360,
    goalType: 'ironman_70_3',
    phase: 'build',
    health: {
      energyAvailability: 'uncertain',
      menstrualRecovery: 'unknown',
      injuryConstraint: 'none',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek,
    frequencyTargets: {
      swim: { min: 2, preferred: 2, max: 2 },
      bike: { min: 2, preferred: 2, max: 2 },
      run: { min: 0, preferred: 0, max: 0 },
      strength: { min: 0, preferred: 0, max: 0 },
    },
  };
}

function weekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function titles(plan: ReturnType<typeof buildWholeAthleteWeek>, discipline: 'swim' | 'bike') {
  return plan.sessions.filter((session) => session.discipline === discipline).sort((a, b) => a.date.localeCompare(b.date)).map((session) => session.title);
}

function weekdays(plan: ReturnType<typeof buildWholeAthleteWeek>, discipline: 'swim' | 'bike') {
  return plan.sessions.filter((session) => session.discipline === discipline).sort((a, b) => a.date.localeCompare(b.date)).map((session) => weekday(session.date));
}

describe('training block rhythm', () => {
  it('keeps weekly anchors stable while rotating the internal workout families', () => {
    const week1 = buildWholeAthleteWeek(input('2026-08-10'));
    const week2 = buildWholeAthleteWeek(input('2026-08-17', week1.sessions));

    expect(weekdays(week2, 'swim')).toEqual(weekdays(week1, 'swim'));
    expect(weekdays(week2, 'bike')).toEqual(weekdays(week1, 'bike'));
    expect(titles(week1, 'swim')).not.toEqual(titles(week2, 'swim'));
    expect(titles(week2, 'swim').join(' ')).toMatch(/Fartlek|Descending/);
    expect(titles(week2, 'bike').join(' ')).toMatch(/Fartlek|Rolling/);
  });

  it('returns to the exact reference family on the fourth week instead of creating endless novelty', () => {
    const week1 = buildWholeAthleteWeek(input('2026-08-10'));
    const week2 = buildWholeAthleteWeek(input('2026-08-17', week1.sessions));
    const week3 = buildWholeAthleteWeek(input('2026-08-24', week2.sessions));
    const week4 = buildWholeAthleteWeek(input('2026-08-31', week3.sessions));

    expect(titles(week4, 'swim')).toEqual(titles(week1, 'swim'));
    expect(titles(week4, 'bike')).toEqual(titles(week1, 'bike'));
    expect(week4.sessions.some((session) => session.rationale.some((line) => line.startsWith('Intentional repeat:')))).toBe(true);
  });

  it('preserves a lower-load day when there is enough room in the week', () => {
    const week1 = buildWholeAthleteWeek(input('2026-08-10'));
    const week2 = buildWholeAthleteWeek(input('2026-08-17', week1.sessions));
    const counts = Array.from({ length: 7 }, (_, day) => week2.sessions.filter((session) => weekday(session.date) === day).length);

    expect(counts.some((count) => count === 0)).toBe(true);
    expect(week2.guardrails.some((line) => /lower-load day/i.test(line))).toBe(true);
  });

  it('can move Side Quest strength back to its established weekday without moving athlete calendar commitments', () => {
    const previous = [
      {
        id: 'strength-prev',
        date: '2026-08-11',
        title: 'Strength',
        discipline: 'strength' as const,
        durationMinutes: 30,
        intensity: 'moderate' as const,
        cardiovascularDemand: 'low' as const,
        musculoskeletalDemand: 'moderate' as const,
        lowerBodyDemand: 'moderate' as const,
        upperBodyDemand: 'moderate' as const,
        impact: 'low' as const,
        technicalDemand: 'moderate' as const,
        recoveryCost: 2 as const,
        priority: 'recommended' as const,
        source: 'side_quest' as const,
        keySession: false,
      },
    ];
    const next = buildWholeAthleteWeek({
      ...input('2026-08-17', previous),
      frequencyTargets: {
        swim: { min: 0, preferred: 0, max: 0 },
        bike: { min: 0, preferred: 0, max: 0 },
        run: { min: 0, preferred: 0, max: 0 },
        strength: { min: 1, preferred: 1, max: 1 },
      },
      fixedSessions: [{ ...previous[0]!, id: 'strength-current', date: '2026-08-20' }],
    });
    const strength = next.sessions.find((session) => session.id === 'strength-current');
    expect(strength?.date).toBe('2026-08-18');
  });
});
