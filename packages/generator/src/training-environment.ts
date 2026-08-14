import type { EquipmentId, Exercise } from '@circuit/domain';

export type TrainingEnvironment = 'home' | 'gym' | 'custom';

export type ExerciseEnvironmentValue =
  | 'home_specialty'
  | 'home_equivalent'
  | 'gym_advantaged'
  | 'gym_dependent';

export interface TrainingEnvironmentProfile {
  environment: TrainingEnvironment;
  availableEquipment: EquipmentId[];
  homeEquipment?: EquipmentId[];
}

const GYM_DEPENDENT_EQUIPMENT = new Set<EquipmentId>([
  'barbell',
  'weight_plate',
  'trap_bar',
  'cable_machine',
  'leg_press',
  'hack_squat_machine',
  'leg_extension_machine',
  'leg_curl_machine',
  'calf_raise_machine',
  'assisted_pullup_machine',
  'chest_press_machine',
  'row_machine',
]);

const HOME_SPECIALTY_EQUIPMENT = new Set<EquipmentId>([
  'bosu',
  'stability_ball',
  'slider',
  'mini_band',
  'medicine_ball',
]);

function requiredEquipmentForOption(exercise: Exercise, optionId?: string): EquipmentId[] {
  const option = optionId
    ? exercise.equipmentOptions.find((item) => item.id === optionId)
    : exercise.equipmentOptions[0];
  return option?.items
    .filter((item) => !item.optional && item.equipmentId !== 'bodyweight')
    .map((item) => item.equipmentId) ?? [];
}

function optionCanRunWith(option: Exercise['equipmentOptions'][number], equipment: Set<EquipmentId>): boolean {
  return option.items.every((item) => item.optional || item.equipmentId === 'bodyweight' || equipment.has(item.equipmentId));
}

export function canExerciseRunWithEquipment(exercise: Exercise, equipment: EquipmentId[]): boolean {
  const available = new Set<EquipmentId>(equipment);
  return exercise.equipmentOptions.some((option) => optionCanRunWith(option, available));
}

export function classifyExerciseEnvironmentValue(
  exercise: Exercise,
  profile: Pick<TrainingEnvironmentProfile, 'homeEquipment'>,
): ExerciseEnvironmentValue {
  const homeEquipment = new Set<EquipmentId>(profile.homeEquipment ?? []);
  const homeCapable = exercise.equipmentOptions.some((option) => optionCanRunWith(option, homeEquipment));

  const hasGymDependentOption = exercise.equipmentOptions.some((option) =>
    requiredEquipmentForOption(exercise, option.id).some((equipment) => GYM_DEPENDENT_EQUIPMENT.has(equipment)),
  );

  if (hasGymDependentOption && !homeCapable) return 'gym_dependent';
  if (hasGymDependentOption && homeCapable) return 'gym_advantaged';

  const hasHomeSpecialtyOption = exercise.equipmentOptions.some((option) =>
    requiredEquipmentForOption(exercise, option.id).some((equipment) => HOME_SPECIALTY_EQUIPMENT.has(equipment)),
  );
  if (hasHomeSpecialtyOption) return 'home_specialty';

  return 'home_equivalent';
}

export function trainingEnvironmentScore(
  exercise: Exercise,
  profile: TrainingEnvironmentProfile,
): number {
  const value = classifyExerciseEnvironmentValue(exercise, profile);

  if (profile.environment === 'gym') {
    if (value === 'gym_dependent') return 24;
    if (value === 'gym_advantaged') return 16;
    if (value === 'home_specialty') return -8;
    return -5;
  }

  if (profile.environment === 'home') {
    if (value === 'home_specialty') return 8;
    if (value === 'home_equivalent') return 4;
    if (value === 'gym_advantaged') return -8;
    return -100;
  }

  return 0;
}

export function gymOpportunityShare(
  exercises: Exercise[],
  profile: Pick<TrainingEnvironmentProfile, 'homeEquipment'>,
): number {
  if (exercises.length === 0) return 0;
  const gymValueCount = exercises.filter((exercise) => {
    const value = classifyExerciseEnvironmentValue(exercise, profile);
    return value === 'gym_advantaged' || value === 'gym_dependent';
  }).length;
  return gymValueCount / exercises.length;
}

export function explainEnvironmentPreference(
  exercise: Exercise,
  profile: TrainingEnvironmentProfile,
): string {
  const value = classifyExerciseEnvironmentValue(exercise, profile);
  if (profile.environment === 'gym') {
    if (value === 'gym_dependent') return 'Prioritized because this movement depends on equipment not available in the athlete’s home setup.';
    if (value === 'gym_advantaged') return 'Prioritized because the gym provides a meaningfully better loading or equipment option than home.';
    return 'Available at the gym, but deprioritized because the athlete can reproduce this movement at home.';
  }
  if (profile.environment === 'home') {
    if (value === 'home_specialty') return 'Prioritized to make use of equipment in the athlete’s home training setup.';
    if (value === 'home_equivalent') return 'Well suited to the athlete’s home equipment profile.';
    return 'Deprioritized because the gym provides a more appropriate equipment option for this movement.';
  }
  return 'No location-specific preference applied.';
}
