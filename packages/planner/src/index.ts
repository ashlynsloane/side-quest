import type {
  BodyRegion,
  EnduranceDiscipline,
  EnduranceSchedule,
  FocusTarget,
  GeneratedWorkout,
  PerformanceGoal,
  PerformanceGoalType,
  PlanRestrictionOverride,
  PlannedSessionPurpose,
  PlannedStrengthSession,
  RecentRegionExposure,
  TrainingBlockPlan,
  TrainingBlockRequest,
  TrainingBlockResult,
  TrainingBlockRequestSnapshot,
  TrainingCalendarEvent,
  TrainingCheckIn,
  TodayRecommendation,
  TrainingPhase,
  Weekday,
  WeeklyPlanRequest,
  WeeklyPlanResult,
  WeeklyPlanningContext,
  WeeklyTrainingPlan,
  WorkoutGenerationRequest,
} from '@circuit/domain';
import { createWorkoutVariant, generateWorkout } from '@circuit/generator';
import { evaluateStrengthLoad, scaleWorkMinutes } from './strength-load-management';
export { evaluateStrengthLoad } from './strength-load-management';
export { buildTrainingWeekEvidence, localTrainingDate, normalizeTrainingSport, proposeCompletedWeekBaseline } from './core-training-week-evidence';
export { assessWeekForBaseline, approveWeekBaseline, assessSavedBaseline, baselineSourceSignature } from './training-baseline-review';
export type { CoverageReviewAttestation, ApprovedWeekSnapshot, BaselineReviewIssue } from './training-baseline-review';
export type { TrainingWeekEvidence, TrainingWeekEvidenceInput } from './core-training-week-evidence';
export { EXPERIMENTAL_TRAINING_POLICY_V1, freezeExperimentalTrainingAllowance, reconcileGuardrailExposure, evaluateExperimentalTrainingGuardrails } from './experimental-training-guardrails';
export type { ApprovedCompletedBaseline, FrozenTrainingAllowance, TrainingExposureRecord, TrainingGuardrailEvaluation, PlanningInterruptionState, GuardrailStatus } from './experimental-training-guardrails';
export { buildExerciseNoveltyDecision, classifyExerciseFamiliarity, profileExerciseNovelty } from './exercise-novelty';

type SessionBlueprint = {
  title: string;
  purpose: PlannedSessionPurpose;
  focusTargets: FocusTarget[];
  rationale: string;
  style?: WorkoutGenerationRequest['workoutStyle'];
  maximumImpact?: WorkoutGenerationRequest['maximumImpact'];
};

const WEEKDAY_OFFSETS: Record<Weekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const FALLBACK_DAY_OFFSETS: Record<1 | 2 | 3 | 4 | 5, number[]> = {
  1: [2],
  2: [1, 4],
  3: [1, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 5, 6],
};

const GOAL_LABELS: Record<PerformanceGoalType, string> = {
  triathlon_sprint: 'Sprint Triathlon',
  triathlon_olympic: 'Olympic Triathlon',
  ironman_70_3: 'Ironman 70.3',
  ironman_full: 'Ironman Distance',
  swimrun: 'Swimrun',
  road_10k: 'Road 10K',
  road_half_marathon: 'Road Half Marathon',
  road_marathon: 'Road Marathon',
  trail_50k: 'Trail 50K',
  trail_100k: 'Trail 100K',
  swim_speed: 'Swim Speed',
  general_offseason: 'Offseason Strength',
};

const LONG_DISTANCE_GOALS = new Set<PerformanceGoalType>([
  'ironman_full',
  'road_marathon',
  'trail_50k',
  'trail_100k',
  'swimrun',
]);

export function determineTrainingPhase(
  goalType: WeeklyPlanRequest['goal']['type'],
  weeksUntilEvent: number,
): TrainingPhase {
  if (goalType === 'general_offseason') return 'offseason';
  if (weeksUntilEvent <= 1) return 'race_week';
  if (weeksUntilEvent <= 3) return 'taper';
  if (weeksUntilEvent <= 6) return 'peak';
  if (weeksUntilEvent <= (LONG_DISTANCE_GOALS.has(goalType) ? 16 : 12)) return 'build';
  return 'base';
}


export function recommendToday({
  block,
  checkIn,
  calendarEvents = [],
  now = new Date().toISOString(),
}: {
  block: TrainingBlockPlan | null;
  checkIn?: TrainingCheckIn | null;
  calendarEvents?: TrainingCalendarEvent[];
  now?: string;
}): TodayRecommendation {
  const today = now.slice(0, 10);
  const todayEvents = calendarEvents.filter((event) => event.startAt.slice(0, 10) === today);

  if (!block) {
    return {
      status: 'no_plan',
      headline: 'Build a goal-based plan first',
      explanation: ['No active strength plan was found.', 'A one-off workout is still available when you do not want a longer plan.'],
      calendarEvents: todayEvents,
    };
  }

  if (checkIn?.status === 'unable_to_train') {
    return {
      status: 'recover',
      headline: 'Strength is paused today',
      explanation: [
        `Your active check-in pauses strength through ${checkIn.activeUntil.slice(0, 10)}.`,
        'Update the check-in when that restriction no longer applies.',
      ],
      calendarEvents: todayEvents,
    };
  }

  const sessions = block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.completionStatus !== 'completed' && session.completionStatus !== 'skipped')
    .sort((left, right) => left.date.localeCompare(right.date));
  const todaySession = sessions.find((session) => session.date === today);

  if (todaySession) {
    let recommendedVariant: TodayRecommendation['recommendedVariant'] = 'full';
    const explanation = [todaySession.rationale];
    if (checkIn?.status === 'tightness_pain' || (checkIn?.severity ?? 0) >= 4) {
      recommendedVariant = 'minimum';
      explanation.unshift('Your active check-in favors the minimum effective version today.');
    } else if (checkIn?.status === 'muscle_soreness' || (checkIn?.severity ?? 0) >= 2) {
      recommendedVariant = 'reduced';
      explanation.unshift('Recent soreness favors the reduced version while preserving the session’s main purpose.');
    }
    if (todayEvents.some((event) => event.discipline === 'run' || event.discipline === 'bike')) {
      if (recommendedVariant === 'full') recommendedVariant = 'reduced';
      explanation.push('A key lower-body endurance event is also on today’s calendar, so strength volume is reduced.');
    } else if (todayEvents.some((event) => event.discipline === 'swim') && todaySession.purpose === 'swim_support') {
      if (recommendedVariant === 'full') recommendedVariant = 'reduced';
      explanation.push('A swim event overlaps a swim-support strength day, so the reduced version is preferred.');
    }

    return {
      status: 'planned_session',
      headline: todaySession.title,
      explanation,
      session: todaySession,
      recommendedVariant,
      calendarEvents: todayEvents,
    };
  }

  const nextSession = sessions.find((session) => session.date > today);
  return {
    status: 'no_strength_today',
    headline: 'No strength session is scheduled today',
    explanation: nextSession
      ? [`The next planned session is ${nextSession.title} on ${nextSession.date}.`, 'Keeping the recovery space between sessions is part of the plan.']
      : ['No remaining strength sessions were found in the current block.'],
    session: nextSession,
    recommendedVariant: nextSession ? 'full' : undefined,
    calendarEvents: todayEvents,
  };
}

export function workoutForRecommendation(
  recommendation: TodayRecommendation,
  level = recommendation.recommendedVariant ?? 'full',
): GeneratedWorkout | null {
  if (!recommendation.session) return null;
  return createWorkoutVariant(recommendation.session.workout, level);
}

