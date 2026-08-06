import type { BodyRegion, JointRegion, PTProfile, TrainingBlockPlan, TrainingCheckIn } from '@circuit/domain';
import {
  classifyRegionalStrengthStatus,
  type RegionalStatusResult,
} from '@circuit/planner';

import {
  getActiveTrainingCheckIn,
  getEnduranceRegionRecency,
  getEnduranceTrainingBalanceBetween,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getRegionRecency,
  getTodayReadinessCheckIn,
  listWorkoutLedgerEntries,
} from './database';
import { readinessBand } from './readiness';
export interface RegionalStrengthStatusSnapshot {
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  sportWindowStart: string;
  baselineDays: number;
  hasPlan: boolean;
  readinessLogged: boolean;
  activeCheckIn: boolean;
  windowDays: 14 | 28;
  regions: RegionalStatusResult[];
}

const REGIONS: BodyRegion[] = [
  'quadriceps', 'hamstrings', 'glutes', 'hip_abductors', 'hip_adductors', 'hip_flexors',
  'gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles',
  'upper_back', 'lats', 'lower_back', 'shoulders', 'chest', 'biceps', 'triceps',
  'forearms_grip', 'core_anterior', 'core_lateral', 'core_rotation',
];

export async function getRegionalStrengthStatusSnapshot(now = new Date(), windowDays: 14 | 28 = 14): Promise<RegionalStrengthStatusSnapshot> {
  const generatedAt = now.toISOString();
  const today = localDate(now);
  const weekStart = addDays(today, -(windowDays - 1));
  const weekEnd = addDays(today, 1);
  const sportWindowStart = weekStart;

  const [saved, ledger, currentSport, directRecency, sportRecency, pt, checkIn, readiness] = await Promise.all([
    getLatestTrainingBlock(),
    listWorkoutLedgerEntries({ from: `${weekStart}T00:00:00.000`, to: `${weekEnd}T00:00:00.000`, limit: 2_000 }),
    getEnduranceTrainingBalanceBetween({ from: `${sportWindowStart}T00:00:00.000`, to: addDaysIso(generatedAt, 1) }),
    getRegionRecency(),
    getEnduranceRegionRecency(),
    getLatestPTProfile(),
    getActiveTrainingCheckIn(),
    getTodayReadinessCheckIn(),
  ]);

  const baselineStart = addDays(sportWindowStart, -windowDays);
  const baselineSport = await getEnduranceTrainingBalanceBetween({
    from: `${baselineStart}T00:00:00.000`,
    to: `${sportWindowStart}T00:00:00.000`,
  });

  const planned = plannedRegionCounts(saved?.block ?? null, weekStart, weekEnd);
  const completed = completedRegionCounts(ledger);
  const currentSportMap = new Map(currentSport.map((item) => [item.region, item.contribution]));
  const baselineSportMap = new Map(baselineSport.map((item) => [item.region, item.contribution]));
  const readinessValue = readiness ? readinessBandFromCheckIn(readiness) : undefined;
  const restrictedRegions = restrictionsFor(pt, checkIn);
  const symptomRegions = symptomsFor(checkIn);

  return {
    generatedAt,
    weekStart,
    weekEnd: today,
    sportWindowStart,
    baselineDays: windowDays,
    hasPlan: Boolean(saved?.block),
    readinessLogged: Boolean(readiness),
    activeCheckIn: Boolean(checkIn),
    windowDays,
    regions: REGIONS.map((region) => {
      const restriction = restrictedRegions.get(region);
      const symptom = symptomRegions.get(region);
      return classifyRegionalStrengthStatus({
        region,
        plannedExposures: planned.get(region) ?? 0,
        completedExposures: completed.get(region) ?? 0,
        currentSportLoad: currentSportMap.get(region) ?? 0,
        baselineSportLoad: baselineSportMap.get(region) ?? 0,
        baselineHistoryDays: windowDays,
        recentDirectAt: directRecency[region],
        recentSportAt: sportRecency[region],
        readinessBand: readinessValue,
        muscleFreshness: readiness?.muscleFreshness,
        painSeverity: symptom?.severity,
        restricted: Boolean(restriction),
        restrictionReason: restriction,
        now: generatedAt,
      });
    }),
  };
}

