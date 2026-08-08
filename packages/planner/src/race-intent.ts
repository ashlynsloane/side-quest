import type { EnduranceDiscipline, PerformanceGoalType } from '@circuit/domain';

import type {
  CoachSemanticStrategyChange,
  CoachStrategyObjective,
  CoachStrategyTradeoff,
} from './coach-semantic-frame';

export type RaceOverallObjective =
  | 'finish_comfortably'
  | 'strong_finish'
  | 'best_overall'
  | 'specific_overall_time'
  | 'discipline_performance'
  | 'placement_qualification';

export type RaceTargetKind = 'pr' | 'time' | 'pace' | 'power' | 'speed' | 'placement';

export interface RaceDisciplineTarget {
  kind: RaceTargetKind;
  value?: string;
}

export interface RaceIntentV2 {
  version: 2;
  overallObjective: RaceOverallObjective;
  primaryDiscipline?: EnduranceDiscipline;
  disciplinePriorities: Partial<Record<EnduranceDiscipline, CoachStrategyObjective>>;
  tradeoffTolerance: CoachStrategyTradeoff;
  overallTarget?: string;
  disciplineTargets?: Partial<Record<EnduranceDiscipline, RaceDisciplineTarget>>;
}

export interface RaceIntentValidationResult {
  valid: boolean;
  errors: string[];
}

type LegacyRacePriority = 'finish' | 'perform' | 'race';

export function defaultRaceIntent(
  goalType: PerformanceGoalType,
  disciplines: EnduranceDiscipline[],
  legacyPriority: LegacyRacePriority = 'perform',
): RaceIntentV2 {
  const overallObjective: RaceOverallObjective = legacyPriority === 'finish'
    ? 'finish_comfortably'
    : legacyPriority === 'race'
      ? 'best_overall'
      : 'strong_finish';
  const defaultPriority: CoachStrategyObjective = legacyPriority === 'finish' ? 'maintain' : 'develop';
  const disciplinePriorities = Object.fromEntries(
    disciplines.map((discipline) => [discipline, defaultPriority]),
  ) as RaceIntentV2['disciplinePriorities'];

  // Single-discipline goals do not need an artificial multisport tradeoff.
  const primaryDiscipline = disciplines.length === 1 ? disciplines[0] : undefined;
  if (primaryDiscipline && legacyPriority === 'race') disciplinePriorities[primaryDiscipline] = 'primary_focus';

  return {
    version: 2,
    overallObjective,
    primaryDiscipline,
    disciplinePriorities,
    tradeoffTolerance: 'preserve_balance',
  };
}

export function validateRaceIntent(
  intent: RaceIntentV2,
  goalDisciplines: EnduranceDiscipline[],
): RaceIntentValidationResult {
  const errors: string[] = [];
  const allowed = new Set(goalDisciplines);
  if (intent.version !== 2) errors.push('Race intent version must be 2.');
  if (!isOverallObjective(intent.overallObjective)) errors.push('Overall race objective is invalid.');
  if (!isTradeoff(intent.tradeoffTolerance)) errors.push('Race tradeoff tolerance is invalid.');
  if (intent.primaryDiscipline && !allowed.has(intent.primaryDiscipline)) {
    errors.push('Primary discipline must be part of the active race goal.');
  }

  for (const [discipline, priority] of Object.entries(intent.disciplinePriorities)) {
    if (!isEnduranceDiscipline(discipline) || !allowed.has(discipline)) {
      errors.push(`${discipline} is not part of the active race goal.`);
      continue;
    }
    if (!isStrategyObjective(priority)) errors.push(`${discipline} has an invalid race priority.`);
  }

  for (const [discipline, target] of Object.entries(intent.disciplineTargets ?? {})) {
    if (!isEnduranceDiscipline(discipline) || !allowed.has(discipline)) {
      errors.push(`${discipline} cannot have a race target for this goal.`);
      continue;
    }
    if (!target || !isTargetKind(target.kind)) errors.push(`${discipline} has an invalid race target.`);
  }

  if (intent.overallObjective === 'discipline_performance' && !intent.primaryDiscipline) {
    errors.push('A discipline-performance objective needs a primary discipline.');
  }
  if (intent.overallObjective === 'specific_overall_time' && !intent.overallTarget?.trim()) {
    errors.push('A specific overall-time objective needs a target.');
  }

  return { valid: errors.length === 0, errors };
}

