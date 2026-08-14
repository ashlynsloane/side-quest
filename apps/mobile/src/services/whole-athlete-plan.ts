import type {
  EnduranceActivity,
  PerformanceGoal,
  TrainingBlockPlan,
  TrainingCalendarEvent,
  TrainingCalendarSource,
  TrainingCheckIn,
} from '@circuit/domain';
import {
  applyReturnToRunProgression,
  buildRaceHorizonDevelopmentPlan,
  raceHorizonWeekForDate,
  recentReturnToRunDurations,
  normalizeCalendarEvent,
  normalizeStrengthSession,
  type RaceHorizonDevelopmentPlan,
} from '@circuit/planner';
import { applyApprovedFrequencySuppression,
  type DisciplineCountMap } from '@circuit/planner/frequency-suppression';
import {
  applyProgressionToWholeAthleteWeek,
  buildWholeAthleteProgressionContextFromHistory,
  type CompletedDisciplineExposure,
  } from '@circuit/planner/whole-athlete-progression';
import {
  buildWholeAthleteWeek,
  resolveWeeklySchedulePreference,
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
import {
  clearAllSideQuestPlanSessionOverrides,
  listSideQuestPlanSessionOverrides,
  resolveSideQuestPlanOverrideEvent,
  type SideQuestPlanSessionOverride,
} from './side-quest-plan-overrides';
import {
  applyAvailabilityToWholeAthleteWeeks,
  loadTrainingAvailabilityProfile,
  plannerWeeklySchedule,
  type AvailabilityScheduledSession,
  type AvailabilityScheduledWeekPlan,
} from './training-availability';
import { generatedWorkoutNamingMetadata } from './workout-name-context';
import { applyPersistedTrainingSpaces } from './training-space-runtime';
import { applyRaceHorizonStrengthDose } from './race-horizon-strength-dose';

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
  completedHistory?: CompletedDisciplineExposure[];
  progressionDate?: string;
  progressionAsOf?: string;
}

export interface GeneratedWholeAthleteBlock {
  weeks: AvailabilityScheduledWeekPlan[];
  generatedEvents: TrainingCalendarEvent[];
  developmentPlan?: RaceHorizonDevelopmentPlan;
}

