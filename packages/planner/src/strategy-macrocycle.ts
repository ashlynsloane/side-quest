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
  resolveSeasonStrategyForWeek,
  seasonStrategyEntryLabel,
  type SeasonStrategyEntry,
} from './season-strategy';
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
  strategyWindowId?: string;
  strategyWindowLabel?: string;
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

export interface StrategySeasonWindowView {
  id: string;
  label: string;
  startsAt?: string;
  endsAt?: string;
  state: CoachStrategyWindowState;
  firstControlledWeek?: string;
  lastControlledWeek?: string;
}

export interface StrategySeasonHandoff {
  weekStartDate: string;
  from: 'race_intent' | 'strategy_coach';
  to: 'race_intent' | 'strategy_coach';
  fromWindowId?: string;
  toWindowId?: string;
}

export interface StrategyMacrocycleView {
  startsAt: string;
  endsAt: string;
  referenceWeekStart: string;
  approvedWindowState?: CoachStrategyWindowState;
  approvedStartsAt?: string;
  approvedEndsAt?: string;
  activeWindowId?: string;
  nextWindowId?: string;
  returnToRaceIntentWeek?: string;
  strategyBeganBeforeBlock: boolean;
  strategyContinuesBeyondBlock: boolean;
  nextPhaseTransition?: StrategyPhaseTransition;
  nextStrategyHandoff?: StrategySeasonHandoff;
  phases: StrategyPhaseSegment[];
  seasonWindows: StrategySeasonWindowView[];
  handoffs: StrategySeasonHandoff[];
  weeks: StrategyMacrocycleWeek[];
}

export function buildStrategyMacrocycle(input: {
  raceIntent: RaceIntentV2;
  approvedStrategy?: CoachSemanticStrategyChange;
  approvedStrategies?: SeasonStrategyEntry[];
  weeks: StrategyMacrocycleWeekInput[];
  referenceWeekStart: string;
}): StrategyMacrocycleView | null {
  const ordered = [...input.weeks].sort((left, right) => left.plan.weekStartDate.localeCompare(right.plan.weekStartDate));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return null;

  const entries = normalizeEntries(input.approvedStrategies, input.approvedStrategy);
  const weeks = ordered.map(({ phase, plan }): StrategyMacrocycleWeek => {
    const resolution = resolveSeasonStrategyForWeek(entries, plan.weekStartDate);
    const override = resolution.state === 'active' ? resolution.entry : undefined;
    const effective = mergeRaceIntentWithCoachStrategy(input.raceIntent, override?.strategy);
    if (!effective) throw new Error('Race intent did not produce a strategy for the macrocycle week.');
    return {
      weekStartDate: plan.weekStartDate,
      weekEndDate: plan.weekEndDate,
      phase,
      source: override ? 'strategy_coach' : 'race_intent',
      strategyWindowId: override?.id,
      strategyWindowLabel: override ? seasonStrategyEntryLabel(override) : undefined,
      overrideWindowState: resolution.state,
      expression: buildWeeklyStrategyExpression(plan, effective),
      planningState: plan.planningState,
      plannedMinutes: plan.plannedMinutes,
      targetMinutes: plan.targetMinutes,
    };
  });

  const referenceResolution = resolveSeasonStrategyForWeek(entries, input.referenceWeekStart);
  const relevantEntry = referenceResolution.entry;
  const activeWindowId = referenceResolution.state === 'active' ? relevantEntry?.id : undefined;
  const nextWindowId = referenceResolution.state === 'scheduled' ? relevantEntry?.id : findNextScheduledWindow(entries, input.referenceWeekStart)?.id;
  const weekStarts = weeks.map((week) => week.weekStartDate);
  const returnToRaceIntentWeek = referenceResolution.state === 'active' && relevantEntry
    ? strategyReturnToBaselineWeek(relevantEntry.strategy, weekStarts)
    : undefined;
  const phases = buildPhaseSegments(ordered);
  const nextPhaseTransition = findNextPhaseTransition(ordered, input.referenceWeekStart);
  const startsAt = first.plan.weekStartDate;
  const endsAt = last.plan.weekEndDate;
  const seasonWindows = entries.map((entry) => buildSeasonWindowView(entry, weeks, input.referenceWeekStart));
  const handoffs = buildHandoffs(weeks);
  const nextStrategyHandoff = handoffs.find((handoff) => handoff.weekStartDate >= input.referenceWeekStart);

  return {
    startsAt,
    endsAt,
    referenceWeekStart: input.referenceWeekStart,
    approvedWindowState: referenceResolution.state,
    approvedStartsAt: relevantEntry?.strategy.startsAt,
    approvedEndsAt: relevantEntry?.strategy.endsAt,
    activeWindowId,
    nextWindowId,
    returnToRaceIntentWeek,
    strategyBeganBeforeBlock: entries.some((entry) => Boolean(entry.strategy.startsAt && entry.strategy.startsAt < startsAt)),
    strategyContinuesBeyondBlock: entries.some((entry) => !entry.strategy.endsAt || entry.strategy.endsAt > endsAt),
    nextPhaseTransition,
    nextStrategyHandoff,
    phases,
    seasonWindows,
    handoffs,
    weeks,
  };
}

