import type { EnduranceActivity, ExternalTrainingClassification, WorkoutSensorLink } from '@circuit/domain';
import {
  calculateEnduranceContributions,
  isMatchEligibleCalendarEvent,
  matchCompletedActivities,
  matchExternalTrainingToWorkouts,
} from '@circuit/planner';

import {
  deleteWorkoutSensorLink,
  getEnduranceActivity,
  getTrainingCalendarEvents,
  getWorkoutLedgerEntry,
  listEnduranceActivities,
  listPlannedCompletedMatches,
  listWorkoutLedgerEntries,
  listWorkoutSensorLinks,
  replaceAutomaticWorkoutSensorLinks,
  replaceEnduranceContributions,
  replacePlannedCompletedMatches,
  saveManualPlannedCompletedMatch,
  deleteManualPlannedCompletedMatch,
  saveWorkoutSensorLink,
  updateEnduranceActivityClassification,
  upsertEnduranceActivities,
  type EnduranceActivityUpsertResult,
} from './database';
import { refreshTrainingIntelligence } from './training-intelligence';

export interface EnduranceIngestResult extends EnduranceActivityUpsertResult {
  matchedCount: number;
  ambiguousCount: number;
  replanCount: number;
}

export async function ingestEnduranceActivities(
  activities: EnduranceActivity[],
  { allowAutomaticReplan = true }: { allowAutomaticReplan?: boolean } = {},
): Promise<EnduranceIngestResult> {
  const changes = await upsertEnduranceActivities(activities);
  const sensorLinks = await rebuildWorkoutSensorLinks();
  const linkedActivityIds = new Set(sensorLinks.filter((link) => link.status === 'linked').map((link) => link.activityId));
  const savedActivities = await listEnduranceActivities({ limit: 10_000 });
  for (const activity of savedActivities) {
    const contributions = linkedActivityIds.has(activity.id)
      ? []
      : calculateEnduranceContributions(activity).contributions;
    await replaceEnduranceContributions(activity.id, contributions);
  }
  const matching = await rebuildPlannedCompletedMatches();
  const intelligence = await refreshTrainingIntelligence({
    applyAutomatic: allowAutomaticReplan,
    triggerActivityIds: changes.insertedIds,
  });
  const replanCount = intelligence.automaticApplied;
  return {
    ...changes,
    matchedCount: matching.matchedCount,
    ambiguousCount: matching.ambiguousCount,
    replanCount,
  };
}

export async function classifyExternalTrainingActivity(
  activityId: string,
  classification: ExternalTrainingClassification,
): Promise<EnduranceActivity | null> {
  const updated = await updateEnduranceActivityClassification(activityId, classification);
  if (!updated) return null;
  const links = await listWorkoutSensorLinks();
  const linked = links.some((link) => link.activityId === updated.id && link.status === 'linked');
  const contributions = linked ? [] : calculateEnduranceContributions(updated).contributions;
  await replaceEnduranceContributions(updated.id, contributions);
  await rebuildPlannedCompletedMatches();
  return updated;
}

export async function rebuildEnduranceDerivedData(): Promise<void> {
  const links = await rebuildWorkoutSensorLinks();
  const linkedActivityIds = new Set(links.filter((link) => link.status === 'linked').map((link) => link.activityId));
  const activities = await listEnduranceActivities({ limit: 10_000 });
  for (const activity of activities) {
    const contributions = linkedActivityIds.has(activity.id)
      ? []
      : calculateEnduranceContributions(activity).contributions;
    await replaceEnduranceContributions(activity.id, contributions);
  }
  await rebuildPlannedCompletedMatches();
}

export async function rebuildWorkoutSensorLinks(): Promise<WorkoutSensorLink[]> {
  const [activities, workouts, existing] = await Promise.all([
    listEnduranceActivities({ limit: 10_000 }),
    listWorkoutLedgerEntries({ limit: 10_000 }),
    listWorkoutSensorLinks(),
  ]);
  const manualLinks = existing.filter((link) => link.method === 'manual');
  const protectedActivityIds = new Set(manualLinks.map((link) => link.activityId));
  const reservedWorkoutIds = new Set(manualLinks.filter((link) => link.status === 'linked' && link.workoutId).map((link) => link.workoutId!));
  const eligibleActivities = activities.filter((activity) => !protectedActivityIds.has(activity.id));
  const eligibleWorkouts = workouts
    .filter((workout) => !reservedWorkoutIds.has(workout.id))
    .map((workout) => ({ id: workout.id, name: workout.name, source: workout.source, startedAt: workout.startedAt, completedAt: workout.completedAt }));
  const automatic = matchExternalTrainingToWorkouts({ activities: eligibleActivities, workouts: eligibleWorkouts });
  const externalActivityIds = activities
    .filter((activity) => activity.discipline === 'strength' || activity.discipline === 'hiit')
    .map((activity) => activity.id);
  await replaceAutomaticWorkoutSensorLinks(externalActivityIds, automatic);
  return listWorkoutSensorLinks();
}