export async function generateAndPersistWholeAthleteBlock(
  input: GenerateWholeAthleteBlockInput,
): Promise<GeneratedWholeAthleteBlock> {
  const firstWeek = input.block.weeks[0];
  const lastWeek = input.block.weeks.at(-1);
  if (!firstWeek || !lastWeek) return { weeks: [], generatedEvents: [] };

  const rangeStartDate = firstWeek.weekStartDate;
  const rangeEndDate = addDays(lastWeek.weekStartDate, 6);
  const rangeStart = `${rangeStartDate}T00:00:00.000Z`;
  const rangeEnd = `${addDays(lastWeek.weekStartDate, 7)}T23:59:59.999Z`;
  const lookbackStart = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const [calendarEvents, recentActivities] = await Promise.all([
    getTrainingCalendarEvents({ from: rangeStart, to: rangeEnd }),
    listEnduranceActivities({ from: lookbackStart, to: new Date().toISOString(), limit: 5_000 }),
  ]);

  const availabilityProfile = loadTrainingAvailabilityProfile();
  const athleteCalendarEvents = calendarEvents.filter((event) => !isSideQuestGeneratedPlanEvent(event));
  const blockEventPrefix = `${PLAN_EVENT_PREFIX}${safeId(input.block.id)}_`;
  const overrides = listSideQuestPlanSessionOverrides()
    .filter((override) => override.baseEvent.sourceId === SIDE_QUEST_PLAN_SOURCE_ID)
    .filter((override) => override.eventId.startsWith(blockEventPrefix))
    .filter((override) => overrideDate(override) >= rangeStartDate && overrideDate(override) <= rangeEndDate);
  const approvedGeneratedEvents = overrides
    .map(resolveSideQuestPlanOverrideEvent)
    .filter((event): event is TrainingCalendarEvent => event !== null);

  const baselines = buildDisciplineBaselines(recentActivities, input.capacity, input.goal);
  const health = buildWholeAthleteHealthContext(input);
  const absentGoalDisciplines = (['swim', 'bike', 'run'] as const).filter((discipline) => !input.goal.disciplines.includes(discipline));
  const frequencyTargets = Object.fromEntries(absentGoalDisciplines.map((discipline) => [discipline, { min: 0, preferred: 0, max: 0 }])) as Partial<Record<TrainableDiscipline, { min: number; preferred: number; max: number }>>;
  if (input.capacity.runStatus === 'not_running') frequencyTargets.run = { min: 0, preferred: 0, max: 0 };
  if (
    input.capacity.runStatus === 'return_to_run'
    && health.boneStress !== 'active'
    && health.injuryConstraint !== 'restricted'
    && !health.noImpact
  ) {
    frequencyTargets.run = { min: 3, preferred: 3, max: 3 };
  }
  const returnToRunSeedMinutes = input.capacity.runStatus === 'return_to_run'
    ? recentReturnToRunDurations(input.completedHistory ?? [], firstWeek.weekStartDate)
    : [];
  const developmentPlan = input.goal.eventDate
    ? buildRaceHorizonDevelopmentPlan({
        startDate: firstWeek.weekStartDate,
        raceDate: input.goal.eventDate,
        goalType: input.goal.type,
        runStatus: input.capacity.runStatus,
        recentBoneStress: input.capacity.boneStressInjuryHistory === 'recent_or_current',
      })
    : undefined;

  const weeks: AvailabilityScheduledWeekPlan[] = [];
  const generatedEvents: TrainingCalendarEvent[] = [];
  let previousWeek: NonNullable<Parameters<typeof buildWholeAthleteWeek>[0]['previousWeek']> =
    previousWeekFromActivities(recentActivities, firstWeek.weekStartDate);

  for (const [weekIndex, week] of input.block.weeks.entries()) {
    const developmentWeek = developmentPlan
      ? raceHorizonWeekForDate(developmentPlan, week.weekStartDate)
      : undefined;
    const resolvedPhase = developmentWeek?.phase ?? week.phase;
    const absoluteWeeklyCeilingMinutes = Math.max(0, Math.round(input.capacity.totalWeeklyHours * 60));
    const weekPlanningCeilingMinutes = developmentWeek
      ? Math.min(
          absoluteWeeklyCeilingMinutes,
          Math.max(0, Math.round(absoluteWeeklyCeilingMinutes * developmentWeek.targetLoadFactor)),
        )
      : absoluteWeeklyCeilingMinutes;
    const weekEnd = addDays(week.weekStartDate, 6);
    const inCurrentWeek = (date: string) => date >= week.weekStartDate && date <= weekEnd;
    const fixedCalendar = athleteCalendarEvents
      .filter((event) => inCurrentWeek(event.startAt.slice(0, 10)))
      .filter(isTrainingCalendarCommitment)
      .map((event) => ({ ...normalizeCalendarEvent(event), priority: 'required' as const }));
    const fixedApprovedEndurance = approvedGeneratedEvents
      .filter((event) => inCurrentWeek(event.startAt.slice(0, 10)))
      .filter(isTrainingCalendarCommitment)
      .map((event) => ({ ...normalizeCalendarEvent(event), priority: 'required' as const }));
    const weeklySchedule = plannerWeeklySchedule(availabilityProfile);
    const resolvedWeeklySchedule = resolveWeeklySchedulePreference(
      input.goal.type,
      weeklySchedule,
    );
    if (resolvedWeeklySchedule) {
      Object.assign(weeklySchedule, resolvedWeeklySchedule);
    }
    const fixedStrength = alignSideQuestStrengthToWeeklyScaffold(
      week.sessions
        .filter((session) => session.completionStatus !== 'skipped')
        .map((session) => applyRaceHorizonStrengthDose(session, developmentWeek))
        .map((session) => ({
          ...normalizeStrengthSession(session),
          priority: 'required' as const,
          keySession: session.intendedLoad === 'high',
        })),
      week.weekStartDate,
      input.goal.type,
      weeklySchedule.preferredDays?.strength,
      weeklySchedule.availableDays?.strength,
      weeklySchedule.restDays,
    );

    const rawWeekEvents = calendarEvents.filter((event) => inCurrentWeek(event.startAt.slice(0, 10)));
    const weekOverrides = overrides.filter((override) => inCurrentWeek(override.baseEvent.startAt.slice(0, 10)));
    const overriddenIds = new Set(weekOverrides.map((override) => override.eventId));
    const untouchedWeekEvents = rawWeekEvents.filter((event) => !overriddenIds.has(event.id));
    const originalCount = (discipline: 'swim' | 'bike' | 'run') =>
      untouchedWeekEvents.filter((event) => event.discipline === discipline).length
      + weekOverrides.filter((override) => override.baseEvent.discipline === discipline).length;
    const originallyPlanned: DisciplineCountMap = {
      swim: originalCount('swim'),
      bike: originalCount('bike'),
      run: originalCount('run'),
      strength: fixedStrength.length,
    };
    const suppressed: DisciplineCountMap = {
      swim: countSuppressed(weekOverrides, 'swim'),
      bike: countSuppressed(weekOverrides, 'bike'),
      run: countSuppressed(weekOverrides, 'run'),
    };
    const weekFrequencyTargets = applyApprovedFrequencySuppression(
      {
        ...frequencyTargets,
        strength: { min: fixedStrength.length, preferred: fixedStrength.length, max: fixedStrength.length },
      },
      originallyPlanned,
      suppressed,
    );

    const basePlan = buildWholeAthleteWeek({
      weekStartDate: week.weekStartDate,
      availableMinutes: weekPlanningCeilingMinutes,
      goalType: input.goal.type,
      phase: resolvedPhase,
      health,
      developmentWeek,
      fixedSessions: [...fixedCalendar, ...fixedApprovedEndurance, ...fixedStrength],
      previousWeek,
      baselines,
      frequencyTargets: weekFrequencyTargets,
      recentBoneStress: input.capacity.boneStressInjuryHistory === 'recent_or_current',
      returnToRun: input.capacity.runStatus === 'return_to_run',
      weeklySchedule,
    });
    const progressionApplies = Boolean(
      input.progressionDate
      && input.progressionAsOf
      && input.completedHistory?.length
      && inCurrentWeek(input.progressionDate),
    );
    const progressedPlan: WholeAthleteWeekPlan = progressionApplies
      ? applyProgressionToWholeAthleteWeek(
          basePlan,
          buildWholeAthleteProgressionContextFromHistory({
            weekStartDate: week.weekStartDate,
            asOf: input.progressionAsOf!,
            exposures: input.completedHistory!,
          }),
        )
      : basePlan;
    const returnToRunPlan = input.capacity.runStatus === 'return_to_run'
      ? applyReturnToRunProgression(progressedPlan, {
          weekIndex,
          recentBoneStress: input.capacity.boneStressInjuryHistory === 'recent_or_current',
          recentCompletedRunMinutes: returnToRunSeedMinutes,
        })
      : progressedPlan;
    const scheduledPlan = applyAvailabilityToWholeAthleteWeeks([returnToRunPlan], availabilityProfile)[0]!;

    // Training-space assignment is deliberately post-scheduling.
    // It may annotate existing strength sessions but cannot move or create them.
    const spaceAwareWeek = applyPersistedTrainingSpaces(
      scheduledPlan.sessions,
    );

    const resolvedScheduledPlan = {
      ...scheduledPlan,
      sessions: spaceAwareWeek.sessions,
    };

    weeks.push(resolvedScheduledPlan);
    previousWeek = resolvedScheduledPlan.sessions;
    for (const session of resolvedScheduledPlan.sessions) {
      if (session.planningCommitment !== 'generated') continue;
      if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') continue;
      const event = plannedSessionToCalendarEvent(session, input.block.id);
      event.description = [
        event.description,
        developmentWeek
          ? `Race horizon · week ${developmentWeek.weekNumber}/${developmentWeek.totalWeeks} · ${developmentWeek.phase.replaceAll('_', ' ')} · ${developmentWeek.loadIntent}\nWeek purpose: ${developmentWeek.weekPurpose}\nPlanning ceiling: ${Math.round(developmentWeek.targetLoadFactor * 100)}% of available weekly capacity (${weekPlanningCeilingMinutes} min). Availability remains a ceiling, not a target.`
          : undefined,
        generatedWorkoutNamingMetadata({
          phase: resolvedPhase,
          goalType: input.goal.type,
          raceDate: input.goal.eventDate,
          raceName: input.goal.name,
        }),
      ].filter((value): value is string => Boolean(value)).join('\n');
      generatedEvents.push(event);
    }
  }

  const persistedEvents = dedupeEvents([...approvedGeneratedEvents, ...generatedEvents]);
  await persistGeneratedPlanEvents(persistedEvents);
  return { weeks, generatedEvents: persistedEvents, developmentPlan };
}


