import type {
  EnduranceActivity,
  PerformanceGoal,
  TrainingBlockPlan,
  TrainingCalendarEvent,
  TrainingCalendarSource,
  TrainingCheckIn,
} from '@circuit/domain';
import { normalizeCalendarEvent, normalizeStrengthSession } from '@circuit/planner';
import {
  buildWholeAthleteWeek,
  type DisciplineBaseline,
  type MentalEnergySignal,
  type LifeStressSignal,
  type EnergyAvailabilitySignal,
  type MenstrualRecoverySignal,
  type TrainableDiscipline,
  type WholeAthleteHealthContext,
  type WholeAthleteWeekPlan,
} from '@circuit/planner/whole-athlete-week';

import {
  getTrainingCalendarEvents,
  listEnduranceActivities,
  replaceTrainingCalendarEvents,
  saveTrainingCalendarSource,
} from './database';
import type { DailyReadinessCheckIn } from './readiness';

export const SIDE_QUEST_PLAN_SOURCE_ID = 'side_quest_generated_plan';
const PLAN_EVENT_PREFIX = 'sq_plan_';
const LOOKBACK_DAYS = 28;

export interface WholeAthleteHealthPreferences {
  energyAvailability: EnergyAvailabilitySignal;
  menstrualRecovery: MenstrualRecoverySignal;
  mentalEnergy: MentalEnergySignal;
  lifeStress: LifeStressSignal;
}

export interface WholeAthleteCapacityInput {
  totalWeeklyHours: number;
  currentEnduranceHours: number;
  runStatus: 'normal' | 'reduced' | 'return_to_run' | 'not_running';
  boneStressInjuryHistory: 'none' | 'remote' | 'recent_or_current';
}

export interface GenerateWholeAthleteBlockInput {
  block: TrainingBlockPlan;
  goal: PerformanceGoal;
  capacity: WholeAthleteCapacityInput;
  healthPreferences: WholeAthleteHealthPreferences;
  activeCheckIn?: TrainingCheckIn | null;
  ptProfileActive?: boolean;
  readiness?: DailyReadinessCheckIn | null;
}

export interface GeneratedWholeAthleteBlock {
  weeks: WholeAthleteWeekPlan[];
  generatedEvents: TrainingCalendarEvent[];
}