export function generateTrainingBlock(
  request: TrainingBlockRequest,
  context: WeeklyPlanningContext,
): TrainingBlockResult {
  if (
    request.goal.type !== 'general_offseason'
    && request.numberOfWeeks > Math.max(1, request.goal.weeksUntilEvent)
  ) {
    return {
      ok: false,
      reason: 'INVALID_GOAL',
      messages: [
        `The selected ${request.numberOfWeeks}-week plan extends beyond the event. Choose a shorter plan or a later event date.`,
      ],
    };
  }

  const weeks: WeeklyTrainingPlan[] = [];
  const accumulatedExposures = [...(context.recentRegionExposures ?? [])];
  let previousExerciseIds = context.previousExerciseIds ?? [];

  for (let weekIndex = 0; weekIndex < request.numberOfWeeks; weekIndex += 1) {
    const weekStartDate = addDays(request.weekStartDate, weekIndex * 7);
    const adjustedGoal: PerformanceGoal = {
      ...request.goal,
      weeksUntilEvent: request.goal.type === 'general_offseason'
        ? 0
        : Math.max(0, request.goal.weeksUntilEvent - weekIndex),
      updatedAt: new Date().toISOString(),
    };

    const result = generateWeeklyPlan(
      {
        ...request,
        goal: adjustedGoal,
        weekStartDate,
        randomSeed: `${request.randomSeed ?? request.goal.id}-anchor-block`,
      },
      {
        ...context,
        recentRegionExposures: accumulatedExposures,
        previousExerciseIds,
        strengthRampWeekIndex: weekIndex,
      },
    );

    if (!result.ok) return result;

    const blockLoadDecision = evaluateStrengthLoad({
      requestedSessions: result.plan.goal.phaseStrengthSessions?.[result.plan.phase] ?? result.plan.goal.sessionsPerWeek,
      weekStartDate,
      baseline: context.strengthLoadBaseline,
      history: context.strengthHistory,
      responses: context.strengthResponses,
      rampWeekIndex: weekIndex,
    });
    const plan = applyBlockProgression(
      {
        ...result.plan,
        weekNumber: weekIndex + 1,
        weeksUntilEvent: adjustedGoal.weeksUntilEvent,
      },
      weekIndex,
      blockLoadDecision.allowRepProgression,
    );
    weeks.push(plan);

    const finalSession = plan.sessions.at(-1);
    if (finalSession) {
      previousExerciseIds = finalSession.workout.stations.flatMap((station) =>
        station.exercises.map((item) => item.exerciseId),
      );
    }
    for (const session of plan.sessions) {
      accumulatedExposures.push(...workoutExposures(session.workout, `${session.date}T12:00:00.000Z`));
    }
  }

  const createdAt = new Date().toISOString();
  const block: TrainingBlockPlan = {
    id: `block_${hashString(`${request.goal.id}-${request.weekStartDate}-${request.numberOfWeeks}-${request.randomSeed ?? createdAt}`).toString(16)}`,
    createdAt,
    numberOfWeeks: request.numberOfWeeks,
    goal: request.goal,
    weeks,
    requestSnapshot: {
      availableEquipment: request.availableEquipment,
      excludedRegions: request.excludedRegions,
      excludedMovementTags: request.excludedMovementTags,
      regionRestrictions: request.regionRestrictions ?? [],
      excludedMovementPatterns: request.excludedMovementPatterns ?? [],
      difficulty: request.difficulty,
      preferredStrengthDays: request.preferredStrengthDays,
      enduranceSchedule: request.enduranceSchedule,
    },
    adaptations: [],
  };

  return { ok: true, block };
}


/**
 * Rewrites only upcoming sessions that overlap an active temporary or PT
 * restriction window. Past sessions and unaffected future sessions remain
 * unchanged. This is plan adaptation, not diagnosis or medical clearance.
 */
export function adaptTrainingBlock(
  block: TrainingBlockPlan,
  override: PlanRestrictionOverride,
  context: WeeklyPlanningContext,
): TrainingBlockResult {
  const snapshot = block.requestSnapshot ?? inferRequestSnapshot(block);
  const today = (context.now ?? new Date().toISOString()).slice(0, 10);
  const activeFrom = override.activeFrom.slice(0, 10);
  const activeUntil = override.activeUntil?.slice(0, 10);
  const effectiveStart = activeFrom > today ? activeFrom : today;

  const penaltyExposures: RecentRegionExposure[] = override.penalizedRegions.map((region) => ({
    region,
    rawExposure: 80,
    completedAt: `${effectiveStart}T08:00:00.000Z`,
  }));

  const adjustedWeeks: WeeklyTrainingPlan[] = [];
  let previousExerciseIds = context.previousExerciseIds ?? [];

  for (const originalWeek of block.weeks) {
    const overlappingSessions = originalWeek.sessions.filter((session) =>
      session.date >= effectiveStart && (!activeUntil || session.date <= activeUntil),
    );

    if (overlappingSessions.length === 0) {
      adjustedWeeks.push(originalWeek);
      const last = originalWeek.sessions.at(-1);
      if (last) {
        previousExerciseIds = last.workout.stations.flatMap((station) =>
          station.exercises.map((item) => item.exerciseId),
        );
      }
      continue;
    }

    if (override.pauseStrengthTraining) {
      adjustedWeeks.push({
        ...originalWeek,
        sessions: originalWeek.sessions.filter((session) =>
          session.date < effectiveStart || Boolean(activeUntil && session.date > activeUntil),
        ),
        warnings: [
          ...originalWeek.warnings,
          `${override.label}: strength sessions in the active window were paused. Update the check-in when normal training is appropriate again.`,
        ],
      });
      continue;
    }

    const regenerated = generateWeeklyPlan(
      {
        goal: originalWeek.goal,
        weekStartDate: originalWeek.weekStartDate,
        availableEquipment: snapshot.availableEquipment,
        excludedRegions: unique([
          ...snapshot.excludedRegions,
          ...override.excludedRegions,
        ]),
        excludedMovementTags: unique([
          ...snapshot.excludedMovementTags,
          ...override.excludedMovementTags,
        ]),
        regionRestrictions: mergeRegionRestrictions([
          ...(snapshot.regionRestrictions ?? []),
          ...(override.regionRestrictions ?? []),
        ]),
        excludedMovementPatterns: unique([
          ...(snapshot.excludedMovementPatterns ?? []),
          ...(override.excludedMovementPatterns ?? []),
        ]),
        difficulty: snapshot.difficulty,
        preferredStrengthDays: snapshot.preferredStrengthDays,
        enduranceSchedule: snapshot.enduranceSchedule,
        randomSeed: `${block.id}-${override.id}-${originalWeek.weekStartDate}`,
      },
      {
        ...context,
        now: `${originalWeek.weekStartDate}T08:00:00.000Z`,
        recentRegionExposures: [
          ...(context.recentRegionExposures ?? []),
          ...penaltyExposures,
        ],
        previousExerciseIds,
      },
    );

    if (!regenerated.ok) return regenerated;

    const replacementsByOrder = new Map(
      regenerated.plan.sessions.map((session) => [session.order, session]),
    );
    const sessions = originalWeek.sessions.map((session) => {
      const affected = session.date >= effectiveStart
        && (!activeUntil || session.date <= activeUntil);
      if (!affected) return session;

      const replacement = replacementsByOrder.get(session.order);
      if (!replacement) return session;
      return {
        ...replacement,
        id: `${replacement.id}_${override.id}`,
        date: session.date,
        order: session.order,
        completionStatus: 'modified' as const,
        placementNote: `${override.label}. ${replacement.placementNote ?? 'The session was rebuilt around the active restriction window.'}`,
      };
    });

    adjustedWeeks.push({
      ...originalWeek,
      sessions,
      warnings: [
        ...originalWeek.warnings,
        `${override.label}: upcoming sessions through ${activeUntil ?? 'the end of the plan'} were adjusted.`,
      ],
    });

    const last = sessions.at(-1);
    if (last) {
      previousExerciseIds = last.workout.stations.flatMap((station) =>
        station.exercises.map((item) => item.exerciseId),
      );
    }
  }

  const appliedAt = new Date().toISOString();
  return {
    ok: true,
    block: {
      ...block,
      id: `${block.id}_adapted_${hashString(`${override.id}-${appliedAt}`).toString(16)}`,
      createdAt: appliedAt,
      weeks: adjustedWeeks,
      requestSnapshot: snapshot,
      parentBlockId: block.id,
      adaptations: [
        ...(block.adaptations ?? []),
        {
          id: override.id,
          source: override.source,
          label: override.label,
          appliedAt,
          activeFrom: override.activeFrom,
          activeUntil: override.activeUntil,
        },
      ],
    },
  };
}

