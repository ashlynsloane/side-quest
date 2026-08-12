import type { Exercise, EquipmentId } from '@circuit/domain';
import environmentExercisesJson from '../data/environment-exercises.json';
import equipmentJson from '../data/equipment.json';
import exercisesJson from '../data/exercises.json';
import substitutionGroupsJson from '../data/substitution-groups.json';

export const exerciseSeed = [
  ...(exercisesJson as Exercise[]),
  ...(environmentExercisesJson as Exercise[]),
];
export const equipmentSeed = equipmentJson as Array<{ id: EquipmentId; label: string }>;
export const substitutionGroupSeed = substitutionGroupsJson as Array<{
  id: string;
  label: string;
}>;
