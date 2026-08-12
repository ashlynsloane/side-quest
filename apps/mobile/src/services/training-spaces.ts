import type { EquipmentId } from '@circuit/domain';
import type { EquipmentCapability, TrainingSpaceProfile } from '@circuit/generator';

export type StrengthLocationPreference = 'home_only' | 'gym_only' | 'mixed' | 'custom';

export interface TrainingSpacePreferences {
  spaces: TrainingSpaceProfile[];
  strengthLocationPreference: StrengthLocationPreference;
  preferredHomeSessions?: number;
  preferredGymSessions?: number;
  preferGymOnSwimDays: boolean;
}

const STORAGE_KEY = 'sidequest.training-spaces.v1';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function storage(): StorageLike | null {
  const candidate = (globalThis as typeof globalThis & { localStorage?: StorageLike }).localStorage;
  return candidate ?? null;
}

export function defaultTrainingSpacePreferences(): TrainingSpacePreferences {
  return {
    spaces: [],
    strengthLocationPreference: 'custom',
    preferGymOnSwimDays: true,
  };
}

export function loadTrainingSpacePreferences(): TrainingSpacePreferences {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return defaultTrainingSpacePreferences();

  try {
    return normalizePreferences(JSON.parse(raw) as Partial<TrainingSpacePreferences>);
  } catch {
    return defaultTrainingSpacePreferences();
  }
}

export function saveTrainingSpacePreferences(preferences: TrainingSpacePreferences): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(normalizePreferences(preferences)));
}

export function clearTrainingSpacePreferences(): void {
  storage()?.removeItem(STORAGE_KEY);
}

export function homeSpace(preferences: TrainingSpacePreferences): TrainingSpaceProfile | undefined {
  return preferences.spaces.find((space) => space.environment === 'home');
}

export function gymSpace(preferences: TrainingSpacePreferences): TrainingSpaceProfile | undefined {
  return preferences.spaces.find((space) => space.environment === 'gym');
}

export function enabledEquipmentForSpace(space: TrainingSpaceProfile): EquipmentId[] {
  return [...new Set(space.capabilities.map((capability) => capability.equipmentId))];
}

export function createTrainingSpace({
  id,
  name,
  environment,
  capabilities,
}: {
  id: string;
  name: string;
  environment: TrainingSpaceProfile['environment'];
  capabilities: EquipmentCapability[];
}): TrainingSpaceProfile {
  return {
    id: id.trim(),
    name: name.trim(),
    environment,
    capabilities: capabilities.map(normalizeCapability),
  };
}

export function commercialGymTemplate(): TrainingSpaceProfile {
  return createTrainingSpace({
    id: 'gym',
    name: 'Gym',
    environment: 'gym',
    capabilities: [
      { equipmentId: 'dumbbell', quantity: 2, maxLoadLb: 100 },
      { equipmentId: 'kettlebell', quantity: 1, maxLoadLb: 80 },
      { equipmentId: 'barbell', quantity: 1, maxLoadLb: 315 },
      { equipmentId: 'weight_plate', quantity: 8, maxLoadLb: 45 },
      { equipmentId: 'trap_bar', quantity: 1, maxLoadLb: 315 },
      { equipmentId: 'bench', quantity: 1 },
      { equipmentId: 'pullup_bar', quantity: 1 },
      { equipmentId: 'cable_machine', quantity: 1 },
      { equipmentId: 'leg_press', quantity: 1 },
    ],
  });
}

export function basicHomeTemplate(): TrainingSpaceProfile {
  return createTrainingSpace({
    id: 'home',
    name: 'Home',
    environment: 'home',
    capabilities: [{ equipmentId: 'bodyweight', quantity: 1 }],
  });
}

function normalizePreferences(input: Partial<TrainingSpacePreferences>): TrainingSpacePreferences {
  const spaces = Array.isArray(input.spaces)
    ? input.spaces
        .filter(isTrainingSpace)
        .map((space) => createTrainingSpace(space))
    : [];

  const preference = input.strengthLocationPreference;
  const strengthLocationPreference: StrengthLocationPreference =
    preference === 'home_only' || preference === 'gym_only' || preference === 'mixed' || preference === 'custom'
      ? preference
      : 'custom';

  return {
    spaces,
    strengthLocationPreference,
    preferredHomeSessions: finiteNonnegativeInteger(input.preferredHomeSessions),
    preferredGymSessions: finiteNonnegativeInteger(input.preferredGymSessions),
    preferGymOnSwimDays: input.preferGymOnSwimDays !== false,
  };
}

function isTrainingSpace(value: unknown): value is TrainingSpaceProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TrainingSpaceProfile>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && (candidate.environment === 'home' || candidate.environment === 'gym' || candidate.environment === 'custom')
    && Array.isArray(candidate.capabilities);
}

function normalizeCapability(capability: EquipmentCapability): EquipmentCapability {
  return {
    equipmentId: capability.equipmentId,
    quantity: finitePositiveInteger(capability.quantity),
    minLoadLb: finiteNonnegativeNumber(capability.minLoadLb),
    maxLoadLb: finiteNonnegativeNumber(capability.maxLoadLb),
    adjustable: capability.adjustable === true,
  };
}

function finitePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function finiteNonnegativeInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function finiteNonnegativeNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}
