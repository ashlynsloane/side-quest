import type { EnduranceDiscipline, PerformanceGoalType, TrainingPhase } from '@circuit/domain';

import type {
  CoachSemanticDiscipline,
  CoachSemanticStrategyChange,
  CoachStrategyObjective,
  CoachStrategyTradeoff,
} from './coach-semantic-frame';
import type { ProgressionDomain } from './unified-training';

export type StrategyFrequencyTarget = { min: number; preferred: number; max: number };
export type StrategyFrequencyPlan = Partial<Record<CoachSemanticDiscipline, StrategyFrequencyTarget>>;

export interface CoachStrategyBaseline {
  sessionsPerWeek: number;
  minutesPerWeek?: number;
}

export interface CoachStrategyPlanningPolicy {
  active: boolean;
  startsAt?: string;
  endsAt?: string;
  primaryFocus?: CoachSemanticDiscipline;
  objectives: Partial<Record<CoachSemanticDiscipline, CoachStrategyObjective>>;
  tradeoffTolerance: CoachStrategyTradeoff;
  disciplinePriority: CoachSemanticDiscipline[];
  progressionPriority: ProgressionDomain[];
  protectedMaintenance: CoachSemanticDiscipline[];
  rationale: string[];
  warnings: string[];
  requiresAthleteApproval: boolean;
}

export interface BuildCoachStrategyPolicyInput {
  strategy: CoachSemanticStrategyChange;
  goalType: PerformanceGoalType;
  goalDisciplines: EnduranceDiscipline[];
  phase: TrainingPhase;
  weekStartDate?: string;
}

const DISCIPLINES: CoachSemanticDiscipline[] = ['swim', 'bike', 'run', 'strength'];
const OBJECTIVE_RANK: Record<CoachStrategyObjective, number> = {
  maximize: 0,
  primary_focus: 1,
  develop: 2,
  maintain: 3,
  minimum_viable: 4,
};

export function buildCoachStrategyPlanningPolicy(input: BuildCoachStrategyPolicyInput): CoachStrategyPlanningPolicy {
  const strategy = input.strategy;
  const warnings: string[] = [];
  const rationale: string[] = [];
  const tradeoffTolerance = strategy.tradeoffTolerance ?? 'preserve_balance';
  const active = strategyIsActiveForWeek(strategy, input.weekStartDate);
  const objectives = normalizeObjectives(strategy, input.goalDisciplines, tradeoffTolerance);
  const primaryFocus = strategy.primaryFocus ?? inferPrimaryFocus(objectives);

  if (primaryFocus && primaryFocus !== 'strength' && !input.goalDisciplines.includes(primaryFocus)) {
    warnings.push(`${primaryFocus} is not part of the active performance goal, so it cannot displace goal-specific minimum training.`);
  }
  if (primaryFocus === 'strength' && (input.phase === 'build' || input.phase === 'peak' || input.phase === 'taper' || input.phase === 'race_week')) {
    warnings.push('Strength specialization is subordinate to race-specific endurance work in build, peak, taper, and race-week phases.');
  }
  if (input.phase === 'taper' || input.phase === 'race_week') {
    rationale.push('The strategy remains remembered, but taper/race-week freshness takes precedence over progression.');
  }

  const protectedMaintenance = input.goalDisciplines.filter((discipline) => objectives[discipline] !== 'develop'
    && objectives[discipline] !== 'primary_focus'
    && objectives[discipline] !== 'maximize');
  const disciplinePriority = buildDisciplinePriority(primaryFocus, objectives, input.goalDisciplines);
  const progressionPriority = buildProgressionPriority(disciplinePriority, objectives, input.phase);

  if (primaryFocus) rationale.push(`${label(primaryFocus)} receives first claim on discretionary progression and additional frequency when the week has capacity.`);
  if (protectedMaintenance.length) rationale.push(`Race-relevant maintenance is preserved for ${protectedMaintenance.map(label).join(', ')} rather than being silently removed.`);
  if (tradeoffTolerance === 'preserve_balance') rationale.push('Balance is preserved unless the athlete explicitly changes an individual discipline objective.');
  if (tradeoffTolerance === 'moderate_tradeoff') rationale.push('Non-focus disciplines may consolidate toward maintenance, but not below goal minimums.');
  if (tradeoffTolerance === 'aggressive_specialization') rationale.push('Discretionary non-focus work may consolidate toward minimum viable frequency, while goal minimums and safety constraints remain protected.');

  return {
    active,
    startsAt: strategy.startsAt,
    endsAt: strategy.endsAt,
    primaryFocus,
    objectives,
    tradeoffTolerance,
    disciplinePriority,
    progressionPriority,
    protectedMaintenance,
    rationale,
    warnings,
    requiresAthleteApproval: meaningfulStrategyChange(strategy),
  };
}

export function applyCoachStrategyToFrequencyTargets(
  base: StrategyFrequencyPlan,
  policy: CoachStrategyPlanningPolicy,
  baselines: Partial<Record<CoachSemanticDiscipline, CoachStrategyBaseline>> = {},
): StrategyFrequencyPlan {
  if (!policy.active) return cloneFrequencyPlan(base);
  const result = cloneFrequencyPlan(base);

  for (const discipline of DISCIPLINES) {
    const current = result[discipline];
    if (!current) continue;
    const objective = policy.objectives[discipline];
    if (!objective) continue;
    const baseline = baselines[discipline];
    result[discipline] = frequencyForObjective(current, objective, baseline);
  }

  return result;
}