function alignSideQuestStrengthToWeeklyScaffold<T extends { date: string }>(
  sessions: T[],
  weekStartDate: string,
  goalType: PerformanceGoal['type'],
  explicitPreferred: readonly number[] | undefined,
  availableDays: readonly number[] | undefined,
  restDays: readonly number[] | undefined,
): T[] {
  if (!sessions.length) return sessions;

  const rest = new Set(restDays ?? []);
  const triathlon = goalType === 'triathlon_sprint'
    || goalType === 'triathlon_olympic'
    || goalType === 'ironman_70_3'
    || goalType === 'ironman_full';

  const available = availableDays?.length ? new Set(availableDays) : null;
  const legal = (weekday: number) => !rest.has(weekday) && (!available || available.has(weekday));
  const requested = (explicitPreferred?.length
    ? [...explicitPreferred]
    : triathlon
      ? [2, 4]
      : [])
    .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
    .filter(legal);

  const fallback = [2, 4, 3, 5, 6, 1, 0].filter(legal);
  const weekdays = [...new Set([...requested, ...fallback])];
  if (!weekdays.length) return sessions;

  return sessions.map((session, index) => {
    const weekday = weekdays[index];
    if (weekday === undefined) return session;
    return {
      ...session,
      date: addDays(weekStartDate, weekday),
    };
  });
}

