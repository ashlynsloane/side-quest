import type { EnduranceDiscipline, PerformanceGoalType } from '@circuit/domain';

import {
  applyCoachStrategyToFrequencyTargets,
  buildCoachStrategyPlanningPolicy,
  type CoachStrategyBaseline,
  type CoachStrategyPlanningPolicy,
  type StrategyFrequencyPlan,
  type StrategyFrequencyTarget,
} from './coach-strategy-policy';
import type { CoachSemanticStrategyChange, CoachStrategyObjective } from './coach-semantic-frame';
import {
  mergeRaceIntentWithCoachStrategy,
  type RaceIntentV2,
} from './race-intent';
import { activeSeasonStrategyForWeek, type SeasonStrategyEntry } from './season-strategy';
import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type DoubleDayPlanSummary,
  type TrainableDiscipline,
  type WeekdayIndex,
  type WholeAthletePlannedSession,
  type WholeAthleteWeeklyPlannerInput,
  type WholeAthleteWeekPlan,
} from './whole-athlete-week';
import { validateUnifiedWeek, type ProgressionBudget } from './unified-training';

export * from './whole-athlete-week';

let configuredStrategy: CoachSemanticStrategyChange | undefined;
let configuredRaceIntent: RaceIntentV2 | undefined;
let configuredApprovedStrategies: CoachSemanticStrategyChange[] = [];

/**
 * Backward-compatible single strategy configuration used by isolated planner
 * tests and non-race callers.
 */
export function configureWholeAthleteCoachStrategy(strategy?: CoachSemanticStrategyChange): void {
  configuredStrategy = strategy ? cloneStrategy(strategy) : undefined;
  configuredRaceIntent = undefined;
  configuredApprovedStrategies = [];
}

/**
 * Race Intent is the durable baseline. Strategy Coach supplies zero or more
 * non-overlapping date-scoped season windows. The effective strategy is
 * resolved independently for every generated week.
 */
export function configureWholeAthleteStrategyLayers(
  raceIntent?: RaceIntentV2,
  approvedStrategies?: CoachSemanticStrategyChange | CoachSemanticStrategyChange[],
): void {
  configuredStrategy = undefined;
  configuredRaceIntent = raceIntent ? cloneRaceIntent(raceIntent) : undefined;
  configuredApprovedStrategies = approvedStrategies
    ? (Array.isArray(approvedStrategies) ? approvedStrategies : [approvedStrategies]).map(cloneStrategy)
    : [];
}

export function getConfiguredWholeAthleteCoachStrategy(weekStartDate?: string): CoachSemanticStrategyChange | undefined {
  const resolved = resolveConfiguredStrategy(weekStartDate);
  return resolved ? cloneStrategy(resolved) : undefined;
}

