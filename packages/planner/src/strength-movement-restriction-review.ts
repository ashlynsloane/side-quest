import type { GeneratedWorkout, WorkoutExercisePrescription } from '@circuit/domain';
import type {
  AthleteTrainingSafetyContext, ProtectedMovement, TrainingSafetyPolicy,
} from './training-safety-context-sqlite';

/**
 * Conservative movement-tag diagnostic. Exercise catalog annotations are not
 * medical clearance or a complete biomechanical model. No result authorizes
 * execution or removes an athlete's existing restrictions.
 */
export type RestrictedExerciseStatus =
  | 'potential_conflict' | 'needs_individual_review'
  | 'no_tagged_conflict_detected' | 'routine_not_applicable';

export interface RestrictedExerciseFinding {
  stationId: string;
  exerciseId: string;
  exerciseName: string;
  status: RestrictedExerciseStatus;
  associatedRestrictions: ProtectedMovement[];
  explanation: string;
  executableWorkoutApproved: false;
}

export interface StrengthMovementRestrictionAssessment {
  schemaVersion: 1;
  track: TrainingSafetyPolicy['track'];
  protectedMovements: ProtectedMovement[];
  findings: RestrictedExerciseFinding[];
  potentialConflictCount: number;
  needsIndividualReviewCount: number;
  /**
   * Matching is an aid to restriction review, NOT a determination that a
   * movement is safe. Partial catalog metadata is treated conservatively.
   */
  matchingIsClinicalClearance: false;
  canApplyWorkout: false;
  executableWorkoutApproved: false;
}

type ExerciseMetadata = WorkoutExercisePrescription['exerciseSnapshot'];
const MOVEMENTS = new Set([
  'squat', 'lunge', 'hinge', 'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull', 'carry', 'rotation', 'anti_rotation',
  'trunk_flexion', 'anti_extension', 'lateral_flexion', 'jump_hop',
  'balance', 'locomotion', 'mobility',
]);
const AVOIDANCE_TAGS = new Set([
  'overhead', 'shoulder_weight_bearing', 'wrist_weight_bearing',
  'hanging', 'deep_knee_flexion', 'single_leg_loading', 'jumping',
  'high_impact', 'rotation', 'spinal_flexion', 'kneeling',
  'floor_required', 'unstable_surface', 'high_balance_demand',
  'complex_coordination',
]);
const BODY_REGIONS = new Set([
  'chest', 'shoulders', 'upper_back', 'lats', 'biceps', 'triceps',
  'forearms_grip', 'core_anterior', 'core_lateral', 'core_rotation',
  'lower_back', 'glutes', 'hamstrings', 'quadriceps',
  'hip_abductors', 'hip_adductors', 'hip_flexors', 'gastrocnemius',
  'soleus', 'tibialis_anterior', 'feet_ankles',
]);
const JOINT_REGIONS = new Set([
  'neck', 'shoulder', 'elbow', 'wrist_hand', 'thoracic_spine',
  'lumbar_spine', 'hip', 'knee', 'ankle', 'foot',
]);
function knownArray(value: unknown, allowed: Set<string>): value is string[] {
  return Array.isArray(value) && value.every(v =>
    typeof v === 'string' && allowed.has(v));
}
function knownLoads(
  value: unknown,
  allowed: Set<string>,
): value is Array<{ region: string; load: number }> {
  return Array.isArray(value) && value.every(v =>
    v !== null && typeof v === 'object'
    && typeof v.region === 'string' && allowed.has(v.region)
    && typeof v.load === 'number' && Number.isFinite(v.load)
    && v.load >= 0 && v.load <= 4
    && Number.isInteger(v.load),
  );
}
function validMetadata(value: ExerciseMetadata): boolean {
  return !!value && typeof value.id === 'string'
    && knownArray(value.avoidanceTags, AVOIDANCE_TAGS)
    && knownArray(value.movementPatterns, MOVEMENTS)
    && knownLoads(value.jointLoads, JOINT_REGIONS)
    && knownLoads(value.bodyRegions, BODY_REGIONS)
    && typeof value.impactLevel === 'number'
    && Number.isInteger(value.impactLevel)
    && value.impactLevel >= 0 && value.impactLevel <= 4;
}

type TagCheck = 'flag' | 'uncertain' | 'not_flagged';

function checkRestriction(
  restriction: ProtectedMovement,
  exercise: WorkoutExercisePrescription,
): TagCheck {
  const m = exercise.exerciseSnapshot;
  const patterns = m.movementPatterns;
  const tags = m.avoidanceTags;
  if (restriction === 'other_movement') return 'uncertain';
  if (restriction === 'impact_running') {
    return m.impactLevel >= 3 || tags.includes('high_impact')
      || tags.includes('jumping') || patterns.includes('jump_hop')
      ? 'flag' : 'not_flagged';
  }
  if (restriction === 'loaded_spinal_rotation') {
    if (patterns.includes('rotation') || tags.includes('rotation')) {
      if (typeof exercise.userLoadValue === 'number' && exercise.userLoadValue > 0) {
        return 'flag';
      }
      return 'uncertain'; // Equipment/bodyweight can still load rotation.
    }
    if (patterns.includes('anti_rotation')) return 'uncertain';
    return 'not_flagged';
  }
  if (restriction === 'shoulder_loading') {
    const joint = m.jointLoads.find(load => load.region === 'shoulder');
    const region = m.bodyRegions.find(load => load.region === 'shoulders');
    return (joint && joint.load > 0) || (region && region.load > 0)
      || tags.includes('overhead') || tags.includes('shoulder_weight_bearing')
      ? 'flag' : 'not_flagged';
  }
  if (restriction === 'deep_hip_flexion') {
    // Motion depth cannot be inferred from a squat/lunge movement tag.
    // Tagging only creates a review task; it never asserts hip clearance.
    return patterns.includes('squat') || patterns.includes('lunge')
      || patterns.includes('hinge') || patterns.includes('mobility')
      ? 'uncertain' : 'not_flagged';
  }
  return 'uncertain';
}