function plannedRegionCounts(block: TrainingBlockPlan | null, from: string, to: string): Map<BodyRegion, number> {
  const counts = new Map<BodyRegion, number>();
  if (!block) return counts;
  const sessions = block.weeks.flatMap((week) => week.sessions)
    .filter((session) => session.date >= from && session.date < to)
    .filter((session) => session.completionStatus !== 'skipped');
  for (const session of sessions) {
    const regions = new Set<BodyRegion>();
    for (const station of session.workout.stations) {
      for (const item of station.exercises) {
        for (const load of item.exerciseSnapshot.bodyRegions) {
          if (load.load > 0) regions.add(load.region);
        }
      }
    }
    for (const region of regions) counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  return counts;
}

function completedRegionCounts(entries: Awaited<ReturnType<typeof listWorkoutLedgerEntries>>): Map<BodyRegion, number> {
  const counts = new Map<BodyRegion, number>();
  for (const entry of entries) {
    if (entry.completionFraction < 0.25) continue;
    const regions = new Set<BodyRegion>();
    for (const exercise of entry.exercises) {
      if (!exercise.sets.some((set) => set.completed)) continue;
      for (const load of exercise.bodyRegions) if (load.load > 0) regions.add(load.region);
    }
    for (const region of regions) counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  return counts;
}

function restrictionsFor(pt: PTProfile | null, checkIn: TrainingCheckIn | null): Map<BodyRegion, string> {
  const result = new Map<BodyRegion, string>();
  if (pt?.active) {
    for (const item of pt.excludedRegions) {
      for (const region of expandRegion(item)) result.set(region, `PT profile excludes ${formatToken(item)}.`);
    }
    for (const restriction of pt.regionRestrictions ?? []) {
      if (restriction.mode !== 'avoid') continue;
      for (const region of expandRegion(restriction.region)) result.set(region, `PT profile protects ${formatToken(restriction.region)} from loading.`);
    }
  }
  if (checkIn?.active && checkIn.status === 'unable_to_train') {
    for (const region of REGIONS) result.set(region, 'Current check-in says you are unable to train.');
  }
  return result;
}

function symptomsFor(checkIn: TrainingCheckIn | null): Map<BodyRegion, { severity: number }> {
  const result = new Map<BodyRegion, { severity: number }>();
  if (!checkIn?.active || checkIn.status === 'normal') return result;
  for (const item of checkIn.affectedRegions) {
    for (const region of expandRegion(item)) result.set(region, { severity: checkIn.severity });
  }
  return result;
}

function expandRegion(item: BodyRegion | JointRegion): BodyRegion[] {
  if (REGIONS.includes(item as BodyRegion)) return [item as BodyRegion];
  const mapping: Record<JointRegion, BodyRegion[]> = {
    neck: ['upper_back', 'shoulders'],
    shoulder: ['shoulders', 'chest', 'upper_back', 'lats', 'biceps', 'triceps'],
    elbow: ['biceps', 'triceps', 'forearms_grip'],
    wrist_hand: ['forearms_grip'],
    thoracic_spine: ['upper_back', 'core_rotation'],
    lumbar_spine: ['lower_back', 'core_anterior', 'core_lateral'],
    hip: ['glutes', 'hip_abductors', 'hip_adductors', 'hip_flexors', 'quadriceps', 'hamstrings'],
    knee: ['quadriceps', 'hamstrings', 'gastrocnemius'],
    ankle: ['gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles'],
    foot: ['feet_ankles', 'tibialis_anterior', 'gastrocnemius', 'soleus'],
  };
  return mapping[item as JointRegion] ?? [];
}

function readinessBandFromCheckIn(value: NonNullable<Awaited<ReturnType<typeof getTodayReadinessCheckIn>>>) {
  const invertedStress = 6 - value.stress;
  const score = (value.sleep + value.energy + value.muscleFreshness + invertedStress + value.motivation) / 5;
  return readinessBand(score);
}

function formatToken(value: string): string {
  return value.replaceAll('_', ' ');
}

function startOfWeek(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return localDate(date);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function addDaysIso(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * 86_400_000).toISOString();
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
