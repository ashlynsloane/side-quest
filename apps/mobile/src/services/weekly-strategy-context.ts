import {
  buildWeeklyStrategyExpression,
  type WeeklyStrategyExpression,
} from '@circuit/planner/weekly-strategy-expression';
import type { WholeAthleteWeekPlan } from '@circuit/planner/whole-athlete-week';

import {
  loadRaceStrategyContext,
  type RaceStrategyContext,
} from './race-strategy-context';
import {
  getLatestWholeAthletePlanSnapshot,
  refreshLatestWholeAthletePlan,
} from './whole-athlete-plan-runtime';

export interface CurrentWeeklyStrategyContext {
  race: RaceStrategyContext;
  week: WholeAthleteWeekPlan;
  expression: WeeklyStrategyExpression;
  isCurrentWeek: boolean;
}

export async function loadCurrentWeeklyStrategyContext(
  raceContext?: RaceStrategyContext,
): Promise<CurrentWeeklyStrategyContext | null> {
  const race = raceContext ?? await loadRaceStrategyContext();
  if (!race) return null;

  let generated = getLatestWholeAthletePlanSnapshot();
  if (!generated?.weeks.length) generated = await refreshLatestWholeAthletePlan();
  if (!generated?.weeks.length) return null;

  const today = localDate();
  const current = generated.weeks.find((week) => today >= week.weekStartDate && today <= week.weekEndDate);
  const next = generated.weeks.find((week) => week.weekStartDate > today);
  const week = current ?? next ?? generated.weeks.at(-1);
  if (!week) return null;

  return {
    race,
    week,
    expression: buildWeeklyStrategyExpression(week, race.effectiveStrategy),
    isCurrentWeek: week === current,
  };
}

export function weeklyStrategyStateLabel(state: WeeklyStrategyExpression['state']): string {
  if (state === 'expressed') return 'STRATEGY EXPRESSED';
  if (state === 'partially_expressed') return 'STRATEGY PARTLY EXPRESSED';
  if (state === 'held') return 'STRATEGY HELD';
  return 'BALANCED WEEK';
}

export function weeklyTargetSupportText(expression: WeeklyStrategyExpression): string | undefined {
  const target = expression.targetSupport;
  if (!target) return undefined;
  const subject = target.discipline ? `${disciplineLabel(target.discipline)} target` : 'Race target';
  if (target.support === 'held') return `${subject}: still active, but this week is intentionally not adding target-specific progression.`;
  if (target.support === 'direct') return `${subject}: directly supported by this week's primary progression slot.`;
  return `${subject}: supported by the week, but not through the primary progression slot.`;
}

export function weeklyDisciplineLine(expression: WeeklyStrategyExpression): string {
  return expression.disciplines
    .filter((item) => item.objective || item.targetMin > 0 || item.sessions > 0)
    .map((item) => {
      const role = item.role === 'top_focus'
        ? 'focus'
        : item.role === 'race_floor'
          ? 'race floor'
          : item.role === 'maintain'
            ? 'maintain'
            : item.role === 'develop'
              ? 'develop'
              : 'support';
      return `${disciplineLabel(item.discipline)} · ${role} · ${item.sessions} session${item.sessions === 1 ? '' : 's'} · ${item.minutes} min`;
    })
    .join('\n');
}

function disciplineLabel(value: 'swim' | 'bike' | 'run' | 'strength'): string {
  if (value === 'swim') return 'Swim';
  if (value === 'bike') return 'Bike';
  if (value === 'run') return 'Run';
  return 'Strength';
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
