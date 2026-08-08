import type {
  BodyRegion,
  EnduranceDiscipline,
  EnduranceSchedule,
  EquipmentId,
  GoalTerrain,
  PerformanceGoal,
  PerformanceGoalType,
  PTProfile,
  TrainingBlockLength,
  TrainingBlockPlan,
  TrainingCheckIn,
  Weekday,
} from '@circuit/domain';
import {
  adaptTrainingBlock,
  generateTrainingBlock,
  recommendStrengthDose,
  type AthleteCapacityProfile,
} from '@circuit/planner';
import {
  defaultRaceIntent,
  type RaceIntentV2,
  type RaceOverallObjective,
  type RaceTargetKind,
} from '@circuit/planner/race-intent';

import {
  deleteCurrentGoalPlan,
  ensureDefaultEquipmentProfiles,
  getActiveTrainingCheckIn,
  getLatestPerformanceGoal,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getPreviousExerciseIds,
  getRecentRegionExposures,
  savePerformanceGoal,
  saveTrainingBlock,
  type EquipmentProfile,
} from './database';
import { applyRaceIntent } from './race-intent-runtime';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export type GoalSetupRestriction = 'none' | 'lower_body' | 'upper_body' | 'back' | 'other';
export type GoalSetupFocusLevel = 'primary_focus' | 'maximize';

export interface GoalSetupDraft {
  goalType: PerformanceGoalType;
  eventDate?: string;
  terrain: GoalTerrain;
  overallObjective: RaceOverallObjective;
  overallTarget?: string;
  primaryDiscipline?: EnduranceDiscipline;
  focusLevel: GoalSetupFocusLevel;
  tradeoffTolerance: RaceIntentV2['tradeoffTolerance'];
  disciplineTargetKind?: RaceTargetKind;
  disciplineTargetValue?: string;
  totalWeeklyHours: number;
  currentEnduranceHours: number;
  runStatus: AthleteCapacityProfile['runStatus'];
  maxRunMilesLast12Weeks: number;
  boneStressInjuryHistory: AthleteCapacityProfile['boneStressInjuryHistory'];
  swimProficiency: AthleteCapacityProfile['swimProficiency'];
  bikeProficiency: AthleteCapacityProfile['bikeProficiency'];
  runProficiency: AthleteCapacityProfile['runProficiency'];
  strengthExperience: AthleteCapacityProfile['strengthExperience'];
  preferredStrengthDays: Weekday[];
  enduranceSchedule: EnduranceSchedule;
  equipmentProfileId?: string;
  equipment: EquipmentId[];
  restriction: GoalSetupRestriction;
  blockLength: TrainingBlockLength;
}

export interface GoalSetupEnvironment {
  existingGoal: PerformanceGoal | null;
  existingBlock: TrainingBlockPlan | null;
  ptProfile: PTProfile | null;
  activeCheckIn: TrainingCheckIn | null;
  equipmentProfiles: EquipmentProfile[];
  draft: GoalSetupDraft;
}

export interface GoalSetupBuildResult {
  goal: PerformanceGoal;
  block: TrainingBlockPlan;
  raceIntent?: RaceIntentV2;
}

