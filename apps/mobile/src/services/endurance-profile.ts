import type {
  BikeEnvironment,
  ReturnToRunProtocol,
  RunEnvironment,
  SwimDistanceUnit,
  SwimEnvironment,
} from '@circuit/planner/endurance-prescription';
import Storage from 'expo-sqlite/kv-store';

const ENDURANCE_PROFILE_KEY = 'circuit.endurance-prescription-profile.v2';

export interface EndurancePrescriptionProfile {
  swimEnvironment: SwimEnvironment;
  poolLength: 25 | 50;
  swimDistanceUnit: SwimDistanceUnit;
  cssSecondsPer100?: number;
  bikeEnvironment: BikeEnvironment;
  runEnvironment: RunEnvironment;
  returnToRunProtocol?: ReturnToRunProtocol;
  updatedAt: string;
}

export interface ReturnToRunStageOption {
  id: string;
  label: string;
  detail: string;
  protocol: ReturnToRunProtocol;
}

export const RETURN_TO_RUN_STAGE_OPTIONS: ReturnToRunStageOption[] = [
  {
    id: 'run1_walk1_x6',
    label: '6 × 1 min run / 1 min walk',
    detail: '4 min walk warm-up · 6 min running · 5 min walk recovery · 4 min walk cool-down',
    protocol: { warmupWalkMinutes: 4, repeats: 6, runMinutes: 1, walkMinutes: 1, cooldownWalkMinutes: 4 },
  },
  {
    id: 'run2_walk1_x5',
    label: '5 × 2 min run / 1 min walk',
    detail: '4 min walk warm-up · 10 min running · 4 min walk recovery · 4 min walk cool-down',
    protocol: { warmupWalkMinutes: 4, repeats: 5, runMinutes: 2, walkMinutes: 1, cooldownWalkMinutes: 4 },
  },
  {
    id: 'run3_walk1_x4',
    label: '4 × 3 min run / 1 min walk',
    detail: '3 min walk warm-up · 12 min running · 3 min walk recovery · 2 min walk cool-down',
    protocol: { warmupWalkMinutes: 3, repeats: 4, runMinutes: 3, walkMinutes: 1, cooldownWalkMinutes: 2 },
  },
  {
    id: 'run4_walk1_x4',
    label: '4 × 4 min run / 1 min walk',
    detail: '3 min walk warm-up · 16 min running · 3 min walk recovery · 2 min walk cool-down',
    protocol: { warmupWalkMinutes: 3, repeats: 4, runMinutes: 4, walkMinutes: 1, cooldownWalkMinutes: 2 },
  },
  {
    id: 'run5_walk1_x4',
    label: '4 × 5 min run / 1 min walk',
    detail: '3 min walk warm-up · 20 min running · 3 min walk recovery · 2 min walk cool-down',
    protocol: { warmupWalkMinutes: 3, repeats: 4, runMinutes: 5, walkMinutes: 1, cooldownWalkMinutes: 2 },
  },
];

const DEFAULT_PROFILE: EndurancePrescriptionProfile = {
  swimEnvironment: 'pool',
  poolLength: 25,
  swimDistanceUnit: 'yd',
  bikeEnvironment: 'outdoor',
  runEnvironment: 'outdoor',
  updatedAt: new Date(0).toISOString(),
};

export function getDefaultEndurancePrescriptionProfile(): EndurancePrescriptionProfile {
  return { ...DEFAULT_PROFILE };
}

export function loadEndurancePrescriptionProfile(): EndurancePrescriptionProfile {
  const raw = Storage.getItemSync(ENDURANCE_PROFILE_KEY);
  if (!raw) return getDefaultEndurancePrescriptionProfile();
  try {
    const parsed = JSON.parse(raw) as Partial<EndurancePrescriptionProfile>;
    return {
      swimEnvironment: parsed.swimEnvironment === 'open_water' ? 'open_water' : 'pool',
      poolLength: parsed.poolLength === 50 ? 50 : 25,
      swimDistanceUnit: parsed.swimDistanceUnit === 'm' ? 'm' : 'yd',
      ...(validCss(parsed.cssSecondsPer100) ? { cssSecondsPer100: parsed.cssSecondsPer100 } : {}),
      bikeEnvironment: parsed.bikeEnvironment === 'indoor_trainer' || parsed.bikeEnvironment === 'mountain_bike' ? parsed.bikeEnvironment : 'outdoor',
      runEnvironment: parsed.runEnvironment === 'treadmill' || parsed.runEnvironment === 'track' || parsed.runEnvironment === 'trail' ? parsed.runEnvironment : 'outdoor',
      ...(validProtocol(parsed.returnToRunProtocol) ? { returnToRunProtocol: parsed.returnToRunProtocol } : {}),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return getDefaultEndurancePrescriptionProfile();
  }
}

export function saveEndurancePrescriptionProfile(profile: Omit<EndurancePrescriptionProfile, 'updatedAt'> | EndurancePrescriptionProfile): EndurancePrescriptionProfile {
  const saved: EndurancePrescriptionProfile = { ...profile, updatedAt: new Date().toISOString() };
  Storage.setItemSync(ENDURANCE_PROFILE_KEY, JSON.stringify(saved));
  return saved;
}

export function parseCssPace(value: string): number | undefined {
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  const parts = cleaned.split(':');
  let seconds: number;
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const remainder = Number(parts[1]);
    if (!Number.isFinite(minutes) || !Number.isFinite(remainder) || remainder < 0 || remainder >= 60) return undefined;
    seconds = minutes * 60 + remainder;
  } else {
    seconds = Number(cleaned);
  }
  return validCss(seconds) ? Math.round(seconds) : undefined;
}

export function formatCssPace(seconds: number | undefined): string {
  if (!validCss(seconds)) return '';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function selectedReturnToRunStage(profile: EndurancePrescriptionProfile): ReturnToRunStageOption | undefined {
  if (!profile.returnToRunProtocol) return undefined;
  return RETURN_TO_RUN_STAGE_OPTIONS.find((option) => protocolsEqual(option.protocol, profile.returnToRunProtocol!));
}

function protocolsEqual(left: ReturnToRunProtocol, right: ReturnToRunProtocol): boolean {
  return left.warmupWalkMinutes === right.warmupWalkMinutes
    && left.repeats === right.repeats
    && left.runMinutes === right.runMinutes
    && left.walkMinutes === right.walkMinutes
    && left.cooldownWalkMinutes === right.cooldownWalkMinutes;
}

function validCss(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 45 && value <= 240;
}

function validProtocol(value: unknown): value is ReturnToRunProtocol {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ReturnToRunProtocol>;
  return [item.warmupWalkMinutes, item.repeats, item.runMinutes, item.walkMinutes, item.cooldownWalkMinutes]
    .every((part) => typeof part === 'number' && Number.isFinite(part) && part >= 1);
}
