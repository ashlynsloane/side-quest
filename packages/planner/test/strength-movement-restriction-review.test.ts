import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, Exercise } from '@circuit/domain';
import {
  assessStrengthMovementRestrictions,
} from '../src/strength-movement-restriction-review';
import type {
  AthleteTrainingSafetyContext, ProtectedMovement, TrainingSafetyPolicy,
} from '../src/training-safety-context-sqlite';

function context(
  protectedMovements: ProtectedMovement[],
  intent: AthleteTrainingSafetyContext['intent'] = 'injury_rehabilitation',
): AthleteTrainingSafetyContext {
  return {
    schemaVersion: 1, athleteId: 'synthetic-athlete',
    intent, activeProtectedMovements: protectedMovements,
    legacyRestrictionReported: false, ptProfile: 'inactive',
    symptoms: 'normal', latestEventId: null, events: [],
    executableWorkoutApproved: false,
  };
}
function policy(
  track: TrainingSafetyPolicy['track'],
  count = 1,
): TrainingSafetyPolicy {
  return {
    schemaVersion: 1, track,
    clinicianDocumentRequiredForRoutineTraining: false,
    requiresRestrictionAwareExerciseReview: track !== 'routine_training_review',
    knownRestrictionCount: count, reasons: [],
    canApproveExerciseRevision: false,
    executableWorkoutApproved: false,
    restrictionMatchingImplemented: false,
  };
}
function workout(
  metadata: Partial<Exercise> = {},
  userLoadValue?: number,
): GeneratedWorkout {
  const exercise: Exercise = {
    id: 'exercise-1', name: 'Synthetic exercise',
    avoidanceTags: [], movementPatterns: [], bodyRegions: [],
    jointLoads: [], impactLevel: 0, ...metadata,
  } as Exercise;
  return {
    id: 'workout-1',
    stations: [{
      id: 'station-1', exercises: [{
        exerciseId: 'exercise-1', exerciseSnapshot: exercise,
        target: 8, unit: 'total', order: 0, equipmentOptionId: 'bodyweight',
        prescriptionId: 'rx',
        ...(userLoadValue === undefined ? {} : { userLoadValue }),
      }],
    }],
  } as GeneratedWorkout;
}
function first(
  restriction: ProtectedMovement,
  metadata: Partial<Exercise>,
  userLoadValue?: number,
) {
  const result = assessStrengthMovementRestrictions(
    workout(metadata, userLoadValue),
    context([restriction]), policy('restriction_aware_review'),
  );
  expect(result.executableWorkoutApproved).toBe(false);
  expect(result.canApplyWorkout).toBe(false);
  expect(result.matchingIsClinicalClearance).toBe(false);
  return result.findings[0]!;
}

describe('conservative movement-specific restriction matching', () => {
  it('flags high-impact and jumping but does not equate all locomotion with running', () => {
    expect(first('impact_running', { impactLevel: 4 }).status)
      .toBe('potential_conflict');
    expect(first('impact_running', { avoidanceTags: ['high_impact'] }).status)
      .toBe('potential_conflict');
    expect(first('impact_running', { movementPatterns: ['jump_hop'] }).status)
      .toBe('potential_conflict');
    expect(first('impact_running', {
      movementPatterns: ['locomotion'], impactLevel: 0,
    }).status).toBe('no_tagged_conflict_detected');
  });
  it('flags explicitly loaded rotation, and reviews ambiguous or anti-rotation', () => {
    expect(first('loaded_spinal_rotation', {
      movementPatterns: ['rotation'],
    }, 12).status).toBe('potential_conflict');
    expect(first('loaded_spinal_rotation', {
      avoidanceTags: ['rotation'],
    }).status).toBe('needs_individual_review');
    expect(first('loaded_spinal_rotation', {
      movementPatterns: ['anti_rotation'],
    }).status).toBe('needs_individual_review');
  });
  it('flags shoulder joint load, muscle-region load and shoulder weight bearing', () => {
    expect(first('shoulder_loading', {
      jointLoads: [{ region: 'shoulder', load: 2 }],
    }).status).toBe('potential_conflict');
    expect(first('shoulder_loading', {
      bodyRegions: [{ region: 'shoulders', load: 1, role: 'secondary' }],
    }).status).toBe('potential_conflict');
    expect(first('shoulder_loading', {
      avoidanceTags: ['overhead'],
    }).status).toBe('potential_conflict');
  });
  it('never equates squat/lunge tags with a measured hip-flexion angle', () => {
    expect(first('deep_hip_flexion', {
      movementPatterns: ['squat'],
    }).status).toBe('needs_individual_review');
    expect(first('deep_hip_flexion', {
      movementPatterns: ['lunge'],
    }).status).toBe('needs_individual_review');
    expect(first('deep_hip_flexion', {
      movementPatterns: ['hinge'],
    }).status).toBe('needs_individual_review');
  });
  it('rejects missing exercise metadata and identity mismatch as individual-review needs', () => {
    expect(first('shoulder_loading', {
      jointLoads: undefined,
    }).status).toBe('needs_individual_review');
    expect(first('impact_running', {
      id: 'different-id',
    }).status).toBe('needs_individual_review');
  });
  it('unqualified other-movement restriction requires review of every candidate exercise', () => {
    expect(first('other_movement', {}).status).toBe('needs_individual_review');
  });
  it('allows routine training to omit provider paperwork without granting exercise approval', () => {
    const result = assessStrengthMovementRestrictions(
      workout(), context([], 'general_training'),
      policy('routine_training_review', 0),
    );
    expect(result.findings[0]?.status).toBe('routine_not_applicable');
    expect(result.executableWorkoutApproved).toBe(false);
    expect(result.canApplyWorkout).toBe(false);
  });
  it('does not treat rehabilitation without tagged movement as uncomplicated routine training', () => {
    const result = assessStrengthMovementRestrictions(
      workout(), context([]), policy('rehabilitation_review', 0),
    );
    expect(result.findings[0]?.status).toBe('needs_individual_review');
    expect(result.canApplyWorkout).toBe(false);
  });
  it('fails closed on inconsistent routine policy, empty workouts and malformed stations', () => {
    expect(() => assessStrengthMovementRestrictions(
      workout(), context(['shoulder_loading'], 'general_training'),
      policy('routine_training_review', 0),
    )).toThrow(/incomplete safety inputs/);
    const falselyRoutine = context([], 'general_training');
    falselyRoutine.legacyRestrictionReported = true;
    expect(() => assessStrengthMovementRestrictions(
      workout(), falselyRoutine, policy('routine_training_review', 0),
    )).toThrow(/incomplete safety inputs/);
    const unrecognizedMovement = context([
      'unrecognized_pattern' as ProtectedMovement,
    ]);
    expect(() => assessStrengthMovementRestrictions(
      workout(), unrecognizedMovement, policy('restriction_aware_review'),
    )).toThrow(/incomplete safety inputs/);
    expect(() => assessStrengthMovementRestrictions(
      { stations: [] } as unknown as GeneratedWorkout,
      context([], 'general_training'), policy('routine_training_review', 0),
    )).toThrow(/empty workout/);
    expect(() => assessStrengthMovementRestrictions(
      { stations: [{ id: 'station-1', exercises: null }] } as unknown as GeneratedWorkout,
      context(['shoulder_loading']), policy('rehabilitation_review'),
    )).toThrow(/invalid station/);
  });
});
