import type { BodyRegion, GeneratedWorkout, JointRegion, MovementPattern } from '@circuit/domain';
import type { TrainingRegion } from './daily-training-guardrails';

const ACHILLES_REGIONS = new Set<BodyRegion>([
  'gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles',
  'glutes', 'hamstrings', 'quadriceps', 'hip_abductors', 'hip_adductors',
  'hip_flexors',
]);
const BACK_REGIONS = new Set<BodyRegion>([
  'upper_back', 'lats', 'shoulders', 'chest', 'lower_back', 'core_rotation',
  'core_lateral',
]);
const ACHILLES_JOINTS = new Set<JointRegion>(['ankle', 'foot']);
const BACK_JOINTS = new Set<JointRegion>(['thoracic_spine', 'shoulder']);
const ACHILLES_MOVEMENTS = new Set<MovementPattern>([
  'lunge', 'squat', 'jump_hop', 'locomotion', 'balance',
]);

/**
 * Conservative affected-region inference for acute return-to-training rules.
 * Looks at every exercise, not just high-level workout targets. An unknown
 * exercise schema is treated as uncertainty in both sensitive regions.
 * This is not a biomechanical injury-risk score.
 */
export function affectedTrainingRegions(workout: GeneratedWorkout): TrainingRegion[] {
  const regions = new Set<TrainingRegion>(['general']);
  const exercises = workout.stations.flatMap((station) => station.exercises);
  for (const region of workout.targetRegions) {
    if (ACHILLES_REGIONS.has(region)) regions.add('achilles');
    if (BACK_REGIONS.has(region)) regions.add('upper_back');
  }
  if (!exercises.length) {
    regions.add('achilles');
    regions.add('upper_back');
  }
  for (const prescription of exercises) {
    const exercise = prescription.exerciseSnapshot;
    if (!exercise || !Array.isArray(exercise.bodyRegions) ||
        !Array.isArray(exercise.jointLoads) || !Array.isArray(exercise.movementPatterns)) {
      regions.add('achilles');
      regions.add('upper_back');
      continue;
    }
    for (const load of exercise.bodyRegions) {
      if (load.load === 0) continue;
      if (ACHILLES_REGIONS.has(load.region)) regions.add('achilles');
      if (BACK_REGIONS.has(load.region)) regions.add('upper_back');
    }
    for (const load of exercise.jointLoads) {
      if (load.load === 0) continue;
      if (ACHILLES_JOINTS.has(load.region)) regions.add('achilles');
      if (BACK_JOINTS.has(load.region)) regions.add('upper_back');
    }
    for (const pattern of exercise.movementPatterns) {
      if (ACHILLES_MOVEMENTS.has(pattern)) regions.add('achilles');
      if (pattern === 'rotation' || pattern === 'anti_rotation' || pattern === 'anti_extension') {
        regions.add('upper_back');
      }
    }
  }
  return [...regions];
}