export function raceIntentToCoachStrategy(intent: RaceIntentV2): CoachSemanticStrategyChange {
  const disciplineObjectives = { ...intent.disciplinePriorities };
  if (intent.primaryDiscipline && !disciplineObjectives[intent.primaryDiscipline]) {
    disciplineObjectives[intent.primaryDiscipline] = intent.overallObjective === 'discipline_performance'
      ? 'primary_focus'
      : 'develop';
  }

  const primaryFocus = intent.primaryDiscipline && (
    intent.overallObjective === 'discipline_performance'
    || disciplineObjectives[intent.primaryDiscipline] === 'primary_focus'
    || disciplineObjectives[intent.primaryDiscipline] === 'maximize'
  ) ? intent.primaryDiscipline : undefined;

  return {
    primaryFocus,
    disciplineObjectives,
    tradeoffTolerance: intent.tradeoffTolerance,
    racePriority: buildRacePriority(intent, primaryFocus),
  };
}

/**
 * Race intent is the baseline season/race emphasis. An explicitly approved
 * Strategy Coach directive is newer athlete intent and therefore overrides
 * only the fields it actually specifies.
 */
export function mergeRaceIntentWithCoachStrategy(
  raceIntent: RaceIntentV2 | undefined,
  approvedStrategy: CoachSemanticStrategyChange | undefined,
): CoachSemanticStrategyChange | undefined {
  const baseline = raceIntent ? raceIntentToCoachStrategy(raceIntent) : undefined;
  if (!approvedStrategy) return baseline;
  if (!baseline) return cloneStrategy(approvedStrategy);
  return {
    ...baseline,
    ...approvedStrategy,
    disciplineObjectives: {
      ...baseline.disciplineObjectives,
      ...approvedStrategy.disciplineObjectives,
    },
    tradeoffTolerance: approvedStrategy.tradeoffTolerance ?? baseline.tradeoffTolerance,
    racePriority: approvedStrategy.racePriority
      ? { ...(baseline.racePriority ?? {}), ...approvedStrategy.racePriority }
      : baseline.racePriority,
  };
}

export function legacyPriorityForRaceIntent(intent: RaceIntentV2): LegacyRacePriority {
  if (intent.overallObjective === 'finish_comfortably') return 'finish';
  if (intent.overallObjective === 'best_overall' || intent.overallObjective === 'placement_qualification') return 'race';
  return 'perform';
}

function buildRacePriority(
  intent: RaceIntentV2,
  primaryFocus: EnduranceDiscipline | undefined,
): CoachSemanticStrategyChange['racePriority'] | undefined {
  const discipline = primaryFocus ?? intent.primaryDiscipline;
  const target = discipline ? intent.disciplineTargets?.[discipline] : undefined;
  if (target) {
    const objective = target.kind === 'pr'
      ? 'personal_best' as const
      : target.kind === 'placement'
        ? 'placement' as const
        : 'time_goal' as const;
    return { discipline, objective, target: target.value?.trim() || undefined };
  }
  if (intent.overallObjective === 'placement_qualification') return { discipline, objective: 'placement' };
  if (intent.overallObjective === 'discipline_performance' && discipline) return { discipline, objective: 'strong_split' };
  if (intent.overallObjective === 'finish_comfortably') return { discipline, objective: 'finish' };
  return undefined;
}

function cloneStrategy(strategy: CoachSemanticStrategyChange): CoachSemanticStrategyChange {
  return {
    ...strategy,
    disciplineObjectives: { ...strategy.disciplineObjectives },
    racePriority: strategy.racePriority ? { ...strategy.racePriority } : undefined,
  };
}

function isOverallObjective(value: unknown): value is RaceOverallObjective {
  return value === 'finish_comfortably'
    || value === 'strong_finish'
    || value === 'best_overall'
    || value === 'specific_overall_time'
    || value === 'discipline_performance'
    || value === 'placement_qualification';
}

function isTradeoff(value: unknown): value is CoachStrategyTradeoff {
  return value === 'preserve_balance' || value === 'moderate_tradeoff' || value === 'aggressive_specialization';
}

function isEnduranceDiscipline(value: unknown): value is EnduranceDiscipline {
  return value === 'swim' || value === 'bike' || value === 'run';
}

function isStrategyObjective(value: unknown): value is CoachStrategyObjective {
  return value === 'minimum_viable' || value === 'maintain' || value === 'develop' || value === 'primary_focus' || value === 'maximize';
}

function isTargetKind(value: unknown): value is RaceTargetKind {
  return value === 'pr' || value === 'time' || value === 'pace' || value === 'power' || value === 'speed' || value === 'placement';
}