export function buildWholeAthleteWeek(input: WholeAthleteWeeklyPlannerInput): WholeAthleteWeekPlan {
  const baselinePlan = buildBaseWholeAthleteWeek(input);
  const strategy = resolveConfiguredStrategy(input.weekStartDate);
  if (!strategy) return baselinePlan;

  const goalDisciplines = goalDisciplinesForType(input.goalType);
  const policy = buildCoachStrategyPlanningPolicy({
    strategy,
    goalType: input.goalType,
    goalDisciplines,
    phase: input.phase,
    weekStartDate: input.weekStartDate,
  });
  if (!policy.active) return baselinePlan;

  // Return-to-run / recent-bone-stress can be an impact-local constraint rather
  // than a whole-week training ceiling. When broader recovery signals are clean,
  // preserve the protected run dose but allow a triathlon plan to use non-impact
  // capacity for swim and bike, including an explicitly selected race focus.
  if (
    isTriathlonGoal(input.goalType)
    && isImpactLocalProtection(input, baselinePlan)
    && input.phase !== 'taper'
    && input.phase !== 'race_week'
  ) {
    return buildImpactLocalTriathlonPlan(baselinePlan, input, policy);
  }

  // Strategy can never turn a genuinely health-constrained week into a
  // progression week. Taper and race week also preserve race-first allocation.
  if (baselinePlan.planningState !== 'build' || input.phase === 'taper' || input.phase === 'race_week') {
    return annotateStrategy(baselinePlan, policy, [
      input.phase === 'taper' || input.phase === 'race_week'
        ? 'Strategy emphasis is remembered, but taper and race-week allocation stay race-first.'
        : 'Strategy emphasis is remembered but does not override the current training-stress ceiling.',
    ]);
  }

  const baseFrequency = frequencyPlanFromBaseline(baselinePlan, input);
  const strategyFrequency = applyCoachStrategyToFrequencyTargets(
    baseFrequency,
    policy,
    baselinesForStrategy(input),
  );
  const effectiveGoalType = strategyOrientationGoalType(input.goalType, policy, input.phase);
  const strategyInput: WholeAthleteWeeklyPlannerInput = {
    ...input,
    frequencyTargets: strategyFrequency,
    goalType: effectiveGoalType,
  };
  const adjusted = buildBaseWholeAthleteWeek(strategyInput);

  const quality = validateUnifiedWeek(adjusted.sessions, {
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek: input.previousWeek ?? [],
    limiterProfile: input.limiterProfile,
  });

  return annotateStrategy({ ...adjusted, quality }, policy, effectiveGoalType !== input.goalType
    ? [`Discretionary progression is oriented toward ${policy.primaryFocus ?? 'the selected focus'} while race-specific minimums remain anchored to ${input.goalType.replaceAll('_', ' ')}.`]
    : []);
}

function buildImpactLocalTriathlonPlan(
  baseline: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
  policy: CoachStrategyPlanningPolicy,
): WholeAthleteWeekPlan {
  const frequency = restoreImpactLocalFrequency(
    applyCoachStrategyToFrequencyTargets(
      frequencyPlanFromBaseline(baseline, input),
      policy,
      baselinesForStrategy(input),
    ),
    input.goalType,
    policy,
  );

  let sessions = baseline.sessions.map((session) => ({ ...session }));
  const protectedRecoveryWeekday = recoveryAnchorWeekday(sessions, input.weekStartDate);

  const nonImpactOrder: Array<'swim' | 'bike'> = policy.primaryFocus === 'bike'
    ? ['bike', 'swim']
    : ['swim', 'bike'];

  for (const discipline of nonImpactOrder) {
    const preferred = frequency[discipline]?.preferred ?? countDiscipline(sessions, discipline);
    sessions = ensureNonImpactFrequency(
      sessions,
      discipline,
      preferred,
      input.weekStartDate,
      protectedRecoveryWeekday,
      policy,
      input,
    );
  }

  const utilization = allocationUtilization(policy);
  const allocationTarget = Math.min(
    input.availableMinutes,
    Math.max(baseline.plannedMinutes, roundToFive(input.availableMinutes * utilization)),
  );
  const protectedMinutes = totalMinutes(sessions.filter((session) => session.discipline !== 'swim' && session.discipline !== 'bike'));
  const nonImpactPool = Math.max(
    totalMinutes(sessions.filter((session) => session.discipline === 'swim' || session.discipline === 'bike')),
    allocationTarget - protectedMinutes,
  );
  const weights = nonImpactTriathlonWeights(policy);
  const swimTarget = roundToFive(nonImpactPool * weights.swim);
  const bikeTarget = Math.max(0, nonImpactPool - swimTarget);

  sessions = expandGeneratedDisciplineMinutes(sessions, 'swim', swimTarget);
  sessions = expandGeneratedDisciplineMinutes(sessions, 'bike', bikeTarget);
  sessions = sessions.sort(sortSessions);

  const progressionBudget = impactLocalProgressionBudget(policy);
  const plannedMinutes = totalMinutes(sessions);
  const quality = validateUnifiedWeek(sessions, {
    availableMinutes: input.availableMinutes,
    phase: input.phase,
    goalType: input.goalType,
    recentBoneStress: input.recentBoneStress ?? (input.health.boneStress === 'recent' || input.health.boneStress === 'active'),
    returnToRun: input.returnToRun ?? false,
    previousWeek: input.previousWeek ?? [],
    limiterProfile: input.limiterProfile,
  });

  const disciplineSummary = baseline.disciplineSummary.map((summary) => {
    const target = frequency[summary.discipline];
    return {
      ...summary,
      sessions: countDiscipline(sessions, summary.discipline),
      minutes: totalMinutes(sessions.filter((session) => session.discipline === summary.discipline)),
      targetMin: target?.min ?? summary.targetMin,
      targetPreferred: target?.preferred ?? summary.targetPreferred,
    };
  });

  const cleanedWarnings = baseline.warnings.filter((warning) =>
    !warning.includes('Progression is intentionally withheld this week')
    && !warning.includes('preferred health-adjusted volume ceiling'));

  return annotateStrategy({
    ...baseline,
    planningState: 'build',
    weekDecision: 'progress',
    weekDecisionReason: policy.primaryFocus === 'bike'
      ? 'Return-to-run limits impact exposure, not the whole training week. Bike is the race-development priority, so available non-impact capacity is directed primarily to cycling while run progression remains protected.'
      : 'Return-to-run limits impact exposure, not the whole training week. Non-impact race training can use available capacity while run progression remains protected.',
    sessions,
    progressionBudget,
    progressionAllowed: progressionBudget.primary !== null,
    targetMinutes: Math.max(baseline.targetMinutes, allocationTarget),
    plannedMinutes,
    generatedMinutes: totalMinutes(sessions.filter((session) => session.planningCommitment === 'generated')),
    disciplineSummary,
    doubleDays: summarizeDoubleDays(sessions),
    guardrails: unique([
      ...baseline.guardrails,
      'Return-to-run protection is discipline-local: run impact stays capped and separated while swim and bike may use otherwise available training capacity.',
    ]),
    warnings: unique([
      ...cleanedWarnings,
      plannedMinutes < allocationTarget * 0.85
        ? `The week uses only ${plannedMinutes} of ${allocationTarget} target minutes because recovery spacing or session-placement constraints prevented the full non-impact allocation.`
        : '',
    ]),
    quality,
  }, policy, [
    `Protected run exposure remains unchanged while non-impact training uses ${plannedMinutes} of ${input.availableMinutes} available minutes.`,
  ]);
}