export function strategyIsActiveForWeek(strategy: CoachSemanticStrategyChange, weekStartDate?: string): boolean {
  if (!weekStartDate) return true;
  const weekEndDate = addDays(weekStartDate, 6);
  if (strategy.startsAt && weekEndDate < strategy.startsAt) return false;
  if (strategy.endsAt && weekStartDate > strategy.endsAt) return false;
  return true;
}

export function progressionDomainForStrategyDiscipline(discipline: CoachSemanticDiscipline): ProgressionDomain[] {
  if (discipline === 'swim') return ['swim_volume'];
  if (discipline === 'bike') return ['bike_volume'];
  if (discipline === 'run') return ['run_volume'];
  return ['strength_intensity', 'strength_volume'];
}

function normalizeObjectives(
  strategy: CoachSemanticStrategyChange,
  goalDisciplines: EnduranceDiscipline[],
  tradeoff: CoachStrategyTradeoff,
): Partial<Record<CoachSemanticDiscipline, CoachStrategyObjective>> {
  const objectives: Partial<Record<CoachSemanticDiscipline, CoachStrategyObjective>> = { ...strategy.disciplineObjectives };
  if (strategy.primaryFocus && !objectives[strategy.primaryFocus]) objectives[strategy.primaryFocus] = 'primary_focus';

  for (const discipline of goalDisciplines) {
    if (objectives[discipline]) continue;
    objectives[discipline] = tradeoff === 'aggressive_specialization'
      ? 'minimum_viable'
      : tradeoff === 'moderate_tradeoff'
        ? 'maintain'
        : undefined;
  }
  return objectives;
}

function inferPrimaryFocus(
  objectives: Partial<Record<CoachSemanticDiscipline, CoachStrategyObjective>>,
): CoachSemanticDiscipline | undefined {
  return DISCIPLINES
    .filter((discipline) => objectives[discipline] === 'maximize' || objectives[discipline] === 'primary_focus')
    .sort((left, right) => OBJECTIVE_RANK[objectives[left]!] - OBJECTIVE_RANK[objectives[right]!])[0];
}

function buildDisciplinePriority(
  primaryFocus: CoachSemanticDiscipline | undefined,
  objectives: Partial<Record<CoachSemanticDiscipline, CoachStrategyObjective>>,
  goalDisciplines: EnduranceDiscipline[],
): CoachSemanticDiscipline[] {
  const goalSet = new Set<CoachSemanticDiscipline>(goalDisciplines);
  goalSet.add('strength');
  return DISCIPLINES
    .filter((discipline) => goalSet.has(discipline))
    .sort((left, right) => {
      if (left === primaryFocus && right !== primaryFocus) return -1;
      if (right === primaryFocus && left !== primaryFocus) return 1;
      const leftObjective = objectives[left];
      const rightObjective = objectives[right];
      const leftRank = leftObjective ? OBJECTIVE_RANK[leftObjective] : 3.5;
      const rightRank = rightObjective ? OBJECTIVE_RANK[rightObjective] : 3.5;
      return leftRank - rightRank || defaultDisciplineRank(left) - defaultDisciplineRank(right);
    });
}

function buildProgressionPriority(
  disciplinePriority: CoachSemanticDiscipline[],
  objectives: Partial<Record<CoachSemanticDiscipline, CoachStrategyObjective>>,
  phase: TrainingPhase,
): ProgressionDomain[] {
  if (phase === 'taper' || phase === 'race_week') return [];
  const eligible = disciplinePriority.filter((discipline) => {
    const objective = objectives[discipline];
    return objective === 'develop' || objective === 'primary_focus' || objective === 'maximize';
  });
  return unique(eligible.flatMap(progressionDomainForStrategyDiscipline));
}

function frequencyForObjective(
  base: StrategyFrequencyTarget,
  objective: CoachStrategyObjective,
  baseline?: CoachStrategyBaseline,
): StrategyFrequencyTarget {
  const min = clampInt(base.min, 0, 7);
  const max = clampInt(Math.max(base.max, min), min, 7);
  const baselineFrequency = baseline ? clampInt(Math.round(baseline.sessionsPerWeek), min, max) : undefined;
  let preferred = clampInt(base.preferred, min, max);

  if (objective === 'minimum_viable') preferred = min;
  if (objective === 'maintain') preferred = baselineFrequency ?? preferred;
  if (objective === 'develop') preferred = Math.min(max, Math.max(preferred, (baselineFrequency ?? preferred) + 1));
  if (objective === 'primary_focus') preferred = Math.min(max, Math.max(preferred + 1, (baselineFrequency ?? preferred) + 1));
  if (objective === 'maximize') preferred = Math.min(max, Math.max(preferred + 2, (baselineFrequency ?? preferred) + 2));

  return { min, preferred: clampInt(preferred, min, max), max };
}

function meaningfulStrategyChange(strategy: CoachSemanticStrategyChange): boolean {
  return Boolean(
    strategy.primaryFocus
    || strategy.tradeoffTolerance
    || strategy.startsAt
    || strategy.endsAt
    || strategy.racePriority
    || Object.keys(strategy.disciplineObjectives).length,
  );
}

function cloneFrequencyPlan(base: StrategyFrequencyPlan): StrategyFrequencyPlan {
  return Object.fromEntries(Object.entries(base).map(([discipline, target]) => [discipline, target ? { ...target } : target])) as StrategyFrequencyPlan;
}

function defaultDisciplineRank(discipline: CoachSemanticDiscipline): number {
  if (discipline === 'bike') return 0;
  if (discipline === 'run') return 1;
  if (discipline === 'swim') return 2;
  return 3;
}

function label(discipline: CoachSemanticDiscipline): string {
  return discipline === 'strength' ? 'strength' : discipline;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.max(minimum, Math.min(maximum, value)));
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
