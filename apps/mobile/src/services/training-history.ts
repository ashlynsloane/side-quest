import type {
  EnduranceActivity,
  PlannedCompletedMatch,
  WorkoutSensorLink,
} from '@circuit/domain';

import {
  listEnduranceActivities,
  countTrainingHistorySourceRows,
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

/**
 * Existing general history view remains an intentionally bounded list.
 */
export async function loadTrainingHistory(limit = 500): Promise<TrainingHistoryItem[]> {
  const [workouts, activities, matches, links] = await Promise.all([
    listWorkoutLedgerEntries({ limit }),
    listEnduranceActivities({ includeDeleted: true, limit }),
    listPlannedCompletedMatches(),
    listWorkoutSensorLinks(),
  ]);
  return mergeTrainingHistory(workouts, activities, matches, links).slice(0, limit);
}

export interface RangeTrainingHistoryAudit {
  history: TrainingHistoryItem[];
  complete: boolean;
  issues: string[];
  rowsRead: { strength: number; endurance: number };
  rowsExpected: { strength: number; endurance: number };
}

/**
 * Read all records in a bounded timestamp window, not the most recent
 * N records lifetime-wide. Strict limits and raw row-count verification
 * prevent silently treating missing/corrupt rows as absent training.
 */
export async function loadTrainingHistoryForRange(input: {
  from: string;
  to: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<RangeTrainingHistoryAudit> {
  const pageSize = input.pageSize ?? 250;
  const maxPages = input.maxPages ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000
    || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error('Invalid history audit paging.');
  }
  const [counts, matches, links] = await Promise.all([
    countTrainingHistorySourceRows(input),
    listPlannedCompletedMatches(),
    listWorkoutSensorLinks(),
  ]);
  const workouts: WorkoutLedgerEntry[] = [];
  const activities: EnduranceActivity[] = [];
  const issues: string[] = [];
  async function pages<T>(source: 'strength' | 'endurance', expected: number,
    sink: T[], fetch: (limit: number, offset: number) => Promise<T[]>) {
    for (let offset = 0; offset < expected && offset < pageSize * maxPages; offset += pageSize) {
      const batch = await fetch(pageSize, offset);
      sink.push(...batch);
      // Stored JSON corruption and rows changing during read are not silently skipped.
      if (batch.length < Math.min(pageSize, expected - offset)) {
        issues.push(source + ' query returned fewer valid rows than expected.');
        break;
      }
    }
    if (sink.length !== expected) {
      issues.push(source + ' record count incomplete or changed during source query.');
    }
  }
  await Promise.all([
    pages('strength', counts.workoutLedgerRows, workouts, (limit, offset) =>
      listWorkoutLedgerEntries({ from: input.from, to: input.to, limit, offset })),
    pages('endurance', counts.enduranceActivityRows, activities, (limit, offset) =>
      listEnduranceActivities({
        from: input.from, to: input.to, includeDeleted: true, limit, offset,
      })),
  ]);
  // Count again to identify concurrent writes / syncs while pages were loaded.
  const after = await countTrainingHistorySourceRows(input);
  if (counts.workoutLedgerRows !== after.workoutLedgerRows
    || counts.enduranceActivityRows !== after.enduranceActivityRows) {
    issues.push('Completed record counts changed during the audit. Reload for review.');
  }
  const history = mergeTrainingHistory(workouts, activities, matches, links);
  return {
    history,
    complete: issues.length === 0,
    issues,
    rowsRead: { strength: workouts.length, endurance: activities.length },
    rowsExpected: { strength: counts.workoutLedgerRows, endurance: counts.enduranceActivityRows },
  };
}

function mergeTrainingHistory(
  workouts: WorkoutLedgerEntry[],
  activities: EnduranceActivity[],
  matches: PlannedCompletedMatch[],
  links: WorkoutSensorLink[],
): TrainingHistoryItem[] {
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
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
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
