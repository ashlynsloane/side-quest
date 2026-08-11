import type { CoachSemanticDiscipline, CoachSemanticStrategyChange, CoachStrategyObjective } from './coach-semantic-frame';
import { topStrategyDisciplines } from './coach-semantic-frame';
import type { TrainableDiscipline, WholeAthleteWeekPlan } from './whole-athlete-week';
import type { ProgressionDomain } from './unified-training';

export type WeeklyStrategyExpressionState = 'expressed' | 'partially_expressed' | 'held' | 'balanced';

export interface WeeklyDisciplineExpression {
  discipline: TrainableDiscipline;
  objective?: CoachStrategyObjective;
  sessions: number;
  minutes: number;
  targetMin: number;
  targetPreferred: number;
  floorMet: boolean;
  preferredMet: boolean;
  role: 'top_focus' | 'develop' | 'maintain' | 'race_floor' | 'support';
}

export interface WeeklyRaceTargetSupport {
  discipline?: Exclude<CoachSemanticDiscipline, 'strength'>;
  objective: NonNullable<NonNullable<CoachSemanticStrategyChange['racePriority']>['objective']>;
  target?: string;
  support: 'direct' | 'supporting' | 'held';
}

export interface WeeklyStrategyExpression {
  state: WeeklyStrategyExpressionState;
  topFocus?: CoachSemanticDiscipline;
  primaryProgression?: TrainableDiscipline;
  secondaryProgression?: TrainableDiscipline;
  headline: string;
  summary: string;
  disciplines: WeeklyDisciplineExpression[];
  targetSupport?: WeeklyRaceTargetSupport;
  reasons: string[];
}

export function buildWeeklyStrategyExpression(
  week: WholeAthleteWeekPlan,
  strategy: CoachSemanticStrategyChange,
): WeeklyStrategyExpression {
  const topFocus = strategy.primaryFocus ?? topStrategyDisciplines(strategy)[0];
  const primaryProgression = progressionDiscipline(week.progressionBudget.primary);
  const secondaryProgression = progressionDiscipline(week.progressionBudget.secondary);
  const strategyHeld = week.planningState !== 'build'
    || !week.progressionAllowed
    || week.warnings.some((warning) => /taper|race[- ]week|training-stress ceiling/i.test(warning));

  let state: WeeklyStrategyExpressionState;
  if (!topFocus) state = strategyHeld ? 'held' : 'balanced';
  else if (strategyHeld) state = 'held';
  else if (primaryProgression === topFocus) state = 'expressed';
  else state = 'partially_expressed';

  const disciplines = week.disciplineSummary.map((summary): WeeklyDisciplineExpression => {
    const objective = strategy.disciplineObjectives[summary.discipline];
    return {
      discipline: summary.discipline,
      objective,
      sessions: summary.sessions,
      minutes: summary.minutes,
      targetMin: summary.targetMin,
      targetPreferred: summary.targetPreferred,
      floorMet: summary.sessions >= summary.targetMin,
      preferredMet: summary.sessions >= summary.targetPreferred,
      role: disciplineRole(summary.discipline, objective, topFocus),
    };
  });

  const reasons = weeklyReasons({ week, state, topFocus, primaryProgression, secondaryProgression, disciplines });
  const targetSupport = buildTargetSupport(strategy, state, primaryProgression, secondaryProgression);

  return {
    state,
    topFocus,
    primaryProgression,
    secondaryProgression,
    headline: headlineFor(state, topFocus, primaryProgression),
    summary: summaryFor(state, topFocus, primaryProgression, disciplines),
    disciplines,
    targetSupport,
    reasons,
  };
}

function disciplineRole(
  discipline: TrainableDiscipline,
  objective: CoachStrategyObjective | undefined,
  topFocus: CoachSemanticDiscipline | undefined,
): WeeklyDisciplineExpression['role'] {
  if (discipline === topFocus) return 'top_focus';
  if (objective === 'minimum_viable') return 'race_floor';
  if (objective === 'maintain') return 'maintain';
  if (objective === 'develop' || objective === 'primary_focus' || objective === 'maximize') return 'develop';
  return 'support';
}

function buildTargetSupport(
  strategy: CoachSemanticStrategyChange,
  state: WeeklyStrategyExpressionState,
  primaryProgression: TrainableDiscipline | undefined,
  secondaryProgression: TrainableDiscipline | undefined,
): WeeklyRaceTargetSupport | undefined {
  const race = strategy.racePriority;
  if (!race?.objective) return undefined;
  const support: WeeklyRaceTargetSupport['support'] = state === 'held'
    ? 'held'
    : race.discipline && race.discipline === primaryProgression
      ? 'direct'
      : race.discipline && race.discipline === secondaryProgression
        ? 'supporting'
        : 'supporting';
  return {
    discipline: race.discipline,
    objective: race.objective,
    target: race.target,
    support,
  };
}