export const GOAL_SETUP_OPTIONS: Array<{
  type: PerformanceGoalType;
  title: string;
  description: string;
  category: 'triathlon' | 'running' | 'trail' | 'performance';
  defaultWeeks: number;
  disciplines: EnduranceDiscipline[];
}> = [
  { type: 'triathlon_sprint', title: 'Sprint triathlon', description: 'Short-course swim, bike, and run speed.', category: 'triathlon', defaultWeeks: 10, disciplines: ['swim', 'bike', 'run'] },
  { type: 'triathlon_olympic', title: 'Olympic triathlon', description: 'Balanced multisport endurance and speed.', category: 'triathlon', defaultWeeks: 12, disciplines: ['swim', 'bike', 'run'] },
  { type: 'ironman_70_3', title: 'Ironman 70.3', description: 'Long-course durability across swim, bike, and run.', category: 'triathlon', defaultWeeks: 16, disciplines: ['swim', 'bike', 'run'] },
  { type: 'ironman_full', title: 'Ironman distance', description: 'Full-distance durability and resilient strength.', category: 'triathlon', defaultWeeks: 24, disciplines: ['swim', 'bike', 'run'] },
  { type: 'swimrun', title: 'Swimrun', description: 'Repeated swim and trail-run transitions.', category: 'triathlon', defaultWeeks: 16, disciplines: ['swim', 'run'] },
  { type: 'road_10k', title: 'Road 10K', description: 'Speed, running economy, and lower-leg resilience.', category: 'running', defaultWeeks: 10, disciplines: ['run'] },
  { type: 'road_half_marathon', title: 'Road half marathon', description: 'Sustained running economy and durability.', category: 'running', defaultWeeks: 12, disciplines: ['run'] },
  { type: 'road_marathon', title: 'Road marathon', description: 'High-volume road-running durability.', category: 'running', defaultWeeks: 16, disciplines: ['run'] },
  { type: 'trail_50k', title: 'Trail 50K', description: 'Climbing, descending, and trail durability.', category: 'trail', defaultWeeks: 16, disciplines: ['run'] },
  { type: 'trail_100k', title: 'Trail 100K', description: 'Ultra-distance mountain resilience.', category: 'trail', defaultWeeks: 24, disciplines: ['run'] },
  { type: 'swim_speed', title: 'Swim faster', description: 'Swim-specific strength, control, and power.', category: 'performance', defaultWeeks: 10, disciplines: ['swim'] },
  { type: 'general_offseason', title: 'Offseason strength', description: 'Build broad strength without a near-term race.', category: 'performance', defaultWeeks: 0, disciplines: [] },
];

const PLAN_LENGTHS: TrainingBlockLength[] = [1, 2, 4, 8, 12];
const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export async function loadGoalSetupEnvironment(requestedGoal?: PerformanceGoalType): Promise<GoalSetupEnvironment> {
  const [existingGoal, savedBlock, ptProfile, activeCheckIn, equipmentProfiles] = await Promise.all([
    getLatestPerformanceGoal(),
    getLatestTrainingBlock(),
    getLatestPTProfile(),
    getActiveTrainingCheckIn(),
    ensureDefaultEquipmentProfiles(),
  ]);
  const goalType = requestedGoal ?? existingGoal?.type ?? 'ironman_70_3';
  const defaultProfile = equipmentProfiles.find((profile) => profile.isDefault) ?? equipmentProfiles[0];
  return {
    existingGoal,
    existingBlock: savedBlock?.block ?? null,
    ptProfile,
    activeCheckIn,
    equipmentProfiles,
    draft: buildInitialDraft(goalType, existingGoal, savedBlock?.block ?? null, defaultProfile),
  };
}

export function resetDraftForGoal(
  current: GoalSetupDraft,
  goalType: PerformanceGoalType,
): GoalSetupDraft {
  const option = goalSetupOption(goalType);
  const eventDate = goalType === 'general_offseason' ? undefined : dateFromWeeks(option.defaultWeeks);
  const weeks = goalType === 'general_offseason' ? 8 : option.defaultWeeks;
  const disciplines = option.disciplines;
  return {
    ...current,
    goalType,
    eventDate,
    terrain: defaultTerrain(goalType),
    primaryDiscipline: disciplines.length === 1 ? disciplines[0] : undefined,
    overallObjective: 'strong_finish',
    overallTarget: undefined,
    disciplineTargetKind: undefined,
    disciplineTargetValue: undefined,
    blockLength: suggestedBlockLength(weeks),
    enduranceSchedule: defaultEnduranceSchedule(disciplines),
  };
}

export function recommendedStrengthDoseForDraft(draft: GoalSetupDraft) {
  return recommendStrengthDose(capacityForDraft(draft), draft.goalType, weeksUntilEvent(draft));
}

