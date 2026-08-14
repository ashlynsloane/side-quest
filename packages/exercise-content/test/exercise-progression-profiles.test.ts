import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '../src';

function exercise(name: string) {
  const match = exerciseSeed.find((item) => item.name === name);
  expect(match, `${name} should exist in exerciseSeed`).toBeDefined();
  return match!;
}

describe('exercise progression profiles', () => {
  it('keeps loadable basic movements useful for experienced athletes', () => {
    for (const name of [
      'Standing Calf Raise',
      'Bent-Knee Calf Raise',
      'Dead Bug',
      'Goblet Squat',
    ]) {
      const profile = exercise(name).progressionProfile;

      expect(profile).toBeDefined();
      expect(profile?.role).toBe('loadable_base');
      expect(profile?.progressionModes).toContain('external_load');
      expect(profile?.loadedCeiling).toBe('high');
      expect(profile?.preferLoadForExperiencedAthlete).toBe(true);
    }
  });

  it('models double-leg pogo as an impact-complexity regression rather than a loadable strength exercise', () => {
    const profile = exercise('Double-Leg Pogo Hop').progressionProfile;

    expect(profile).toMatchObject({
      family: 'vertical_pogo',
      role: 'skill_regression',
      bodyweightCeiling: 'moderate',
    });

    expect(profile?.progressionModes).toContain('impact_complexity');
    expect(profile?.progressionModes).not.toContain('external_load');
    expect(profile?.loadedCeiling).toBeUndefined();
  });

  it('models single-leg pogo as a more advanced reactive variant', () => {
    const profile = exercise('Single-Leg Pogo Hop').progressionProfile;

    expect(profile).toMatchObject({
      family: 'vertical_pogo',
      role: 'advanced_variant',
      bodyweightCeiling: 'high',
    });

    expect(profile?.progressionModes).toContain('impact_complexity');
    expect(profile?.progressionModes).toContain('balance_complexity');
  });

  it('keeps straight-knee and bent-knee calf work in distinct families', () => {
    expect(exercise('Standing Calf Raise').progressionProfile?.family)
      .toBe('calf_straight_knee');

    expect(exercise('Single-Leg Calf Raise').progressionProfile?.family)
      .toBe('calf_straight_knee');

    expect(exercise('Bent-Knee Calf Raise').progressionProfile?.family)
      .toBe('calf_bent_knee');

    expect(exercise('Seated Calf Raise').progressionProfile?.family)
      .toBe('calf_bent_knee');
  });

  it('requires loaded ceilings to correspond to an external-load progression path', () => {
    const profiled = exerciseSeed.filter(
      (item) => item.progressionProfile,
    );

    for (const item of profiled) {
      const profile = item.progressionProfile!;

      if (profile.loadedCeiling) {
        expect(
          profile.progressionModes,
          `${item.name} has loadedCeiling but no external_load progression`,
        ).toContain('external_load');
      }

      if (profile.preferLoadForExperiencedAthlete) {
        expect(
          profile.loadedCeiling,
          `${item.name} prefers load but has no loaded ceiling`,
        ).toBeDefined();

        expect(
          profile.progressionModes,
          `${item.name} prefers load but cannot progress through external load`,
        ).toContain('external_load');
      }
    }
  });

  it('distinguishes primary strength from balance-control variants', () => {
    const stableRdl = exercise('Single-Leg Romanian Deadlift');
    const bosuRdl = exercise('BOSU Single-Leg Romanian Deadlift');

    expect(stableRdl.trainingFamily)
      .toBe('unilateral_hip_hinge_strength');

    expect(bosuRdl.trainingFamily)
      .toBe('lower_body_control_balance');

    expect(stableRdl.trainingFamily)
      .not.toBe(bosuRdl.trainingFamily);
  });

  it('distinguishes hip hinge strength from hamstring knee-flexion work', () => {
    expect(exercise('Dumbbell Romanian Deadlift').trainingFamily)
      .toBe('hip_hinge_strength');

    expect(exercise('Slider Hamstring Curl').trainingFamily)
      .toBe('hamstring_knee_flexion');

    expect(exercise('Dumbbell Romanian Deadlift').trainingFamily)
      .not.toBe(exercise('Slider Hamstring Curl').trainingFamily);
  });

  it('groups stable bilateral hinge loading together despite equipment differences', () => {
    for (const name of [
      'Dumbbell Romanian Deadlift',
      'Barbell Romanian Deadlift',
      'Trap-Bar Deadlift',
    ]) {
      expect(exercise(name).trainingFamily)
        .toBe('hip_hinge_strength');
    }
  });


  it('treats dumbbell and barbell RDLs as loading variants of the same task', () => {
    const dumbbell = exercise('Dumbbell Romanian Deadlift').progressionProfile;
    const barbell = exercise('Barbell Romanian Deadlift').progressionProfile;

    expect(dumbbell?.family).toBe('romanian_deadlift');
    expect(barbell?.family).toBe('romanian_deadlift');

    expect(dumbbell?.loadedCeiling).toBe('high');
    expect(barbell?.loadedCeiling).toBe('high');

    expect(dumbbell?.progressionModes).toContain('external_load');
    expect(barbell?.progressionModes).toContain('external_load');
  });

  it('keeps deadlift and RDL as distinct progression families', () => {
    expect(exercise('Trap-Bar Deadlift').progressionProfile?.family)
      .toBe('deadlift');

    expect(exercise('Barbell Romanian Deadlift').progressionProfile?.family)
      .toBe('romanian_deadlift');

    expect(exercise('Trap-Bar Deadlift').progressionProfile?.family)
      .not.toBe(exercise('Barbell Romanian Deadlift').progressionProfile?.family);
  });

  it('does not treat BOSU single-leg RDL as the advanced rung of strength loading', () => {
    const stable = exercise('Single-Leg Romanian Deadlift');
    const bosu = exercise('BOSU Single-Leg Romanian Deadlift');

    expect(stable.progressionProfile?.family).toBe('single_leg_rdl');
    expect(stable.trainingFamily).toBe('unilateral_hip_hinge_strength');

    expect(bosu.progressionProfile?.family).not.toBe('single_leg_rdl');
    expect(bosu.trainingFamily).toBe('lower_body_control_balance');
  });

  it('groups hamstring curls by function while preserving Nordic as a demanding variant', () => {
    for (const name of [
      'Slider Hamstring Curl',
      'Stability-Ball Hamstring Curl',
      'Single-Leg Slider Hamstring Curl',
      'Seated Leg Curl',
      'Nordic Hamstring Lower',
    ]) {
      expect(exercise(name).progressionProfile?.family)
        .toBe('hamstring_curl');
    }

    expect(exercise('Nordic Hamstring Lower').progressionProfile?.role)
      .toBe('advanced_variant');

    expect(exercise('Single-Leg Slider Hamstring Curl').progressionProfile?.role)
      .toBe('advanced_variant');
  });

  it('treats forward and reverse loaded lunges as related alternatives', () => {
    expect(exercise('Kettlebell Forward Lunge').progressionProfile?.family)
      .toBe('weighted_lunge');

    expect(exercise('Kettlebell Reverse Lunge').progressionProfile?.family)
      .toBe('weighted_lunge');
  });


  it('requires loadable progression metadata to expose real external-load equipment', () => {
    const externallyLoadedEquipment = new Set([
      'dumbbell',
      'kettlebell',
      'barbell',
      'weight_plate',
      'trap_bar',
      'cable_machine',
      'leg_press',
      'hack_squat_machine',
      'leg_extension_machine',
      'leg_curl_machine',
      'calf_raise_machine',
      'chest_press_machine',
      'row_machine',
    ]);

    for (const item of exerciseSeed) {
      const profile = item.progressionProfile;
      if (!profile?.loadedCeiling) continue;

      const supportsExternalLoad = item.equipmentOptions.some((option) =>
        option.items.some((equipment) =>
          externallyLoadedEquipment.has(equipment.equipmentId),
        ),
      );

      expect(
        supportsExternalLoad,
        `${item.name} has a loaded ceiling but no external-load equipment option`,
      ).toBe(true);
    }
  });

});
