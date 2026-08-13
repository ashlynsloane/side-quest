import type { PerformanceGoal, TrainingBlockPlan } from '@circuit/domain';
import {
  buildWholeAthleteProgressionContextFromHistory,
  type CompletedDisciplineExposure,
} from '@circuit/planner/whole-athlete-progression';
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
  listEquipmentProfiles,
  replaceTrainingCalendarEvents,
  saveTrainingBlock,
} from './database';
import { loadApprovedCoachStrategySchedule } from './coach-strategy-state';
import { loadRaceIntent } from './race-intent-state';
import { applyCurrentWeekStrengthProgression } from './strength-progression-persistence';
import { loadTrainingAvailabilityProfile } from './training-availability';
import { applyTrainingOutingsToGeneratedBlock, type TrainingLocationProfile } from './training-outings';
import { applyTrainingSpacesToGeneratedBlock } from './training-space-runtime';
import { loadTrainingHistory, type TrainingHistoryItem } from './training-history';
import {
  clearSideQuestGeneratedPlanEvents,
  generateAndPersistWholeAthleteBlock,
  SIDE_QUEST_PLAN_SOURCE_ID,
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
    loadTrainingHistory(PROGRESSION_HISTORY_LIMIT).catch(() => [] as TrainingHistoryItem[]),
  ]);
  const now = new Date();
  const progressionDate = localDateKey(now);
  const currentWeekStart = currentTrainingWeekStart(saved.block, progressionDate);
  const allCompletedHistory = progressionHistoryFromTrainingHistory(trainingHistory);
  const completedHistory = currentWeekStart
    ? historyEnteringWeek(allCompletedHistory, currentWeekStart)
    : allCompletedHistory;
  const progressionAsOf = currentWeekStart
    ? weekEntryInstant(currentWeekStart)
    : now.toISOString();
  const progressionContext = currentWeekStart
    ? buildWholeAthleteProgressionContextFromHistory({
        weekStartDate: currentWeekStart,
        asOf: progressionAsOf,
        exposures: completedHistory,
      })
    : {};
  const strengthProgression = currentWeekStart
    ? applyCurrentWeekStrengthProgression(
        saved.block,
        currentWeekStart,
        progressionContext.disciplineAssignments?.strength,
      )
    : { block: saved.block, changed: false };
  const workingBlock = strengthProgression.block;
  if (strengthProgression.changed) await saveTrainingBlock(workingBlock);

  const goal = workingBlock.goal;
  const capacity = capacityFromGoal(goal);
  const generated = await generateAndPersistWholeAthleteBlock({
    block: workingBlock,
    goal,
    capacity,
    healthPreferences: loadWholeAthleteHealthPreferences(),
    activeCheckIn,
    ptProfileActive: Boolean(ptProfile?.active),
    readiness,
    completedHistory,
    progressionDate,
    progressionAsOf,
    raceIntent,
  });

  const [availabilityProfile, locationProfiles] = await Promise.all([
    Promise.resolve(loadTrainingAvailabilityProfile()),
    listEquipmentProfiles(),
  ]);
  // Resolve strength-space intent before convenience/outings.
  // Athlete-configured Home/Gym decisions outrank facility stacking.
  const spaceAware = await applyTrainingSpacesToGeneratedBlock(generated);
  const reconciled = applyTrainingOutingsToGeneratedBlock(
    spaceAware,
    availabilityProfile,
    locationProfiles as TrainingLocationProfile[],
    capacity.runStatus,
  );
  await replaceTrainingCalendarEvents(SIDE_QUEST_PLAN_SOURCE_ID, reconciled.generatedEvents);

  latestReconciledPlan = { blockId: saved.block.id, generated: reconciled };
  return reconciled;
}

export function progressionHistoryFromTrainingHistory(
  items: TrainingHistoryItem[],
): CompletedDisciplineExposure[] {
  const exposures: CompletedDisciplineExposure[] = [];
  for (const item of items) {
    if (item.needsReview) continue;
    if (item.kind === 'strength') {
      const durationMinutes = elapsedMinutes(item.workout.startedAt, item.workout.completedAt);
      const completedAsPlanned = strengthCompletionSignal(item);
      const rpe = validRpe(item.reflection?.rpe);
      const difficulty = item.feedback?.difficulty;
      exposures.push({
        discipline: 'strength',
        completedAt: item.occurredAt,
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        ...(completedAsPlanned !== undefined ? { completedAsPlanned } : {}),
        ...(rpe !== undefined ? { rpe } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
      });
      continue;
    }
    if (item.activity.deletedAt) continue;
    const discipline = progressionDiscipline(item.activity.discipline);
    if (!discipline) continue;
    const completedAsPlanned = enduranceCompletionSignal(item);
    exposures.push({
      discipline,
      completedAt: item.occurredAt,
      durationMinutes: Math.max(1, Math.round(item.activity.movingTimeSeconds / 60)),
      ...(completedAsPlanned !== undefined ? { completedAsPlanned } : {}),
      ...(finitePositive(item.activity.averageWatts) ? { averageWatts: item.activity.averageWatts } : {}),
      ...(finitePositive(item.activity.weightedAverageWatts) ? { weightedAverageWatts: item.activity.weightedAverageWatts } : {}),
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

export function currentTrainingWeekStart(block: TrainingBlockPlan, dateKey: string): string | null {
  const week = block.weeks.find((candidate) => {
    const weekEnd = addDays(candidate.weekStartDate, 6);
    return dateKey >= candidate.weekStartDate && dateKey <= weekEnd;
  });
  return week?.weekStartDate ?? null;
}

export function historyEnteringWeek(
  exposures: CompletedDisciplineExposure[],
  weekStartDate: string,
): CompletedDisciplineExposure[] {
  return exposures.filter((exposure) => exposure.completedAt.slice(0, 10) < weekStartDate);
}

export function weekEntryInstant(weekStartDate: string): string {
  return `${weekStartDate}T12:00:00.000Z`;
}

function strengthCompletionSignal(
  item: Extract<TrainingHistoryItem, { kind: 'strength' }>,
): boolean | undefined {
  if (item.workout.relationToPlan !== 'completed_planned') return undefined;
  if (item.workout.completionFraction >= 0.9) return true;
  if (item.workout.completionFraction < 0.75) return false;
  return undefined;
}

function enduranceCompletionSignal(
  item: Extract<TrainingHistoryItem, { kind: 'endurance' }>,
): boolean | undefined {
  if (item.plannedMatch?.status !== 'matched' || !item.plannedEvent) return undefined;
  const plannedMinutes = item.plannedEvent.endAt
    ? elapsedMinutes(item.plannedEvent.startAt, item.plannedEvent.endAt)
    : undefined;
  if (!plannedMinutes) return undefined;
  const actualMinutes = Math.max(1, item.activity.movingTimeSeconds / 60);
  const completionRatio = actualMinutes / plannedMinutes;
  if (completionRatio >= 0.9) return true;
  if (completionRatio < 0.75) return false;
  return undefined;
}

function elapsedMinutes(startAt: string, endAt: string): number | undefined {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return Math.max(1, Math.round((end - start) / 60_000));
}

function validRpe(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 1 || value > 10) return undefined;
  return value;
}

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function progressionDiscipline(
  value: string | null | undefined,
): CompletedDisciplineExposure['discipline'] | null {
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

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