export function buildRaceIntentForDraft(draft: GoalSetupDraft): RaceIntentV2 | undefined {
  const option = goalSetupOption(draft.goalType);
  if (!option.disciplines.length || draft.goalType === 'general_offseason') return undefined;
  const base = defaultRaceIntent(draft.goalType, option.disciplines, legacyPriorityForObjective(draft.overallObjective));
  const disciplinePriorities: RaceIntentV2['disciplinePriorities'] = {};
  const baseline = draft.overallObjective === 'finish_comfortably' ? 'maintain' : 'develop';
  for (const discipline of option.disciplines) disciplinePriorities[discipline] = baseline;

  if (draft.primaryDiscipline && option.disciplines.includes(draft.primaryDiscipline)) {
    disciplinePriorities[draft.primaryDiscipline] = draft.focusLevel;
    for (const discipline of option.disciplines) {
      if (discipline === draft.primaryDiscipline) continue;
      disciplinePriorities[discipline] = draft.tradeoffTolerance === 'aggressive_specialization'
        ? 'minimum_viable'
        : draft.tradeoffTolerance === 'moderate_tradeoff'
          ? 'maintain'
          : baseline;
    }
  }

  const disciplineTargets = draft.primaryDiscipline && draft.disciplineTargetKind
    ? {
        [draft.primaryDiscipline]: {
          kind: draft.disciplineTargetKind,
          value: draft.disciplineTargetValue?.trim() || undefined,
        },
      }
    : undefined;

  return {
    ...base,
    overallObjective: draft.overallObjective,
    overallTarget: draft.overallTarget?.trim() || undefined,
    primaryDiscipline: draft.primaryDiscipline,
    disciplinePriorities,
    tradeoffTolerance: draft.tradeoffTolerance,
    disciplineTargets,
  };
}

export function validateGoalSetupDraft(draft: GoalSetupDraft): string[] {
  const errors: string[] = [];
  const option = goalSetupOption(draft.goalType);
  const weeks = weeksUntilEvent(draft);
  if (draft.goalType !== 'general_offseason') {
    if (!draft.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate)) errors.push('Enter the event date as YYYY-MM-DD.');
    else if (weeks < 0) errors.push('The event date must be today or later.');
    else if (weeks < draft.blockLength) errors.push(`A ${draft.blockLength}-week block would extend beyond the event.`);
  }
  if (draft.totalWeeklyHours < 3 || draft.totalWeeklyHours > 25) errors.push('Weekly training capacity must be between 3 and 25 hours.');
  if (draft.currentEnduranceHours < 0 || draft.currentEnduranceHours > draft.totalWeeklyHours) errors.push('Current endurance hours cannot exceed total weekly capacity.');
  const recommendation = recommendedStrengthDoseForDraft(draft);
  if (recommendation.validationErrors[0]) errors.push(recommendation.validationErrors[0]);
  if (draft.preferredStrengthDays.length < recommendation.sessionsPerWeek) errors.push(`Choose at least ${recommendation.sessionsPerWeek} days where strength could fit.`);
  if (!draft.equipment.length) errors.push('Choose a training setup with at least one equipment option.');
  if (draft.primaryDiscipline && !option.disciplines.includes(draft.primaryDiscipline)) errors.push('The top-focus discipline must be part of the selected goal.');
  if (draft.overallObjective === 'specific_overall_time' && !draft.overallTarget?.trim()) errors.push('Add the overall race-time target.');
  return [...new Set(errors)];
}

