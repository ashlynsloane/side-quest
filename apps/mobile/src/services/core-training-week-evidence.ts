import type { TrainingExposureRecord, TrainingWeekEvidence } from '@circuit/planner';
import {
  buildTrainingWeekEvidence, localTrainingDate, normalizeTrainingSport,
} from '@circuit/planner';
import type { TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';

import { getTrainingCalendarEvents, getLatestTrainingBlock } from './database';
import { loadTrainingHistory, type TrainingHistoryItem } from './training-history';

/**
 * Read-only translation from existing Side Quest sources into canonical week
 * evidence. It neither approves a baseline nor changes generated workouts.
 *
 * The current data services do not guarantee cross-provider coverage;
 * therefore the caller ALWAYS uses unverified coverage.
 */
export async function loadCoreTrainingWeekEvidence(
  weekStartDate: string,
  timezone: string,
): Promise<TrainingWeekEvidence> {
  const end = new Date(weekStartDate + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 7);
  const first = new Date(weekStartDate + 'T00:00:00Z');
  first.setUTCDate(first.getUTCDate() - 1);
  const [saved, events, history] = await Promise.all([
    getLatestTrainingBlock(),
    getTrainingCalendarEvents({ from: first.toISOString(), to: end.toISOString() }),
    loadTrainingHistory(2000),
  ]);
  const records = [
    ...plannedStrengthRecords(saved?.block ?? null, weekStartDate, new Date(end.getTime() - 1)
      .toISOString().slice(0, 10)),
    ...plannedCalendarRecords(events, timezone),
    ...completedHistoryRecords(history, timezone),
  ];
  return buildTrainingWeekEvidence({
    weekStartDate, timezone, plannedAndCompleted: records,
    coverage: 'unverified',
  });
}

function plannedStrengthRecords(
  block: TrainingBlockPlan | null, from: string, to: string,
): TrainingExposureRecord[] {
  return (block?.weeks ?? []).flatMap(week => week.sessions)
    .filter(session => session.date >= from && session.date <= to
      && session.completionStatus !== 'skipped')
    .map(session => ({
      recordId: 'plan-strength:' + session.id,
      canonicalActivityId: 'plan-strength:' + session.id,
      localDate: session.date,
      sport: 'strength' as const,
      status: 'planned' as const,
      // Generated duration is a planning estimate, not actual completed exposure.
      durationMinutes: Number.isFinite(session.workout.estimatedElapsedSeconds)
        ? session.workout.estimatedElapsedSeconds / 60 : null,
      durationEstimate: true,
      source: 'Side Quest planned strength',
    }));
}

function plannedCalendarRecords(
  events: TrainingCalendarEvent[], timezone: string,
): TrainingExposureRecord[] {
  // Only explicitly classified training goes into the shared budget.
  // Generic 'other' calendar events may be ordinary life or work commitments.
  return events.filter(event => event.discipline === 'run' || event.discipline === 'bike'
    || event.discipline === 'swim' || event.discipline === 'strength')
    .map(event => {
      const date = event.allDay
        ? event.startAt.slice(0, 10)
        : localTrainingDate(event.startAt, timezone);
      let durationMinutes: number | null = null;
      if (event.allDay) {
        const match = event.description?.match(/Side Quest generated · (\d+) min/i);
        if (match) durationMinutes = Number(match[1]);
      } else if (event.endAt && Date.parse(event.endAt) > Date.parse(event.startAt)) {
        durationMinutes = (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000;
      }
      return {
        recordId: 'calendar:' + event.id,
        canonicalActivityId: 'calendar:' + event.id,
        localDate: date,
        sport: normalizeTrainingSport(event.discipline),
        status: 'planned' as const,
        durationMinutes, durationEstimate: false,
        // Calendar sources rarely provide planned run distance in a canonical unit.
        runDistanceKm: event.discipline === 'run' ? null : undefined,
        source: 'Calendar: ' + event.sourceId,
        sourceIds: [event.externalUid ?? event.id],
      };
    });
}

function completedHistoryRecords(
  items: TrainingHistoryItem[], timezone: string,
): TrainingExposureRecord[] {
  return items.flatMap((item): TrainingExposureRecord[] => {
    if (item.kind === 'strength') {
      const workout = item.workout;
      const sensorMinutes = item.sensorActivity?.movingTimeSeconds
        ? item.sensorActivity.movingTimeSeconds / 60 : null;
      const wallMinutes = (Date.parse(workout.completedAt) - Date.parse(workout.startedAt)) / 60000;
      // Wall clock may contain breaks. It is usable for preliminary review only,
      // not a verified training-duration baseline.
      const durationMinutes = sensorMinutes && sensorMinutes > 0
        ? sensorMinutes
        : Number.isFinite(wallMinutes) && wallMinutes >= 0 ? wallMinutes : null;
      return [{
        recordId: 'logged-strength:' + workout.id,
        canonicalActivityId: 'logged-strength:' + workout.id,
        linkedPlanRecordId: workout.plannedSessionId
          ? 'plan-strength:' + workout.plannedSessionId : undefined,
        localDate: localTrainingDate(workout.completedAt, timezone),
        sport: 'strength' as const,
        status: 'completed' as const,
        durationMinutes,
        durationEstimate: durationMinutes !== null,
        source: 'Side Quest workout ledger',
        sourceIds: [workout.id, ...(item.sensorActivity ? [item.sensorActivity.id] : [])],
      }];
    }
    const activity = item.activity;
    if (activity.deletedAt || activity.classification === 'ignored') return [];
    const minutes = Number.isFinite(activity.movingTimeSeconds) && activity.movingTimeSeconds > 0
      ? activity.movingTimeSeconds / 60 : null;
    return [{
      recordId: 'recorded-activity:' + activity.id,
      canonicalActivityId: 'recorded-activity:' + activity.id,
      linkedPlanRecordId: item.plannedMatch?.status === 'matched'
        && item.plannedMatch.calendarEventId
        ? 'calendar:' + item.plannedMatch.calendarEventId : undefined,
      localDate: localTrainingDate(activity.startAt, timezone),
      sport: normalizeTrainingSport(activity.discipline),
      status: 'completed' as const,
      durationMinutes: minutes,
      runDistanceKm: activity.discipline === 'run'
        ? typeof activity.distanceMeters === 'number' && Number.isFinite(activity.distanceMeters)
          ? activity.distanceMeters / 1000 : null
        : undefined,
      // Unresolved strength/HIIT imports may represent an already-logged session.
      possibleDuplicate: item.needsReview,
      source: 'Completed activity: ' + activity.source,
      sourceIds: [activity.externalId, activity.id],
    }];
  });
}

export function currentLocalWeekStart(timezone: string, now = new Date()): string {
  const local = localTrainingDate(now.toISOString(), timezone);
  const date = new Date(local + 'T00:00:00Z');
  const delta = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - delta);
  return date.toISOString().slice(0, 10);
}