export async function clearSideQuestGeneratedPlanEvents(): Promise<void> {
  await replaceTrainingCalendarEvents(SIDE_QUEST_PLAN_SOURCE_ID, []);
  clearAllSideQuestPlanSessionOverrides();
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
      const sessionsPerWeek = discipline === 'run' && capacity.runStatus === 'return_to_run'
        ? 3
        : discipline === 'run' && capacity.runStatus === 'not_running'
          ? 0
          : 2;
      const minutesPerWeek = discipline === 'run' && capacity.runStatus === 'return_to_run'
        ? 60
        : Math.round(fallbackMinutes * weights[discipline]);
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
    musculoskeletalDemand: discipline === 'run' ? (hard ? 'high' as const : 'moderate' as const) : discipline === 'bike' ? (hard ? 'moderate' as const : 'low') : 'low' as const,
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
  session: AvailabilityScheduledSession,
  blockId: string,
): TrainingCalendarEvent {
  const startAt = session.scheduledStartAt ?? `${session.date}T12:00:00.000Z`;
  const endAt = session.scheduledEndAt ?? new Date(new Date(startAt).getTime() + session.durationMinutes * 60_000).toISOString();
  return {
    id: `${PLAN_EVENT_PREFIX}${safeId(blockId)}_${safeId(session.id)}`,
    sourceId: SIDE_QUEST_PLAN_SOURCE_ID,
    title: session.title,
    startAt,
    endAt,
    allDay: !session.scheduledStartAt,
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

function countSuppressed(
  overrides: SideQuestPlanSessionOverride[],
  discipline: 'swim' | 'bike' | 'run',
): number {
  return overrides.filter((override) =>
    override.baseEvent.discipline === discipline
    && (override.option.action === 'skip' || override.option.action === 'replace')).length;
}

function overrideDate(override: SideQuestPlanSessionOverride): string {
  if (override.option.action === 'move' && override.option.targetDate) return override.option.targetDate;
  return override.baseEvent.startAt.slice(0, 10);
}

function dedupeEvents(events: TrainingCalendarEvent[]): TrainingCalendarEvent[] {
  const byId = new Map<string, TrainingCalendarEvent>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => left.startAt.localeCompare(right.startAt) || left.id.localeCompare(right.id));
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