export async function buildAndSaveGoalSetup(
  draft: GoalSetupDraft,
  exercises: Parameters<typeof generateTrainingBlock>[1]['exercises'],
): Promise<GoalSetupBuildResult> {
  const errors = validateGoalSetupDraft(draft);
  if (errors[0]) throw new Error(errors[0]);
  const environment = await loadGoalSetupEnvironment(draft.goalType);
  if (environment.activeCheckIn?.status === 'unable_to_train') {
    throw new Error(`Strength training is paused through ${formatDate(environment.activeCheckIn.activeUntil.slice(0, 10))}. Update today's check-in before rebuilding the plan.`);
  }

  const option = goalSetupOption(draft.goalType);
  const weeks = weeksUntilEvent(draft);
  const recommendation = recommendedStrengthDoseForDraft(draft);
  const now = new Date().toISOString();
  const goal: PerformanceGoal = {
    id: `goal_${draft.goalType}`,
    type: draft.goalType,
    name: draft.goalType === 'general_offseason' ? option.title : `${option.title} · ${draft.eventDate}`,
    eventDate: draft.goalType === 'general_offseason' ? undefined : draft.eventDate,
    weeksUntilEvent: draft.goalType === 'general_offseason' ? 0 : weeks,
    terrain: supportsTerrain(draft.goalType) ? draft.terrain : undefined,
    disciplines: option.disciplines,
    priority: legacyPriorityForObjective(draft.overallObjective),
    sessionsPerWeek: recommendation.sessionsPerWeek,
    defaultSessionMinutes: recommendation.sessionMinutes,
    capacityProfile: capacityForDraft(draft),
    phaseStrengthSessions: recommendation.phaseSchedule,
    strengthDoseMetadata: {
      minutesPerWeek: recommendation.minutesPerWeek,
      minimumEffectiveMinutes: recommendation.minimumEffectiveMinutes,
      maximumRecommendedMinutes: recommendation.maximumRecommendedMinutes,
      maxHighLoadStrengthDays: recommendation.maxHighLoadStrengthDays,
      maxTotalHardDays: recommendation.maxTotalHardDays,
      sessionRoles: recommendation.sessionRoles,
    },
    createdAt: environment.existingGoal?.createdAt ?? now,
    updatedAt: now,
  };

  const [recentRegionExposures, previousExerciseIds] = await Promise.all([
    getRecentRegionExposures(),
    getPreviousExerciseIds(),
  ]);
  const activePT = environment.ptProfile?.active ? environment.ptProfile : null;
  const setupExcluded = excludedRegionsForRestriction(draft.restriction);
  const result = generateTrainingBlock({
    goal,
    numberOfWeeks: draft.blockLength,
    weekStartDate: nextMondayIsoDate(),
    availableEquipment: draft.equipment,
    excludedRegions: unique([...(activePT?.excludedRegions ?? []), ...setupExcluded]),
    excludedMovementTags: activePT?.excludedMovementTags ?? [],
    regionRestrictions: activePT?.regionRestrictions ?? [],
    excludedMovementPatterns: activePT?.excludedMovementPatterns ?? [],
    difficulty: draft.strengthExperience,
    preferredStrengthDays: draft.preferredStrengthDays,
    enduranceSchedule: draft.enduranceSchedule,
    randomSeed: `goal-setup-${Date.now()}`,
  }, {
    exercises,
    recentRegionExposures,
    previousExerciseIds,
  });
  if (!result.ok) throw new Error(result.messages.join(' '));

  await savePerformanceGoal(goal);
  let blockToSave = result.block;
  if (environment.activeCheckIn) {
    await saveTrainingBlock(result.block);
    const adjusted = adaptTrainingBlock(result.block, buildCheckInOverride(environment.activeCheckIn, activePT), {
      exercises,
      recentRegionExposures,
      previousExerciseIds,
      now,
    });
    if (!adjusted.ok) throw new Error(`The base plan was created, but today's temporary check-in could not be applied: ${adjusted.messages.join(' ')}`);
    blockToSave = adjusted.block;
  }
  await saveTrainingBlock(blockToSave);

  const raceIntent = buildRaceIntentForDraft(draft);
  if (raceIntent) await applyRaceIntent(raceIntent);
  else await refreshLatestWholeAthletePlan();
  return { goal, block: blockToSave, raceIntent };
}

export async function removeCurrentGoalSetup(): Promise<void> {
  await deleteCurrentGoalPlan();
}