function inferRequestSnapshot(block: TrainingBlockPlan): TrainingBlockRequestSnapshot {
  const firstSession = block.weeks.flatMap((week) => week.sessions)[0];
  const request = firstSession?.workout.request;
  const firstWeekDays = block.weeks[0]?.sessions.map((session) => weekdayFromIsoDate(session.date));
  return {
    availableEquipment: request?.availableEquipment ?? ['bodyweight'],
    excludedRegions: request?.excludedRegions ?? [],
    excludedMovementTags: request?.excludedMovementTags ?? [],
    regionRestrictions: request?.regionRestrictions ?? [],
    excludedMovementPatterns: request?.excludedMovementPatterns ?? [],
    difficulty: request?.difficulty ?? 'intermediate',
    preferredStrengthDays: firstWeekDays,
    enduranceSchedule: undefined,
  };
}

function weekdayFromIsoDate(value: string): Weekday {
  const date = new Date(`${value}T12:00:00Z`);
  const weekdays: Weekday[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return weekdays[date.getUTCDay()] ?? 'monday';
}

function mergeRegionRestrictions(values: NonNullable<WeeklyPlanRequest['regionRestrictions']>): NonNullable<WeeklyPlanRequest['regionRestrictions']> {
  const rank = { direct_only: 1, keep_light: 2, avoid: 3 } as const;
  const merged = new Map<string, NonNullable<WeeklyPlanRequest['regionRestrictions']>[number]>();
  for (const value of values) {
    const current = merged.get(value.region);
    if (!current || rank[value.mode] > rank[current.mode]) merged.set(value.region, value);
  }
  return [...merged.values()];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function generateWeeklyPlan(
  request: WeeklyPlanRequest,
  context: WeeklyPlanningContext,
): WeeklyPlanResult {
  if (!Number.isFinite(request.goal.weeksUntilEvent) || request.goal.weeksUntilEvent < 0) {
    return {
      ok: false,
      reason: 'INVALID_GOAL',
      messages: ['Weeks until the event must be zero or greater.'],
    };
  }

  const phase = determineTrainingPhase(request.goal.type, request.goal.weeksUntilEvent);
  const blueprints = applyGoalModifiers(buildBlueprints(request.goal.type, phase), request.goal);
  const phaseSessionCount = request.goal.phaseStrengthSessions?.[phase] ?? request.goal.sessionsPerWeek;
  const requestedSessionCount = Math.max(1, Math.min(5, phaseSessionCount)) as 1 | 2 | 3 | 4 | 5;
  const strengthLoadDecision = evaluateStrengthLoad({
    requestedSessions: requestedSessionCount,
    weekStartDate: request.weekStartDate,
    baseline: context.strengthLoadBaseline,
    history: context.strengthHistory,
    responses: context.strengthResponses,
    rampWeekIndex: context.strengthRampWeekIndex,
  });
  const safeSessionCount = strengthLoadDecision.allowedSessions;
  const selectedBlueprints = selectBlueprints(blueprints, safeSessionCount, request.goal, phase);
  const scheduledDays = scheduleSessionDays(request, selectedBlueprints, phase);
  const plannedExposures: RecentRegionExposure[] = [];
  const sessions: PlannedStrengthSession[] = [];

  for (let index = 0; index < selectedBlueprints.length; index += 1) {
    const blueprint = selectedBlueprints[index];
    const date = addDays(request.weekStartDate, scheduledDays[index].offset);
    const workoutRequest = buildWorkoutRequest(request, blueprint, phase, index, strengthLoadDecision);
    const generationContext: WeeklyPlanningContext = {
      ...context,
      now: `${date}T12:00:00.000Z`,
      recentRegionExposures: [
        ...(context.recentRegionExposures ?? []),
        ...plannedExposures,
      ],
      previousExerciseIds: sessions.at(-1)?.workout.stations.flatMap((station) =>
        station.exercises.map((item) => item.exerciseId),
      ) ?? context.previousExerciseIds,
    };

    let result = generateWorkout(workoutRequest, generationContext);
    if (!result.ok && blueprint.focusTargets.length > 1) {
      result = generateWorkout(
        {
          ...workoutRequest,
          focusTargets: [blueprint.focusTargets[0]],
          randomSeed: `${workoutRequest.randomSeed}-fallback`,
        },
        generationContext,
      );
    }

    if (!result.ok) {
      return {
        ok: false,
        reason: 'WORKOUT_GENERATION_FAILED',
        messages: [
          `Session ${index + 1} (${blueprint.title}) could not be generated.`,
          ...result.messages,
        ],
      };
    }

    const workout: GeneratedWorkout = {
      ...result.workout,
      name: blueprint.title,
    };

    sessions.push({
      id: `planned_${index + 1}_${workout.id}`,
      date,
      order: index + 1,
      title: blueprint.title,
      purpose: blueprint.purpose,
      intendedLoad: intendedLoadForPhase(phase, index),
      focusTargets: blueprint.focusTargets,
      workout,
      rationale: blueprint.rationale,
      placementNote: scheduledDays[index].note,
      completionStatus: 'planned',
    });

    plannedExposures.push(...workoutExposures(workout, `${date}T12:00:00.000Z`));
  }

  const now = new Date().toISOString();
  const plan: WeeklyTrainingPlan = {
    id: `plan_${hashString(`${request.goal.id}-${request.weekStartDate}-${request.randomSeed ?? now}`).toString(16)}`,
    createdAt: now,
    weekStartDate: request.weekStartDate,
    weeksUntilEvent: request.goal.weeksUntilEvent,
    goal: request.goal,
    phase,
    headline: `${GOAL_LABELS[request.goal.type]} · ${phaseLabel(phase)} week`,
    phaseExplanation: phaseExplanation(phase),
    sessions,
    warnings: [
      ...planWarnings(request, phase),
      ...(strengthLoadDecision.action === 'progress' ? [] : strengthLoadDecision.reasons),
    ],
  };

  return { ok: true, plan };
}


function applyBlockProgression(
  plan: WeeklyTrainingPlan,
  weekIndex: number,
  allowRepProgression = true,
): WeeklyTrainingPlan {
  if (!allowRepProgression || weekIndex === 0 || plan.phase === 'taper' || plan.phase === 'race_week') return plan;
  const repIncrease = Math.min(2, Math.floor((weekIndex + 1) / 2));
  if (repIncrease <= 0) return plan;
  return {
    ...plan,
    phaseExplanation: `${plan.phaseExplanation} Familiar anchor movements are retained while rep targets progress gradually.`,
    sessions: plan.sessions.map((session) => ({
      ...session,
      workout: {
        ...session.workout,
        stations: session.workout.stations.map((station) => ({
          ...station,
          exercises: station.exercises.map((exercise) => ({
            ...exercise,
            target: exercise.unit === 'seconds'
              ? exercise.target + repIncrease * 5
              : exercise.target + repIncrease,
          })),
        })),
      },
    })),
  };
}

function buildWorkoutRequest(
  request: WeeklyPlanRequest,
  blueprint: SessionBlueprint,
  phase: TrainingPhase,
  index: number,
  strengthLoadDecision: ReturnType<typeof evaluateStrengthLoad>,
): WorkoutGenerationRequest {
  const phaseSettings = settingsForPhase(phase, request.goal.defaultSessionMinutes);
  const adjustedWorkMinutes = scaleWorkMinutes(phaseSettings.workMinutes, strengthLoadDecision.durationMultiplier);
  const excludedMovementTags = new Set(request.excludedMovementTags);
  phaseSettings.additionalExclusions.forEach((tag) => excludedMovementTags.add(tag));

  return {
    workMinutes: adjustedWorkMinutes,
    allowedStationMinutes: [4, 8, 12],
    restSeconds: 60,
    exercisesPerStation: phase === 'race_week' || phase === 'taper' ? 2 : 'mixed',
    focusTargets: blueprint.focusTargets,
    excludedRegions: request.excludedRegions,
    excludedMovementTags: [...excludedMovementTags],
    regionRestrictions: request.regionRestrictions ?? [],
    excludedMovementPatterns: request.excludedMovementPatterns ?? [],
    availableEquipment: request.availableEquipment,
    workoutStyle: blueprint.style ?? phaseSettings.style,
    difficulty: request.difficulty,
    maximumImpact: Math.min(
      blueprint.maximumImpact ?? phaseSettings.maximumImpact,
      request.goal.priority === 'finish'
        ? Math.max(1, phaseSettings.maximumImpact - 1)
        : phaseSettings.maximumImpact,
    ) as WorkoutGenerationRequest['maximumImpact'],
    recoveryAware: true,
    avoidPreviousWorkoutExercises: false,
    favorFamiliarExercises: true,
    allowUnfamiliarExercises: !strengthLoadDecision.reduceNovelty && phase !== 'taper' && phase !== 'race_week',
    minimizeEquipmentChanges: phase === 'taper' || phase === 'race_week',
    randomSeed: `${request.randomSeed ?? request.goal.id}-${request.weekStartDate}-${index + 1}-${blueprint.purpose}`,
  };
}

function settingsForPhase(phase: TrainingPhase, requestedMinutes: 24 | 32 | 40 | 48) {
  switch (phase) {
    case 'offseason':
      return {
        workMinutes: requestedMinutes,
        style: 'strength_amrap' as const,
        maximumImpact: 4 as const,
        additionalExclusions: [] as WorkoutGenerationRequest['excludedMovementTags'],
      };
    case 'base':
    case 'build':
      return {
        workMinutes: requestedMinutes,
        style: 'strength_cardio_amrap' as const,
        maximumImpact: 3 as const,
        additionalExclusions: [] as WorkoutGenerationRequest['excludedMovementTags'],
      };
    case 'peak':
      return {
        workMinutes: Math.min(requestedMinutes, 32) as 24 | 32,
        style: 'strength_cardio_amrap' as const,
        maximumImpact: 2 as const,
        additionalExclusions: [] as WorkoutGenerationRequest['excludedMovementTags'],
      };
    case 'taper':
      return {
        workMinutes: 24 as const,
        style: 'low_impact' as const,
        maximumImpact: 1 as const,
        additionalExclusions: ['jumping', 'high_impact'] as WorkoutGenerationRequest['excludedMovementTags'],
      };
    case 'race_week':
      return {
        workMinutes: 24 as const,
        style: 'low_impact' as const,
        maximumImpact: 1 as const,
        additionalExclusions: ['jumping', 'high_impact', 'complex_coordination'] as WorkoutGenerationRequest['excludedMovementTags'],
      };
  }
}

function maintenanceBlueprint(phase: TrainingPhase): SessionBlueprint {
  return {
    title: phase === 'race_week' ? 'Race-Week Movement Primer' : 'Full-Body Strength Maintenance',
    purpose: 'maintenance',
    focusTargets: [
      { region: 'glutes', emphasis: 'moderate' },
      { region: 'core_anterior', emphasis: 'light' },
    ],
    rationale: 'Preserves broad strength without concentrating excessive fatigue in one region.',
    style: phase === 'race_week' ? 'low_impact' : undefined,
    maximumImpact: phase === 'race_week' ? 1 : undefined,
  };
}

function buildBlueprints(goalType: PerformanceGoalType, phase: TrainingPhase): SessionBlueprint[] {
  const maintenance = maintenanceBlueprint(phase);
  let profile: SessionBlueprint[];

  switch (goalType) {
    case 'triathlon_sprint':
      profile = triathlonBlueprints('sprint', maintenance);
      break;
    case 'triathlon_olympic':
      profile = triathlonBlueprints('olympic', maintenance);
      break;
    case 'ironman_70_3':
      profile = triathlonBlueprints('half', maintenance);
      break;
    case 'ironman_full':
      profile = triathlonBlueprints('full', maintenance);
      break;
    case 'swimrun':
      profile = swimrunBlueprints(maintenance);
      break;
    case 'road_10k':
      profile = roadBlueprints('10k', maintenance, phase);
      break;
    case 'road_half_marathon':
      profile = roadBlueprints('half', maintenance, phase);
      break;
    case 'road_marathon':
      profile = roadBlueprints('marathon', maintenance, phase);
      break;
    case 'trail_50k':
      profile = trailBlueprints('50k', maintenance);
      break;
    case 'trail_100k':
      profile = trailBlueprints('100k', maintenance);
      break;
    case 'swim_speed':
      profile = swimSpeedBlueprints(maintenance);
      break;
    case 'general_offseason':
      profile = offseasonBlueprints();
      break;
  }

  if (phase === 'taper' || phase === 'race_week') {
    return profile.map((blueprint, index) => ({
      ...(index === 0 ? maintenance : blueprint),
      title: index === 0 ? maintenance.title : `${blueprint.title} — Reduced Volume`,
      purpose: index === 0 ? maintenance.purpose : blueprint.purpose,
      style: 'low_impact',
      maximumImpact: 1,
      rationale: `${index === 0 ? maintenance.rationale : blueprint.rationale} Volume and impact are reduced for ${phaseLabel(phase).toLowerCase()}.`,
    }));
  }

  return profile;
}

function triathlonBlueprints(
  distance: 'sprint' | 'olympic' | 'half' | 'full',
  maintenance: SessionBlueprint,
): SessionBlueprint[] {
  const shortCourse = distance === 'sprint' || distance === 'olympic';
  const distanceLabel = distance === 'sprint'
    ? 'Sprint'
    : distance === 'olympic'
      ? 'Olympic'
      : distance === 'half'
        ? '70.3'
        : 'Ironman';

  return [
    {
      title: shortCourse ? `${distanceLabel} Lower-Body Force` : 'Posterior-Chain Endurance Strength',
      purpose: shortCourse ? 'max_strength' : 'posterior_durability',
      focusTargets: shortCourse
        ? [
            { region: 'quadriceps', emphasis: 'strong' },
            { region: 'glutes', emphasis: 'strong' },
            { region: 'hamstrings', emphasis: 'moderate' },
          ]
        : [
            { region: 'hamstrings', emphasis: 'strong' },
            { region: 'glutes', emphasis: 'strong' },
            { region: 'core_anterior', emphasis: 'light' },
          ],
      rationale: shortCourse
        ? 'Supports higher-force cycling and running at shorter-course race intensities.'
        : 'Supports sustained cycling force, posture, and late-run durability over long-course racing.',
    },
    {
      title: shortCourse ? 'Swim Pull + Start Power' : 'Swim Support + Trunk Control',
      purpose: 'swim_support',
      focusTargets: [
        { region: 'upper_back', emphasis: 'strong' },
        { region: 'lats', emphasis: 'strong' },
        { region: 'core_anterior', emphasis: 'light' },
      ],
      rationale: shortCourse
        ? 'Builds forceful pulling support and body-line control for faster, more decisive swimming.'
        : 'Builds pulling endurance, scapular control, and trunk stiffness for sustained swimming.',
      maximumImpact: 1,
    },
    {
      title: shortCourse ? 'Single-Leg Run Power + Calves' : 'Single-Leg + Calf Durability',
      purpose: 'single_leg_durability',
      focusTargets: [
        { region: 'quadriceps', emphasis: shortCourse ? 'strong' : 'moderate' },
        { region: 'feet_ankles', emphasis: 'strong' },
        { region: 'hip_abductors', emphasis: 'moderate' },
      ],
      rationale: shortCourse
        ? 'Develops unilateral force, pelvic control, and lower-leg stiffness for faster running off the bike.'
        : 'Targets running durability, pelvic control, and lower-leg capacity after prolonged cycling.',
    },
    maintenance,
    {
      title: shortCourse ? 'Triathlon Power Circuit' : 'Long-Course Durability Circuit',
      purpose: shortCourse ? 'power' : 'full_body',
      focusTargets: [
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'core_rotation', emphasis: 'moderate' },
        { region: 'upper_back', emphasis: distance === 'full' ? 'moderate' : 'light' },
      ],
      rationale: shortCourse
        ? 'Maintains whole-body power and fast transitions without replacing sport-specific speed work.'
        : 'Builds whole-body postural durability for long periods of swimming, cycling, and running.',
      style: shortCourse ? 'power_athleticism' : 'strength_cardio_amrap',
      maximumImpact: shortCourse ? 3 : 2,
    },
  ];
}

function roadBlueprints(
  distance: '10k' | 'half' | 'marathon',
  maintenance: SessionBlueprint,
  phase: TrainingPhase,
): SessionBlueprint[] {
  const fast = distance === '10k';
  const marathon = distance === 'marathon';
  const label = distance === '10k' ? '10K' : distance === 'half' ? 'Half-Marathon' : 'Marathon';

  return [
    {
      title: fast ? '10K Lower-Body Force' : `${label} Strength Foundation`,
      purpose: 'max_strength',
      focusTargets: [
        { region: 'quadriceps', emphasis: fast ? 'strong' : 'moderate' },
        { region: 'glutes', emphasis: 'strong' },
        { region: 'hamstrings', emphasis: marathon ? 'strong' : 'moderate' },
      ],
      rationale: fast
        ? 'Builds lower-body force production that can support running economy and speed.'
        : 'Builds force capacity so race-specific mileage represents a smaller fraction of maximal strength.',
      style: phase === 'base' ? 'strength_amrap' : undefined,
    },
    {
      title: 'Calf, Soleus + Ankle Capacity',
      purpose: 'calf_ankle_capacity',
      focusTargets: [
        { region: 'feet_ankles', emphasis: 'strong' },
        { region: 'soleus', emphasis: 'strong' },
        { region: 'hamstrings', emphasis: 'light' },
      ],
      rationale: fast
        ? 'Develops lower-leg strength and stiffness for repeated fast ground contacts.'
        : 'Builds lower-leg capacity for the cumulative loading of longer road races.',
    },
    {
      title: marathon ? 'Posterior-Chain Marathon Durability' : 'Single-Leg Running Strength',
      purpose: marathon ? 'posterior_durability' : 'single_leg_durability',
      focusTargets: marathon
        ? [
            { region: 'hamstrings', emphasis: 'strong' },
            { region: 'glutes', emphasis: 'strong' },
            { region: 'core_anterior', emphasis: 'moderate' },
          ]
        : [
            { region: 'glutes', emphasis: 'strong' },
            { region: 'hip_abductors', emphasis: 'moderate' },
            { region: 'core_lateral', emphasis: 'light' },
          ],
      rationale: marathon
        ? 'Supports posture and hip extension as fatigue accumulates late in a marathon.'
        : 'Builds pelvic control and unilateral force transfer for efficient running.',
    },
    maintenance,
    {
      title: fast ? 'Running Power Circuit' : `${label} Durability Circuit`,
      purpose: fast ? 'power' : 'single_leg_durability',
      focusTargets: [
        { region: 'quadriceps', emphasis: 'moderate' },
        { region: 'feet_ankles', emphasis: 'moderate' },
        { region: 'core_lateral', emphasis: 'light' },
      ],
      rationale: fast
        ? 'Adds a controlled power stimulus when the current phase permits it.'
        : 'Combines unilateral strength, lower-leg capacity, and trunk control for sustained road running.',
      style: fast ? 'power_athleticism' : undefined,
      maximumImpact: fast ? 3 : 2,
    },
  ];
}

function trailBlueprints(
  distance: '50k' | '100k',
  maintenance: SessionBlueprint,
): SessionBlueprint[] {
  const ultra = distance === '100k';
  return [
    {
      title: ultra ? 'Ultra Climbing + Posterior Strength' : 'Hill-Climbing Strength',
      purpose: 'trail_durability',
      focusTargets: [
        { region: 'quadriceps', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'strong' },
        { region: 'hamstrings', emphasis: ultra ? 'moderate' : 'light' },
      ],
      rationale: ultra
        ? 'Supports repeated climbing and posterior-chain durability across very long trail events.'
        : 'Supports repeated climbing and high-force uphill steps.',
    },
    {
      title: 'Ankle + Lateral Trail Stability',
      purpose: 'stability',
      focusTargets: [
        { region: 'feet_ankles', emphasis: 'strong' },
        { region: 'hip_abductors', emphasis: 'moderate' },
        { region: 'core_lateral', emphasis: 'light' },
      ],
      rationale: 'Targets uneven-terrain control through the foot, ankle, hip, and lateral trunk.',
      style: 'stability_control',
    },
    {
      title: ultra ? 'Long-Descent Eccentric Support' : 'Downhill Durability Support',
      purpose: 'single_leg_durability',
      focusTargets: [
        { region: 'quadriceps', emphasis: 'strong' },
        { region: 'hamstrings', emphasis: 'moderate' },
        { region: 'hip_adductors', emphasis: 'light' },
      ],
      rationale: ultra
        ? 'Builds controlled single-leg capacity for prolonged descending and repeated braking demands.'
        : 'Builds controlled single-leg strength for repeated descents and braking demands.',
    },
    {
      title: ultra ? '100K Trunk + Hip Durability' : 'Trail Posterior Chain + Core',
      purpose: 'posterior_durability',
      focusTargets: [
        { region: 'hamstrings', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'core_anterior', emphasis: 'moderate' },
      ],
      rationale: ultra
        ? 'Builds postural and hip-extension capacity for many hours on variable terrain.'
        : 'Supports posture and propulsion over long, variable terrain.',
    },
    maintenance,
  ];
}

function swimrunBlueprints(maintenance: SessionBlueprint): SessionBlueprint[] {
  return [
    {
      title: 'Swimrun Pull + Trunk Strength',
      purpose: 'swim_support',
      focusTargets: [
        { region: 'lats', emphasis: 'strong' },
        { region: 'upper_back', emphasis: 'strong' },
        { region: 'core_anterior', emphasis: 'moderate' },
      ],
      rationale: 'Supports repeated open-water swim segments while maintaining trunk control through frequent transitions.',
      maximumImpact: 1,
    },
    {
      title: 'Trail Running Durability',
      purpose: 'trail_durability',
      focusTargets: [
        { region: 'quadriceps', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'strong' },
        { region: 'feet_ankles', emphasis: 'moderate' },
      ],
      rationale: 'Builds climbing, descending, and uneven-terrain capacity for repeated trail-running segments.',
    },
    {
      title: 'Transition Posterior Chain + Calves',
      purpose: 'posterior_durability',
      focusTargets: [
        { region: 'hamstrings', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'soleus', emphasis: 'moderate' },
      ],
      rationale: 'Builds the posterior-chain and lower-leg durability needed to repeatedly switch between swimming and running.',
    },
    {
      title: 'Lateral Hip + Ankle Stability',
      purpose: 'stability',
      focusTargets: [
        { region: 'feet_ankles', emphasis: 'strong' },
        { region: 'hip_abductors', emphasis: 'strong' },
        { region: 'core_lateral', emphasis: 'moderate' },
      ],
      rationale: 'Supports technical trail control and stable transitions on wet or uneven surfaces.',
      style: 'stability_control',
    },
    maintenance,
  ];
}

function swimSpeedBlueprints(maintenance: SessionBlueprint): SessionBlueprint[] {
  return [
    {
      title: 'Lat + Upper-Back Strength',
      purpose: 'swim_support',
      focusTargets: [
        { region: 'upper_back', emphasis: 'strong' },
        { region: 'lats', emphasis: 'strong' },
        { region: 'core_anterior', emphasis: 'light' },
      ],
      rationale: 'Develops the pulling musculature and trunk support used during swimming.',
      maximumImpact: 1,
    },
    {
      title: 'Scapular + Shoulder Support',
      purpose: 'swim_support',
      focusTargets: [
        { region: 'shoulders', emphasis: 'moderate' },
        { region: 'upper_back', emphasis: 'strong' },
        { region: 'core_rotation', emphasis: 'light' },
      ],
      rationale: 'Emphasizes scapular control and shoulder-support musculature rather than indiscriminate shoulder volume.',
      maximumImpact: 1,
    },
    {
      title: 'Streamline Core + Posterior Chain',
      purpose: 'posterior_durability',
      focusTargets: [
        { region: 'core_anterior', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'hamstrings', emphasis: 'light' },
      ],
      rationale: 'Builds the trunk and hip support needed to hold an efficient body line.',
      maximumImpact: 1,
    },
    maintenance,
    {
      title: 'Full-Body Swim Power',
      purpose: 'power',
      focusTargets: [
        { region: 'lats', emphasis: 'moderate' },
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'core_rotation', emphasis: 'moderate' },
      ],
      rationale: 'Connects upper-body pulling, trunk control, and hip power.',
      style: 'power_athleticism',
      maximumImpact: 2,
    },
  ];
}

