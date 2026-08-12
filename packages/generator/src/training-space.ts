import type { EquipmentId, Exercise } from '@circuit/domain';
import {
  trainingEnvironmentScore,
  type TrainingEnvironment,
  type TrainingEnvironmentProfile,
} from './training-environment';

export interface EquipmentCapability {
  equipmentId: EquipmentId;
  quantity?: number;
  minLoadLb?: number;
  maxLoadLb?: number;
  adjustable?: boolean;
}

export interface TrainingSpaceProfile {
  id: string;
  name: string;
  environment: TrainingEnvironment;
  capabilities: EquipmentCapability[];
}

const LOADABLE_EQUIPMENT = new Set<EquipmentId>([
  'dumbbell',
  'kettlebell',
  'barbell',
  'weight_plate',
  'trap_bar',
]);

export function equipmentIdsForTrainingSpace(space: TrainingSpaceProfile): EquipmentId[] {
  return [...new Set(space.capabilities.map((item) => item.equipmentId))];
}

export function toTrainingEnvironmentProfile(
  space: TrainingSpaceProfile,
  homeSpace?: TrainingSpaceProfile,
): TrainingEnvironmentProfile {
  return {
    environment: space.environment,
    availableEquipment: equipmentIdsForTrainingSpace(space),
    homeEquipment: homeSpace ? equipmentIdsForTrainingSpace(homeSpace) : undefined,
  };
}

function maximumLoad(space: TrainingSpaceProfile | undefined, equipmentId: EquipmentId): number | undefined {
  return space?.capabilities.find((item) => item.equipmentId === equipmentId)?.maxLoadLb;
}

function loadableEquipmentUsed(exercise: Exercise): EquipmentId[] {
  return [...new Set(
    exercise.equipmentOptions.flatMap((option) =>
      option.items
        .map((item) => item.equipmentId)
        .filter((equipmentId) => LOADABLE_EQUIPMENT.has(equipmentId)),
    ),
  )];
}

export function loadCapacityAdvantage(
  exercise: Exercise,
  homeSpace: TrainingSpaceProfile | undefined,
  targetSpace: TrainingSpaceProfile,
): number {
  if (!homeSpace || targetSpace.environment !== 'gym') return 0;
  if (!exercise.stationRoles.some((role) => role === 'primary_strength' || role === 'secondary_strength')) return 0;

  let bestRatio = 1;
  for (const equipmentId of loadableEquipmentUsed(exercise)) {
    const homeMax = maximumLoad(homeSpace, equipmentId);
    const targetMax = maximumLoad(targetSpace, equipmentId);
    if (!homeMax || !targetMax || targetMax <= homeMax) continue;
    bestRatio = Math.max(bestRatio, targetMax / homeMax);
  }

  if (bestRatio >= 3) return 12;
  if (bestRatio >= 2) return 8;
  if (bestRatio >= 1.5) return 4;
  return 0;
}

export function trainingSpaceExerciseScore(
  exercise: Exercise,
  targetSpace: TrainingSpaceProfile,
  homeSpace?: TrainingSpaceProfile,
): number {
  return trainingEnvironmentScore(
    exercise,
    toTrainingEnvironmentProfile(targetSpace, homeSpace),
  ) + loadCapacityAdvantage(exercise, homeSpace, targetSpace);
}

export function createHomeTrainingSpace(capabilities: EquipmentCapability[]): TrainingSpaceProfile {
  return {
    id: 'home',
    name: 'Home',
    environment: 'home',
    capabilities,
  };
}

export function createGymTrainingSpace(capabilities: EquipmentCapability[]): TrainingSpaceProfile {
  return {
    id: 'gym',
    name: 'Gym',
    environment: 'gym',
    capabilities,
  };
}