function interpretExercise(
  stationId: string,
  exercise: WorkoutExercisePrescription,
  restrictions: ProtectedMovement[],
  track: TrainingSafetyPolicy['track'],
): RestrictedExerciseFinding {
  const name = typeof exercise.exerciseSnapshot?.name === 'string'
    ? exercise.exerciseSnapshot.name : 'Unidentified exercise';
  const base = {
    stationId, exerciseId: exercise.exerciseId,
    exerciseName: name, executableWorkoutApproved: false as const,
  };
  if (!validMetadata(exercise.exerciseSnapshot)
    || !exercise.exerciseId?.trim()
    || exercise.exerciseSnapshot.id !== exercise.exerciseId) {
    return {
      ...base, status: 'needs_individual_review',
      associatedRestrictions: restrictions,
      explanation: 'Exercise catalog annotations or identity are incomplete; movement-specific restriction checks cannot be trusted.',
    };
  }
  if (restrictions.length === 0) {
    return {
      ...base,
      status: track === 'routine_training_review'
        ? 'routine_not_applicable' : 'needs_individual_review',
      associatedRestrictions: [],
      explanation: track === 'routine_training_review'
        ? 'No protected movement is currently recorded; this is not an exercise safety determination.'
        : 'This is not uncomplicated routine training. Review injury-specific exercise applicability.',
    };
  }
  const flagged: ProtectedMovement[] = [];
  const uncertain: ProtectedMovement[] = [];
  for (const restriction of restrictions) {
    const match = checkRestriction(restriction, exercise);
    if (match === 'flag') flagged.push(restriction);
    if (match === 'uncertain') uncertain.push(restriction);
  }
  if (flagged.length) {
    return {
      ...base, status: 'potential_conflict', associatedRestrictions: flagged,
      explanation: 'Catalog metadata indicates loading or movement that may conflict with a protected movement; do not infer clearance from reduced exercise dose.',
    };
  }
  // Known hazards take precedence over missing metadata. If all movement
  // annotations are empty and none establish a conflict, still require review:
  // an impact rating alone cannot certify shoulder/spine/hip compatibility.
  if (exercise.exerciseSnapshot.movementPatterns.length === 0
    && exercise.exerciseSnapshot.avoidanceTags.length === 0
    && exercise.exerciseSnapshot.jointLoads.length === 0
    && exercise.exerciseSnapshot.bodyRegions.length === 0) {
    return {
      ...base, status: 'needs_individual_review',
      associatedRestrictions: restrictions,
      explanation: 'All exercise movement annotations are absent; a low impact or reduced dose estimate cannot establish restriction compatibility.',
    };
  }
  if (uncertain.length) {
    return {
      ...base, status: 'needs_individual_review', associatedRestrictions: uncertain,
      explanation: 'Movement depth, external loading or rehabilitation-specific applicability cannot be determined from catalog tags.',
    };
  }
  return {
    ...base, status: 'no_tagged_conflict_detected', associatedRestrictions: restrictions,
    explanation: 'No tagged conflict was detected. Unannotated mechanics and individual clinical restrictions still require review.',
  };
}

export function assessStrengthMovementRestrictions(
  workout: GeneratedWorkout,
  context: AthleteTrainingSafetyContext,
  policy: TrainingSafetyPolicy,
): StrengthMovementRestrictionAssessment {
  if (!workout || !Array.isArray(workout.stations)
    || !context || context.schemaVersion !== 1
    || context.executableWorkoutApproved !== false
    || !Array.isArray(context.activeProtectedMovements)
    || context.activeProtectedMovements.some(movement => ![
      'impact_running', 'loaded_spinal_rotation', 'shoulder_loading',
      'deep_hip_flexion', 'other_movement',
    ].includes(movement))
    || !policy || policy.schemaVersion !== 1
    || policy.executableWorkoutApproved !== false
    || policy.canApproveExerciseRevision !== false
    || (policy.track === 'routine_training_review'
      && (context.activeProtectedMovements.length > 0
        || context.legacyRestrictionReported !== false
        || context.ptProfile === 'active'
        || context.ptProfile === 'unknown'
        || context.symptoms === 'reported'
        || context.symptoms === 'unknown'
        || context.intent !== 'general_training'))) {
    throw new Error('Movement restriction review has incomplete safety inputs.');
  }
  const protectedMovements = [...new Set(context.activeProtectedMovements)];
  const findings: RestrictedExerciseFinding[] = [];
  for (const station of workout.stations) {
    if (!station || !station.id?.trim() || !Array.isArray(station.exercises)) {
      throw new Error('Movement restriction review contains an invalid station.');
    }
    for (const exercise of station.exercises) {
      findings.push(interpretExercise(
        station.id, exercise, protectedMovements, policy.track,
      ));
    }
  }
  if (findings.length === 0) {
    throw new Error('Movement restriction review cannot interpret an empty workout.');
  }
  return {
    schemaVersion: 1, track: policy.track, protectedMovements,
    findings,
    potentialConflictCount: findings.filter(f => f.status === 'potential_conflict').length,
    needsIndividualReviewCount: findings.filter(f =>
      f.status === 'needs_individual_review').length,
    matchingIsClinicalClearance: false,
    canApplyWorkout: false, executableWorkoutApproved: false,
  };
}