function isImpactLocalProtection(input: WholeAthleteWeeklyPlannerInput, plan: WholeAthleteWeekPlan): boolean {
  if (plan.planningState !== 'protect' && plan.planningState !== 'hold') return false;
  const health = input.health;
  const impactSignal = Boolean(input.returnToRun || input.recentBoneStress || health.boneStress === 'recent');
  if (!impactSignal) return false;
  if (health.energyAvailability === 'concerning' || health.menstrualRecovery === 'disrupted') return false;
  if (health.boneStress === 'active' || health.injuryConstraint === 'restricted' || health.noImpact) return false;
  if (health.illnessOrSystemicSymptoms || health.athleteRequestedRest) return false;
  if (health.mentalEnergy === 'depleted' || health.lifeStress === 'overwhelming') return false;
  if ((health.restrictedDisciplines ?? []).some((discipline) => discipline !== 'run')) return false;
  return true;
}

function restoreImpactLocalFrequency(
  frequency: StrategyFrequencyPlan,
  goalType: PerformanceGoalType,
  policy: CoachStrategyPlanningPolicy,
): StrategyFrequencyPlan {
  const next = cloneFrequencyPlan(frequency);
  for (const discipline of ['swim', 'bike'] as const) {
    const current = next[discipline];
    if (!current) continue;
    const defaultPreferred = defaultPreferredFrequency(goalType, discipline);
    const objective = policy.objectives[discipline];
    const extra = objective === 'maximize' ? 2 : objective === 'primary_focus' || objective === 'develop' ? 1 : 0;
    next[discipline] = {
      ...current,
      preferred: clampInt(Math.max(current.preferred, defaultPreferred + extra), current.min, current.max),
    };
  }
  return next;
}

const ADAPTIVE_FREQUENCY_REFLOW_PREFIX = 'Adaptive frequency reflow:';