function offseasonBlueprints(): SessionBlueprint[] {
  return [
    {
      title: 'Heavy Lower-Body Foundation',
      purpose: 'max_strength',
      focusTargets: [
        { region: 'quadriceps', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'strong' },
      ],
      rationale: 'Uses the offseason to build foundational lower-body strength.',
      style: 'strength_amrap',
    },
    {
      title: 'Upper-Body Strength Foundation',
      purpose: 'full_body',
      focusTargets: [
        { region: 'upper_back', emphasis: 'strong' },
        { region: 'chest', emphasis: 'moderate' },
        { region: 'shoulders', emphasis: 'moderate' },
      ],
      rationale: 'Builds balanced upper-body strength before race-specific training increases.',
      style: 'strength_amrap',
    },
    {
      title: 'Posterior-Chain Foundation',
      purpose: 'posterior_durability',
      focusTargets: [
        { region: 'hamstrings', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'strong' },
      ],
      rationale: 'Develops hinge strength and posterior-chain capacity.',
      style: 'strength_amrap',
    },
    {
      title: 'Athletic Power + Conditioning',
      purpose: 'power',
      focusTargets: [
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'quadriceps', emphasis: 'moderate' },
        { region: 'core_rotation', emphasis: 'moderate' },
      ],
      rationale: 'Uses the lower sport-specific load of the offseason for broader athletic development.',
      style: 'power_athleticism',
    },
    {
      title: 'Stability + Weak-Link Session',
      purpose: 'stability',
      focusTargets: [
        { region: 'feet_ankles', emphasis: 'moderate' },
        { region: 'hip_abductors', emphasis: 'moderate' },
        { region: 'core_lateral', emphasis: 'moderate' },
      ],
      rationale: 'Trains smaller stabilizing systems that are easy to neglect in endurance training.',
      style: 'stability_control',
    },
  ];
}

