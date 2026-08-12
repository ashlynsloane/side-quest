import { afterEach, describe, expect, it } from 'vitest';

import { buildRaceHorizonDevelopmentPlan } from '../src/race-horizon-development';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week-block';

function plannerInput(
  weekStartDate: string,
  developmentWeek: NonNullable<WholeAthleteWeeklyPlannerInput['developmentWeek']>,
  previousWeek: WholeAthleteWeeklyPlannerInput['previousWeek'] = [],
): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate,
    availableMinutes: Math.round(840 * developmentWeek.targetLoadFactor),
    goalType: 'ironman_70_3',
    phase: developmentWeek.phase,
    developmentWeek,
    health: {
      energyAvailability: 'adequate',
      menstrualRecovery: 'stable',
      boneStress: 'recent',
      injuryConstraint: 'monitor',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek,
    returnToRun: true,
    recentBoneStress: true,
    frequencyTargets: {
      run: { min: 3, preferred: 3, max: 3 },
    },
    weeklySchedule: {
      restDays: [0],
      availableDays: {
        swim: [1, 3, 5],
        bike: [1, 3, 5, 6],
        run: [2, 4, 6],
        strength: [2, 4],
      },
      maxContinuousMinutesByDay: {
        0: 0,
        1: 120,
        2: 120,
        3: 120,
        4: 120,
        5: 420,
        6: 360,
      },
    },
  };
}

function weekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('race-horizon plan -> weekly planner', () => {
  it('makes quality, support, and long-ride roles execute the race-horizon objective while RTR stays protected', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const horizon = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      recentBoneStress: true,
    });
    const developmentWeek = horizon.weeks[0]!;
    const plan = buildWholeAthleteWeek(plannerInput('2026-08-17', developmentWeek));

    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    const quality = bikes.filter((session) => session.intensity === 'hard' || session.recoveryCost >= 4);
    const long = bikes.filter((session) => session.keySession && /long ride/i.test(session.title));
    const support = bikes.filter((session) => !session.keySession && weekday(session.date) < 5);

    expect(plan.developmentWeek?.weekNumber).toBe(1);
    expect(plan.developmentWeek?.totalWeeks).toBe(16);
    expect(quality).toHaveLength(1);
    expect(quality[0]!.title).toBe('VO2 · 6 × 4');
    expect(long).toHaveLength(1);
    expect(long[0]!.title).toBe('Long Ride · Aerobic Durability');
    expect(support.some((session) => session.title === 'Aerobic · Steady Economy')).toBe(true);
    expect(runs).toHaveLength(3);
    expect(runs.every((session) => session.intensity === 'easy')).toBe(true);
    expect(plan.sessions.some((session) => session.rationale.some((line) => /Race horizon: week 1 of 16/i.test(line)))).toBe(true);
  });

  it('changes non-quality bike purpose week to week without changing the weekly scaffold', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const horizon = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      recentBoneStress: true,
    });

    const week1 = buildWholeAthleteWeek(plannerInput('2026-08-17', horizon.weeks[0]!));
    const week2 = buildWholeAthleteWeek(plannerInput('2026-08-24', horizon.weeks[1]!, week1.sessions));

    const long1 = week1.sessions.find((session) => session.discipline === 'bike' && session.keySession && /long ride/i.test(session.title));
    const long2 = week2.sessions.find((session) => session.discipline === 'bike' && session.keySession && /long ride/i.test(session.title));
    const support1 = week1.sessions.find((session) => session.discipline === 'bike' && !session.keySession && weekday(session.date) < 5);
    const support2 = week2.sessions.find((session) => session.discipline === 'bike' && !session.keySession && weekday(session.date) < 5);

    expect(long1?.title).toBe('Long Ride · Aerobic Durability');
    expect(long2?.title).toBe('Long Ride · Fueling Practice');
    expect(support1?.title).toBe('Aerobic · Steady Economy');
    expect(support2?.title).toBe('Aerobic · Cadence Economy');

    const weekdays = (plan: typeof week1, discipline: 'bike' | 'run') => plan.sessions
      .filter((session) => session.discipline === discipline)
      .map((session) => (new Date(`${session.date}T12:00:00Z`).getUTCDay() + 6) % 7)
      .sort((a, b) => a - b);
    expect(weekdays(week2, 'run')).toEqual(weekdays(week1, 'run'));
  });
  it('turns the fourth base week into a true recovery week instead of preserving a hard Tuesday by habit', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const horizon = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      recentBoneStress: true,
    });
    const recovery = horizon.weeks[3]!;
    const plan = buildWholeAthleteWeek(plannerInput('2026-09-07', recovery));
    const generatedBikes = plan.sessions.filter((session) =>
      session.discipline === 'bike' && session.planningCommitment === 'generated');

    expect(recovery.loadIntent).toBe('recovery');
    expect(generatedBikes.some((session) => session.intensity === 'hard' || session.recoveryCost >= 4)).toBe(false);
    expect(generatedBikes.some((session) => session.title === 'Long Ride · Reduced Aerobic')).toBe(true);
    expect(plan.sessions.filter((session) => session.discipline === 'run')).toHaveLength(3);
  });

});