function ensureNonImpactFrequency(
  sessions: WholeAthletePlannedSession[],
  discipline: 'swim' | 'bike',
  targetCount: number,
  weekStartDate: string,
  protectedRecoveryWeekday: number | null,
  policy: CoachStrategyPlanningPolicy,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthletePlannedSession[] {
  let next = sessions.map((session) => ({ ...session, rationale: [...session.rationale] }));
  while (countDiscipline(next, discipline) < targetCount) {
    let date = chooseStrategyDate(
      next,
      discipline,
      weekStartDate,
      protectedRecoveryWeekday,
      input,
    );

    if (!date && discipline === 'bike') {
      const reflowed = reflowEasySwimForBikeFrequency(
        next,
        weekStartDate,
        protectedRecoveryWeekday,
        input,
      );
      if (reflowed) {
        next = reflowed;
        date = chooseStrategyDate(
          next,
          discipline,
          weekStartDate,
          protectedRecoveryWeekday,
          input,
        );
      }
    }

    if (!date) break;
    next.push(createStrategySession(discipline, date, countDiscipline(next, discipline), policy));
  }
  return next.sort(sortSessions);
}

function chooseStrategyDate(
  sessions: WholeAthletePlannedSession[],
  discipline: 'swim' | 'bike',
  weekStartDate: string,
  protectedRecoveryWeekday: number | null,
  input: WholeAthleteWeeklyPlannerInput,
): string | null {
  const preferredOffsets = discipline === 'bike'
    ? [1, 3, 5, 2, 0, 4, 6]
    : [1, 3, 4, 0, 2, 5, 6];

  for (const offset of preferredOffsets) {
    if (offset === protectedRecoveryWeekday) continue;
    if (!sportAvailableOnWeekday(input, discipline, offset)) continue;
    const date = addDays(weekStartDate, offset);
    const sameDay = sessions.filter((session) => session.date === date && isTrainable(session.discipline));
    if (sameDay.some((session) => session.discipline === discipline)) continue;
    if (sameDay.length >= 2) continue;
    if (sameDay.length === 1 && !compatibleNonImpactPair(discipline, sameDay[0]!)) continue;
    return date;
  }
  return null;
}

function reflowEasySwimForBikeFrequency(
  sessions: WholeAthletePlannedSession[],
  weekStartDate: string,
  protectedRecoveryWeekday: number | null,
  input: WholeAthleteWeeklyPlannerInput,
): WholeAthletePlannedSession[] | null {
  const sourceCandidates = Array.from({ length: 7 }, (_, offset) => offset)
    .filter((offset) => offset !== protectedRecoveryWeekday)
    .filter((offset) => sportAvailableOnWeekday(input, 'bike', offset))
    .map((offset) => {
      const date = addDays(weekStartDate, offset);
      const day = sessions.filter((session) => session.date === date && isTrainable(session.discipline));
      const swim = day.find(isMovableEasySwim);
      const run = day.find((session) =>
        session.discipline === 'run'
        && session.intensity === 'easy'
        && session.recoveryCost <= 2);
      return { offset, date, day, swim, run };
    })
    .filter((candidate) =>
      candidate.day.length === 2
      && Boolean(candidate.swim)
      && Boolean(candidate.run))
    .sort((left, right) => right.offset - left.offset);

  for (const source of sourceCandidates) {
    const swim = source.swim!;
    const destinationCandidates = Array.from({ length: 7 }, (_, offset) => offset)
      .filter((offset) => offset !== protectedRecoveryWeekday)
      .filter((offset) => offset !== source.offset)
      .filter((offset) => sportAvailableOnWeekday(input, 'swim', offset))
      .map((offset) => {
        const date = addDays(weekStartDate, offset);
        const day = sessions.filter((session) => session.date === date && isTrainable(session.discipline));
        const bike = day.find((session) => session.discipline === 'bike');
        const weekend = offset >= 5 ? 1 : 0;
        const longBikeLike = bike && (bike.keySession || /\blong\b/i.test(bike.title)) ? 1 : 0;
        return { offset, date, day, bike, weekend, longBikeLike };
      })
      .filter((candidate) =>
        candidate.day.length === 1
        && candidate.bike
        && !candidate.day.some((session) => session.discipline === 'swim')
        && compatibleNonImpactPair('swim', candidate.bike))
      .sort((left, right) =>
        right.longBikeLike - left.longBikeLike
        || right.weekend - left.weekend
        || left.offset - right.offset);

    const destination = destinationCandidates[0];
    if (!destination) continue;

    return sessions.map((session) => session.id === swim.id
      ? {
          ...session,
          date: destination.date,
          rationale: unique([
            ...session.rationale,
            `${ADAPTIVE_FREQUENCY_REFLOW_PREFIX} moved this easy swim to ${weekdayName(destination.offset)} beside the existing bike so a fourth non-impact bike ride can fit on ${weekdayName(source.offset)} without creating a triple day or reducing return-to-run frequency.`,
          ]),
        }
      : { ...session, rationale: [...session.rationale] });
  }

  return null;
}

function sportAvailableOnWeekday(
  input: WholeAthleteWeeklyPlannerInput,
  discipline: 'swim' | 'bike',
  weekday: number,
): boolean {
  const allowed = input.weeklySchedule?.availableDays?.[discipline];
  return !allowed?.length || allowed.includes(weekday as WeekdayIndex);
}

function isMovableEasySwim(session: WholeAthletePlannedSession): boolean {
  return session.discipline === 'swim'
    && session.planningCommitment === 'generated'
    && session.intensity === 'easy'
    && !session.keySession
    && session.recoveryCost <= 2;
}

function weekdayName(weekday: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday] ?? 'another day';
}