export async function generateAndPersistWholeAthleteBlock(
  input: GenerateWholeAthleteBlockInput,
): Promise<GeneratedWholeAthleteBlock> {
  const firstWeek = input.block.weeks[0];
  const lastWeek = input.block.weeks.at(-1);
  if (!firstWeek || !lastWeek) return { weeks: [], generatedEvents: [] };

  const rangeStart = `${firstWeek.weekStartDate}T00:00:00.000Z`;
  const rangeEnd = `${addDays(lastWeek.weekStartDate, 7)}T23:59:59.999Z`;
  const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const [calendarEvents, recentActivities] = await Promise.all([
    getTrainingCalendarEvents({ from: rangeStart, to: rangeEnd }),
    listEnduranceActivities({ from: lookbackStart, to: new Date().toISOString(), limit: 5_000 }),
  ]);

  const athleteCalendarEvents = calendarEvents.filter((event) => !isSideQuestGeneratedPlanEvent(event));
  const baselines = buildDisciplineBaselines(recentActivities, input.capacity, input.goal);
  const health = buildWholeAthleteHealthContext(input);
  const absentGoalDisciplines = (['swim', 'bike', 'run'] as const).filter((discipline) => !input.goal.disciplines.includes(discipline));
  const frequencyTargets = Object.fromEntries(absentGoalDisciplines.map((discipline) => [discipline, { min: 0, preferred: 0, max: 0 }])) as Partial<Record<TrainableDiscipline, { min: number; preferred: number; max: number }>>;
  if (input.capacity.runStatus === 'not_running') frequencyTargets.run = { min: 0, preferred: 0, max: 0 };

  const weeks: WholeAthleteWeekPlan[] = [];
  const generatedEvents: TrainingCalendarEvent[] = [];
  let previousWeek: NonNullable<Parameters<typeof buildWholeAthleteWeek>[0]['previousWeek']> =
    previousWeekFromActivities(recentActivities, firstWeek.weekStartDate);

  for (const week of input.block.weeks) {
    const weekEnd = addDays(week.weekStartDate, 6);
    const fixedCalendar = athleteCalendarEvents
      .filter((event) => event.startAt.slice(0, 10) >= week.weekStartDate && event.startAt.slice(0, 10) <= weekEnd)
      .filter(isTrainingCalendarCommitment)
      .map((event) => ({ ...normalizeCalendarEvent(event), priority: 'required' as const }));
    const fixedStrength = week.sessions
      .filter((session) => session.completionStatus !== 'skipped')
      .map((session) => ({
        ...normalizeStrengthSession(session),
        priority: 'required' as const,
        keySession: session.intendedLoad === 'high',
      }));

    const strengthCount = fixedStrength.length;
    const weekFrequencyTargets = {
      ...frequencyTargets,
      strength: { min: strengthCount, preferred: strengthCount, max: strengthCount },
    };

    const plan = buildWholeAthleteWeek({
      weekStartDate: week.weekStartDate,
      availableMinutes: Math.max(0, Math.round(input.capacity.totalWeeklyHours * 60)),
      goalType: input.goal.type,
      phase: week.phase,
      health,
      fixedSessions: [...fixedCalendar, ...fixedStrength],
      previousWeek,
      baselines,
      frequencyTargets: weekFrequencyTargets,
      recentBoneStress: input.capacity.boneStressInjuryHistory === 'recent_or_current',
      returnToRun: input.capacity.runStatus === 'return_to_run',
    });

    weeks.push(plan);
    previousWeek = plan.sessions;
    for (const session of plan.sessions) {
      if (session.planningCommitment !== 'generated') continue;
      if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') continue;
      generatedEvents.push(plannedSessionToCalendarEvent(session, input.block.id));
    }
  }

  await persistGeneratedPlanEvents(generatedEvents);
  return { weeks, generatedEvents };
}

export async function clearSideQuestGeneratedPlanEvents(): Promise<void> {
  await replaceTrainingCalendarEvents(SIDE_QUEST_PLAN_SOURCE_ID, []);
  const existing = await sourceMetadata();
  await saveTrainingCalendarSource({ ...existing, lastEventCount: 0, updatedAt: new Date().toISOString() });
}

export function isSideQuestGeneratedPlanEvent(event: TrainingCalendarEvent): boolean {
  return event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID || event.id.startsWith(PLAN_EVENT_PREFIX);
}

export function buildWholeAthleteHealthContext(input: GenerateWholeAthleteBlockInput): WholeAthleteHealthContext {
  const checkIn = input.activeCheckIn;
  const returnToRun = input.capacity.runStatus === 'return_to_run';
  const notRunning = input.capacity.runStatus === 'not_running';
  const recentBoneStress = input.capacity.boneStressInjuryHistory === 'recent_or_current';
  const readiness = input.readiness;
  const readinessLimited = Boolean(readiness && (readiness.energy <= 2 || readiness.motivation <= 2));
  const readinessStressHigh = Boolean(readiness && readiness.stress >= 4);
  const affectedRun = Boolean(checkIn?.affectedRegions.some((region) => ['hip', 'knee', 'ankle', 'foot', 'quadriceps', 'hamstrings', 'glutes', 'gastrocnemius', 'soleus', 'feet_ankles'].includes(region)));
  const noImpact = Boolean(
    notRunning
    || checkIn?.aggravatedMovementTags.includes('high_impact')
    || checkIn?.aggravatedMovementTags.includes('jumping')
    || checkIn?.aggravatedMovementPatterns?.includes('jump_hop'),
  );
  const restrictedDisciplines: TrainableDiscipline[] = [];
  if (notRunning || (checkIn?.status === 'tightness_pain' && affectedRun && (checkIn.severity ?? 0) >= 4)) restrictedDisciplines.push('run');
  if (checkIn?.status === 'unable_to_train') restrictedDisciplines.push('swim', 'bike', 'run', 'strength');

  return {
    energyAvailability: input.healthPreferences.energyAvailability,
    menstrualRecovery: input.healthPreferences.menstrualRecovery,
    boneStress: recentBoneStress ? 'recent' : input.capacity.boneStressInjuryHistory === 'remote' ? 'remote' : 'none',
    injuryConstraint: checkIn?.status === 'unable_to_train'
      ? 'restricted'
      : checkIn?.status === 'tightness_pain' || input.ptProfileActive || returnToRun || recentBoneStress
        ? 'monitor'
        : 'none',
    restrictedDisciplines: [...new Set(restrictedDisciplines)],
    noImpact,
    mentalEnergy: input.healthPreferences.mentalEnergy === 'good' && readinessLimited ? 'limited' : input.healthPreferences.mentalEnergy,
    lifeStress: input.healthPreferences.lifeStress === 'low' && readinessStressHigh ? 'moderate' : input.healthPreferences.lifeStress,
    illnessOrSystemicSymptoms: checkIn?.status === 'unable_to_train',
    athleteRequestedRest: false,
  };
}

