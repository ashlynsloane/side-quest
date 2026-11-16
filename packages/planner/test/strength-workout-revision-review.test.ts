import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';
import { evaluateStrengthWorkoutRevision } from '../src/strength-workout-revision-review';

const exercise = (id: string, target: number, load = 5) => ({
  exerciseId: id, exerciseSnapshot: { id, name: id } as unknown as GeneratedWorkout['stations'][number]['exercises'][number]['exerciseSnapshot'],
  equipmentOptionId: 'equipment-a', prescriptionId: 'rx-a',
  target, unit: 'total' as const, order: id === 'e1' ? 0 : 1,
  userLoadValue: load, userLoadUnit: 'lb' as const,
});
const original = (): GeneratedWorkout => ({
  id: 'workout-a', name: 'Synthetic strength', createdAt: '2026-11-14T00:00:00Z',
  randomSeed: 'synthetic', request: {} as GeneratedWorkout['request'],
  stations: [{
    id: 'station-a', order: 0, durationSeconds: 1800, format: 'amrap',
    purpose: 'synthetic', exercises: [exercise('e1', 12), exercise('e2', 10)],
  }],
  totalWorkSeconds: 1800, totalRestSeconds: 600, estimatedElapsedSeconds: 2400,
  requiredEquipment: [], targetRegions: [], recentLoadAdjustments: [],
  source: 'generated',
});
const shortened = (): GeneratedWorkout => ({
  ...original(), estimatedElapsedSeconds: 1920,
  totalWorkSeconds: 1500, totalRestSeconds: 420,
  stations: [{ ...original().stations[0]!, durationSeconds: 1500,
    exercises: [exercise('e1', 10), exercise('e2', 8)] }],
});
const review = (proposed: GeneratedWorkout, maximumMinutes = 32) =>
  evaluateStrengthWorkoutRevision({ original: original(), proposed, maximumMinutes });

describe('strength workout revision is structural only, never clinical authorization', () => {
  it('checks a bounded reduction without approving or modifying its source', () => {
    const source = original();
    const before = JSON.stringify(source);
    const result = evaluateStrengthWorkoutRevision({
      original: source, proposed: shortened(), maximumMinutes: 32,
    });
    expect(result).toEqual({
      structurallyValid: true, reasons: [],
      requiresCurrentRestrictionReview: true, autoApproved: false,
    });
    expect(JSON.stringify(source)).toBe(before);
  });
  it('refuses a duration cap that the actual revision exceeds', () => {
    expect(review(shortened(), 30).structurallyValid).toBe(false);
  });
  it('refuses an unchanged full workout masquerading as a shorter workout', () => {
    expect(review(original()).structurallyValid).toBe(false);
  });
  it('refuses any repetition or load increase even when elapsed time decreases', () => {
    const increasedReps = shortened();
    increasedReps.stations[0]!.exercises[0]!.target = 13;
    expect(review(increasedReps).structurallyValid).toBe(false);
    const increasedLoad = shortened();
    increasedLoad.stations[0]!.exercises[0]!.userLoadValue = 9;
    expect(review(increasedLoad).structurallyValid).toBe(false);
  });
  it('refuses replacements, unknown exercise snapshots and ambiguous load units', () => {
    const changed = shortened();
    changed.stations[0]!.exercises[0]!.exerciseId = 'replacement';
    expect(review(changed).structurallyValid).toBe(false);
    const changedSnapshot = shortened();
    changedSnapshot.stations[0]!.exercises[0]!.exerciseSnapshot.name = 'other';
    expect(review(changedSnapshot).structurallyValid).toBe(false);
    const changedUnits = shortened();
    changedUnits.stations[0]!.exercises[0]!.userLoadUnit = 'kg';
    expect(review(changedUnits).structurallyValid).toBe(false);
  });
  it('refuses duplicate stations, duplicate exercises and missing station identity', () => {
    const duplicateStation = shortened();
    duplicateStation.stations.push({ ...duplicateStation.stations[0]! });
    expect(review(duplicateStation).structurallyValid).toBe(false);
    const duplicateExercise = shortened();
    duplicateExercise.stations[0]!.exercises.push({
      ...duplicateExercise.stations[0]!.exercises[0]!,
    });
    expect(review(duplicateExercise).structurallyValid).toBe(false);
    const missingStation = shortened();
    missingStation.stations[0]!.id = 'different';
    expect(review(missingStation).structurallyValid).toBe(false);
  });
  it('rejects hidden changes to generator restrictions or workout provenance', () => {
    const changed = shortened();
    changed.request = { ...changed.request, recoveryAware: false };
    expect(review(changed).structurallyValid).toBe(false);
    const equipment = shortened();
    equipment.requiredEquipment = ['other-equipment' as GeneratedWorkout['requiredEquipment'][number]];
    expect(review(equipment).structurallyValid).toBe(false);
    const provenance = shortened();
    provenance.source = 'manual';
    expect(review(provenance).structurallyValid).toBe(false);
  });
  it('refuses altered workout identity, station purpose or exercise instructions', () => {
    const identity = shortened();
    identity.id = 'other-workout';
    expect(review(identity).structurallyValid).toBe(false);
    const purpose = shortened();
    purpose.stations[0]!.purpose = 'higher intensity';
    expect(review(purpose).structurallyValid).toBe(false);
    const guidance = shortened();
    guidance.stations[0]!.exercises[0]!.adaptationNote = 'Add explosive reps';
    expect(review(guidance).structurallyValid).toBe(false);
  });
  it('rejects changed or injected metadata outside the explicitly reduced dose', () => {
    const changedName = shortened();
    changedName.name = 'Different workout';
    expect(review(changedName).structurallyValid).toBe(false);
    const addedWorkoutField = shortened() as GeneratedWorkout & { bonus?: string };
    addedWorkoutField.bonus = 'extra training';
    expect(review(addedWorkoutField).structurallyValid).toBe(false);
    const changedStation = shortened();
    changedStation.stations[0]!.purpose = 'Different execution instructions';
    expect(review(changedStation).structurallyValid).toBe(false);
    const extraStation = shortened();
    const station = extraStation.stations[0]! as typeof extraStation.stations[number] & {
      additionalRounds?: number;
    };
    station.additionalRounds = 3;
    expect(review(extraStation).structurallyValid).toBe(false);
    const changedExercise = shortened();
    const exercise = changedExercise.stations[0]!.exercises[0]! as
      typeof changedExercise.stations[number]['exercises'][number] & { extraSets?: number };
    exercise.extraSets = 5;
    expect(review(changedExercise).structurallyValid).toBe(false);
  });
  it('fails closed on malformed time and incomplete workout structures', () => {
    const invalid = shortened();
    invalid.totalRestSeconds = Number.NaN;
    expect(review(invalid).structurallyValid).toBe(false);
    const incomplete = shortened();
    incomplete.stations = [];
    expect(review(incomplete).structurallyValid).toBe(false);
    const badAccounting = shortened();
    badAccounting.estimatedElapsedSeconds = 100;
    expect(review(badAccounting).structurallyValid).toBe(false);
  });
});