export function goalSetupOption(type: PerformanceGoalType) {
  return GOAL_SETUP_OPTIONS.find((option) => option.type === type) ?? GOAL_SETUP_OPTIONS[2]!;
}

export function weeksUntilEvent(draft: Pick<GoalSetupDraft, 'goalType' | 'eventDate'>): number {
  if (draft.goalType === 'general_offseason') return 0;
  if (!draft.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate)) return -1;
  const target = new Date(`${draft.eventDate}T12:00:00`);
  if (!Number.isFinite(target.getTime())) return -1;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function suggestedBlockLength(weeksUntil: number): TrainingBlockLength {
  if (weeksUntil <= 1) return 1;
  return [...PLAN_LENGTHS].reverse().find((weeks) => weeks <= weeksUntil) ?? 1;
}

export function defaultEnduranceSchedule(disciplines: EnduranceDiscipline[]): EnduranceSchedule {
  return {
    keySwim: disciplines.includes('swim') ? 'tuesday' : null,
    keyBike: disciplines.includes('bike') ? 'saturday' : null,
    keyRun: disciplines.includes('run') ? 'sunday' : null,
  };
}

export function weekdays(): Weekday[] {
  return [...WEEKDAYS];
}

function buildInitialDraft(
  goalType: PerformanceGoalType,
  existingGoal: PerformanceGoal | null,
  existingBlock: TrainingBlockPlan | null,
  defaultProfile: EquipmentProfile | undefined,
): GoalSetupDraft {
  const matching = existingGoal?.type === goalType ? existingGoal : null;
  const option = goalSetupOption(goalType);
  const capacity = matching?.capacityProfile;
  const eventDate = goalType === 'general_offseason' ? undefined : matching?.eventDate ?? dateFromWeeks(option.defaultWeeks);
  const weeks = goalType === 'general_offseason' ? 8 : Math.max(1, matching?.weeksUntilEvent ?? option.defaultWeeks);
  return {
    goalType,
    eventDate,
    terrain: matching?.terrain ?? defaultTerrain(goalType),
    overallObjective: matching?.priority === 'finish' ? 'finish_comfortably' : matching?.priority === 'race' ? 'best_overall' : 'strong_finish',
    primaryDiscipline: option.disciplines.length === 1 ? option.disciplines[0] : undefined,
    focusLevel: 'primary_focus',
    tradeoffTolerance: 'preserve_balance',
    totalWeeklyHours: capacity?.totalWeeklyHours ?? 10,
    currentEnduranceHours: capacity?.currentEnduranceHours ?? 6,
    runStatus: capacity?.runStatus ?? 'normal',
    maxRunMilesLast12Weeks: capacity?.maxRunMilesLast12Weeks ?? 20,
    boneStressInjuryHistory: capacity?.boneStressInjuryHistory ?? 'none',
    swimProficiency: capacity?.swimProficiency ?? 'average',
    bikeProficiency: capacity?.bikeProficiency ?? 'average',
    runProficiency: capacity?.runProficiency ?? 'average',
    strengthExperience: capacity?.strengthExperience ?? 'intermediate',
    preferredStrengthDays: ['tuesday', 'thursday', 'saturday'],
    enduranceSchedule: defaultEnduranceSchedule(option.disciplines),
    equipmentProfileId: defaultProfile?.id,
    equipment: defaultProfile?.equipment ?? ['bodyweight'],
    restriction: 'none',
    blockLength: existingBlock?.goal.type === goalType ? existingBlock.numberOfWeeks : suggestedBlockLength(weeks),
  };
}

function capacityForDraft(draft: GoalSetupDraft): AthleteCapacityProfile {
  return {
    totalWeeklyHours: draft.totalWeeklyHours,
    currentEnduranceHours: draft.currentEnduranceHours,
    runStatus: draft.runStatus,
    maxRunMilesLast12Weeks: draft.maxRunMilesLast12Weeks,
    boneStressInjuryHistory: draft.boneStressInjuryHistory,
    swimProficiency: draft.swimProficiency,
    bikeProficiency: draft.bikeProficiency,
    runProficiency: draft.runProficiency,
    strengthExperience: draft.strengthExperience,
  };
}

