import type { EnduranceDiscipline, PerformanceGoalType } from '@circuit/domain';

import {
  applyCoachStrategyToFrequencyTargets,
  buildCoachStrategyPlanningPolicy,
  type CoachStrategyBaseline,
  type CoachStrategyPlanningPolicy,
  type StrategyFrequencyPlan,
} from './coach-strategy-policy';
import type { CoachSemanticStrategyChange } from './coach-semantic-frame';
import { coachStrategyAppliesToWeek } from './coach-strategy-window';
import {
  mergeRaceIntentWithCoachStrategy,
  type RaceIntentV2,
} from './race-intent';
import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type TrainableDiscipline,
  type WholeAthleteWeeklyPlannerInput,
  type WholeAthleteWeekPlan,
} from './whole-athlete-week';
import { validateUnifiedWeek } from './unified-training';

export * from './whole-athlete-week';

let configuredStrategy: CoachSemanticStrategyChange | undefined;
let configuredRaceIntent: RaceIntentV2 | undefined;
let configuredApprovedStrategy: CoachSemanticStrategyChange | undefined;

/**
 * Backward-compatible single strategy configuration used by isolated planner
 * tests and non-race callers.
 */
export function configureWholeAthleteCoachStrategy(strategy?: CoachSemanticStrategyChange): void {
  configuredStrategy = strategy ? cloneStrategy(strategy) : undefined;
  configuredRaceIntent = undefined;
  configuredApprovedStrategy = undefined;
}

/**
 * Race Intent is the durable baseline. Strategy Coach is a date-scoped overlay.
 * The effective strategy is resolved independently for every generated week so
 * a future/expired override cannot suppress the underlying race priorities.
 */
export function configureWholeAthleteStrategyLayers(
  raceIntent?: RaceIntentV2,
  approvedStrategy?: CoachSemanticStrategyChange,
): void {
  configuredStrategy = undefined;
  configuredRaceIntent = raceIntent ? cloneRaceIntent(raceIntent) : undefined;
  configuredApprovedStrategy = approvedStrategy ? cloneStrategy(approvedStrategy) : undefined;
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

  // Strategy can never turn a health-constrained week into a progression week.
  // Taper and race week also preserve the original race-oriented allocation.
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
    // Full frequency targets derived from the already-resolved baseline preserve
    // race-specific minimums and any explicit caller overrides.
    frequencyTargets: strategyFrequency,
    // This controls which discipline receives first claim on scarce
    // quality/progression capacity. Frequency targets above remain anchored to
    // the athlete's actual race goal.
    goalType: effectiveGoalType,
  };
  const adjusted = buildBaseWholeAthleteWeek(strategyInput);

  // Re-run quality validation against the athlete's real goal rather than the
  // internal orientation used to allocate discretionary progression.
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

function resolveConfiguredStrategy(weekStartDate?: string): CoachSemanticStrategyChange | undefined {
  if (configuredStrategy) return configuredStrategy;
  const approved = configuredApprovedStrategy
    && (!weekStartDate || coachStrategyAppliesToWeek(configuredApprovedStrategy, weekStartDate))
    ? configuredApprovedStrategy
    : undefined;
  return mergeRaceIntentWithCoachStrategy(configuredRaceIntent, approved);
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
