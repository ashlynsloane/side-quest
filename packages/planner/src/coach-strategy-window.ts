import type { CoachSemanticStrategyChange } from './coach-semantic-frame';

export type CoachStrategyWindowState = 'scheduled' | 'active' | 'expired';

/**
 * Strategy windows are evaluated at weekly-planning granularity. If any part of
 * a planning week intersects the approved strategy window, the strategy is
 * active for that week. This matches the whole-athlete planner's application
 * semantics and avoids the UI describing a different strategy than the plan.
 */
export function coachStrategyWindowStateForWeek(
  strategy: CoachSemanticStrategyChange,
  weekStartDate: string,
): CoachStrategyWindowState {
  const weekEndDate = addDays(weekStartDate, 6);
  if (strategy.startsAt && weekEndDate < strategy.startsAt) return 'scheduled';
  if (strategy.endsAt && weekStartDate > strategy.endsAt) return 'expired';
  return 'active';
}

export function coachStrategyAppliesToWeek(
  strategy: CoachSemanticStrategyChange,
  weekStartDate: string,
): boolean {
  return coachStrategyWindowStateForWeek(strategy, weekStartDate) === 'active';
}

export function strategyReturnToBaselineWeek(
  strategy: CoachSemanticStrategyChange,
  candidateWeekStarts: string[],
): string | undefined {
  if (!strategy.endsAt) return undefined;
  return [...candidateWeekStarts]
    .sort()
    .find((weekStart) => coachStrategyWindowStateForWeek(strategy, weekStart) === 'expired');
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
