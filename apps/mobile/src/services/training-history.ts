import type {
  EnduranceActivity,
  PlannedCompletedMatch,
  TrainingCalendarEvent,
  WorkoutSensorLink,
} from '@circuit/domain';

import {
  getTrainingCalendarEvents,
  listEnduranceActivities,
  listPlannedCompletedMatches,
  listWorkoutLedgerEntries,
  listWorkoutReflectionsSince,
  listWorkoutSensorLinks,
  type WorkoutLedgerEntry,
  type WorkoutReflection,
} from './database';

export type TrainingHistoryFilter = 'all' | 'strength' | 'endurance' | 'review';

export interface StrengthHistoryItem {
  kind: 'strength';
  id: string;
  occurredAt: string;
  workout: WorkoutLedgerEntry;
  reflection?: WorkoutReflection;
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
  plannedEvent?: TrainingCalendarEvent;
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

  const earliest = earliestHistoryInstant(workouts, activities);
  const [reflections, calendar] = earliest
    ? await Promise.all([
        listWorkoutReflectionsSince(earliest).catch(() => [] as WorkoutReflection[]),
        getTrainingCalendarEvents({
          from: earliest,
          to: new Date(Date.now() + 86_400_000).toISOString(),
        }).catch(() => [] as TrainingCalendarEvent[]),
      ])
    : [[], []] as [WorkoutReflection[], TrainingCalendarEvent[]];

  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const matchByActivity = new Map(matches.map((match) => [match.activityId, match]));
  const linkByActivity = new Map(links.map((link) => [link.activityId, link]));
  const reflectionByWorkoutInstance = new Map(
    reflections.map((reflection) => [reflection.workoutInstanceId, reflection]),
  );
  const eventById = new Map(calendar.map((event) => [event.id, event]));
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
      reflection: reflectionByWorkoutInstance.get(workout.id),
      sensorActivity,
      sensorLink,
      needsReview: false,
    };
  });

  const enduranceItems: EnduranceHistoryItem[] = activities
    .filter((activity) => !linkedActivityIds.has(activity.id))
    .map((activity) => {
      const plannedMatch = matchByActivity.get(activity.id);
      const plannedEvent = plannedMatch?.calendarEventId
        ? eventById.get(plannedMatch.calendarEventId)
        : undefined;
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
        plannedEvent,
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

function earliestHistoryInstant(
  workouts: WorkoutLedgerEntry[],
  activities: EnduranceActivity[],
): string | null {
  const timestamps = [
    ...workouts.map((workout) => workout.completedAt),
    ...activities.map((activity) => activity.startAt),
  ]
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return timestamps[0] ?? null;
}