function applyGoalModifiers(
  blueprints: SessionBlueprint[],
  goal: PerformanceGoal,
): SessionBlueprint[] {
  if (!goal.terrain || goal.type === 'swim_speed' || goal.type === 'general_offseason') {
    return blueprints;
  }

  return blueprints.map((blueprint, index) => {
    const focusTargets = [...blueprint.focusTargets];
    let rationale = blueprint.rationale;

    if (goal.terrain === 'hilly' || goal.terrain === 'mountainous') {
      if (index < 2 && !focusTargets.some((target) => target.region === 'feet_ankles')) {
        focusTargets.push({ region: 'feet_ankles', emphasis: 'light' });
      }
      rationale += ' The hilly course profile increases the value of calf, ankle, and climbing durability.';
    }

    if (goal.terrain === 'technical_trail') {
      if (!focusTargets.some((target) => target.region === 'hip_abductors')) {
        focusTargets.push({ region: 'hip_abductors', emphasis: 'light' });
      }
      rationale += ' Technical terrain adds lateral hip, foot, and balance demands.';
    }

    if (goal.terrain === 'flat' && isRoadGoal(goal.type)) {
      rationale += ' The flat course profile favors force production and running stiffness over climbing-specific volume.';
    }

    return { ...blueprint, focusTargets: focusTargets.slice(0, 3), rationale };
  });
}