function compatibleNonImpactPair(
  discipline: 'swim' | 'bike',
  existing: WholeAthletePlannedSession,
): boolean {
  if (existing.discipline === 'rest') return false;
  if (existing.recoveryCost >= 4) return false;
  if (discipline === 'swim') return existing.discipline !== 'swim';
  if (existing.discipline === 'swim') return true;
  if (existing.discipline === 'run') return existing.intensity === 'easy' && existing.recoveryCost <= 2;
  if (existing.discipline === 'strength') return existing.lowerBodyDemand !== 'high' && existing.recoveryCost <= 3;
  return false;
}

function createStrategySession(
  discipline: 'swim' | 'bike',
  date: string,
  index: number,
  policy: CoachStrategyPlanningPolicy,
): WholeAthletePlannedSession {
  const focus = policy.primaryFocus === discipline;
  if (discipline === 'swim') {
    return {
      id: `strategy_swim_${date}_${index + 1}`,
      date,
      title: 'Aerobic + technique swim',
      discipline: 'swim',
      durationMinutes: 45,
      intensity: 'easy',
      cardiovascularDemand: 'low',
      musculoskeletalDemand: 'low',
      lowerBodyDemand: 'none',
      upperBodyDemand: 'moderate',
      impact: 'none',
      technicalDemand: 'high',
      recoveryCost: 1,
      priority: 'recommended',
      source: 'side_quest',
      keySession: false,
      planningCommitment: 'generated',
      rationale: ['Added to use available non-impact training capacity while run impact remains protected.'],
      healthAdjusted: false,
      progressionTarget: focus ? 'swim_volume' : undefined,
    };
  }
  return {
    id: `strategy_bike_${date}_${index + 1}`,
    date,
    title: index === 2 ? 'Long endurance ride' : 'Aerobic ride',
    discipline: 'bike',
    durationMinutes: 75,
    intensity: 'easy',
    cardiovascularDemand: 'low',
    musculoskeletalDemand: 'low',
    lowerBodyDemand: 'moderate',
    upperBodyDemand: 'none',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: 1,
    priority: 'recommended',
    source: 'side_quest',
    keySession: index === 2,
    planningCommitment: 'generated',
    rationale: ['Added to use available non-impact training capacity while run impact remains protected.'],
    healthAdjusted: false,
    progressionTarget: focus ? 'bike_volume' : undefined,
  };
}

