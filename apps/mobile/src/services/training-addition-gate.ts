import {
  evaluateTrainingAddition,
  type ActivityDose,
  type DailyTrainingCeiling,
  type ProposedActivity,
  type RecoveryStatus,
  type TrainingGuardrailResult,
  type TrainingRegion,
} from '@circuit/planner';
import type { GeneratedWorkout, TrainingCheckIn } from '@circuit/domain';
import { getActiveTrainingCheckIn, getLatestTrainingBlock } from './database';
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

function regionsForWorkout(workout: GeneratedWorkout): TrainingRegion[] {
  const values = workout.targetRegions.map((region) => String(region).toLowerCase()).join(' ');
  const regions: TrainingRegion[] = ['general'];
  if (/calf|ankle|foot|lower_leg|hamstring|quadricep|glute|hip|leg/.test(values)) regions.push('achilles');
  if (/upper_back|back|shoulder|scapul|thorac|lat|trap|chest/.test(values)) regions.push('upper_back');
  // Unknown target-region nomenclature is not clearance for a sensitive area.
  if (!workout.targetRegions.length) regions.push('achilles', 'upper_back');
  return regions;
}

function recoveryFor(checkIn: TrainingCheckIn | null): Partial<Record<TrainingRegion, RecoveryStatus>> {
  // General check-in does not automatically certify recovering tissue.
  const general: RecoveryStatus = checkIn?.status === 'normal'
    ? 'stable'
    : checkIn?.status === 'unable_to_train' ? 'worse' : 'uncertain';
  return { general, achilles: 'uncertain', upper_back: 'uncertain' };
}

/** Establish the day's ceiling only from the saved training block, never from an ad hoc request. */
async function ensurePrescribedCeiling(userId: string, date: string): Promise<DailyTrainingCeiling | null> {
  const existing = await loadDailyCeiling(userId, date);
  const checkIn = await getActiveTrainingCheckIn();
  if (existing) return { ...existing, pauseTraining: checkIn?.status === 'unable_to_train' };
  const saved = await getLatestTrainingBlock();
  const sessions = saved?.block.weeks.flatMap((week) => week.sessions).filter(
    (session) => session.date === date && session.completionStatus !== 'completed' && session.completionStatus !== 'skipped',
  ) ?? [];
  if (!sessions.length) return null;
  const planned: ActivityDose[] = sessions.map((session) => ({
    activity: 'strength',
    sessionId: session.id,
    minutes: Math.ceil(session.workout.estimatedElapsedSeconds / 60),
    regions: regionsForWorkout(session.workout),
  }));
  const ceiling: DailyTrainingCeiling = { date, planned, recovery: recoveryFor(checkIn), restrictUnplanned: true, pauseTraining: checkIn?.status === 'unable_to_train' };
  await saveDailyCeiling(userId, ceiling);
  return loadDailyCeiling(userId, date);
}

export async function assessTrainingAddition(request: TrainingAdditionRequest): Promise<TrainingGuardrailResult> {
  const [ceiling, history] = await Promise.all([
    ensurePrescribedCeiling(request.userId, request.date),
    loadTrainingEvents(request.userId, request.date),
  ]);
  const activeCheckIn = ceiling ? null : await getActiveTrainingCheckIn();
  const result: TrainingGuardrailResult = ceiling
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
  if (result.decision === 'stop' || !overrideReason?.trim()) return { result, authorized: false };
  await recordTrainingEvent(userId, {
    id: `override:${workout.id}:${now.toISOString()}:${Math.random().toString(36).slice(2)}`,
    occurredAt: now.toISOString(),
    kind: 'override',
    note: JSON.stringify({ decision: result.decision, reason: overrideReason, workoutId: workout.id, sessionId }),
  }, date);
  return { result, authorized: true };
}

export async function recordActualWorkoutCompletion({
  userId, workout, sessionId, completedAt, completionFraction,
}: {
  userId: string;
  workout: GeneratedWorkout;
  sessionId?: string;
  completedAt: string;
  completionFraction: number;
}): Promise<void> {
  const fraction = Number.isFinite(completionFraction) ? Math.max(0, Math.min(1, completionFraction)) : 0;
  // This event records an estimate from actually saved completion, not the prescription.
  await recordTrainingEvent(userId, {
    id: `completed:${workout.id}:${completedAt}`,
    occurredAt: completedAt,
    kind: 'completed',
    activity: {
      activity: 'strength',
      sessionId,
      minutes: Math.ceil(workout.estimatedElapsedSeconds / 60 * fraction),
      regions: regionsForWorkout(workout),
    },
  }, localTrainingDate(new Date(completedAt)));
}
