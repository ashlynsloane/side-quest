import type { EnduranceActivity, EnduranceDiscipline } from '@circuit/domain';

import type { CoachSemanticStrategyChange } from './coach-semantic-frame';
import type { RaceIntentV2, RaceTargetKind } from './race-intent';

export type RaceTargetEvidenceStatus = 'none' | 'target_defined' | 'recent_reference';

export interface RaceTargetEvidence {
  status: RaceTargetEvidenceStatus;
  discipline?: EnduranceDiscipline;
  kind?: RaceTargetKind | 'overall_time';
  targetLabel?: string;
  evidenceLabel?: string;
  caveat?: string;
}

export interface RaceTargetEvidenceInput {
  raceIntent: RaceIntentV2;
  effectiveStrategy: CoachSemanticStrategyChange;
  activities: EnduranceActivity[];
}

export function buildRaceTargetEvidence(input: RaceTargetEvidenceInput): RaceTargetEvidence {
  const target = resolveTarget(input.raceIntent, input.effectiveStrategy);
  if (!target) return { status: 'none' };

  if (!target.discipline || (target.kind !== 'power' && target.kind !== 'pace' && target.kind !== 'speed')) {
    return {
      status: 'target_defined',
      discipline: target.discipline,
      kind: target.kind,
      targetLabel: target.label,
      caveat: nonComparableCaveat(target.kind),
    };
  }

  const reference = mostRecentReference(
    input.activities.filter((activity) => !activity.deletedAt && activity.discipline === target.discipline),
    target.kind,
    target.discipline,
  );

  return reference
    ? {
        status: 'recent_reference',
        discipline: target.discipline,
        kind: target.kind,
        targetLabel: target.label,
        evidenceLabel: reference,
        caveat: 'This is a recent training reference, not a race projection or readiness score.',
      }
    : {
        status: 'target_defined',
        discipline: target.discipline,
        kind: target.kind,
        targetLabel: target.label,
        caveat: 'The target is guiding planning, but Side Quest does not have a recent comparable training metric to show yet.',
      };
}

function resolveTarget(
  raceIntent: RaceIntentV2,
  effectiveStrategy: CoachSemanticStrategyChange,
): {
  discipline?: EnduranceDiscipline;
  kind: RaceTargetKind | 'overall_time';
  label: string;
} | undefined {
  if (raceIntent.overallObjective === 'specific_overall_time' && raceIntent.overallTarget?.trim()) {
    return { kind: 'overall_time', label: `Overall time · ${raceIntent.overallTarget.trim()}` };
  }

  const discipline = effectiveStrategy.racePriority?.discipline ?? raceIntent.primaryDiscipline;
  if (!discipline) return undefined;
  const target = raceIntent.disciplineTargets?.[discipline];
  if (!target) {
    const race = effectiveStrategy.racePriority;
    if (!race?.objective) return undefined;
    if (race.objective === 'personal_best') return { discipline, kind: 'pr', label: `${disciplineLabel(discipline)} · PR` };
    if (race.objective === 'placement') return { discipline, kind: 'placement', label: `${disciplineLabel(discipline)} · placement / qualification` };
    if (race.objective === 'time_goal') return { discipline, kind: 'time', label: `${disciplineLabel(discipline)} · performance target${race.target ? ` · ${race.target}` : ''}` };
    return undefined;
  }

  return {
    discipline,
    kind: target.kind,
    label: `${disciplineLabel(discipline)} · ${targetKindLabel(target.kind)}${target.value?.trim() ? ` · ${target.value.trim()}` : ''}`,
  };
}

function mostRecentReference(
  activities: EnduranceActivity[],
  kind: 'power' | 'pace' | 'speed',
  discipline: EnduranceDiscipline,
): string | undefined {
  const sorted = [...activities].sort((left, right) => right.startAt.localeCompare(left.startAt));
  if (kind === 'power') {
    const activity = sorted.find((item) => item.movingTimeSeconds >= 20 * 60 && ((item.weightedAverageWatts ?? item.averageWatts) ?? 0) > 0);
    if (!activity) return undefined;
    const watts = Math.round(activity.weightedAverageWatts ?? activity.averageWatts ?? 0);
    return `Recent reference · ${watts} W over ${durationLabel(activity.movingTimeSeconds)} · ${dateLabel(activity.startAt)}`;
  }

  const activity = sorted.find((item) => item.movingTimeSeconds >= 15 * 60 && (item.distanceMeters ?? 0) > 0);
  if (!activity?.distanceMeters) return undefined;
  if (kind === 'speed' || discipline === 'bike') {
    const mph = (activity.distanceMeters / 1609.344) / (activity.movingTimeSeconds / 3600);
    return `Recent reference · ${mph.toFixed(1)} mph average over ${distanceMiles(activity.distanceMeters)} mi · ${dateLabel(activity.startAt)}`;
  }
  if (discipline === 'swim') {
    const secondsPer100m = activity.movingTimeSeconds / activity.distanceMeters * 100;
    return `Recent reference · ${paceLabel(secondsPer100m)}/100m average over ${Math.round(activity.distanceMeters)} m · ${dateLabel(activity.startAt)}`;
  }
  const secondsPerMile = activity.movingTimeSeconds / (activity.distanceMeters / 1609.344);
  return `Recent reference · ${paceLabel(secondsPerMile)}/mi average over ${distanceMiles(activity.distanceMeters)} mi · ${dateLabel(activity.startAt)}`;
}

function nonComparableCaveat(kind: RaceTargetKind | 'overall_time'): string {
  if (kind === 'pr') return 'A PR goal needs comparable race or benchmark history before Side Quest can describe progress without guessing.';
  if (kind === 'placement') return 'Placement and qualification depend on competition context, so Side Quest does not infer progress from ordinary training metrics.';
  if (kind === 'time' || kind === 'overall_time') return 'Side Quest does not treat arbitrary training duration as a race-distance time benchmark.';
  return 'The target is guiding planning, but there is not enough comparable evidence to score progress yet.';
}

function targetKindLabel(kind: RaceTargetKind): string {
  if (kind === 'pr') return 'PR';
  if (kind === 'time') return 'Split time';
  if (kind === 'pace') return 'Pace';
  if (kind === 'power') return 'Power';
  if (kind === 'speed') return 'Speed';
  return 'Placement';
}

function disciplineLabel(value: EnduranceDiscipline): string {
  if (value === 'swim') return 'Swim';
  if (value === 'bike') return 'Bike';
  return 'Run';
}

function durationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function distanceMiles(meters: number): string {
  return (meters / 1609.344).toFixed(meters >= 16_093 ? 1 : 2);
}

function paceLabel(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