export async function linkExternalTrainingToWorkout(activityId: string, workoutId: string): Promise<WorkoutSensorLink> {
  const [activity, workout, existing] = await Promise.all([
    getEnduranceActivity(activityId),
    getWorkoutLedgerEntry(workoutId),
    listWorkoutSensorLinks(),
  ]);
  if (!activity) throw new Error('The external activity could not be found.');
  if (!workout) throw new Error('The Side Quest workout could not be found.');
  const conflicting = existing.find((link) => link.status === 'linked' && link.workoutId === workoutId && link.activityId !== activityId);
  if (conflicting) throw new Error('That Side Quest workout is already linked to another watch activity.');
  const now = new Date().toISOString();
  const link: WorkoutSensorLink = {
    id: `sensor_link_manual_${stableHash(`${activityId}:${workoutId}`)}`,
    activityId, workoutId, status: 'linked', confidence: 1, method: 'manual',
    rationale: ['The athlete manually linked the watch record to this Side Quest workout.'],
    createdAt: now, updatedAt: now,
  };
  await saveWorkoutSensorLink(link);
  await replaceEnduranceContributions(activityId, []);
  return link;
}

export async function dismissExternalTrainingLink(activityId: string): Promise<WorkoutSensorLink> {
  const activity = await getEnduranceActivity(activityId);
  if (!activity) throw new Error('The external activity could not be found.');
  await deleteWorkoutSensorLink(activityId);
  const now = new Date().toISOString();
  const link: WorkoutSensorLink = {
    id: `sensor_link_dismissed_${stableHash(activityId)}`, activityId, status: 'dismissed', confidence: 1, method: 'manual',
    rationale: ['The athlete chose to keep this watch record separate from Side Quest workouts.'],
    createdAt: now, updatedAt: now,
  };
  await saveWorkoutSensorLink(link);
  const summary = calculateEnduranceContributions(activity);
  await replaceEnduranceContributions(activity.id, summary.contributions);
  return link;
}

export async function manualMatchCompletedActivity(
  activityId: string,
  event: import('@circuit/domain').TrainingCalendarEvent,
): Promise<import('@circuit/domain').PlannedCompletedMatch> {
  const activity = await getEnduranceActivity(activityId);
  if (!activity) throw new Error('The completed activity could not be found.');
  if (!isMatchEligibleCalendarEvent(event)) throw new Error('That calendar event is not eligible for completed-workout matching.');
  const existing = await listPlannedCompletedMatches();
  const occupied = existing.find((match) =>
    match.activityId !== activityId
    && match.calendarEventId === event.id
    && match.status === 'matched',
  );
  if (occupied) throw new Error('That planned session is already matched to another completed activity.');
  const now = new Date().toISOString();
  const match: import('@circuit/domain').PlannedCompletedMatch = {
    id: `match_manual_${stableHash(`${activityId}:${event.id}`)}`,
    activityId,
    calendarEventId: event.id,
    status: 'matched',
    confidence: 1,
    method: 'manual',
    rationale: ['The athlete manually linked this completed activity to the planned session.'],
    createdAt: now,
    updatedAt: now,
  };
  await saveManualPlannedCompletedMatch(match);
  return match;
}

export async function dismissPlannedActivityMatch(
  activityId: string,
): Promise<import('@circuit/domain').PlannedCompletedMatch> {
  const activity = await getEnduranceActivity(activityId);
  if (!activity) throw new Error('The completed activity could not be found.');
  const now = new Date().toISOString();
  const match: import('@circuit/domain').PlannedCompletedMatch = {
    id: `match_manual_dismissed_${stableHash(activityId)}`,
    activityId,
    status: 'dismissed',
    confidence: 1,
    method: 'manual',
    rationale: ['The athlete confirmed that this completed activity should not match a planned session.'],
    createdAt: now,
    updatedAt: now,
  };
  await saveManualPlannedCompletedMatch(match);
  return match;
}

export async function restoreAutomaticPlannedActivityMatch(activityId: string): Promise<void> {
  await deleteManualPlannedCompletedMatch(activityId);
  await rebuildPlannedCompletedMatches();
}

export async function rebuildPlannedCompletedMatches(): Promise<{ matchedCount: number; ambiguousCount: number }> {
  const activities = await listEnduranceActivities({ limit: 5_000 });
  if (!activities.length) {
    await replacePlannedCompletedMatches([], []);
    return { matchedCount: 0, ambiguousCount: 0 };
  }
  const dates = activities.map((activity) => activity.startAt).sort();
  const from = addDaysIso(dates[0]!, -2);
  const to = addDaysIso(dates.at(-1)!, 2);
  const [events, existing] = await Promise.all([
    getTrainingCalendarEvents({ from, to }),
    listPlannedCompletedMatches(),
  ]);
  const manual = existing.filter((match) => match.id.startsWith('match_manual_'));
  const protectedActivityIds = new Set(manual.map((match) => match.activityId));
  const protectedEventIds = new Set(manual.flatMap((match) => match.calendarEventId ? [match.calendarEventId] : []));
  const matches = matchCompletedActivities({
    activities: activities.filter((activity) => !protectedActivityIds.has(activity.id)),
    events: events.filter((event) => !protectedEventIds.has(event.id)),
  });
  await replacePlannedCompletedMatches(activities.map((activity) => activity.id), matches);
  return {
    matchedCount: matches.filter((match) => match.status === 'matched').length,
    ambiguousCount: matches.filter((match) => match.status === 'ambiguous').length,
  };
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
