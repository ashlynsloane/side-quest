import type { PerformanceGoal } from '@circuit/domain';
import Storage from 'expo-sqlite/kv-store';

import {
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
} from './database';
import {
  clearSideQuestGeneratedPlanEvents,
  generateAndPersistWholeAthleteBlock,
  type GeneratedWholeAthleteBlock,
  type WholeAthleteCapacityInput,
  type WholeAthleteHealthPreferences,
} from './whole-athlete-plan';

const HEALTH_PREFERENCES_KEY = 'circuit.whole-athlete-health.v1';

const DEFAULT_HEALTH_PREFERENCES: WholeAthleteHealthPreferences = {
  energyAvailability: 'adequate',
  menstrualRecovery: 'unknown',
  mentalEnergy: 'good',
  lifeStress: 'low',
};

export function getDefaultWholeAthleteHealthPreferences(): WholeAthleteHealthPreferences {
  return { ...DEFAULT_HEALTH_PREFERENCES };
}

export function loadWholeAthleteHealthPreferences(): WholeAthleteHealthPreferences {
  const saved = Storage.getItemSync(HEALTH_PREFERENCES_KEY);
  if (!saved) return getDefaultWholeAthleteHealthPreferences();
  try {
    const parsed = JSON.parse(saved) as Partial<WholeAthleteHealthPreferences>;
    return {
      energyAvailability: isEnergyAvailability(parsed.energyAvailability) ? parsed.energyAvailability : DEFAULT_HEALTH_PREFERENCES.energyAvailability,
      menstrualRecovery: isMenstrualRecovery(parsed.menstrualRecovery) ? parsed.menstrualRecovery : DEFAULT_HEALTH_PREFERENCES.menstrualRecovery,
      mentalEnergy: isMentalEnergy(parsed.mentalEnergy) ? parsed.mentalEnergy : DEFAULT_HEALTH_PREFERENCES.mentalEnergy,
      lifeStress: isLifeStress(parsed.lifeStress) ? parsed.lifeStress : DEFAULT_HEALTH_PREFERENCES.lifeStress,
    };
  } catch {
    return getDefaultWholeAthleteHealthPreferences();
  }
}

export function saveWholeAthleteHealthPreferences(preferences: WholeAthleteHealthPreferences): void {
  Storage.setItemSync(HEALTH_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function clearWholeAthleteHealthPreferences(): void {
  Storage.removeItemSync(HEALTH_PREFERENCES_KEY);
}

export async function refreshLatestWholeAthletePlan(): Promise<GeneratedWholeAthleteBlock | null> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) {
    await clearSideQuestGeneratedPlanEvents();
    return null;
  }

  const [activeCheckIn, ptProfile, readiness] = await Promise.all([
    getActiveTrainingCheckIn(),
    getLatestPTProfile(),
    getTodayReadinessCheckIn(),
  ]);
  const goal = saved.block.goal;
  return generateAndPersistWholeAthleteBlock({
    block: saved.block,
    goal,
    capacity: capacityFromGoal(goal),
    healthPreferences: loadWholeAthleteHealthPreferences(),
    activeCheckIn,
    ptProfileActive: Boolean(ptProfile?.active),
    readiness,
  });
}

function capacityFromGoal(goal: PerformanceGoal): WholeAthleteCapacityInput {
  const capacity = goal.capacityProfile;
  if (capacity) {
    return {
      totalWeeklyHours: Math.max(0, capacity.totalWeeklyHours),
      currentEnduranceHours: Math.max(0, capacity.currentEnduranceHours),
      runStatus: capacity.runStatus,
      boneStressInjuryHistory: capacity.boneStressInjuryHistory,
    };
  }
  return {
    totalWeeklyHours: 8,
    currentEnduranceHours: goal.disciplines.length ? 5 : 0,
    runStatus: goal.disciplines.includes('run') ? 'normal' : 'not_running',
    boneStressInjuryHistory: 'none',
  };
}

function isEnergyAvailability(value: unknown): value is WholeAthleteHealthPreferences['energyAvailability'] {
  return value === 'adequate' || value === 'uncertain' || value === 'concerning';
}

function isMenstrualRecovery(value: unknown): value is WholeAthleteHealthPreferences['menstrualRecovery'] {
  return value === 'stable' || value === 'unknown' || value === 'disrupted';
}

function isMentalEnergy(value: unknown): value is WholeAthleteHealthPreferences['mentalEnergy'] {
  return value === 'good' || value === 'limited' || value === 'depleted';
}

function isLifeStress(value: unknown): value is WholeAthleteHealthPreferences['lifeStress'] {
  return value === 'low' || value === 'moderate' || value === 'high' || value === 'overwhelming';
}
