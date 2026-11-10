import {
  evaluateTrainingAddition,
  assessCrossSportExposure,
  affectedTrainingRegions,
  reconcileDailyCeilingPlan,
  planLedgerReconciliation,
  type ActivityDose,
  type DailyTrainingCeiling,
  type ProposedActivity,
  type RecoveryStatus,
  type TrainingGuardrailResult,
  type TrainingRegion,
} from '@circuit/planner';
import type { GeneratedWorkout, TrainingCheckIn } from '@circuit/domain';
import { getActiveTrainingCheckIn, getLatestTrainingBlock, listEnduranceActivitiesForGuardrails, listWorkoutLedgerEntriesForGuardrails } from './database';
import { loadDailyCeiling, loadTrainingEvents, recordTrainingEvent, saveDailyCeiling } from './training-guardrail-storage';

export interface TrainingAdditionRequest {
  userId: string;
  date: string;
  proposed: ProposedActivity;
  requestId: string;
  occurredAt: string;
}

export interface WorkoutStartAssessment {
  result: TrainingGuardrailResult;
  authorized: boolean;
}

export function localTrainingDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const regionsForWorkout = affectedTrainingRegions;

function recoveryFor(checkIn: TrainingCheckIn | null, date: string): Partial<Record<TrainingRegion, RecoveryStatus>> {
  // General check-in does not automatically certify recovering tissue.
  const general: RecoveryStatus = checkIn?.status === 'normal' &&
    localTrainingDate(new Date(checkIn.createdAt)) === date
    ? 'stable'
    : checkIn?.status === 'unable_to_train' ? 'worse' : 'uncertain';
  return { general, achilles: 'uncertain', upper_back: 'uncertain' };
}

/** Establish the day's ceiling only from the saved training block, never from an ad hoc request. */
export async function getEffectiveDailyCeiling(
  userId: string, date: string,
): Promise<DailyTrainingCeiling | null> {
  const [existing, checkIn, saved] = await Promise.all([
    loadDailyCeiling(userId, date),
    getActiveTrainingCheckIn(),
    getLatestTrainingBlock(),
  ]);
  // Keep completed sessions in the day's original budget. A completed session
  // may not be restarted but its load must still count against the total.
  const sessions = saved?.block.weeks.flatMap((week) => week.sessions).filter(
    (session) => session.date === date && session.completionStatus !== 'skipped',
  ) ?? [];
  const currentPlan: ActivityDose[] = sessions.map((session) => ({
    activity: 'strength',
    sessionId: session.id,
    minutes: Math.ceil(session.workout.estimatedElapsedSeconds / 60),
    regions: regionsForWorkout(session.workout),
  }));
  if (existing) {
    const reconciled = reconcileDailyCeilingPlan(existing, currentPlan);
    // A new active pain report invalidates prior general clearance without
    // erasing the athlete's independent region-specific check-in history.
    const invalidatesGeneral = checkIn?.status === 'tightness_pain'
      || checkIn?.status === 'muscle_soreness';
    return {
      ...reconciled,
      recovery: {
        ...reconciled.recovery,
        ...(invalidatesGeneral ? { general: 'uncertain' as const } : {}),
      },
      pauseTraining: checkIn?.status === 'unable_to_train',
    };
  }
  const activeSessions = sessions.filter((session) =>
    session.completionStatus !== 'completed',
  );
  if (!activeSessions.length) return null;
  const ceiling: DailyTrainingCeiling = {
    date,
    planned: currentPlan,
    recovery: recoveryFor(checkIn, date),
    restrictUnplanned: true,
    pauseTraining: checkIn?.status === 'unable_to_train',
  };
  await saveDailyCeiling(userId, ceiling);
  // Another route may have saved the first ceiling while we were checking.
  const stored = await loadDailyCeiling(userId, date);
  if (!stored) return null;
  return reconcileDailyCeilingPlan(stored, currentPlan);
}

/**
 * Repair interruptions between the authoritative workout-history commit and
 * guardrail-event commit. This also imports earlier sessions into the budget.
 * No prescription is ever treated as a completion.
 */
export async function reconcileCompletedWorkoutHistory(userId: string, date: string): Promise<void> {
  const beginning = new Date(`${date}T00:00:00`);
  const end = new Date(beginning.getTime());
  end.setDate(end.getDate() + 1);
  const [rows, history] = await Promise.all([
    listWorkoutLedgerEntriesForGuardrails({
      from: beginning.toISOString(),
      to: new Date(end.getTime() - 1).toISOString(),
      limit: 501,
    }),
    loadTrainingEvents(userId, date),
  ]);
  if (rows.length >= 501) throw new Error('Daily workout history is too large for a safe reconciliation.');
  const ledger = rows.filter((entry) => localTrainingDate(new Date(entry.completedAt)) === date)
    .map((entry) => {
      const estimatedMinutes = entry.workout
        ? entry.workout.estimatedElapsedSeconds * entry.completionFraction / 60
        : (Date.parse(entry.completedAt) - Date.parse(entry.startedAt)) / 60000;
      if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 0 || !entry.updatedAt) {
        throw new Error('Completed workout history requires review before loading can progress.');
      }
      return {
        ledgerId: entry.id,
        revision: entry.updatedAt,
        completedAt: entry.completedAt,
        legacyEventIds: [
          entry.workout ? `completed:${entry.workout.id}:${entry.completedAt}` : '',
          `completed:ledger:${entry.id}`,
        ].filter(Boolean),
        activity: {
          activity: 'strength',
          sessionId: entry.plannedSessionId,
          minutes: Math.max(1, Math.ceil(estimatedMinutes)),
          regions: entry.workout ? regionsForWorkout(entry.workout) : ['general', 'achilles', 'upper_back'] as TrainingRegion[],
        },
      };
    });
  const events = planLedgerReconciliation(date, ledger, history, new Date().toISOString());
  for (const event of events) {
    await recordTrainingEvent(userId, event, date);
  }
}

