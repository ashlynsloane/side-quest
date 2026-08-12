import { afterEach, describe, expect, it } from 'vitest';

import { buildEndurancePrescription } from '../src/endurance-prescription-block-aware';
import type { PlannedMultisportSession } from '../src/multisport';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week-block';

function input(
  weekStartDate: string,
  phase: WholeAthleteWeeklyPlannerInput['phase'],
  previousWeek: WholeAthleteWeeklyPlannerInput['previousWeek'] = [],
): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate,
    availableMinutes: 840,
    goalType: 'ironman_70_3',
    phase,
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
  };
}

function qualityBike(plan: ReturnType<typeof buildWholeAthleteWeek>) {
  const quality = plan.sessions.filter((session) =>
    session.discipline === 'bike'
    && (session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4));
  expect(quality).toHaveLength(1);
  return quality[0]!;
}

function prescriptionFor(session: ReturnType<typeof qualityBike>) {
  return buildEndurancePrescription({
    id: session.id,
    date: session.date,
    day: 'tuesday',
    discipline: 'bike',
    title: session.title,
    durationMinutes: session.durationMinutes,
    intensity: 'hard',
    priority: 'key',
    ownership: 'generated',
    rationale: session.rationale,
  } as PlannedMultisportSession);
}

function fourWeekBlock(
  phase: WholeAthleteWeeklyPlannerInput['phase'],
  startDates: [string, string, string, string],
) {
  const week1 = buildWholeAthleteWeek(input(startDates[0], phase));
  const week2 = buildWholeAthleteWeek(input(startDates[1], phase, week1.sessions));
  const week3 = buildWholeAthleteWeek(input(startDates[2], phase, week2.sessions));
  const week4 = buildWholeAthleteWeek(input(startDates[3], phase, week3.sessions));
  return [week1, week2, week3, week4];
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('phase-aware bike quality stimulus library', () => {
  it('uses four genuinely different bike-quality workouts during base', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const weeks = fourWeekBlock('base', [
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
    const quality = weeks.map(qualityBike);

    expect(quality.map((session) => session.title)).toEqual([
      'VO2 · 6 × 4',
      'Tempo · Aerobic Strength',
      'VO2 · 8 × 2',
      'Over / Under · 4 × 10',
    ]);
    expect(quality.every((session) => session.durationMinutes === 105)).toBe(true);

    const shapes = quality.map((session) => prescriptionFor(session)?.workoutShapeId);
    expect(shapes).toEqual([
      'bike-vo2-6x4-r4',
      'bike-tempo-3x15-r5',
      'bike-vo2-8x2-r2',
      'bike-over-under-4x10-r5',
    ]);
    expect(new Set(shapes).size).toBe(4);
  });

  it('changes the stimulus library when the athlete enters build', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const weeks = fourWeekBlock('build', [
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    const quality = weeks.map(qualityBike);

    expect(quality.map((session) => session.title)).toEqual([
      'Threshold · Cruise Control',
      'VO2 · 5 × 5',
      'Threshold · Long Repeats',
      'Over / Under · 3 × 12',
    ]);

    const shapes = quality.map((session) => prescriptionFor(session)?.workoutShapeId);
    expect(shapes).toEqual([
      'bike-threshold-cruise-4x10-r5',
      'bike-vo2-5x5-r5',
      'bike-threshold-3x12-r4',
      'bike-over-under-3x12-r5',
    ]);
    expect(new Set(shapes).size).toBe(4);
  });
});