function expandGeneratedDisciplineMinutes(
  sessions: WholeAthletePlannedSession[],
  discipline: 'swim' | 'bike',
  targetMinutes: number,
): WholeAthletePlannedSession[] {
  const next = sessions.map((session) => ({ ...session }));
  const indexes = next
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.discipline === discipline && session.planningCommitment === 'generated')
    .map(({ index }) => index);
  if (!indexes.length) return next;

  const fixedMinutes = totalMinutes(next.filter((session) => session.discipline === discipline && session.planningCommitment !== 'generated'));
  const desiredGenerated = Math.max(
    totalMinutes(next.filter((session) => session.discipline === discipline && session.planningCommitment === 'generated')),
    targetMinutes - fixedMinutes,
  );
  let remaining = desiredGenerated - totalMinutes(indexes.map((index) => next[index]!));
  if (remaining <= 0) return next;

  const orderedIndexes = discipline === 'bike'
    ? [...indexes].sort((left, right) => {
        const leftWeekend = weekdayIndex(next[left]!.date) >= 5 ? 1 : 0;
        const rightWeekend = weekdayIndex(next[right]!.date) >= 5 ? 1 : 0;
        return rightWeekend - leftWeekend || next[right]!.date.localeCompare(next[left]!.date);
      })
    : [...indexes];

  let progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (const index of orderedIndexes) {
      if (remaining <= 0) break;
      const session = next[index]!;
      const longBike = discipline === 'bike' && index === orderedIndexes[0];
      const cap = discipline === 'swim' ? 90 : longBike ? 240 : 150;
      if (session.durationMinutes >= cap) continue;
      const increment = Math.min(5, cap - session.durationMinutes, remaining);
      next[index] = {
        ...session,
        durationMinutes: session.durationMinutes + increment,
        rationale: unique([
          ...session.rationale,
          discipline === 'bike'
            ? 'Duration uses available bike-priority training capacity without increasing run impact.'
            : 'Duration preserves established swim volume while run impact is constrained.',
        ]),
      };
      remaining -= increment;
      progress = true;
    }
  }
  return next;
}

function impactLocalProgressionBudget(policy: CoachStrategyPlanningPolicy): ProgressionBudget {
  const primary = policy.primaryFocus === 'swim'
    ? 'swim_volume' as const
    : 'bike_volume' as const;
  const secondary = primary === 'bike_volume' ? 'swim_volume' as const : 'bike_volume' as const;
  return {
    primary,
    secondary,
    heldStable: ['run_volume', 'strength_volume', 'strength_intensity'],
    reduced: ['impact'],
    rationale: [
      `${policy.primaryFocus === 'swim' ? 'Swim' : 'Bike'} volume receives the discretionary non-impact progression budget.`,
      'Return-to-run exposure is held to the protected protocol rather than being used to absorb spare weekly time.',
      'Additional training capacity is directed to non-impact race-specific work while impact progression stays reduced.',
    ],
  };
}

function allocationUtilization(policy: CoachStrategyPlanningPolicy): number {
  const objective = policy.primaryFocus ? policy.objectives[policy.primaryFocus] : undefined;
  if (objective === 'maximize') return 0.97;
  if (objective === 'primary_focus') return 0.95;
  if (objective === 'develop') return 0.9;
  return 0.85;
}

function nonImpactTriathlonWeights(policy: CoachStrategyPlanningPolicy): { swim: number; bike: number } {
  const bikeObjective = policy.objectives.bike;
  const swimObjective = policy.objectives.swim;
  if (policy.primaryFocus === 'bike' || bikeObjective === 'maximize' || bikeObjective === 'primary_focus') {
    return { swim: bikeObjective === 'maximize' ? 0.2 : 0.25, bike: bikeObjective === 'maximize' ? 0.8 : 0.75 };
  }
  if (policy.primaryFocus === 'swim' || swimObjective === 'maximize' || swimObjective === 'primary_focus') {
    return { swim: swimObjective === 'maximize' ? 0.6 : 0.55, bike: swimObjective === 'maximize' ? 0.4 : 0.45 };
  }
  return { swim: 0.35, bike: 0.65 };
}

function recoveryAnchorWeekday(sessions: WholeAthletePlannedSession[], weekStartDate: string): number | null {
  const preferred = [2, 6, 1, 4, 0, 3, 5];
  return preferred.find((offset) => {
    const date = addDays(weekStartDate, offset);
    return sessions.every((session) => session.date !== date || !isTrainable(session.discipline));
  }) ?? null;
}

