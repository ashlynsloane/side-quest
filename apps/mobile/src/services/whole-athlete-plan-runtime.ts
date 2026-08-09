import type { PerformanceGoal } from '@circuit/domain';
import type { CompletedDisciplineExposure } from '@circuit/planner/whole-athlete-progression';
import {
  configureWholeAthleteCoachStrategy,
  configureWholeAthleteStrategyLayers,
} from '@circuit/planner/whole-athlete-week';
import Storage from 'expo-sqlite/kv-store';

import {
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
} from './database';
import { loadApprovedCoachStrategySchedule } from './coach-strategy-state';
import { loadRaceIntent } from './race-intent-state';
import { loadTrainingHistory, type TrainingHistoryItem } from './training-history';
import {
  clearSideQuestGeneratedPlanEvents,
  generateAndPersistWholeAthleteBlock,
  type GeneratedWholeAthleteBlock,
  type WholeAthleteCapacityInput,
  type WholeAthleteHealthPreferences,
} from './whole-athlete-plan';

const HEALTH_PREFERENCES_KEY = 'circuit.whole-athlete-health.v1';
const PROGRESSION_HISTORY_LIMIT = 2_000;

const DEFAULT_HEALTH_PREFERENCES: WholeAthleteHealthPreferences = {
  energyAvailability: 'adequate',
  menstrualRecovery: 'unknown',
  mentalEnergy: 'good',
  lifeStress: 'low',
};

let reconciliationQueue: Promise<GeneratedWholeAthleteBlock | null> = Promise.resolve(null);
let latestReconciledPlan: { blockId: string; generated: GeneratedWholeAthleteBlock } | null = null;

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

export function getLatestWholeAthletePlanSnapshot(blockId?: string): GeneratedWholeAthleteBlock | null {
  if (!latestReconciledPlan) return null;
  if (blockId && latestReconciledPlan.blockId !== blockId) return null;
  return latestReconciledPlan.generated;
}

export function refreshLatestWholeAthletePlan(): Promise<GeneratedWholeAthleteBlock | null> {
  const next = reconciliationQueue.then(runWholeAthleteReconciliation, runWholeAthleteReconciliation);
  reconciliationQueue = next.catch(() => null);
  return next;
}

async function runWholeAthleteReconciliation(): Promise<GeneratedWholeAthleteBlock | null> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) {
    configureWholeAthleteCoachStrategy(undefined);
    latestReconciledPlan = null;
    await clearSideQuestGeneratedPlanEvents();
    return null;
  }

  const raceIntent = loadRaceIntent(saved.block.id)?.intent;
  const approvedSchedule = loadApprovedCoachStrategySchedule(saved.block.id);
  configureWholeAthleteStrategyLayers(
    raceIntent,
    approvedSchedule.windows.map((window) => window.strategy),
  );

  const [activeCheckIn, ptProfile, readiness, trainingHistory] = await Promise.all([
    getActiveTrainingCheckIn(),
    getLatestPTProfile(),
    getTodayReadinessCheckIn(),
    loadTrainingHistory(PROGRESSION_HISTORY_LIMIT),
  ]);
  const goal = saved.block.goal;
  const now = new Date();
  const generated = await generateAndPersistWholeAthleteBlock({
    block: saved.block,
    goal,
    capacity: capacityFromGoal(goal),
    healthPreferences: loadWholeAthleteHealthPreferences(),
    activeCheckIn,
    ptProfileActive: Boolean(ptProfile?.active),
    readiness,
    completedHistory: progressionHistoryFromTrainingHistory(trainingHistory),
    progressionDate: localDateKey(now),
    progressionAsOf: now.toISOString(),
  });
  latestReconciledPlan = { blockId: saved.block.id, generated };
  return generated;
}

export function progressionHistoryFromTrainingHistory(
  items: TrainingHistoryItem[],
): CompletedDisciplineExposure[] {
  const exposures: CompletedDisciplineExposure[] = [];
  for (const item of items) {
    if (item.needsReview) continue;
    if (item.kind === 'strength') {
      exposures.push({ discipline: 'strength', completedAt: item.occurredAt });
      continue;
    }
    if (item.activity.deletedAt) continue;
    const discipline = progressionDiscipline(item.activity.discipline);
    if (!discipline) continue;
    exposures.push({
      discipline,
      completedAt: item.occurredAt,
      durationMinutes: Math.max(1, Math.round(item.activity.movingTimeSeconds / 60)),
    });
  }
  return exposures.sort((left, right) => left.completedAt.localeCompare(right.completedAt));
}

export function localDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (part: 'year' | 'month' | 'day') => parts.find((candidate) => candidate.type === part)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function progressionDiscipline(value: string): CompletedDisciplineExposure['discipline'] | null {
  if (value === 'swim' || value === 'bike' || value === 'run') return value;
  if (value === 'strength' || value === 'hiit') return 'strength';
  return null;
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
