import type {
  AthleteFirstMovementTrend,
  AthleteFirstProgressModel,
  RaceHierarchyModel,
  RacePeriodizationContext,
  RacePriority,
  SeasonRace,
  SecondaryRaceAdjustment,
  TrainingWin,
  TrainingWinCandidate,
} from '@circuit/domain';

const DAY_MS = 86_400_000;

function parseDate(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid race date: ${value}`);
  return timestamp;
}

function weeksBetween(earlier: string, later: string): number {
  return Math.max(0, Math.round(((parseDate(later) - parseDate(earlier)) / DAY_MS) / 7));
}

type SecondarySeasonRace = SeasonRace & { priority: Exclude<RacePriority, 'A'> };

function isSecondaryRace(race: SeasonRace): race is SecondarySeasonRace {
  return race.priority === 'B' || race.priority === 'C';
}

function secondaryAdjustment(race: SecondarySeasonRace, aRace: SeasonRace): SecondaryRaceAdjustment {
  const weeksBeforeARace = weeksBetween(race.date, aRace.date);
  const intent = race.intent ?? (race.priority === 'B' ? 'race_fully' : 'training_day');
  const isB = race.priority === 'B';
  const replaceExistingKeySession = intent === 'supported_hard_workout' || intent === 'training_day';
  const treatment = isB ? 'short_taper' : replaceExistingKeySession ? 'replace_key_session' : 'minimal_freshening';
  const lighterDaysBefore = isB ? (weeksBeforeARace <= 4 ? 2 : 3) : 1;
  const recoveryDaysAfter = isB ? 2 : 1;
  const guidance = [
    `Keep the macrocycle oriented around ${aRace.name}.`,
    isB
      ? 'Use a short reduction in load rather than a full A-race taper.'
      : 'Treat this event as a supported training stimulus unless the athlete chooses otherwise.',
    replaceExistingKeySession
      ? 'Replace a compatible key session instead of adding race load on top of the week.'
      : 'Remove nearby conflicting heavy strength while preserving the surrounding block.',
  ];
  if (weeksBeforeARace >= 4 && weeksBeforeARace <= 8) {
    guidance.push('Embed the event inside the A-race build, then resume the planned block after brief recovery.');
  }
  return {
    raceId: race.raceId,
    priority: race.priority,
    weeksBeforeARace,
    treatment,
    lighterDaysBefore,
    recoveryDaysAfter,
    preserveARaceOrientation: true,
    replaceExistingKeySession,
    guidance,
  };
}

export function buildRaceHierarchy(context: RacePeriodizationContext): RaceHierarchyModel {
  const aRaces = context.races.filter((race) => race.priority === 'A');
  if (aRaces.length !== 1) throw new Error('A planning cycle requires exactly one A race.');
  const aRace = aRaces[0]!;
  const secondaryRaces = context.races
    .filter(isSecondaryRace)
    .filter((race) => parseDate(race.date) <= parseDate(aRace.date))
    .sort((left, right) => parseDate(left.date) - parseDate(right.date));
  return {
    aRace,
    secondaryRaces,
    adjustments: secondaryRaces.map((race) => secondaryAdjustment(race, aRace)),
    macrocycleOrientation: `${context.activePhaseLabel} remains oriented around the A race: ${aRace.name}.`,
  };
}

export function evaluateTrainingWin(candidate: TrainingWinCandidate): TrainingWin {
  if (candidate.safetyRecommendationIgnored || candidate.painIncreased) {
    return {
      ...candidate,
      safetyState: 'suppress',
      celebrationReason: 'Do not reward work completed against pain or an active safety recommendation.',
    };
  }
  if (candidate.requiredUnplannedExtraWork && candidate.category === 'performance') {
    return {
      ...candidate,
      safetyState: 'hold',
      celebrationReason: 'Performance changes are not celebrated when they depended on unnecessary extra work.',
    };
  }
  const judgment = candidate.reflectsAppropriateModification || ['judgment', 'recovery', 'maintenance', 'durability'].includes(candidate.category);
  return {
    ...candidate,
    safetyState: 'celebrate',
    celebrationReason: judgment
      ? 'This reflects a sound training decision, recovery choice, or durable participation.'
      : 'This is a meaningful outcome that does not require constant upward progression.',
  };
}

export function buildAthleteFirstProgress(input: {
  headline?: string;
  interpretation?: string;
  candidates?: TrainingWinCandidate[];
  movementTrends?: AthleteFirstMovementTrend[];
  milestonesEnabled?: boolean;
  milestoneNotificationsEnabled?: boolean;
  activeSafetyMessage?: string;
} = {}): AthleteFirstProgressModel {
  const trainingWins = (input.candidates ?? [])
    .map(evaluateTrainingWin)
    .filter((win) => win.safetyState === 'celebrate');
  return {
    headline: input.headline ?? 'Your training is supporting the larger plan',
    interpretation: input.interpretation ?? 'Good training decisions include progression, maintenance, modification, recovery, and returning safely.',
    trainingWins,
    movementTrends: input.movementTrends ?? [],
    milestonesEnabled: input.milestonesEnabled ?? true,
    milestoneNotificationsEnabled: input.milestoneNotificationsEnabled ?? false,
    safetyMessage: input.activeSafetyMessage,
  };
}

export function assertAthleteFirstProgress(model: AthleteFirstProgressModel): void {
  if (model.trainingWins.some((win) => win.safetyState !== 'celebrate')) throw new Error('Unsafe or held wins must not be displayed.');
  if (model.trainingWins.some((win) => win.painIncreased || win.safetyRecommendationIgnored)) throw new Error('Pain- or safety-conflicted work must not be celebrated.');
  if (model.movementTrends.some((trend) => trend.evidenceCount < 0)) throw new Error('Evidence counts cannot be negative.');
}