type ScheduledDay = { offset: number; note: string };

function scheduleSessionDays(
  request: WeeklyPlanRequest,
  blueprints: SessionBlueprint[],
  phase: TrainingPhase,
): ScheduledDay[] {
  const preferredOffsets = (request.preferredStrengthDays ?? [])
    .map((day) => WEEKDAY_OFFSETS[day])
    .filter((value, index, values) => values.indexOf(value) === index);
  const requestedCount = Math.max(1, Math.min(5, blueprints.length)) as 1 | 2 | 3 | 4 | 5;
  const fallback = FALLBACK_DAY_OFFSETS[requestedCount];
  const candidates = [...new Set([...preferredOffsets, ...fallback, 0, 1, 2, 3, 4, 5, 6])];
  const selected: ScheduledDay[] = [];
  const eventOffset = eventOffsetWithinWeek(request.weekStartDate, request.goal.eventDate);

  for (let index = 0; index < blueprints.length; index += 1) {
    const load = intendedLoadForPhase(phase, index);
    const blueprint = blueprints[index];
    const available = candidates.filter((offset) => !selected.some((item) => item.offset === offset));
    const ranked = available
      .map((offset) => ({
        offset,
        score: dayPlacementScore(
          offset,
          load,
          blueprint.purpose,
          request.preferredStrengthDays ?? [],
          request.enduranceSchedule,
          selected,
          eventOffset,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.offset - b.offset);
    const chosen = ranked[0] ?? { offset: fallback[index] ?? index, score: 0 };
    selected.push({
      offset: chosen.offset,
      note: placementNote(chosen.offset, request.enduranceSchedule, load, blueprint.purpose, eventOffset),
    });
  }

  return selected
    .map((item) => item.offset)
    .sort((a, b) => a - b)
    .map((offset, index) => ({
      offset,
      note: placementNote(
        offset,
        request.enduranceSchedule,
        intendedLoadForPhase(phase, index),
        blueprints[index]?.purpose ?? 'full_body',
        eventOffset,
      ),
    }));
}

function dayPlacementScore(
  offset: number,
  load: PlannedStrengthSession['intendedLoad'],
  purpose: PlannedSessionPurpose,
  preferredDays: Weekday[],
  schedule: EnduranceSchedule | undefined,
  selected: ScheduledDay[],
  eventOffset: number | null,
): number {
  const weekday = weekdayFromOffset(offset);
  let score = preferredDays.includes(weekday) ? 30 : 0;
  const loadMultiplier = load === 'high' ? 1.35 : load === 'moderate' ? 1 : 0.65;

  for (const discipline of ['swim', 'bike', 'run'] as EnduranceDiscipline[]) {
    const keyDay = enduranceDayFor(schedule, discipline);
    if (!keyDay) continue;
    const keyOffset = WEEKDAY_OFFSETS[keyDay];
    const relevance = disciplineRelevance(purpose, discipline);
    if (offset === keyOffset) score -= 65 * loadMultiplier * relevance;
    if (circularDistance(offset, keyOffset) === 1) score -= 18 * loadMultiplier * relevance;
  }

  if (eventOffset !== null) {
    if (offset >= eventOffset) score -= 2_000;
    if (offset === eventOffset - 1) score -= 220 * loadMultiplier;
    if (offset === eventOffset - 2) score -= 45 * loadMultiplier;
  }

  for (const prior of selected) {
    const distance = Math.abs(offset - prior.offset);
    if (distance === 1) score -= load === 'high' ? 25 : 12;
    if (distance >= 2) score += Math.min(distance, 3) * 4;
  }

  return score;
}

function placementNote(
  offset: number,
  schedule: EnduranceSchedule | undefined,
  load: PlannedStrengthSession['intendedLoad'],
  purpose: PlannedSessionPurpose,
  eventOffset: number | null,
): string {
  const weekday = weekdayFromOffset(offset);
  const sameDay = (['swim', 'bike', 'run'] as EnduranceDiscipline[])
    .find((discipline) => enduranceDayFor(schedule, discipline) === weekday);

  if (eventOffset !== null && offset === eventOffset - 1) {
    return 'Placed the day before the event only because the requested session frequency left limited alternatives; keep it brief and very easy.';
  }
  if (eventOffset !== null && offset < eventOffset) {
    return 'Placed early enough in race week to protect freshness for the event.';
  }
  if (sameDay) {
    const relevance = disciplineRelevance(purpose, sameDay);
    return `Placed on your key ${sameDay} day because the selected weekly frequency left limited alternatives; keep this ${load === 'high' || relevance > 1 ? 'controlled' : 'easy to moderate'}.`;
  }
  if (schedule && Object.values(schedule).some(Boolean)) {
    return 'Placed away from the key swim, bike, and run sessions you entered to reduce competing fatigue.';
  }
  return 'Placed to distribute strength exposure across the week.';
}

function enduranceDayFor(
  schedule: EnduranceSchedule | undefined,
  discipline: EnduranceDiscipline,
): Weekday | null | undefined {
  if (discipline === 'swim') return schedule?.keySwim;
  if (discipline === 'bike') return schedule?.keyBike;
  return schedule?.keyRun;
}

function disciplineRelevance(
  purpose: PlannedSessionPurpose,
  discipline: EnduranceDiscipline,
): number {
  if (purpose === 'swim_support') return discipline === 'swim' ? 1.4 : 0.35;
  if (
    purpose === 'max_strength'
    || purpose === 'posterior_durability'
    || purpose === 'single_leg_durability'
    || purpose === 'calf_ankle_capacity'
    || purpose === 'trail_durability'
    || purpose === 'power'
  ) {
    if (discipline === 'run') return 1.35;
    if (discipline === 'bike') return 1.05;
    return 0.3;
  }
  return 0.75;
}

function eventOffsetWithinWeek(weekStartDate: string, eventDate?: string): number | null {
  if (!eventDate) return null;
  const weekStart = new Date(`${weekStartDate}T12:00:00.000Z`);
  const event = new Date(`${eventDate}T12:00:00.000Z`);
  if (Number.isNaN(weekStart.getTime()) || Number.isNaN(event.getTime())) return null;
  const offset = Math.round((event.getTime() - weekStart.getTime()) / 86_400_000);
  return offset >= 0 && offset <= 6 ? offset : null;
}

function weekdayFromOffset(offset: number): Weekday {
  return (Object.entries(WEEKDAY_OFFSETS).find(([, value]) => value === offset)?.[0] ?? 'monday') as Weekday;
}

function circularDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 7 - direct);
}

function selectBlueprints(
  blueprints: SessionBlueprint[],
  count: 1 | 2 | 3 | 4 | 5,
  goal: PerformanceGoal,
  phase: TrainingPhase,
): SessionBlueprint[] {
  const selected = blueprints.slice(0, count);
  const powerGoals = new Set<PerformanceGoalType>([
    'road_10k',
    'triathlon_sprint',
    'triathlon_olympic',
    'swim_speed',
  ]);
  const shouldPrioritizePower = goal.priority === 'race'
    && powerGoals.has(goal.type)
    && phase !== 'taper'
    && phase !== 'race_week';

  if (shouldPrioritizePower && count >= 3) {
    const power = blueprints.find((blueprint) => blueprint.purpose === 'power');
    if (power && !selected.some((blueprint) => blueprint.purpose === 'power')) {
      selected[selected.length - 1] = power;
    }
  }

  return selected;
}

function intendedLoadForPhase(
  phase: TrainingPhase,
  index: number,
): PlannedStrengthSession['intendedLoad'] {
  if (phase === 'race_week' || phase === 'taper') return 'light';
  if (phase === 'peak') return index === 0 ? 'moderate' : 'light';
  if (phase === 'offseason') return index < 3 ? 'high' : 'moderate';
  return index === 0 ? 'high' : 'moderate';
}

function workoutExposures(workout: GeneratedWorkout, completedAt: string): RecentRegionExposure[] {
  const totals = new Map<BodyRegion, number>();
  for (const station of workout.stations) {
    const stationMinutes = station.durationSeconds / 60;
    for (const item of station.exercises) {
      for (const load of item.exerciseSnapshot.bodyRegions) {
        const roleMultiplier = load.role === 'primary' ? 1 : load.role === 'secondary' ? 0.65 : 0.4;
        totals.set(
          load.region,
          (totals.get(load.region) ?? 0) + load.load * stationMinutes * roleMultiplier,
        );
      }
    }
  }
  return [...totals].map(([region, rawExposure]) => ({ region, rawExposure, completedAt }));
}

function phaseExplanation(phase: TrainingPhase): string {
  switch (phase) {
    case 'offseason':
      return 'Higher strength volume and broader exercise variety are appropriate because race-specific fatigue is lower.';
    case 'base':
      return 'The block develops foundational strength, unilateral control, and durable support tissues.';
    case 'build':
      return 'Strength remains substantial but becomes more specific to the goal while avoiding unnecessary fatigue.';
    case 'peak':
      return 'Volume is reduced while strength and movement quality are maintained.';
    case 'taper':
      return 'Sessions become shorter, lower-impact, and more familiar to minimize residual fatigue.';
    case 'race_week':
      return 'The plan prioritizes movement quality and activation rather than creating a new training stimulus.';
  }
}

function phaseLabel(phase: TrainingPhase): string {
  return phase.replace('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function planWarnings(request: WeeklyPlanRequest, phase: TrainingPhase): string[] {
  const warnings: string[] = [];
  if (request.goal.sessionsPerWeek >= 4) {
    warnings.push('Four or five strength sessions require careful recovery management around endurance training.');
  }
  if ((phase === 'taper' || phase === 'race_week') && request.goal.sessionsPerWeek > 2) {
    warnings.push('This phase usually favors fewer strength sessions; extra sessions are intentionally light.');
  }
  if (!request.enduranceSchedule || !Object.values(request.enduranceSchedule).some(Boolean)) {
    warnings.push('Add the key swim, bike, or run day for each relevant discipline to improve session placement.');
  } else {
    warnings.push('Strength sessions were placed to reduce conflict with the key discipline days you entered.');
  }
  if (request.excludedRegions.length > 0 || request.excludedMovementTags.length > 0 || (request.regionRestrictions?.length ?? 0) > 0 || (request.excludedMovementPatterns?.length ?? 0) > 0) {
    warnings.push('The active symptom or PT profile was applied while preserving unrelated movement options when possible.');
  }
  return warnings;
}

function isRoadGoal(type: PerformanceGoalType): boolean {
  return type === 'road_10k' || type === 'road_half_marathon' || type === 'road_marathon';
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type {
  PerformanceGoal,
  WeeklyPlanRequest,
  WeeklyTrainingPlan,
  Weekday,
} from '@circuit/domain';

export {
  analyzePlanHealth,
  applyReplanProposals,
  buildReplanProposals,
} from './adaptive';
export type {
  PlanConflict,
  PlanConflictKind,
  PlanConflictSeverity,
  PlanHealthSummary,
  PlanMoveProposal,
} from './adaptive';

export { nextAvailableLoad, previousAvailableLoad, recommendExerciseProgressions } from './progression';
export type {
  AvailableLoadOptions,
  ExerciseLoadObservation,
  ExerciseProgressionContext,
  ExerciseProgressionMetadata,
  ExerciseProgressionRecommendation,
  ExerciseProgressionStrategy,
} from './progression';

export { buildRaceChecklist } from './race-readiness';
export type {
  RaceChecklistCategory,
  RaceChecklistItem,
} from './race-readiness';

export {
  buildPostEnduranceReplanProposals,
  calculateEnduranceContributions,
  inferEnduranceIntensity,
  isEnduranceDiscipline,
  isMatchEligibleCalendarEvent,
  matchCompletedActivities,
  matchExternalTrainingToWorkouts,
} from './endurance';
export type {
  EnduranceContributionSummary,
  MatchCompletedActivitiesInput,
  MatchExternalTrainingToWorkoutsInput,
  PostEnduranceReplanInput,
} from './endurance';

export { isValidTimeZone, zonedWallTimeToUtc } from './timezone';
export type { ZonedWallTime } from './timezone';


export {
  applyCoachSessionRevision,
  coachWorkoutConflicts,
  describeCoachProposalDifference,
  combineSharedWorkouts,
  markFriendWorkoutSubstitution,
  nextSubstitutableSession,
  publicWorkoutForCollaboration,
  withSharedWorkoutContext,
} from './collaboration';
export type {
  CoachSessionApplyResult,
  CoachSessionRevision,
  SharedWorkoutCandidateInput,
} from './collaboration';

export {
  applyStrengthAdjustmentProposal,
  assessEnduranceLoads,
  buildTrainingIntelligence,
  defaultTrainingIntelligencePreferences,
  determineStrengthPlanningPriority,
} from './training-intelligence';
export type {
  ApplyStrengthAdjustmentResult,
  AssessEnduranceLoadsInput,
  BuildTrainingIntelligenceInput,
} from './training-intelligence';

export {
  classifyRegionalStrengthStatus,
  classifySportDemand,
} from './regional-status';
export type {
  RegionalRecoveryContext,
  RegionalSportDemandBand,
  RegionalStatusConfidence,
  RegionalStatusInput,
  RegionalStatusResult,
  RegionalStrengthStatusKind,
} from './regional-status';

export { recommendStrengthDose, sessionsForPhase, validateCapacityProfile } from './capacity';
export type { AthleteCapacityProfile, StrengthDoseRecommendation, RunStatus, Proficiency, StrengthSessionRole, TrainingBudgetItem } from './capacity';

export {
  chooseProgressionBudget,
  createPlanChangeAuditEntry,
  normalizeCalendarEvent,
  normalizeStrengthSession,
  requiresAthleteApproval,
  validateTrainingBlockUnified,
  validateUnifiedWeek,
} from './unified-training';
export type {
  AthleteLimiterProfile,
  DemandBand,
  ImpactBand,
  PlanChangeAuditEntry,
  PlanInvariantViolation,
  PlanQualityReport,
  ProgressionBudget,
  ProgressionDomain,
  RecommendationConfidence,
  SessionPriority,
  UnifiedDiscipline,
  UnifiedIntensity,
  UnifiedTrainingSession,
  WeeklyTrainingBudgetInput,
} from './unified-training';
export { planningPriorityHierarchy } from './unified-training';
export type { PlanningPriority } from './unified-training';
export { SYNTHETIC_ATHLETE_FIXTURES } from './synthetic-athletes';
export type { SyntheticAthleteFixture } from './synthetic-athletes';


export { assessAthleteLevel, planningProficiency } from './athlete-level';
export type {
  AssessAthleteLevelInput,
  AthleteHistoryProfile,
  AthleteLevelAssessment,
  CalibrationKind,
  CurrentCapacityBand,
  DisciplineLevelAssessment,
  DurabilityBand,
  EvidenceConfidence,
  StrengthExperienceBand,
  TechnicalBand,
} from './athlete-level';

export { createEndurancePrescription, assessSessionPair } from './session-archetypes';
export type { DayPart, EndurancePrescription, EndurancePurpose, SessionPairAssessment, StrengthRole, TrainingWindow } from './session-archetypes';
export { buildDailyAdjustmentOptions } from './daily-adjustment';
export type { AdjustmentContext, AdjustmentOption, AdjustmentReason, DailyAdjustmentResult, FatigueKind, RequestedAdjustment, SessionAdjustmentRequest } from './daily-adjustment';
export * from './mechanical-load';

export * from './structural-exposure';
export * from './cross-sport-structural-load';
export * from './progression-control';
export * from './load-management-week';

export * from './post-workout-response';

export * from './unified-adaptive-planning';

export * from './athlete-response-model';

export * from './capacity-forecast';

export * from './calendar-intelligence';

export * from './multi-week-optimization';

export * from './training-block-intelligence';

export * from './long-term-adaptation';

export * from './goal-specific-coaching';

export * from './unified-coach-engine';

export * from './coach-decision-lifecycle';

export * from './coach-outcome-learning';

export * from './coach-preference-policy';

export * from './coach-attention-queue';

export * from './coach-evidence-confidence';

export * from './coach-scenario-simulator';
export * from './digital-twin';

export * from './digital-twin-governance';

export * from './coach-decision-ledger';

export * from './coach-policy';

export * from './coach-policy-evaluation';
export * from './coach-policy-portfolio';
export * from './coach-policy-release';
export * from './longitudinal-learning';

export * from './causal-evidence';

export * from './coach-uncertainty';

export * from './multi-objective-coaching';

export * from './coach-simulation';

export * from './coach-meta-learning';

export * from './unified-coaching-os';

export * from './coach-decision-reassessment';

export * from './coach-decision-audit';

export * from './counterfactual-reasoning';

export * from './athlete-decision-appeals';

export * from './protected-commitments';
export * from './coaching-workflow-inbox';

export * from './season-operations';

export * from './coaching-product-integration';

export * from './daily-coaching-loop';

export * from './session-execution-loop';

export * from './active-workout-logging';
export * from './workout-completion-sharing';

export * from './active-workout-persistence';

export * from './mobile-workout-flow';

export * from './workout-history-recall';
export * from './workout-flow-hardening';

export * from './ui-architecture';
export * from './today-workspace';

export * from './train-workspace';

export * from './plan-workspace';

export * from './progress-workspace';

export * from './you-workspace';

export * from './athlete-first-periodization';

export * from './visible-ui-shell';

export * from './visible-today-workspace';
export * from './visible-train-workspace';

export * from './visible-plan-workspace';

export * from './visible-progress-workspace';

export * from './visible-you-workspace';

export * from './recommendation-explanation';
