import type { EnduranceActivity, PlannedCompletedMatch, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { classifyCoachObservedExecution, type CoachObservedExecution } from '@circuit/planner/coach-observed-outcome';
import Storage from 'expo-sqlite/kv-store';

import {
  getLatestTrainingBlock,
  getTrainingCalendarEvents,
  listEnduranceActivities,
  listPlannedCompletedMatches,
  listWorkoutLedgerEntries,
  type WorkoutLedgerEntry,
} from './database';
import { exportCoachClosedLoopState, type CoachAppliedInterventionRecord } from './coach-closed-loop-state';

const OBSERVED_OUTCOMES_KEY = 'circuit.coach-observed-outcomes.v1';
const MAX_RECORDS = 300;

export interface CoachObservedOutcomeRecord {
  interventionId: string;
  observedAt: string;
  execution: CoachObservedExecution;
  source: 'endurance_match' | 'endurance_other_match' | 'strength_ledger';
  actualDurationMinutes?: number;
  prescribedDurationMinutes?: number;
}

export function loadCoachObservedOutcomes(): CoachObservedOutcomeRecord[] {
  const saved = Storage.getItemSync(OBSERVED_OUTCOMES_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecord).slice(-MAX_RECORDS);
  } catch {
    return [];
  }
}

export function clearCoachObservedOutcomes(): void {
  Storage.removeItemSync(OBSERVED_OUTCOMES_KEY);
}

export function exportCoachObservedOutcomes(): CoachObservedOutcomeRecord[] {
  return loadCoachObservedOutcomes();
}

export async function refreshCoachObservedOutcomes(): Promise<CoachObservedOutcomeRecord[]> {
  const state = exportCoachClosedLoopState();
  const existing = loadCoachObservedOutcomes();
  const recorded = new Set(existing.map((item) => item.interventionId));
  const candidates = state.interventions.filter((item) => item.status === 'active' && !recorded.has(item.id));
  if (!candidates.length) return existing;

  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  const earliest = candidates.map((item) => item.appliedAt).sort()[0] ?? new Date().toISOString();
  const latest = new Date(Date.now() + 21 * 86_400_000).toISOString();
  const [matches, activities, ledger, calendar] = await Promise.all([
    listPlannedCompletedMatches(),
    listEnduranceActivities({ from: earliest, to: latest, limit: 5_000 }),
    listWorkoutLedgerEntries({ from: earliest, to: latest, limit: 5_000 }),
    getTrainingCalendarEvents({ from: earliest, to: latest }),
  ]);
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const additions: CoachObservedOutcomeRecord[] = [];

  for (const intervention of candidates) {
    const observation = intervention.target.targetKind === 'strength'
      ? observedStrength(intervention, block, ledger)
      : observedEndurance(intervention, matches, activityById, activities, calendar);
    if (observation) additions.push(observation);
  }

  const next = [...existing, ...additions].slice(-MAX_RECORDS);
  Storage.setItemSync(OBSERVED_OUTCOMES_KEY, JSON.stringify(next));
  return next;
}

function observedStrength(
  intervention: CoachAppliedInterventionRecord,
  block: TrainingBlockPlan | undefined,
  ledger: WorkoutLedgerEntry[],
): CoachObservedOutcomeRecord | null {
  const entry = ledger
    .filter((item) => item.plannedSessionId === intervention.target.sessionId && item.completedAt >= intervention.appliedAt)
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))[0];
  if (!entry) return null;
  const planned = block?.weeks.flatMap((week) => week.sessions).find((session) => session.id === intervention.target.sessionId);
  const prescribedDurationMinutes = intervention.selectedOption?.durationMinutes
    ?? (planned ? Math.round(planned.workout.estimatedElapsedSeconds / 60) : undefined);
  const actualDurationMinutes = Math.max(1, Math.round((new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000));
  const execution = classifyCoachObservedExecution({
    prescribedDurationMinutes,
    actualDurationMinutes,
    matchedPlannedSession: true,
    completed: true,
    completionFraction: entry.completionFraction,
  });
  return { interventionId: intervention.id, observedAt: entry.completedAt, execution, source: 'strength_ledger', actualDurationMinutes, prescribedDurationMinutes };
}

function observedEndurance(
  intervention: CoachAppliedInterventionRecord,
  matches: PlannedCompletedMatch[],
  activityById: Map<string, EnduranceActivity>,
  activities: EnduranceActivity[],
  calendar: TrainingCalendarEvent[],
): CoachObservedOutcomeRecord | null {
  const eventId = intervention.target.calendarEventId ?? intervention.target.sessionId;
  const match = matches
    .filter((item) => item.status === 'matched' && item.calendarEventId === eventId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const event = calendar.find((item) => item.id === eventId);
  const prescribedDurationMinutes = intervention.selectedOption?.durationMinutes ?? eventDurationMinutes(event);

  if (match) {
    const activity = activityById.get(match.activityId);
    if (!activity || activity.startAt < intervention.appliedAt) return null;
    const actualDurationMinutes = Math.max(1, Math.round(activity.movingTimeSeconds / 60));
    const execution = classifyCoachObservedExecution({
      prescribedDurationMinutes,
      actualDurationMinutes,
      matchedPlannedSession: true,
      completed: true,
    });
    return { interventionId: intervention.id, observedAt: activity.startAt, execution, source: 'endurance_match', actualDurationMinutes, prescribedDurationMinutes };
  }

  const effectiveDate = intervention.selectedOption?.targetDate ?? intervention.target.sessionDate;
  const targetDiscipline = intervention.target.sessionDiscipline;
  const explicitlyMatchedElsewhere = activities
    .filter((activity) => activity.startAt >= intervention.appliedAt)
    .filter((activity) => activity.startAt.slice(0, 10) === effectiveDate && activity.discipline === targetDiscipline)
    .find((activity) => matches.some((item) =>
      item.status === 'matched'
      && item.activityId === activity.id
      && item.calendarEventId !== eventId,
    ));
  if (!explicitlyMatchedElsewhere) return null;
  const actualDurationMinutes = Math.max(1, Math.round(explicitlyMatchedElsewhere.movingTimeSeconds / 60));
  const execution = classifyCoachObservedExecution({
    prescribedDurationMinutes,
    actualDurationMinutes,
    matchedPlannedSession: false,
    completed: true,
  });
  return {
    interventionId: intervention.id,
    observedAt: explicitlyMatchedElsewhere.startAt,
    execution,
    source: 'endurance_other_match',
    actualDurationMinutes,
    prescribedDurationMinutes,
  };
}

function eventDurationMinutes(event: TrainingCalendarEvent | undefined): number | undefined {
  if (!event) return undefined;
  if (event.endAt) {
    const minutes = Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000);
    if (minutes > 0) return minutes;
  }
  const text = `${event.title} ${event.description ?? ''}`;
  const match = text.match(/\b(\d{1,3})\s*min\b/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

function isValidRecord(value: unknown): value is CoachObservedOutcomeRecord {
  const item = value as Partial<CoachObservedOutcomeRecord> | null | undefined;
  return Boolean(item?.interventionId && item.observedAt && item.execution?.status && item.source);
}
