import type { PerformanceGoalType } from '@circuit/domain';

import type {
  DisciplineFrequencyTarget,
  TrainableDiscipline,
} from './whole-athlete-week';

export type WeeklyFrequencyContract = Record<
  TrainableDiscipline,
  DisciplineFrequencyTarget
>;

export interface WeeklyFrequencyContractInput {
  goalType: PerformanceGoalType;
  runStatus: 'normal' | 'reduced' | 'return_to_run' | 'not_running';
  fixedCounts?: Partial<Record<TrainableDiscipline, number>>;
  plannedStrengthSessions: number;
}

/**
 * Resolves the week's normal discipline counts before placement.
 *
 * Priority:
 * 1. Explicit athlete commitments are preserved.
 * 2. Safety constraints such as return-to-run constrain generated work.
 * 3. Planned strength frequency is honored exactly.
 * 4. Goal defaults fill the remaining disciplines.
 *
 * The contract deliberately keeps max == preferred for generated endurance
 * work. A discipline may exceed that only because the athlete already has
 * explicit fixed commitments in the week.
 */
export function resolveWeeklyFrequencyContract(
  input: WeeklyFrequencyContractInput,
): WeeklyFrequencyContract {
  const preferred = preferredFrequency(input.goalType);
  const fixed = {
    swim: safeCount(input.fixedCounts?.swim),
    bike: safeCount(input.fixedCounts?.bike),
    run: safeCount(input.fixedCounts?.run),
    strength: safeCount(input.fixedCounts?.strength),
  };

  const result = {} as WeeklyFrequencyContract;

  for (const discipline of ['swim', 'bike', 'run'] as const) {
    if (discipline === 'run' && input.runStatus === 'not_running') {
      result.run = { min: fixed.run, preferred: fixed.run, max: fixed.run };
      continue;
    }

    if (discipline === 'run' && input.runStatus === 'return_to_run') {
      const target = Math.max(2, fixed.run);
      result.run = { min: target, preferred: target, max: target };
      continue;
    }

    const normal = preferred[discipline];
    const target = Math.max(normal, fixed[discipline]);

    result[discipline] = {
      min: Math.min(normal, target),
      preferred: target,
      max: target,
    };
  }

  const strengthTarget = Math.max(
    safeCount(input.plannedStrengthSessions),
    fixed.strength,
  );

  result.strength = {
    min: strengthTarget,
    preferred: strengthTarget,
    max: strengthTarget,
  };

  return result;
}

function preferredFrequency(
  goalType: PerformanceGoalType,
): Record<'swim' | 'bike' | 'run', number> {
  switch (goalType) {
    case 'triathlon_sprint':
      return { swim: 2, bike: 2, run: 2 };
    case 'triathlon_olympic':
      return { swim: 2, bike: 3, run: 3 };
    case 'ironman_70_3':
      return { swim: 3, bike: 4, run: 3 };
    case 'ironman_full':
      return { swim: 3, bike: 4, run: 3 };
    case 'swimrun':
      return { swim: 3, bike: 0, run: 3 };
    case 'road_10k':
    case 'road_half_marathon':
      return { swim: 1, bike: 1, run: 4 };
    case 'road_marathon':
    case 'trail_50k':
    case 'trail_100k':
      return { swim: 1, bike: 1, run: 5 };
    case 'swim_speed':
      return { swim: 4, bike: 1, run: 1 };
    case 'general_offseason':
      return { swim: 1, bike: 1, run: 1 };
  }
}

function safeCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(7, Math.round(value)));
}
