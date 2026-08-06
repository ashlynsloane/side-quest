import type {
  EnduranceActivity,
  PlannedCompletedMatch,
  WorkoutSensorLink,
} from '@circuit/domain';

import {
  listEnduranceActivities,
  listPlannedCompletedMatches,
  listWorkoutLedgerEntries,
  listWorkoutSensorLinks,
  type WorkoutLedgerEntry,
} from './database';

export type TrainingHistoryFilter = 'all' | 'strength' | 'endurance' | 'review';

export interface StrengthHistoryItem {
  kind: 'strength';
  id: string;
  occurredAt: string;
  workout: WorkoutLedgerEntry;
  sensorActivity?: EnduranceActivity;
  sensorLink?: WorkoutSensorLink;
  needsReview: boolean;
}

export interface EnduranceHistoryItem {
  kind: 'endurance';
  id: string;
  occurredAt: string;
  activity: EnduranceActivity;
  plannedMatch?: PlannedCompletedMatch;
  sensorLink?: WorkoutSensorLink;
  needsReview: boolean;
}

export type TrainingHistoryItem = StrengthHistoryItem | EnduranceHistoryItem;

export async function loadTrainingHistory(limit = 500): Promise<TrainingHistoryItem[]> {
  const [workouts, activities, matches, links] = await Promise.all([
    listWorkoutLedgerEntries({ limit }),
    listEnduranceActivities({ includeDeleted: true, limit }),
    listPlannedCompletedMatches(),
    listWorkoutSensorLinks(),
  ]);

  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const matchByActivity = new Map(matches.map((match) => [match.activityId, match]));
  const linkByActivity = new Map(links.map((link) => [link.activityId, link]));
  const linkedActivityIds = new Set<string>();

  const strengthItems: StrengthHistoryItem[] = workouts.map((workout) => {
    const sensorLink = links.find((candidate) =>
      candidate.workoutId === workout.id && candidate.status === 'linked');
    const sensorActivity = sensorLink ? activityById.get(sensorLink.activityId) : undefined;
    if (sensorActivity) linkedActivityIds.add(sensorActivity.id);
    return {
      kind: 'strength',
      id: `strength:${workout.id}`,
      occurredAt: workout.completedAt,
      workout,
      sensorActivity,
      sensorLink,
      needsReview: false,
    };
  });

  const enduranceItems: EnduranceHistoryItem[] = activities
    .filter((activity) => !linkedActivityIds.has(activity.id))
    .map((activity) => {
      const plannedMatch = matchByActivity.get(activity.id);
      const sensorLink = linkByActivity.get(activity.id);
      const isExternalStrength = activity.discipline === 'strength' || activity.discipline === 'hiit';
      const unresolvedStrengthLink = isExternalStrength
        && activity.classification !== 'ignored'
        && sensorLink?.status !== 'dismissed';
      return {
        kind: 'endurance',
        id: `endurance:${activity.id}`,
        occurredAt: activity.startAt,
        activity,
        plannedMatch,
        sensorLink,
        needsReview: plannedMatch?.status === 'ambiguous'
          || sensorLink?.status === 'ambiguous'
          || unresolvedStrengthLink,
      };
    });

  return [...strengthItems, ...enduranceItems]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, limit);
}

export function filterTrainingHistory(
  items: TrainingHistoryItem[],
  filter: TrainingHistoryFilter,
): TrainingHistoryItem[] {
  if (filter === 'strength') return items.filter((item) => item.kind === 'strength');
  if (filter === 'endurance') {
    return items.filter((item) => item.kind === 'endurance'
      && item.activity.discipline !== 'strength'
      && item.activity.discipline !== 'hiit');
  }
  if (filter === 'review') return items.filter((item) => item.needsReview);
  return items;
}