export function buildDisciplineBaselines(
  activities: EnduranceActivity[],
  capacity: WholeAthleteCapacityInput,
  goal: PerformanceGoal,
): Partial<Record<TrainableDiscipline, DisciplineBaseline>> {
  const active = activities.filter((activity) => !activity.deletedAt);
  const weeks = LOOKBACK_DAYS / 7;
  const baselines: Partial<Record<TrainableDiscipline, DisciplineBaseline>> = {};
  for (const discipline of ['swim', 'bike', 'run'] as const) {
    const matching = active.filter((activity) => activity.discipline === discipline);
    if (!matching.length) continue;
    baselines[discipline] = {
      sessionsPerWeek: roundOne(matching.length / weeks),
      minutesPerWeek: Math.round(matching.reduce((sum, activity) => sum + activity.movingTimeSeconds / 60, 0) / weeks),
      longestSessionMinutes: Math.max(...matching.map((activity) => Math.round(activity.movingTimeSeconds / 60))),
    };
  }

  if (!baselines.swim && !baselines.bike && !baselines.run && capacity.currentEnduranceHours > 0) {
    const fallbackMinutes = capacity.currentEnduranceHours * 60;
    const weights = goalFallbackWeights(goal);
    for (const discipline of ['swim', 'bike', 'run'] as const) {
      if (!goal.disciplines.includes(discipline) || weights[discipline] <= 0) continue;
      const minutesPerWeek = Math.round(fallbackMinutes * weights[discipline]);
      const sessionsPerWeek = discipline === 'run' && capacity.runStatus === 'return_to_run' ? 2 : discipline === 'run' && capacity.runStatus === 'not_running' ? 0 : 2;
      if (sessionsPerWeek === 0) continue;
      baselines[discipline] = {
        sessionsPerWeek,
        minutesPerWeek,
        longestSessionMinutes: Math.round(minutesPerWeek / sessionsPerWeek * (discipline === 'bike' ? 1.4 : 1.15)),
      };
    }
  }
  return baselines;
}

function previousWeekFromActivities(activities: EnduranceActivity[], nextWeekStart: string) {
  const start = addDays(nextWeekStart, -7);
  const end = addDays(nextWeekStart, -1);
  return activities
    .filter((activity) => !activity.deletedAt && activity.startAt.slice(0, 10) >= start && activity.startAt.slice(0, 10) <= end)
    .filter((activity) => activity.discipline === 'swim' || activity.discipline === 'bike' || activity.discipline === 'run')
    .map((activity) => completedActivityToUnified(activity));
}