function resolveConfiguredStrategy(weekStartDate?: string): CoachSemanticStrategyChange | undefined {
  if (configuredStrategy) return configuredStrategy;
  const approved = resolveApprovedStrategy(weekStartDate);
  return mergeRaceIntentWithCoachStrategy(configuredRaceIntent, approved);
}

function resolveApprovedStrategy(weekStartDate?: string): CoachSemanticStrategyChange | undefined {
  if (!configuredApprovedStrategies.length) return undefined;
  if (!weekStartDate) return cloneStrategy(configuredApprovedStrategies[0]!);
  const entries: SeasonStrategyEntry[] = configuredApprovedStrategies.map((strategy, index) => ({
    id: `configured_${index}`,
    strategy,
  }));
  return activeSeasonStrategyForWeek(entries, weekStartDate)?.strategy;
}

function annotateStrategy(
  plan: WholeAthleteWeekPlan,
  policy: CoachStrategyPlanningPolicy,
  extra: string[],
): WholeAthleteWeekPlan {
  return {
    ...plan,
    guardrails: unique([
      ...plan.guardrails,
      ...policy.rationale,
      'Strategy never overrides fixed commitments, safety restrictions, race-week/taper limits, or the weekly time budget.',
    ]),
    warnings: unique([...plan.warnings, ...policy.warnings, ...extra]),
  };
}

function frequencyPlanFromBaseline(
  plan: WholeAthleteWeekPlan,
  input: WholeAthleteWeeklyPlannerInput,
): StrategyFrequencyPlan {
  return Object.fromEntries(plan.disciplineSummary.map((summary) => {
    const explicitMax = input.frequencyTargets?.[summary.discipline]?.max;
    const max = explicitMax ?? defaultFrequencyMax(input.goalType, summary.discipline);
    return [summary.discipline, {
      min: summary.targetMin,
      preferred: summary.targetPreferred,
      max: Math.max(summary.targetMin, Math.min(7, max)),
    }];
  })) as StrategyFrequencyPlan;
}

function baselinesForStrategy(input: WholeAthleteWeeklyPlannerInput): Partial<Record<TrainableDiscipline, CoachStrategyBaseline>> {
  return Object.fromEntries(
    Object.entries(input.baselines ?? {}).map(([discipline, baseline]) => [discipline, baseline ? {
      sessionsPerWeek: baseline.sessionsPerWeek,
      minutesPerWeek: baseline.minutesPerWeek,
    } : undefined]),
  ) as Partial<Record<TrainableDiscipline, CoachStrategyBaseline>>;
}

function strategyOrientationGoalType(
  original: PerformanceGoalType,
  policy: CoachStrategyPlanningPolicy,
  phase: WholeAthleteWeeklyPlannerInput['phase'],
): PerformanceGoalType {
  if (!policy.primaryFocus || policy.progressionPriority.length === 0) return original;
  if (policy.primaryFocus === 'swim') return 'swim_speed';
  if (policy.primaryFocus === 'run') return 'road_half_marathon';
  if (policy.primaryFocus === 'bike') return original;
  if (policy.primaryFocus === 'strength' && (phase === 'offseason' || phase === 'base')) return 'general_offseason';
  return original;
}

function goalDisciplinesForType(goal: PerformanceGoalType): EnduranceDiscipline[] {
  if (goal === 'swim_speed') return ['swim'];
  if (goal === 'road_10k' || goal === 'road_half_marathon' || goal === 'road_marathon' || goal === 'trail_50k' || goal === 'trail_100k') return ['run'];
  if (goal === 'swimrun') return ['swim', 'run'];
  if (goal === 'general_offseason') return [];
  return ['swim', 'bike', 'run'];
}

function isTriathlonGoal(goal: PerformanceGoalType): boolean {
  return goal === 'triathlon_sprint'
    || goal === 'triathlon_olympic'
    || goal === 'ironman_70_3'
    || goal === 'ironman_full';
}

