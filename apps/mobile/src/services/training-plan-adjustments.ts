import {
  buildPlanAdjustmentPreview, planExposureSignature, rawGeneratedEventSignature,
  type PlanAdjustmentCandidate, type PlanAdjustmentEvent, type PlanAdjustmentPreview,
} from '@circuit/planner';
import {
  appendTrainingPlanAdjustmentEvent, getActiveDatabaseName,
  getRawTrainingCalendarEvent, listTrainingPlanAdjustmentEvents,
} from './database';
import { loadTrainingBaselineReviewState } from './training-baseline-review';
import { localTrainingDate } from '@circuit/planner';

export interface PlanAdjustmentReviewState {
  weekStartDate: string;
  timezone: string;
  ready: boolean;
  explanations: string[];
  preview: PlanAdjustmentPreview | null;
  latestDecisions: PlanAdjustmentEvent[];
}
function latestDecisions(events: PlanAdjustmentEvent[]): PlanAdjustmentEvent[] {
  const latest = new Map<string, PlanAdjustmentEvent>();
  for (const event of events) latest.set(event.sourceEventId, event);
  return [...latest.values()].sort((a, b) => a.sourceEventId.localeCompare(b.sourceEventId));
}
export async function loadPlanAdjustmentReview(input: {
  weekStartDate: string;
  timezone: string;
  now?: Date;
}): Promise<PlanAdjustmentReviewState> {
  const dbBefore = getActiveDatabaseName();
  const [review, stored] = await Promise.all([
    loadTrainingBaselineReviewState({
      planningWeekStart: input.weekStartDate, timezone: input.timezone,
    }),
    listTrainingPlanAdjustmentEvents(),
  ]);
  if (dbBefore !== getActiveDatabaseName()) {
    throw new Error('Athlete profile changed during plan review.');
  }
  const approved = review.savedStatus === 'active'
    && review.saved?.frozenAllowance != null
    && review.forcedClinicalContext === 'none_reported'
    && review.currentPlanningState === 'ordinary_progression'
    && !review.proposedWeek.historyPossiblyTruncated;
  const explanations: string[] = [];
  if (!approved) explanations.push(
    'A current, reviewed completed-week baseline and unrestricted ordinary planning state are required.',
  );
  if (review.proposedWeek.historyAuditIssues.length) explanations.push(
    ...review.proposedWeek.historyAuditIssues,
  );
  const allowance = approved ? review.saved?.frozenAllowance : undefined;
  const preview = allowance ? buildPlanAdjustmentPreview({
    weekStartDate: input.weekStartDate,
    timezone: input.timezone,
    allowance,
    records: review.proposedWeek.plannedAndCompleted,
    todayLocalDate: localTrainingDate((input.now ?? new Date()).toISOString(), input.timezone),
    eligible: approved,
  }) : null;
  return {
    weekStartDate: input.weekStartDate, timezone: input.timezone,
    ready: Boolean(preview?.eligibleForProposal),
    explanations: [...explanations, ...(preview?.explanations ?? [])],
    preview, latestDecisions: latestDecisions(stored),
  };
}
export async function decideProposedPlanAdjustment(input: {
  weekStartDate: string;
  timezone: string;
  candidate: PlanAdjustmentCandidate;
  expectedExposureSignature: string;
  decision: 'accepted' | 'declined';
  now?: Date;
}): Promise<PlanAdjustmentReviewState> {
  const dbBefore = getActiveDatabaseName();
  const fresh = await loadPlanAdjustmentReview({
    weekStartDate: input.weekStartDate, timezone: input.timezone, now: input.now,
  });
  if (fresh.preview?.exposureSignature !== input.expectedExposureSignature
    || !fresh.ready) throw new Error('The plan or baseline changed. Reload this review.');
  const confirmed = fresh.preview.candidates.find(item => item.id === input.candidate.id);
  if (!confirmed
    || confirmed.proposedMinutes !== input.candidate.proposedMinutes
    || confirmed.eventId !== input.candidate.eventId) {
    throw new Error('This proposed adjustment is no longer available.');
  }
  const raw = await getRawTrainingCalendarEvent(confirmed.eventId);
  if (!raw || raw.sourceId !== 'side_quest_generated_plan') {
    throw new Error('Only current Side Quest-generated endurance events can be adjusted.');
  }
  const now = input.now ?? new Date();
  if (localTrainingDate(now.toISOString(), input.timezone) > confirmed.localDate) {
    throw new Error('Cannot change an already past training session.');
  }
  if (dbBefore !== getActiveDatabaseName()) throw new Error('Athlete profile changed.');
  const event: PlanAdjustmentEvent = {
    id: 'plan-review-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 9),
    sourceEventId: confirmed.eventId,
    sourceSignature: rawGeneratedEventSignature(raw),
    action: confirmed.action,
    decision: input.decision,
    proposedMinutes: confirmed.proposedMinutes,
    createdAt: now.toISOString(),
  };
  await appendTrainingPlanAdjustmentEvent(event);
  return loadPlanAdjustmentReview({
    weekStartDate: input.weekStartDate, timezone: input.timezone, now,
  });
}
export async function restoreAcceptedPlanAdjustment(input: {
  weekStartDate: string;
  timezone: string;
  eventId: string;
  now?: Date;
}): Promise<PlanAdjustmentReviewState> {
  const dbBefore = getActiveDatabaseName();
  const state = await loadPlanAdjustmentReview({
    weekStartDate: input.weekStartDate, timezone: input.timezone, now: input.now,
  });
  if (!state.ready && !state.preview?.eligibleForProposal) {
    throw new Error('The planning baseline or clinical state needs review before increasing a session.');
  }
  const latest = state.latestDecisions.find(item => item.sourceEventId === input.eventId);
  if (latest?.decision !== 'accepted') throw new Error('No current approved change to restore.');
  const raw = await getRawTrainingCalendarEvent(input.eventId);
  if (!raw || rawGeneratedEventSignature(raw) !== latest.sourceSignature) {
    throw new Error('The underlying generated workout changed. Reopen the training plan.');
  }
  const now = input.now ?? new Date();
  if (localTrainingDate(now.toISOString(), input.timezone) > raw.startAt.slice(0, 10)) {
    throw new Error('Past workouts cannot be restored retroactively.');
  }
  if (dbBefore !== getActiveDatabaseName()) throw new Error('Athlete profile changed.');
  await appendTrainingPlanAdjustmentEvent({
    ...latest,
    id: 'plan-restore-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 9),
    decision: 'restored', createdAt: now.toISOString(),
  });
  return loadPlanAdjustmentReview({
    weekStartDate: input.weekStartDate, timezone: input.timezone, now,
  });
}