function weeklyReasons(input: {
  week: WholeAthleteWeekPlan;
  state: WeeklyStrategyExpressionState;
  topFocus?: CoachSemanticDiscipline;
  primaryProgression?: TrainableDiscipline;
  secondaryProgression?: TrainableDiscipline;
  disciplines: WeeklyDisciplineExpression[];
}): string[] {
  const reasons: string[] = [];
  if (input.state === 'expressed' && input.topFocus) {
    reasons.push(`${label(input.topFocus)} received this week's primary progression slot.`);
  } else if (input.state === 'partially_expressed' && input.topFocus) {
    reasons.push(input.primaryProgression
      ? `${label(input.topFocus)} remains a strategic focus, but ${label(input.primaryProgression)} received this week's primary progression slot.`
      : `${label(input.topFocus)} remains a strategic focus, but no primary progression slot was added this week.`);
  } else if (input.state === 'held') {
    reasons.push('The strategy is being remembered, but this week is not using discretionary specialization.');
  } else if (input.primaryProgression) {
    reasons.push(`${label(input.primaryProgression)} received the primary progression slot inside a balanced strategy.`);
  }

  const floors = input.disciplines.filter((item) => item.targetMin > 0 && item.floorMet && item.role !== 'top_focus');
  if (floors.length) reasons.push(`${joinLabels(floors.map((item) => item.discipline))} ${floors.length === 1 ? 'keeps' : 'keep'} the configured minimum frequency.`);

  const missingFloors = input.disciplines.filter((item) => item.targetMin > 0 && !item.floorMet);
  if (missingFloors.length) reasons.push(`${joinLabels(missingFloors.map((item) => item.discipline))} did not reach the configured minimum frequency inside this week's constraints.`);

  if (input.week.planningState !== 'build') reasons.push(`Whole-athlete planning is in ${input.week.planningState} mode, so progression is subordinate to the current training-stress ceiling.`);
  const phaseWarning = input.week.warnings.find((warning) => /taper|race[- ]week/i.test(warning));
  if (phaseWarning) reasons.push(phaseWarning);
  return unique(reasons);
}

function headlineFor(
  state: WeeklyStrategyExpressionState,
  topFocus: CoachSemanticDiscipline | undefined,
  primaryProgression: TrainableDiscipline | undefined,
): string {
  if (state === 'expressed' && topFocus) return `${label(topFocus)} is getting the progression slot this week`;
  if (state === 'partially_expressed' && topFocus) return `${label(topFocus)} stays the focus, but the week is sharing progression`;
  if (state === 'held' && topFocus) return `${label(topFocus)} remains the focus, but specialization is held this week`;
  if (state === 'held') return 'Progression is held this week';
  if (primaryProgression) return `${label(primaryProgression)} gets this week's progression slot inside a balanced plan`;
  return 'This week keeps the race strategy balanced';
}

function summaryFor(
  state: WeeklyStrategyExpressionState,
  topFocus: CoachSemanticDiscipline | undefined,
  primaryProgression: TrainableDiscipline | undefined,
  disciplines: WeeklyDisciplineExpression[],
): string {
  if (state === 'held') {
    return 'Side Quest is preserving the long-term strategy without forcing extra progression through a week that has a higher-order constraint.';
  }
  const top = topFocus ? disciplines.find((item) => item.discipline === topFocus) : undefined;
  if (state === 'expressed' && top) {
    return `${label(top.discipline)} has ${top.sessions} planned session${top.sessions === 1 ? '' : 's'} / ${top.minutes} min, with scarce progression capacity pointed at that discipline.`;
  }
  if (state === 'partially_expressed' && top) {
    return `${label(top.discipline)} remains prioritized at ${top.sessions} session${top.sessions === 1 ? '' : 's'} / ${top.minutes} min, while ${primaryProgression ? label(primaryProgression) : 'another need'} gets the primary progression slot.`;
  }
  return 'The week is distributing training across the race disciplines rather than privileging a single discipline.';
}

function progressionDiscipline(domain: ProgressionDomain | null): TrainableDiscipline | undefined {
  if (domain === 'swim_volume') return 'swim';
  if (domain === 'bike_volume') return 'bike';
  if (domain === 'run_volume' || domain === 'impact') return 'run';
  if (domain === 'strength_volume' || domain === 'strength_intensity') return 'strength';
  return undefined;
}

function label(value: CoachSemanticDiscipline | TrainableDiscipline): string {
  if (value === 'swim') return 'Swim';
  if (value === 'bike') return 'Bike';
  if (value === 'run') return 'Run';
  return 'Strength';
}

function joinLabels(values: TrainableDiscipline[]): string {
  const labels = values.map(label);
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
