import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, Exercise } from '@circuit/domain';
import { assessActiveWorkoutMutation } from '../src/active-workout-mutation';

function make(): GeneratedWorkout {
  const base = {
    id: 'core', bodyRegions: [{ region: 'core_anterior', role: 'primary', load: 1 }],
    jointLoads: [], movementPatterns: ['anti_extension'],
    impactLevel: 0, balanceDemand: 0, cardiovascularDemand: 0,
  } as unknown as Exercise;
  return {
    id: 'one', name: 'Workout', createdAt: '', randomSeed: '1',
    request: {} as GeneratedWorkout['request'],
    stations: [{ id: 'station', order: 0, durationSeconds: 240, format: 'amrap',
      purpose: 'base', exercises: [{
        exerciseId: 'core', exerciseSnapshot: base, equipmentOptionId: 'e',
        prescriptionId: 'p', target: 10, unit: 'total', order: 0,
      }],
    }],
    totalWorkSeconds: 240, totalRestSeconds: 0, estimatedElapsedSeconds: 240,
    requiredEquipment: [], targetRegions: ['core_anterior'],
    recentLoadAdjustments: [], source: 'generated',
  };
}
function change(workout: GeneratedWorkout, patch: Partial<Exercise>): GeneratedWorkout {
  return {
    ...workout, stations: workout.stations.map((station) => ({
      ...station, exercises: station.exercises.map((prescription) => ({
        ...prescription, exerciseSnapshot: { ...prescription.exerciseSnapshot, ...patch },
      })),
    })),
  };
}
describe('live workout substitutions cannot escalate dose', () => {
  it('allows an unchanged workout and a reduced target', () => {
    const original = make();
    expect(assessActiveWorkoutMutation(original, original).allowed).toBe(true);
    const reduced = structuredClone(original);
    reduced.stations[0]!.exercises[0]!.target = 8;
    expect(assessActiveWorkoutMutation(original, reduced).allowed).toBe(true);
    expect(assessActiveWorkoutMutation(reduced, original).allowed).toBe(false);
  });
  it('rejects newly introduced Achilles loading even when duration stays equal', () => {
    const original = make();
    const substitute = change(original, { jointLoads: [{ region: 'ankle', load: 2 }] });
    expect(assessActiveWorkoutMutation(original, substitute).allowed).toBe(false);
  });
  it('rejects increasing reps or session duration', () => {
    const original = make();
    const more = structuredClone(original);
    more.stations[0]!.exercises[0]!.target = 25;
    expect(assessActiveWorkoutMutation(original, more).allowed).toBe(false);
    more.stations[0]!.exercises[0]!.target = 10;
    more.stations[0]!.durationSeconds = 360;
    expect(assessActiveWorkoutMutation(original, more).allowed).toBe(false);
  });
  it('rejects increased impact and a newly loaded joint', () => {
    const original = make();
    expect(assessActiveWorkoutMutation(original, change(original, { impactLevel: 4 })).allowed).toBe(false);
    expect(assessActiveWorkoutMutation(original, change(original, {
      jointLoads: [{ region: 'thoracic_spine', load: 2 }],
    })).allowed).toBe(false);
  });
  it('rejects exercise additions and incompatible units', () => {
    const original = make();
    const more = structuredClone(original);
    more.stations[0]!.exercises.push({ ...more.stations[0]!.exercises[0]!, exerciseId: 'added' });
    expect(assessActiveWorkoutMutation(original, more).allowed).toBe(false);
    const incompatible = structuredClone(original);
    incompatible.stations[0]!.exercises[0]!.unit = 'seconds';
    expect(assessActiveWorkoutMutation(original, incompatible).allowed).toBe(false);
  });
  it('blocks increased calf-muscle loading even when Achilles was already a target', () => {
    const original = make();
    const lighter = change(original, { bodyRegions: [
      { region: 'gastrocnemius', role: 'primary', load: 1 },
    ] });
    const heavier = change(lighter, { bodyRegions: [
      { region: 'gastrocnemius', role: 'primary', load: 4 },
    ] });
    expect(assessActiveWorkoutMutation(lighter, heavier).allowed).toBe(false);
  });
  it('rejects a newly introduced impact movement despite equal duration', () => {
    const original = make();
    const modified = change(original, { movementPatterns: ['anti_extension','jump_hop'] });
    expect(assessActiveWorkoutMutation(original, modified).allowed).toBe(false);
  });
  it('rejects corrupted demand metadata rather than treating NaN as a reduction', () => {
    const original = make();
    const modified = change(original, { impactLevel: Number.NaN as Exercise['impactLevel'] });
    expect(assessActiveWorkoutMutation(original, modified).allowed).toBe(false);
  });

});
