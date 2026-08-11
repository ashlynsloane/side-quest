import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkoutGenerationRequest } from '@circuit/domain';
import { exerciseSeed, machineExerciseSeed } from '@circuit/exercise-content';
import {
  buildStationPlan,
  estimateStationRounds,
  generateWorkout,
  normalizeStationDensity,
} from '@circuit/generator';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

const baseRequest: WorkoutGenerationRequest = {
  workMinutes: 36,
  allowedStationMinutes: [4, 6, 8, 12],
  restSeconds: 60,
  exercisesPerStation: 'mixed',
  focusTargets: [],
  excludedRegions: [],
  excludedMovementTags: [],
  regionRestrictions: [],
  excludedMovementPatterns: [],
  availableEquipment: ['dumbbell', 'kettlebell', 'long_band', 'mini_band', 'bench', 'box', 'cable_machine', 'leg_press'],
  workoutStyle: 'strength_cardio_amrap',
  difficulty: 'intermediate',
  maximumImpact: 3,
  recoveryAware: true,
  avoidPreviousWorkoutExercises: false,
  favorFamiliarExercises: false,
  allowUnfamiliarExercises: true,
  minimizeEquipmentChanges: false,
  randomSeed: 'density-contract',
};

describe('Station Architecture V2 + machine strength', () => {
  it('treats six minutes as a first-class station duration', () => {
    expect(buildStationPlan(30, [6])).toEqual([6, 6, 6, 6, 6]);

    const mixedPlan = buildStationPlan(40, [4, 6, 8, 12]);
    expect(mixedPlan).not.toBeNull();
    if (!mixedPlan) return;

    expect(mixedPlan.reduce((sum, minutes) => sum + minutes, 0)).toBe(40);
    expect(mixedPlan).toContain(6);
    expect(mixedPlan.filter((minutes) => minutes === 12).length).toBeLessThanOrEqual(1);
  });

  it('keeps 12-minute stations away from explicit two-exercise structures', () => {
    const explicitTwo = normalizeStationDensity({
      ...baseRequest,
      exercisesPerStation: 2,
    });
    expect(explicitTwo.exercisesPerStation).toBe(2);
    expect(explicitTwo.allowedStationMinutes).toEqual([4, 6, 8]);

    const mixed = normalizeStationDensity(baseRequest);
    expect(mixed.exercisesPerStation).toBe('mixed');
    expect(mixed.allowedStationMinutes).toEqual([4, 6, 8, 12]);

    const onlyTwelve = normalizeStationDensity({
      ...baseRequest,
      exercisesPerStation: 2,
      allowedStationMinutes: [12],
    });
    expect(onlyTwelve.allowedStationMinutes).toEqual([12]);
    expect(onlyTwelve.exercisesPerStation).toBe(3);
  });

  it('allows mixed long stations only when they contain three movements', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 40,
        allowedStationMinutes: [4, 6, 8, 12],
        randomSeed: 'mixed-long-station-v2',
      },
      { exercises: exerciseSeed },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const longStations = result.workout.stations.filter(
      (station) => station.durationSeconds === 12 * 60,
    );
    expect(longStations.length).toBeGreaterThan(0);
    expect(
      longStations.every((station) => station.exercises.length === 3),
    ).toBe(true);
  });

  it('uses round estimates to prevent fast two-movement six-minute loops', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 30,
        allowedStationMinutes: [6],
        randomSeed: 'six-minute-round-density',
      },
      { exercises: exerciseSeed },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.workout.stations).toHaveLength(5);
    expect(
      result.workout.stations.every(
        (station) => station.durationSeconds === 6 * 60,
      ),
    ).toBe(true);

    for (const station of result.workout.stations) {
      expect([2, 3]).toContain(station.exercises.length);
      if (station.exercises.length === 2) {
        expect(estimateStationRounds(station)).toBeLessThanOrEqual(5.25);
      }
    }
  });

  it('still promotes twelve-only mixed generation to three movements', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 36,
        allowedStationMinutes: [12],
        randomSeed: 'three-long-stations',
      },
      { exercises: exerciseSeed },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.workout.stations).toHaveLength(3);
    expect(
      result.workout.stations.every(
        (station) => station.durationSeconds === 12 * 60,
      ),
    ).toBe(true);
    expect(
      result.workout.stations.every(
        (station) => station.exercises.length === 3,
      ),
    ).toBe(true);
  });

  it('adds machine exercises as real strength-only catalog content', () => {
    expect(machineExerciseSeed.length).toBeGreaterThanOrEqual(10);
    expect(machineExerciseSeed.map((exercise) => exercise.name)).toEqual(expect.arrayContaining([
      'Lat Pulldown',
      'Reverse Fly Machine',
      'Machine Chest Press',
      'Triceps Pressdown',
      'Leg Press',
      'Seated Leg Curl',
    ]));
    for (const exercise of machineExerciseSeed) {
      expect(exercise.suitableForAmrap).toBe(false);
      expect(
        exercise.prescriptions.some(
          (prescription) => prescription.style === 'strength',
        ),
      ).toBe(true);
      expect(
        exerciseSeed.some(
          (catalogExercise) => catalogExercise.id === exercise.id,
        ),
      ).toBe(true);
    }
  });

  it('keeps machine exercises out of ordinary AMRAP generation', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 32,
        allowedStationMinutes: [8],
        randomSeed: 'no-machines-in-amrap',
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.workout.stations.flatMap((station) =>
      station.exercises.map((item) => item.exerciseId),
    );
    expect(ids.some((id) => id.startsWith('ex_machine_'))).toBe(false);
  });

  it('wires a separate set-based machine workflow with weekly-dose and protection boundaries', () => {
    const train = source('apps/mobile/src/components/train-screen-v3.tsx');
    const route = source('apps/mobile/src/app/machine-strength.tsx');
    const screen = source('apps/mobile/src/components/machine-strength-screen.tsx');
    const runtime = source('apps/mobile/src/services/machine-strength.ts');

    expect(train).toContain('Machine strength');
    expect(train).toContain("router.push('/machine-strength'");
    expect(route).toContain('MachineStrengthScreen');
    expect(screen).toContain('Heavier sets. Fewer repetitions. No station timer.');
    expect(screen).toContain('Save machine session');
    expect(screen).toContain('exerciseSets');
    expect(screen).toContain('one supplemental machine session per week');
    expect(runtime).toContain("mode: 'machine_sets'");
    expect(runtime).toContain("checkIn?.status === 'unable_to_train'");
    expect(runtime).toContain("checkIn?.status === 'muscle_soreness'");
    expect(runtime).toContain('machineExerciseAllowed');
    expect(runtime).toContain("repRange: [number, number]");
  });

  it('preserves the ordinary circuit architecture as a separate training stimulus', () => {
    const runtime = source('apps/mobile/src/services/machine-strength.ts');
    const machineContent = source('packages/exercise-content/src/machine-exercises.ts');

    expect(runtime).toContain("workoutStyle: 'strength_amrap'");
    expect(runtime).toContain('supplemental: true');
    expect(machineContent).toContain('suitableForAmrap: false');
  });
});

