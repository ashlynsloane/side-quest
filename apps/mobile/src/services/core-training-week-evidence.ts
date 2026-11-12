import type { TrainingExposureRecord, TrainingWeekEvidence } from '@circuit/planner';
import {
  buildTrainingWeekEvidence, localTrainingDate, normalizeTrainingSport,
  trainingSourceQueryEnvelope, crossesLocalTrainingMidnight,
} from '@circuit/planner';
import type { TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';

import { getTrainingCalendarEvents, getLatestTrainingBlock, listTrainingCalendarSources } from './database';
import { loadTrainingHistoryForRange, type TrainingHistoryItem } from './training-history';

/**
 * Read-only translation from existing Side Quest sources into canonical week
 * evidence. It neither approves a baseline nor changes generated workouts.
 *
 * The current data services do not guarantee cross-provider coverage;
 * therefore the caller ALWAYS uses unverified coverage.
 */
export interface CoreTrainingWeekAudit {
  evidence: TrainingWeekEvidence;
  plannedAndCompleted: TrainingExposureRecord[];
  /** Unreadable, incomplete or concurrently changed source rows block approval. */
  historyPossiblyTruncated: boolean;
  historyAuditIssues: string[];
  rowsRead: { strength: number; endurance: number };
  rowsExpected: { strength: number; endurance: number };
  activitySources: string[];
  sourceDiagnostics: Array<{ name: string; status: string; lastSuccessfulAt: string | null }>;
}

/** Read-only full audit of activity sources and the selected local week. */
export async function loadCoreTrainingWeekAudit(
  weekStartDate: string,
  timezone: string,
): Promise<CoreTrainingWeekAudit> {
  const envelope = trainingSourceQueryEnvelope(weekStartDate);
  const [saved, events, historyAudit, sources] = await Promise.all([
    getLatestTrainingBlock(),
    getTrainingCalendarEvents({ from: envelope.from, to: envelope.to }),
    loadTrainingHistoryForRange({ from: envelope.from, to: envelope.to }),
    listTrainingCalendarSources(),
  ]);
  const history = historyAudit.history;
  const records = [
    ...plannedStrengthRecords(saved?.block ?? null, weekStartDate, envelope.localWeekEnd),
    ...plannedCalendarRecords(events, timezone),
    ...completedHistoryRecords(history, timezone),
  ];
  const evidence = buildTrainingWeekEvidence({
    weekStartDate, timezone, plannedAndCompleted: records,
    coverage: 'unverified',
  });
  return {
    evidence, plannedAndCompleted: records,
    historyPossiblyTruncated: !historyAudit.complete,
    historyAuditIssues: historyAudit.issues,
    rowsRead: historyAudit.rowsRead,
    rowsExpected: historyAudit.rowsExpected,
    activitySources: [...new Set(records.map(record => record.source))].sort(),
    sourceDiagnostics: sources.filter(source => source.active && source.sourceType !== 'manual')
      .map(source => ({
        name: source.name,
        status: source.syncStatus ?? 'unknown',
        lastSuccessfulAt: source.lastSuccessfulAt ?? source.lastSyncedAt ?? null,
      })),
  };
}
export async function loadCoreTrainingWeekEvidence(
  weekStartDate: string, timezone: string,
): Promise<TrainingWeekEvidence> {
  return (await loadCoreTrainingWeekAudit(weekStartDate, timezone)).evidence;
}

/** Fail closed on invalid or mismatched elapsed-time metadata. */
function crossesMidnightOrNeedsReview(start: string, end: string, timezone: string): boolean {
  try { return crossesLocalTrainingMidnight(start, end, timezone); }
  catch { return true; }
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
        durationMinutes, durationEstimate: Boolean(event.allDay && durationMinutes !== null),
        crossesLocalMidnight: Boolean(!event.allDay && event.endAt
          && crossesMidnightOrNeedsReview(event.startAt, event.endAt, timezone)),
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
        crossesLocalMidnight: crossesMidnightOrNeedsReview(
          workout.startedAt, workout.completedAt, timezone),
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
      crossesLocalMidnight: Number.isFinite(activity.elapsedTimeSeconds)
        && activity.elapsedTimeSeconds > 0
        ? crossesMidnightOrNeedsReview(activity.startAt,
          new Date(Date.parse(activity.startAt) + activity.elapsedTimeSeconds * 1000)
            .toISOString(), timezone)
        : true,
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
