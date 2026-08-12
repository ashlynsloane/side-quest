import type { Exercise, EquipmentId } from '@circuit/domain';
import environmentExercisesJson from '../data/environment-exercises.json';
import gymExpansionV2Json from '../data/gym-expansion-v2.json';
import equipmentJson from '../data/equipment.json';
import exercisesJson from '../data/exercises.json';
import substitutionGroupsJson from '../data/substitution-groups.json';
import { machineExerciseSeed } from './machine-exercises';

export const exerciseSeed = [
  ...(exercisesJson as Exercise[]),
  ...(environmentExercisesJson as Exercise[]),
  ...(gymExpansionV2Json as Exercise[]),
  ...machineExerciseSeed,
];

export const equipmentSeed = equipmentJson as Array<{
  id: EquipmentId;
  label: string;
}>;

export const substitutionGroupSeed = substitutionGroupsJson as Array<{
  id: string;
  label: string;
}>;

export { machineExerciseSeed } from './machine-exercises';
