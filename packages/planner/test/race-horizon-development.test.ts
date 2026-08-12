import { describe, expect, it } from 'vitest';

import { buildRaceHorizonDevelopmentPlan } from '../src/race-horizon-development';

describe('race-horizon development plan', () => {
  it('builds the entire 70.3 horizon through race week instead of stopping at a 12-week block', () => {
    const plan = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      recentBoneStress: true,
    });

    expect(plan.totalWeeks).toBe(16);
    expect(plan.weeks[0]).toMatchObject({
      weekStartDate: '2026-08-17',
      weekNumber: 1,
      phase: 'base',
      loadIntent: 'build',
      runMode: 'return_to_run',
    });
    expect(plan.weeks.at(-1)).toMatchObject({
      weekStartDate: '2026-11-30',
      phase: 'race_week',
      loadIntent: 'race',
    });

    expect(plan.weeks.map((week) => week.phase)).toEqual([
      'base', 'base', 'base', 'base',
      'build', 'build', 'build', 'build', 'build', 'build', 'build',
      'peak', 'peak', 'peak',
      'taper',
      'race_week',
    ]);
  });

  it('creates explicit weekly bike development instead of random workout novelty', () => {
    const plan = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
    });

    expect(plan.weeks.slice(0, 3).map((week) => week.bikeQuality.title)).toEqual([
      'VO2 · 6 × 4',
      'Tempo · Aerobic Strength',
      'VO2 · 8 × 2',
    ]);
    expect(plan.weeks.slice(0, 3).map((week) => week.bikeSupport.title)).toEqual([
      'Aerobic · Steady Economy',
      'Aerobic · Cadence Economy',
      'Aerobic Strength · Low Cadence',
    ]);
    expect(plan.weeks.slice(0, 3).map((week) => week.longRide.title)).toEqual([
      'Long Ride · Aerobic Durability',
      'Long Ride · Fueling Practice',
      'Long Ride · Hills + Rolling Terrain',
    ]);
    expect(plan.weeks[3]).toMatchObject({
      loadIntent: 'recovery',
      bikeQuality: { title: 'Aerobic · Cadence Economy' },
      bikeSupport: { title: 'Recovery Spin · Aerobic Reset' },
      longRide: { title: 'Long Ride · Reduced Aerobic' },
    });

    const buildWeeks = plan.weeks.filter((week) => week.phase === 'build');
    expect(buildWeeks.map((week) => week.longRide.variantId)).toEqual([
      'tempo_inserts',
      'fueling_rehearsal',
      'rolling_durability',
      'reduced_aerobic',
      'strong_finish',
      'tempo_inserts',
      'fueling_rehearsal',
    ]);
    expect(buildWeeks.map((week) => week.bikeSupport.variantId)).toEqual([
      'rolling_aerobic',
      'low_cadence_strength',
      'tempo_inserts',
      'recovery_spin',
      'cadence_economy',
      'rolling_aerobic',
      'low_cadence_strength',
    ]);
    expect(buildWeeks.map((week) => week.bikeQuality.variantId)).toContain('3x12');
    expect(buildWeeks.map((week) => week.bikeQuality.familyId)).toContain('bike_over_under');

    const peakWeeks = plan.weeks.filter((week) => week.phase === 'peak');
    expect(peakWeeks.map((week) => week.longRide.variantId)).toContain('race_pace_blocks');
    expect(peakWeeks.map((week) => week.longRide.variantId)).toContain('full_rehearsal');
  });

  it('makes recovery/load intent explicit while keeping availability a ceiling rather than a workout target', () => {
    const plan = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'normal',
    });

    expect(plan.weeks[0]!.targetLoadFactor).toBe(0.88);
    expect(plan.weeks[1]!.targetLoadFactor).toBeGreaterThan(plan.weeks[0]!.targetLoadFactor);
    expect(plan.weeks[3]).toMatchObject({ loadIntent: 'recovery', targetLoadFactor: 0.82 });
    expect(plan.weeks[7]).toMatchObject({
      loadIntent: 'recovery',
      targetLoadFactor: 0.88,
      runSupport: { variantId: 'recovery' },
      longRun: { variantId: 'reduced' },
    });
    expect(plan.weeks[7]!.swimObjective).toMatch(/reduce swim stress/i);
    expect(plan.weeks[7]!.strengthObjective).toMatch(/reduce strength volume/i);
    expect(plan.weeks[14]).toMatchObject({ phase: 'taper', targetLoadFactor: 0.72 });
  });

  it('keeps the run horizon in return-to-run mode until the athlete state changes', () => {
    const rtr = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
    });
    const normal = buildRaceHorizonDevelopmentPlan({
      startDate: '2026-08-17',
      raceDate: '2026-12-05',
      goalType: 'ironman_70_3',
      runStatus: 'normal',
    });

    expect(rtr.weeks.every((week) => week.runMode === 'return_to_run')).toBe(true);
    expect(rtr.weeks.every((week) => /return-to-run/i.test(week.runObjective))).toBe(true);
    expect(normal.weeks[0]!.longRun.title).toBe('Long Run · Time on Feet');
    expect(normal.weeks.some((week) => week.longRun.variantId === 'race_rhythm_blocks')).toBe(true);
  });
});