function defaultPreferredFrequency(goal: PerformanceGoalType, discipline: 'swim' | 'bike'): number {
  if (goal === 'ironman_70_3' || goal === 'ironman_full' || goal === 'triathlon_olympic') return 3;
  if (goal === 'triathlon_sprint') return discipline === 'bike' ? 2 : 2;
  return 1;
}

function defaultFrequencyMax(goal: PerformanceGoalType, discipline: TrainableDiscipline): number {
  const maxima: Record<PerformanceGoalType, Record<TrainableDiscipline, number>> = {
    triathlon_sprint: { swim: 3, bike: 4, run: 4, strength: 3 },
    triathlon_olympic: { swim: 4, bike: 4, run: 4, strength: 3 },
    ironman_70_3: { swim: 5, bike: 5, run: 5, strength: 3 },
    ironman_full: { swim: 5, bike: 5, run: 5, strength: 3 },
    swimrun: { swim: 5, bike: 2, run: 5, strength: 3 },
    road_10k: { swim: 2, bike: 2, run: 6, strength: 3 },
    road_half_marathon: { swim: 2, bike: 2, run: 6, strength: 3 },
    road_marathon: { swim: 2, bike: 2, run: 6, strength: 3 },
    trail_50k: { swim: 2, bike: 2, run: 6, strength: 3 },
    trail_100k: { swim: 2, bike: 2, run: 7, strength: 3 },
    swim_speed: { swim: 6, bike: 2, run: 2, strength: 3 },
    general_offseason: { swim: 2, bike: 2, run: 2, strength: 4 },
  };
  return maxima[goal][discipline];
}

function summarizeDoubleDays(sessions: WholeAthletePlannedSession[]): DoubleDayPlanSummary[] {
  const byDate = new Map<string, WholeAthletePlannedSession[]>();
  for (const session of sessions.filter((item) => isTrainable(item.discipline))) {
    const values = byDate.get(session.date) ?? [];
    values.push(session);
    byDate.set(session.date, values);
  }
  return [...byDate.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([date, values]) => ({
      date,
      sessionIds: values.map((session) => session.id),
      disciplines: values.map((session) => session.discipline as TrainableDiscipline),
      rationale: 'Two compatible sessions share the day so race-specific volume can fit without sacrificing the protected lower-load day.',
      athleteSpecified: values.some((session) => session.planningCommitment !== 'generated'),
    }));
}

function countDiscipline(sessions: WholeAthletePlannedSession[], discipline: TrainableDiscipline): number {
  return sessions.filter((session) => session.discipline === discipline).length;
}

function totalMinutes(sessions: WholeAthletePlannedSession[]): number {
  return sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
}

function isTrainable(discipline: WholeAthletePlannedSession['discipline']): discipline is TrainableDiscipline {
  return discipline === 'swim' || discipline === 'bike' || discipline === 'run' || discipline === 'strength';
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function sortSessions(left: WholeAthletePlannedSession, right: WholeAthletePlannedSession): number {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundToFive(value: number): number {
  return Math.max(0, Math.round(value / 5) * 5);
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.max(minimum, Math.min(maximum, value)));
}

function cloneFrequencyPlan(base: StrategyFrequencyPlan): StrategyFrequencyPlan {
  return Object.fromEntries(Object.entries(base).map(([discipline, target]) => [discipline, target ? { ...target } as StrategyFrequencyTarget : target])) as StrategyFrequencyPlan;
}

function cloneStrategy(strategy: CoachSemanticStrategyChange): CoachSemanticStrategyChange {
  return {
    ...strategy,
    disciplineObjectives: { ...strategy.disciplineObjectives },
    racePriority: strategy.racePriority ? { ...strategy.racePriority } : undefined,
  };
}

function cloneRaceIntent(intent: RaceIntentV2): RaceIntentV2 {
  return {
    ...intent,
    disciplinePriorities: { ...intent.disciplinePriorities },
    disciplineTargets: intent.disciplineTargets
      ? Object.fromEntries(Object.entries(intent.disciplineTargets).map(([discipline, target]) => [discipline, target ? { ...target } : target])) as RaceIntentV2['disciplineTargets']
      : undefined,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