async function crossSportOverlapFor(
  date: string,
  regions: readonly TrainingRegion[],
): Promise<ReturnType<typeof assessCrossSportExposure>> {
  const beginning = new Date(`${date}T00:00:00`);
  const end = new Date(beginning.getTime());
  end.setDate(end.getDate() + 1);
  const imported = await listEnduranceActivitiesForGuardrails({
    from: beginning.toISOString(),
    to: new Date(end.getTime() - 1).toISOString(),
    limit: 501,
  });
  if (imported.length >= 501) throw new Error('Too many endurance activities for a reliable daily assessment.');
  const completed = imported.filter((item) =>
    localTrainingDate(new Date(item.startAt)) === date
    && Date.parse(item.startAt) <= Date.now()
    && !item.deletedAt
    && item.classification !== 'ignored'
  );
  return assessCrossSportExposure(regions, completed.map((item) => ({
    id: item.id,
    discipline: item.discipline,
    minutes: item.movingTimeSeconds / 60,
  })));
}

export async function assessTrainingAddition(request: TrainingAdditionRequest): Promise<TrainingGuardrailResult> {
  await reconcileCompletedWorkoutHistory(request.userId, request.date);
  const [ceiling, history] = await Promise.all([
    getEffectiveDailyCeiling(request.userId, request.date),
    loadTrainingEvents(request.userId, request.date),
  ]);
  const activeCheckIn = ceiling ? null : await getActiveTrainingCheckIn();
  let result: TrainingGuardrailResult = ceiling
    ? evaluateTrainingAddition(ceiling, request.proposed, history)
    : activeCheckIn?.status === 'unable_to_train'
      ? {
        decision: 'stop',
        reasons: ['Your active check-in pauses training. Update it before starting a workout.'],
        requiresReassessment: true,
      }
      : {
        decision: 'defer',
        reasons: ['No approved daily training ceiling is available. Review the plan and recovery check-in first.'],
        requiresReassessment: true,
      };
  if (result.decision !== 'stop') {
    const matching = ceiling?.planned.find((item) =>
      item.activity === request.proposed.activity
      && (!item.sessionId || item.sessionId === request.proposed.sessionId));
    const regions = [...new Set<TrainingRegion>([
      ...request.proposed.regions, ...(matching?.regions ?? []),
    ])];
    const crossSport = await crossSportOverlapFor(request.date, regions);
    if (crossSport.conflict) {
      result = {
        decision: 'defer',
        reasons: [...result.reasons, ...crossSport.reasons],
        requiresReassessment: true,
        overrideAllowed: result.overrideAllowed,
      };
    }
  }
  await recordTrainingEvent(request.userId, {
    id: request.requestId,
    occurredAt: request.occurredAt,
    kind: 'assessment',
    note: JSON.stringify({
      category: 'addition_assessment',
      decision: result.decision,
      reasons: result.reasons,
      proposed: request.proposed,
    }),
  }, request.date);
  return result;
}

export async function assessWorkoutStart({
  userId, workout, sessionId, overrideReason,
}: {
  userId: string;
  workout: GeneratedWorkout;
  sessionId?: string;
  overrideReason?: string;
}): Promise<WorkoutStartAssessment> {
  const now = new Date();
  const date = localTrainingDate(now);
  const saved = await getLatestTrainingBlock();
  const scheduled = Boolean(sessionId && saved?.block.weeks.some((week) =>
    week.sessions.some((session) => session.id === sessionId &&
      session.date === date && session.completionStatus !== 'completed' &&
      session.completionStatus !== 'skipped')));
  const result = await assessTrainingAddition({
    userId, date,
    requestId: `assessment:${workout.id}:${now.toISOString()}:${Math.random().toString(36).slice(2)}`,
    occurredAt: now.toISOString(),
    proposed: {
      activity: 'strength',
      sessionId,
      minutes: Math.ceil(workout.estimatedElapsedSeconds / 60),
      regions: regionsForWorkout(workout),
      scheduled,
    },
  });
  if (result.decision === 'allow') return { result, authorized: true };
  // Safety red flags cannot be bypassed from this interface.
  if (result.decision === 'stop' || result.overrideAllowed === false ||
      !overrideReason?.trim()) return { result, authorized: false };
  await recordTrainingEvent(userId, {
    id: `override:${workout.id}:${now.toISOString()}:${Math.random().toString(36).slice(2)}`,
    occurredAt: now.toISOString(),
    kind: 'override',
    note: JSON.stringify({ decision: result.decision, reason: overrideReason, workoutId: workout.id, sessionId }),
  }, date);
  return { result, authorized: true };
}

export async function recordActualWorkoutCompletion({
  userId, workout, completedAt, ledgerId,
}: {
  userId: string;
  workout: GeneratedWorkout;
  sessionId?: string;
  completedAt: string;
  completionFraction: number;
  ledgerId?: string;
}): Promise<void> {
  const date = localTrainingDate(new Date(completedAt));
  await reconcileCompletedWorkoutHistory(userId, date);
  const expected = ledgerId ?? `${workout.id}_${completedAt}`;
  const history = await loadTrainingEvents(userId, date);
  const retracted = new Set(history.filter((event) => event.kind === 'retracted')
    .map((event) => event.retractsEventId));
  if (!history.some((event) => event.kind === 'completed'
    && event.sourceId === expected && !retracted.has(event.id))) {
    throw new Error('Workout saved but its training-load record could not be verified. Retry reconciliation.');
  }
}