function normalizeEntries(
  scheduled: SeasonStrategyEntry[] | undefined,
  legacy: CoachSemanticStrategyChange | undefined,
): SeasonStrategyEntry[] {
  if (scheduled?.length) return scheduled.map(cloneEntry).sort(compareEntries);
  return legacy ? [{ id: 'legacy-approved-strategy', strategy: cloneStrategy(legacy) }] : [];
}

function buildSeasonWindowView(
  entry: SeasonStrategyEntry,
  weeks: StrategyMacrocycleWeek[],
  referenceWeekStart: string,
): StrategySeasonWindowView {
  const controlled = weeks.filter((week) => week.strategyWindowId === entry.id);
  return {
    id: entry.id,
    label: seasonStrategyEntryLabel(entry),
    startsAt: entry.strategy.startsAt,
    endsAt: entry.strategy.endsAt,
    state: coachStrategyWindowStateForWeek(entry.strategy, referenceWeekStart),
    firstControlledWeek: controlled[0]?.weekStartDate,
    lastControlledWeek: controlled.at(-1)?.weekStartDate,
  };
}

function buildHandoffs(weeks: StrategyMacrocycleWeek[]): StrategySeasonHandoff[] {
  const handoffs: StrategySeasonHandoff[] = [];
  for (let index = 1; index < weeks.length; index += 1) {
    const previous = weeks[index - 1]!;
    const current = weeks[index]!;
    const previousKey = `${previous.source}:${previous.strategyWindowId ?? 'race'}`;
    const currentKey = `${current.source}:${current.strategyWindowId ?? 'race'}`;
    if (previousKey === currentKey) continue;
    handoffs.push({
      weekStartDate: current.weekStartDate,
      from: previous.source,
      to: current.source,
      fromWindowId: previous.strategyWindowId,
      toWindowId: current.strategyWindowId,
    });
  }
  return handoffs;
}

function findNextScheduledWindow(entries: SeasonStrategyEntry[], referenceWeekStart: string): SeasonStrategyEntry | undefined {
  return [...entries]
    .filter((entry) => coachStrategyWindowStateForWeek(entry.strategy, referenceWeekStart) === 'scheduled')
    .sort(compareEntries)[0];
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

function compareEntries(left: SeasonStrategyEntry, right: SeasonStrategyEntry): number {
  return (left.strategy.startsAt ?? '').localeCompare(right.strategy.startsAt ?? '') || left.id.localeCompare(right.id);
}

function cloneEntry(entry: SeasonStrategyEntry): SeasonStrategyEntry {
  return { ...entry, strategy: cloneStrategy(entry.strategy) };
}

function cloneStrategy(strategy: CoachSemanticStrategyChange): CoachSemanticStrategyChange {
  return {
    ...strategy,
    disciplineObjectives: { ...strategy.disciplineObjectives },
    racePriority: strategy.racePriority ? { ...strategy.racePriority } : undefined,
  };
}
