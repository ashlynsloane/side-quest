import type { TrainingPhase } from '@circuit/domain';

import type { CoachSemanticStrategyChange } from './coach-semantic-frame';
import {
  coachStrategyWindowStateForWeek,
  strategyReturnToBaselineWeek,
  type CoachStrategyWindowState,
} from './coach-strategy-window';
import {
  mergeRaceIntentWithCoachStrategy,
  type RaceIntentV2,
} from './race-intent';
import {
  buildWeeklyStrategyExpression,
  type WeeklyStrategyExpression,
} from './weekly-strategy-expression';
import type { WholeAthleteWeekPlan } from './whole-athlete-week';

export interface StrategyMacrocycleWeekInput {
  phase: TrainingPhase;
  plan: WholeAthleteWeekPlan;
}

export interface StrategyMacrocycleWeek {
  weekStartDate: string;
  weekEndDate: string;
  phase: TrainingPhase;
  source: 'race_intent' | 'strategy_coach';
  overrideWindowState?: CoachStrategyWindowState;
  expression: WeeklyStrategyExpression;
  planningState: WholeAthleteWeekPlan['planningState'];
  plannedMinutes: number;
  targetMinutes: number;
}

export interface StrategyPhaseSegment {
  phase: TrainingPhase;
  startDate: string;
  endDate: string;
  weeks: number;
}

export interface StrategyPhaseTransition {
  from: TrainingPhase;
  to: TrainingPhase;
  startsAt: string;
}

export interface StrategyMacrocycleView {
  startsAt: string;
  endsAt: string;
  referenceWeekStart: string;
  approvedWindowState?: CoachStrategyWindowState;
  approvedStartsAt?: string;
  approvedEndsAt?: string;
  returnToRaceIntentWeek?: string;
  strategyBeganBeforeBlock: boolean;
  strategyContinuesBeyondBlock: boolean;
  nextPhaseTransition?: StrategyPhaseTransition;
  phases: StrategyPhaseSegment[];
  weeks: StrategyMacrocycleWeek[];
}

export function buildStrategyMacrocycle(input: {
  raceIntent: RaceIntentV2;
  approvedStrategy?: CoachSemanticStrategyChange;
  weeks: StrategyMacrocycleWeekInput[];
  referenceWeekStart: string;
}): StrategyMacrocycleView | null {
  const ordered = [...input.weeks].sort((left, right) => left.plan.weekStartDate.localeCompare(right.plan.weekStartDate));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return null;

  const weeks = ordered.map(({ phase, plan }): StrategyMacrocycleWeek => {
    const overrideWindowState = input.approvedStrategy
      ? coachStrategyWindowStateForWeek(input.approvedStrategy, plan.weekStartDate)
      : undefined;
    const override = overrideWindowState === 'active' ? input.approvedStrategy : undefined;
    const effective = mergeRaceIntentWithCoachStrategy(input.raceIntent, override);
    if (!effective) throw new Error('Race intent did not produce a strategy for the macrocycle week.');
    return {
      weekStartDate: plan.weekStartDate,
      weekEndDate: plan.weekEndDate,
      phase,
      source: override ? 'strategy_coach' : 'race_intent',
      overrideWindowState,
      expression: buildWeeklyStrategyExpression(plan, effective),
      planningState: plan.planningState,
      plannedMinutes: plan.plannedMinutes,
      targetMinutes: plan.targetMinutes,
    };
  });

  const approvedWindowState = input.approvedStrategy
    ? coachStrategyWindowStateForWeek(input.approvedStrategy, input.referenceWeekStart)
    : undefined;
  const weekStarts = weeks.map((week) => week.weekStartDate);
  const returnToRaceIntentWeek = input.approvedStrategy
    ? strategyReturnToBaselineWeek(input.approvedStrategy, weekStarts)
    : undefined;
  const phases = buildPhaseSegments(ordered);
  const nextPhaseTransition = findNextPhaseTransition(ordered, input.referenceWeekStart);
  const startsAt = first.plan.weekStartDate;
  const endsAt = last.plan.weekEndDate;

  return {
    startsAt,
    endsAt,
    referenceWeekStart: input.referenceWeekStart,
    approvedWindowState,
    approvedStartsAt: input.approvedStrategy?.startsAt,
    approvedEndsAt: input.approvedStrategy?.endsAt,
    returnToRaceIntentWeek,
    strategyBeganBeforeBlock: Boolean(input.approvedStrategy?.startsAt && input.approvedStrategy.startsAt < startsAt),
    strategyContinuesBeyondBlock: Boolean(
      input.approvedStrategy
      && (!input.approvedStrategy.endsAt || input.approvedStrategy.endsAt > endsAt),
    ),
    nextPhaseTransition,
    phases,
    weeks,
  };
}

function buildPhaseSegments(weeks: StrategyMacrocycleWeekInput[]): StrategyPhaseSegment[] {
  const segments: StrategyPhaseSegment[] = [];
  for (const week of weeks) {
    const previous = segments.at(-1);
    if (previous?.phase === week.phase) {
      previous.endDate = week.plan.weekEndDate;
      previous.weeks += 1;
      continue;
    }
    segments.push({
      phase: week.phase,
      startDate: week.plan.weekStartDate,
      endDate: week.plan.weekEndDate,
      weeks: 1,
    });
  }
  return segments;
}

function findNextPhaseTransition(
  weeks: StrategyMacrocycleWeekInput[],
  referenceWeekStart: string,
): StrategyPhaseTransition | undefined {
  const currentIndex = Math.max(0, weeks.findIndex((week) => week.plan.weekStartDate >= referenceWeekStart));
  const current = weeks[currentIndex];
  if (!current) return undefined;
  for (let index = currentIndex + 1; index < weeks.length; index += 1) {
    const candidate = weeks[index];
    if (candidate && candidate.phase !== current.phase) {
      return { from: current.phase, to: candidate.phase, startsAt: candidate.plan.weekStartDate };
    }
  }
  return undefined;
}
