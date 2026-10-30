import {
  approveWeekBaseline, assessSavedBaseline, assessWeekForBaseline,
  type ApprovedWeekSnapshot, type CoverageReviewAttestation,
  type BaselineReviewIssue, type PlanningInterruptionState,
  evaluateExperimentalTrainingGuardrails, localTrainingDate,
} from '@circuit/planner';

import {
  appendTrainingBaselineReviewEvent, getActiveDatabaseName,
  getActiveTrainingCheckIn, getLatestPTProfile,
  getLatestTrainingBaselineReviewEvent,
} from './database';
import { loadCoreTrainingWeekAudit,
  type CoreTrainingWeekAudit } from './core-training-week-evidence';

function addLocalDays(localDate: string, days: number): string {
  const d = new Date(localDate + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw new Error('Invalid week date');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export interface TrainingBaselineReviewState {
  planningWeekStart: string;
  completedWeekStart: string;
  timezone: string;
  previousWeek: CoreTrainingWeekAudit;
  proposedWeek: CoreTrainingWeekAudit;
  saved: ApprovedWeekSnapshot | null;
  savedStatus: 'not_reviewed' | 'withdrawn' | 'stale' | 'active';
  savedReasons: string[];
  forcedClinicalContext: 'none_reported' | 'active';
  currentPlanningState: PlanningInterruptionState;
  /** Known overages only; missing daily source coverage prevents a green status. */
  detectedWindowOverages: Array<{ window: string; dimension: string; proposed: number; ceiling: number }>;
  rollingCoverageVerified: false;
}

/**
 * Clinical evidence is a hard *negative* gate. Lack of PT profile cannot prove
 * medical clearance: the athlete must also explicitly attest no restriction.
 */
async function currentHardConstraints(): Promise<{
  context: 'none_reported' | 'active';
  planningState: PlanningInterruptionState;
}> {
  const [pt, checkIn] = await Promise.all([
    getLatestPTProfile(), getActiveTrainingCheckIn(),
  ]);
  const painRestriction = checkIn?.active
    && (checkIn.status === 'tightness_pain' || checkIn.status === 'unable_to_train');
  return {
    context: pt?.active || painRestriction ? 'active' : 'none_reported',
    planningState: checkIn?.status === 'unable_to_train'
      ? 'injury_or_worsening_interruption' : 'ordinary_progression',
  };
}
export async function loadTrainingBaselineReviewState(input: {
  planningWeekStart: string;
  timezone: string;
}): Promise<TrainingBaselineReviewState> {
  const dbBefore = getActiveDatabaseName();
  const completedWeekStart = addLocalDays(input.planningWeekStart, -7);
  const [previousWeek, proposedWeek, savedEvent, hard] = await Promise.all([
    loadCoreTrainingWeekAudit(completedWeekStart, input.timezone),
    loadCoreTrainingWeekAudit(input.planningWeekStart, input.timezone),
    getLatestTrainingBaselineReviewEvent(input.planningWeekStart),
    currentHardConstraints(),
  ]);
  if (dbBefore !== getActiveDatabaseName()) throw new Error(
    'Athlete profile changed during baseline review. Reopen this page.',
  );
  const saved = savedEvent?.kind === 'approval' ? savedEvent.snapshot : null;
  const assessment = saved ? assessSavedBaseline({
    snapshot: saved, evidence: previousWeek.evidence,
    clinicalContext: hard.context, planningState: hard.planningState,
  }) : null;
  const truncated = previousWeek.historyPossiblyTruncated
    || proposedWeek.historyPossiblyTruncated;
  const ceilingForWeek = saved && assessment?.usableForPolicyComparison && !truncated
    ? saved.frozenAllowance : null;
  // Only report *confirmed arithmetic overages*. All days are intentionally
  // marked uncovered until canonical per-day coverage has been audited.
  const evaluation = ceilingForWeek ? evaluateExperimentalTrainingGuardrails({
    planningWeekStart: input.planningWeekStart,
    timezone: input.timezone,
    planningState: 'ordinary_progression',
    frozenAllowances: [ceilingForWeek],
    activities: [...previousWeek.plannedAndCompleted, ...proposedWeek.plannedAndCompleted]
      .filter(record => record.localDate >= completedWeekStart
        && record.localDate <= addLocalDays(input.planningWeekStart, 6)),
    coveredLocalDates: [],
    clinicalConstraintState: hard.context,
  }) : null;
  const detectedWindowOverages = (evaluation?.windows ?? [])
    .flatMap(window => window.checks.filter(check => check.status === 'exceeds'
      && check.ceiling !== null).map(check => ({
      window: window.kind + ': ' + window.startDate + ' – ' + window.endDate,
      dimension: check.dimension,
      proposed: check.proposed,
      ceiling: check.ceiling!,
    })));
  return {
    planningWeekStart: input.planningWeekStart,
    completedWeekStart, timezone: input.timezone, previousWeek, proposedWeek,
    saved,
    savedStatus: savedEvent?.kind === 'revocation' ? 'withdrawn'
      : !saved ? 'not_reviewed'
        : !assessment?.usableForPolicyComparison || truncated ? 'stale' : 'active',
    savedReasons: [
      ...(assessment?.reasons ?? []),
      ...(truncated ? ['Activity history query may be truncated. Source coverage cannot be assumed.'] : []),
    ],
    forcedClinicalContext: hard.context,
    currentPlanningState: hard.planningState,
    detectedWindowOverages,
    rollingCoverageVerified: false,
  };
}

export type SaveTrainingBaselineReviewResult =
  | { status: 'approved'; state: TrainingBaselineReviewState }
  | { status: 'rejected'; issues: BaselineReviewIssue[] };

/**
 * Force a fresh source query at the moment of the user action. Never trust the
 * original screen state and never use synthetic planned durations as actuals.
 */
export async function approveAndSaveTrainingBaseline(input: {
  planningWeekStart: string;
  timezone: string;
  attestation: CoverageReviewAttestation;
  expectedSourceSignature: string;
  now: Date;
}): Promise<SaveTrainingBaselineReviewResult> {
  const dbBefore = getActiveDatabaseName();
  const today = localTrainingDate(input.now.toISOString(), input.timezone);
  const state = await loadTrainingBaselineReviewState({
    planningWeekStart: input.planningWeekStart, timezone: input.timezone,
  });
  const issues: BaselineReviewIssue[] = [];
  if (dbBefore !== getActiveDatabaseName()) issues.push({
    code: 'profile_changed', detail: 'Athlete profile changed. Reopen the review.',
  });
  if (state.previousWeek.historyPossiblyTruncated || state.proposedWeek.historyPossiblyTruncated) {
    issues.push({
      code: 'truncated_history',
      detail: 'History query reached its limit. Complete source auditing is needed before approval.',
    });
  }
  const observedSignature = assessWeekForBaseline(
    state.previousWeek.evidence, input.planningWeekStart, today,
    input.attestation,
  ).sourceSignature;
  if (observedSignature !== input.expectedSourceSignature) issues.push({
    code: 'source_changed',
    detail: 'Completed training changed since the page loaded. Review updated records.',
  });
  if (state.forcedClinicalContext === 'active') issues.push({
    code: 'active_restriction',
    detail: 'A PT profile or active pain restriction requires a separate clinical review.',
  });
  if (state.proposedWeek.evidence.completed.count > 0) issues.push({
    code: 'retroactive_freeze',
    detail: 'Target week already has completed training. A new frozen ceiling cannot be applied retrospectively.',
  });
  if (state.currentPlanningState !== 'ordinary_progression') issues.push({
    code: 'interruption',
    detail: 'An active inability-to-train check-in suspends ordinary progression.',
  });
  if (issues.length) return { status: 'rejected', issues };
  const result = approveWeekBaseline({
    evidence: state.previousWeek.evidence, planningWeekStart: input.planningWeekStart,
    reviewedAt: input.now.toISOString(), nowLocalDate: today,
    attestation: input.attestation,
    targetWeekCompletedCount: state.proposedWeek.evidence.completed.count,
  });
  if (result.status === 'rejected') return result;
  if (dbBefore !== getActiveDatabaseName()) return {
    status: 'rejected',
    issues: [{ code: 'profile_changed', detail: 'Profile changed before saving.' }],
  };
  await appendTrainingBaselineReviewEvent({
    kind: 'approval', snapshot: result.snapshot, createdAt: result.snapshot.reviewedAt,
  });
  return {
    status: 'approved',
    state: await loadTrainingBaselineReviewState({
      planningWeekStart: input.planningWeekStart, timezone: input.timezone,
    }),
  };
}
export async function withdrawTrainingBaselineApproval(input: {
  planningWeekStart: string;
  reason: string;
}): Promise<void> {
  if (!input.reason.trim()) throw new Error('A withdrawal reason is required.');
  await appendTrainingBaselineReviewEvent({
    kind: 'revocation', planningWeekStart: input.planningWeekStart,
    reason: input.reason.trim(), createdAt: new Date().toISOString(),
  });
}