function buildCheckInOverride(checkIn: TrainingCheckIn, ptProfile: PTProfile | null) {
  const legacyHardRegions = checkIn.regionRestrictions?.length
    ? []
    : (checkIn.status === 'tightness_pain' || (checkIn.status === 'muscle_soreness' && checkIn.severity >= 4) ? checkIn.affectedRegions : []);
  return {
    id: checkIn.id,
    source: 'temporary_check_in' as const,
    label: checkIn.status === 'muscle_soreness' ? 'Temporary soreness adjustment' : 'Temporary pain or tightness adjustment',
    activeFrom: checkIn.createdAt,
    activeUntil: checkIn.activeUntil,
    excludedRegions: unique([...legacyHardRegions, ...(ptProfile?.active ? ptProfile.excludedRegions : [])]),
    excludedMovementTags: unique([...checkIn.aggravatedMovementTags, ...(ptProfile?.active ? ptProfile.excludedMovementTags : [])]),
    regionRestrictions: mergeRegionRestrictions([...(checkIn.regionRestrictions ?? []), ...(ptProfile?.active ? ptProfile.regionRestrictions ?? [] : [])]),
    excludedMovementPatterns: unique([...(checkIn.aggravatedMovementPatterns ?? []), ...(ptProfile?.active ? ptProfile.excludedMovementPatterns ?? [] : [])]),
    penalizedRegions: checkIn.affectedRegions.filter((region): region is BodyRegion => BODY_REGIONS.has(region as BodyRegion)),
  };
}

function mergeRegionRestrictions(values: NonNullable<PTProfile['regionRestrictions']>) {
  const rank = { direct_only: 1, keep_light: 2, avoid: 3 } as const;
  const merged = new Map<string, NonNullable<PTProfile['regionRestrictions']>[number]>();
  for (const value of values) {
    const current = merged.get(value.region);
    if (!current || rank[value.mode] > rank[current.mode]) merged.set(value.region, value);
  }
  return [...merged.values()];
}

function excludedRegionsForRestriction(value: GoalSetupRestriction): BodyRegion[] {
  if (value === 'lower_body') return ['quadriceps', 'hamstrings', 'glutes', 'gastrocnemius', 'soleus', 'feet_ankles'];
  if (value === 'upper_body') return ['chest', 'shoulders', 'upper_back', 'lats', 'biceps', 'triceps'];
  if (value === 'back') return ['lower_back', 'core_rotation'];
  return [];
}

function legacyPriorityForObjective(value: RaceOverallObjective): PerformanceGoal['priority'] {
  if (value === 'finish_comfortably') return 'finish';
  if (value === 'strong_finish') return 'perform';
  return 'race';
}

function supportsTerrain(type: PerformanceGoalType): boolean {
  return type !== 'swim_speed' && type !== 'general_offseason';
}

function defaultTerrain(type: PerformanceGoalType): GoalTerrain {
  if (type === 'trail_50k' || type === 'trail_100k' || type === 'swimrun') return 'technical_trail';
  if (type === 'road_10k' || type === 'road_half_marathon' || type === 'road_marathon') return 'flat';
  return 'rolling';
}

function dateFromWeeks(weeks: number): string {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return localIsoDate(date);
}

function nextMondayIsoDate(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  return localIsoDate(monday);
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

const BODY_REGIONS = new Set<BodyRegion>([
  'chest', 'shoulders', 'upper_back', 'lats', 'biceps', 'triceps', 'forearms_grip',
  'core_anterior', 'core_lateral', 'core_rotation', 'lower_back', 'glutes',
  'hamstrings', 'quadriceps', 'hip_abductors', 'hip_adductors', 'hip_flexors',
  'gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles',
]);
