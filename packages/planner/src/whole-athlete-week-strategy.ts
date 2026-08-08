import type { EnduranceDiscipline, PerformanceGoalType } from '@circuit/domain';

import {
  applyCoachStrategyToFrequencyTargets,
  buildCoachStrategyPlanningPolicy,
  type CoachStrategyBaseline,
  type CoachStrategyPlanningPolicy,
  type StrategyFrequencyPlan,
} from './coach-strategy-policy';
import type { CoachSemanticStrategyChange } from './coach-semantic-frame';
import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type TrainableDiscipline,
  type WholeAthleteWeeklyPlannerInput,
  type WholeAthleteWeekPlan,
} from './whole-athlete-week';
import { validateUnifiedWeek } from './unified-training';

export * from './whole-athlete-week';

let configuredStrategy: CoachSemanticStrategyChange | undefined;

/**
 * Runtime-scoped strategy overlay. Mobile reconciliation is serialized, so the
 * current approved strategy can be configured immediately before generation.
 * The underlying weekly planner remains pure and is still available directly
 * from ./whole-athlete-week for isolated planner tests.
 */
export function configureWholeAthleteCoachStrategy(strategy?: CoachSemanticStrategyChange): void {
  configuredStrategy = strategy ? cloneStrategy(strategy) : undefined;
}

export function getConfiguredWholeAthleteCoachStrategy(): CoachSemanticStrategyChange | undefined {
  return configuredStrategy ? cloneStrategy(configuredStrategy) : undefined;
}

export function buildWholeAthleteWeek(input: WholeAthleteWeeklyPlannerInput): WholeAthleteWeekPlan {
  const baselinePlan = buildBaseWholeAthleteWeek(input);
  const strategy = configuredStrategy;
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
  // The baseline planner has already resolved build/hold/protect/recover from
  // the full health context, so non-build states are returned unchanged except
  // for transparent strategy context.
  if (baselinePlan.planningState !== 'build') {
    return annotateStrategy(baselinePlan, policy, [
      'Strategy emphasis is remembered but does not override the current training-stress ceiling.',
    ]);
  }

  const baseFrequency = frequencyPlanFromBaseline(baselinePlan);
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
    // This controls only which discipline receives scarce quality/progression
    // priority. The original race frequencies remain explicit above.
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

function frequencyPlanFromBaseline(plan: WholeAthleteWeekPlan): StrategyFrequencyPlan {
  return Object.fromEntries(plan.disciplineSummary.map((summary) => [summary.discipline, {
    min: summary.targetMin,
    preferred: summary.targetPreferred,
    // The baseline summary does not expose max. Use a conservative ceiling that
    // cannot exceed seven and is at least the resolved preferred target. The
    // caller's explicit max is restored below when available.
    max: Math.max(summary.targetPreferred, summary.targetMin),
  }])) as StrategyFrequencyPlan;
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
  if (policy.primaryFocus === 'bike') {
    // Triathlon/ironman already gives cycling first claim on build/peak
    // progression. For non-triathlon goals, do not masquerade as a race type
    // that would imply a different event structure.
    return isTriathlonGoal(original) ? original : original;
  }
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
  return goal === 'triathlon_sprint' || goal === 'triathlon_olympic' || goal === 'ironman_70_3' || goal === 'ironman_full';
}

function cloneStrategy(strategy: CoachSemanticStrategyChange): CoachSemanticStrategyChange {
  return {
    ...strategy,
    disciplineObjectives: { ...strategy.disciplineObjectives },
    racePriority: strategy.racePriority ? { ...strategy.racePriority } : undefined,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