function completedActivityToUnified(activity: EnduranceActivity) {
  const discipline = activity.discipline as 'swim' | 'bike' | 'run';
  const durationMinutes = Math.max(1, Math.round(activity.movingTimeSeconds / 60));
  const intensity = inferActivityIntensity(activity);
  const hard = intensity === 'hard' || intensity === 'max';
  return {
    id: `history_${activity.id}`,
    date: activity.startAt.slice(0, 10),
    title: activity.name,
    discipline,
    durationMinutes,
    intensity,
    cardiovascularDemand: hard ? 'high' as const : intensity === 'moderate' ? 'moderate' as const : 'low' as const,
    musculoskeletalDemand: discipline === 'run' ? (hard ? 'high' as const : 'moderate' as const) : discipline === 'bike' ? (hard ? 'moderate' as const : 'low' as const) : 'low' as const,
    lowerBodyDemand: discipline === 'run' || discipline === 'bike' ? (hard ? 'high' as const : 'moderate' as const) : 'none' as const,
    upperBodyDemand: discipline === 'swim' ? (hard ? 'high' as const : 'moderate' as const) : 'none' as const,
    impact: discipline === 'run' ? (hard ? 'high' as const : 'moderate' as const) : 'none' as const,
    technicalDemand: discipline === 'swim' ? 'high' as const : 'moderate' as const,
    recoveryCost: (hard ? 4 : intensity === 'moderate' ? 2 : 1) as 0 | 1 | 2 | 3 | 4 | 5,
    priority: 'recommended' as const,
    source: 'manual' as const,
    keySession: hard,
  };
}

function inferActivityIntensity(activity: EnduranceActivity): 'easy' | 'moderate' | 'hard' | 'max' {
  if (activity.intensity === 'race') return 'max';
  if (activity.intensity === 'hard') return 'hard';
  if (activity.intensity === 'moderate') return 'moderate';
  if (activity.intensity === 'easy' || activity.intensity === 'recovery') return 'easy';
  const text = `${activity.name} ${activity.sportType ?? ''}`.toLowerCase();
  if (/race|vo2|max/.test(text)) return 'max';
  if (/threshold|interval|tempo|hard|long/.test(text)) return 'hard';
  if (/easy|recovery/.test(text)) return 'easy';
  return 'moderate';
}

function isTrainingCalendarCommitment(event: TrainingCalendarEvent): boolean {
  return event.discipline === 'swim'
    || event.discipline === 'bike'
    || event.discipline === 'run'
    || event.discipline === 'strength'
    || event.discipline === 'rest';
}

function plannedSessionToCalendarEvent(
  session: WholeAthleteWeekPlan['sessions'][number],
  blockId: string,
): TrainingCalendarEvent {
  const startAt = `${session.date}T12:00:00.000Z`;
  const endAt = new Date(new Date(startAt).getTime() + session.durationMinutes * 60_000).toISOString();
  return {
    id: `${PLAN_EVENT_PREFIX}${safeId(blockId)}_${safeId(session.id)}`,
    sourceId: SIDE_QUEST_PLAN_SOURCE_ID,
    title: session.title,
    startAt,
    endAt,
    allDay: true,
    discipline: session.discipline as 'swim' | 'bike' | 'run',
    description: [
      `Side Quest generated · ${session.durationMinutes} min · ${session.intensity}`,
      ...session.rationale,
    ].join('\n'),
    externalUid: `${PLAN_EVENT_PREFIX}${safeId(blockId)}_${safeId(session.id)}`,
  };
}

async function persistGeneratedPlanEvents(events: TrainingCalendarEvent[]): Promise<void> {
  const source = await sourceMetadata();
  await replaceTrainingCalendarEvents(SIDE_QUEST_PLAN_SOURCE_ID, events);
  await saveTrainingCalendarSource({
    ...source,
    lastEventCount: events.length,
    lastSuccessfulAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function sourceMetadata(): Promise<TrainingCalendarSource> {
  const now = new Date().toISOString();
  return {
    id: SIDE_QUEST_PLAN_SOURCE_ID,
    name: 'Side Quest plan',
    sourceType: 'manual',
    active: true,
    autoRefresh: false,
    syncStatus: 'success',
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function goalFallbackWeights(goal: PerformanceGoal): Record<'swim' | 'bike' | 'run', number> {
  if (goal.type === 'swim_speed') return { swim: 1, bike: 0, run: 0 };
  if (goal.type === 'swimrun') return { swim: 0.4, bike: 0, run: 0.6 };
  if (goal.type.startsWith('triathlon_') || goal.type === 'ironman_70_3' || goal.type === 'ironman_full') return { swim: 0.25, bike: 0.45, run: 0.3 };
  return { swim: 0, bike: 0, run: 1 };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
