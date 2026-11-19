import { describe, expect, it } from 'vitest';
import { exerciseSeed } from '@circuit/exercise-content';
import type { PerformanceGoal, WeeklyPlanRequest } from '@circuit/domain';
import { generateWeeklyPlan, isBlueprintCompatibleWithRestrictions } from '../src/index';
import {
  allowedFastStartEquipment, excludedRegionsFromFastStart,
  fastStartCrossTrainingReview, fastStartMovementExclusions,
  fastStartNeedsSpecificReview, normalizeCrossTrainingModes,
  normalizeFastStartLocations, normalizeFastStartRestrictions,
  normalizeProtectedAreas, toggleFastStartLocation, toggleFastStartRestriction,
} from '../../../apps/mobile/src/services/first-week-input-policy';

describe('Milestone 1 synthetic first-run interface constraints', () => {
  it('migrates a legacy one-location draft without dropping its chosen venue', () => {
    expect(normalizeFastStartLocations(undefined, 'full_gym')).toEqual(['full_gym']);
    expect(normalizeFastStartRestrictions(undefined, 'upper_body')).toEqual(['upper_body']);
    expect(normalizeProtectedAreas(undefined)).toEqual([]);
  });
  it('supports both home and full gym without mixing their equipment', () => {
    const both = toggleFastStartLocation(['home'], 'full_gym');
    expect(both).toEqual(['home', 'full_gym']);
    const profiles = [
      { kind: 'home', equipment: ['mini_band', 'dumbbell'] as const },
      { kind: 'full_gym', equipment: ['barbell', 'cable_machine'] as const },
    ].map((item) => ({ kind: item.kind, equipment: [...item.equipment] }));
    expect(allowedFastStartEquipment(both, 'home', profiles)).toEqual(['mini_band', 'dumbbell']);
    expect(allowedFastStartEquipment(both, 'full_gym', profiles)).toEqual(['barbell', 'cable_machine']);
    expect(allowedFastStartEquipment(both, 'travel', profiles)).toEqual(['mini_band', 'dumbbell']);
    expect(toggleFastStartLocation(both, 'bodyweight')).toEqual(['bodyweight']);
    expect(toggleFastStartLocation(['bodyweight'], 'home')).toEqual(['home']);
  });
  it('combines broad upper and back restrictions instead of silently replacing one', () => {
    const choices = toggleFastStartRestriction(['upper_body'], 'back');
    expect(choices).toEqual(['upper_body', 'back']);
    const regions = excludedRegionsFromFastStart(choices, []);
    expect(regions).toContain('shoulders');
    expect(regions).toContain('upper_back');
    expect(regions).toContain('lower_back');
    expect(toggleFastStartRestriction(choices, 'none')).toEqual(['none']);
  });
  it('preserves protected Achilles side while excluding both sides until validated', () => {
    const areas = normalizeProtectedAreas([
      { area: 'achilles_calf', side: 'left' },
      { area: 'upper_back', side: 'right' },
    ]);
    expect(areas[0]).toEqual({ area: 'achilles_calf', side: 'left' });
    const regions = excludedRegionsFromFastStart(['none'], areas);
    for (const region of ['gastrocnemius', 'soleus', 'feet_ankles', 'upper_back', 'lats']) {
      expect(regions).toContain(region);
    }
    expect(fastStartMovementExclusions(['none'], areas)).toEqual({
      tags: ['jumping', 'high_impact'], patterns: ['jump_hop'],
    });
  });
  it('fails closed on unclassified other restriction', () => {
    expect(fastStartNeedsSpecificReview(['upper_body', 'other'])).toBe(true);
    expect(fastStartNeedsSpecificReview(['upper_body'])).toBe(false);
  });
  it('does not infer cardio clearance or duration from choosing a modality', () => {
    const chosen = normalizeCrossTrainingModes(['bike', 'elliptical', 'arc_trainer', 'bike']);
    expect(chosen).toEqual(['bike', 'elliptical', 'arc_trainer']);
    expect(fastStartCrossTrainingReview(chosen)).toEqual([
      { mode: 'bike', label: 'Cycling', status: 'requires_dose_review' },
      { mode: 'elliptical', label: 'Elliptical', status: 'requires_dose_review' },
      { mode: 'arc_trainer', label: 'Arc trainer', status: 'requires_dose_review' },
    ]);
  });
});

describe('Session purpose must agree with protected anatomy', () => {
  const upperTargets = [
    { region: 'upper_back' as const, emphasis: 'strong' as const },
    { region: 'chest' as const, emphasis: 'moderate' as const },
    { region: 'shoulders' as const, emphasis: 'moderate' as const },
  ];
  it('rejects an upper-body blueprint if its only strong focus is excluded', () => {
    expect(isBlueprintCompatibleWithRestrictions(upperTargets, ['upper_back'])).toBe(false);
    expect(isBlueprintCompatibleWithRestrictions(upperTargets, [])).toBe(true);
    expect(isBlueprintCompatibleWithRestrictions(upperTargets, [], [
      { region: 'upper_back', mode: 'keep_light' },
    ])).toBe(false);
  });
  it('refuses to relabel an upper-body restriction as an upper-body prescription', () => {
    const goal: PerformanceGoal = {
      id: 'synthetic_general_strength',
      type: 'general_offseason', name: 'General strength', weeksUntilEvent: 0,
      disciplines: [], priority: 'perform', sessionsPerWeek: 4,
      defaultSessionMinutes: 24, createdAt: '2026-11-19T00:00:00Z',
      updatedAt: '2026-11-19T00:00:00Z',
    };
    const req: WeeklyPlanRequest = {
      goal, weekStartDate: '2026-11-23',
      availableEquipment: ['bodyweight','dumbbell','kettlebell','long_band','mini_band','bench','box','bosu'],
      excludedRegions: ['chest','shoulders','upper_back','lats','biceps','triceps','forearms_grip'],
      excludedMovementTags: [], difficulty: 'intermediate', randomSeed: 'simulator-upper-body-safety',
    };
    const result = generateWeeklyPlan(req, { exercises: exerciseSeed });
    // A failed generation is an acceptable safety hold; a mislabeled upper-body
    // plan under these exclusions is not.
    if (result.ok) {
      expect(result.plan.sessions.some((session) =>
        session.title === 'Upper-Body Strength Foundation')).toBe(false);
      for (const session of result.plan.sessions) {
        for (const station of session.workout.stations) {
          for (const exercise of station.exercises) {
            const regions = exercise.exerciseSnapshot.bodyRegions.map((load) => load.region);
            for (const excluded of req.excludedRegions) {
              expect(regions.includes(excluded as typeof regions[number])).toBe(false);
            }
          }
        }
      }
    } else {
      expect(result.reason).toBe('WORKOUT_GENERATION_FAILED');
    }
  });
});
