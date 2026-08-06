import type { EquipmentId, WorkoutGenerationRequest } from '@circuit/domain';

export const DEFAULT_EQUIPMENT: EquipmentId[] = [
  'dumbbell',
  'kettlebell',
  'long_band',
  'mini_band',
  'bench',
  'box',
  'bosu',
];

export const DEFAULT_REQUEST: WorkoutGenerationRequest = {
  workMinutes: 40,
  allowedStationMinutes: [4, 8, 12],
  restSeconds: 60,
  exercisesPerStation: 'mixed',
  focusTargets: [],
  excludedRegions: [],
  excludedMovementTags: [],
  regionRestrictions: [],
  excludedMovementPatterns: [],
  availableEquipment: DEFAULT_EQUIPMENT,
  workoutStyle: 'strength_cardio_amrap',
  difficulty: 'intermediate',
  maximumImpact: 4,
  recoveryAware: true,
  avoidPreviousWorkoutExercises: true,
  favorFamiliarExercises: false,
  allowUnfamiliarExercises: true,
  minimizeEquipmentChanges: false,
};
