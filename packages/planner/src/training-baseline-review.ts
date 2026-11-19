/**
 * Deliberate, athlete-attested baseline review. No inference of fitness,
 * medical clearance, source sync completeness, or fitted pTSS.
 *
 * Source coverage is MANUALLY ATTESTED, not automatically verified by an API.
 * The exercise/planning engine must not treat a saved allowance as permission.
 */
import {
  freezeExperimentalTrainingAllowance,
  type ApprovedCompletedBaseline,
  type FrozenTrainingAllowance,
  type PlanningInterruptionState,
} from './experimental-training-guardrails';
import type { TrainingWeekEvidence } from './core-training-week-evidence';

export interface CoverageReviewAttestation {
  allTrainingRecorded: boolean;
  providersAndManualLogsReviewed: boolean;
  duplicateRecordsReconciled: boolean;
  estimatedDurationsReviewed: boolean;
  symptomContextReviewed: boolean;
  planningState: PlanningInterruptionState;
  clinicalContext: 'none_reported' | 'active' | 'unknown';
  notes: string;
}
export interface BaselineReviewIssue { code: string; detail: string }
export interface ApprovedWeekSnapshot {
  schemaVersion: 1;
  id: string;
  planningWeekStart: string;
  completedWeekStart: string;
  reviewedAt: string;
  sourceSignature: string;
  evidenceBasis: 'athlete_attested_not_source_audited';
  attestation: CoverageReviewAttestation;
  baseline: ApprovedCompletedBaseline;
  frozenAllowance: FrozenTrainingAllowance;
}
export interface BaselineReviewAssessment {
  canApprove: boolean;
  sourceSignature: string;
  issues: BaselineReviewIssue[];
  candidate: ApprovedCompletedBaseline;
}
const ONE_DAY = 86_400_000;
function ordinal(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid local day');
  const n = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid local day');
  }
  return n / ONE_DAY;
}
function date(n: number): string { return new Date(n * ONE_DAY).toISOString().slice(0, 10); }
function uniqueSorted(items: string[]): string[] { return [...new Set(items)].sort(); }

/**
 * Versioned exact source signature (not a cryptographic digest).
 * Only COMPLETED source membership and measurements matter. Changing the
 * future calendar cannot accidentally invalidate an already completed week.
 */
export function baselineSourceSignature(evidence: TrainingWeekEvidence): string {
  return JSON.stringify({
    version: 1, week: evidence.weekStartDate, end: evidence.weekEndDate,
    tz: evidence.timezone,
    recordIds: uniqueSorted(evidence.completedRecordIds),
    sources: uniqueSorted(evidence.completedSourceIds),
    completed: evidence.completed,
    completedRecordRows: evidence.completedRecordRows,
    completedUnresolved: uniqueSorted(evidence.unresolvedRecords
      .filter(issue => evidence.completedRecordIds.includes(issue.recordId))
      .map(issue => issue.recordId + ':' + issue.reason)),
    conflicts: uniqueSorted(evidence.sourceConflicts),
  });
}

function isReviewableEstimate(issue: { reason: string }): boolean {
  return issue.reason.includes('Estimated duration');
}
function baselineCandidate(evidence: TrainingWeekEvidence): ApprovedCompletedBaseline {
  return {
    id: 'reviewed-baseline:' + evidence.weekStartDate + ':' + evidence.timezone,
    startDate: evidence.weekStartDate,
    endDate: evidence.weekEndDate,
    timezone: evidence.timezone,
    runDistanceKm: evidence.completed.runDistanceKm,
    cyclingMinutes: evidence.completed.cyclingMinutes,
    combinedMinutes: evidence.completed.combinedMinutes,
    sourceActivityIds: uniqueSorted(evidence.completedSourceIds),
    evidenceStatus: 'incomplete',
    eligibility: 'needs_review',
    symptomContextReviewed: false,
  };
}
export function assessWeekForBaseline(
  evidence: TrainingWeekEvidence,
  planningWeekStart: string,
  nowLocalDate: string,
  attestation: CoverageReviewAttestation,
  targetWeekCompletedCount = 0,
): BaselineReviewAssessment {
  const issues: BaselineReviewIssue[] = [];
  const add = (code: string, detail: string) => issues.push({ code, detail });
  if (ordinal(planningWeekStart) - ordinal(evidence.weekStartDate) !== 7
      || ordinal(evidence.weekEndDate) !== ordinal(planningWeekStart) - 1) {
    add('wrong_week', 'Only the immediately preceding completed Monday–Sunday week can be used.');
  }
  if (ordinal(nowLocalDate) < ordinal(planningWeekStart)) {
    add('unfinished_week', 'Finish the previous calendar week before reviewing its baseline.');
  }
  if (ordinal(nowLocalDate) > ordinal(planningWeekStart) + 6) {
    add('stale_week', 'Do not use an older week to reauthorize a later ramp.');
  }
  if (targetWeekCompletedCount > 0) {
    add('retroactive_freeze', 'The target week already contains completed training. Do not freeze a new progression ceiling retrospectively.');
  }
  if (evidence.completed.count === 0) {
    add('no_completed_evidence', 'No completed sessions were found. A zero-load week is not evidence of progression tolerance.');
  }
  if (evidence.sourceConflicts.length) {
    add('source_conflict', 'Unresolved source or planned-versus-completed matches need review.');
  }
  const completedIssues = evidence.unresolvedRecords.filter(issue =>
    evidence.completedRecordIds.includes(issue.recordId));
  if (completedIssues.some(issue => !isReviewableEstimate(issue))) {
    add('incomplete_records', 'Missing distances, times, or unresolved duplicates block a baseline.');
  }
  if (completedIssues.some(isReviewableEstimate) && !attestation.estimatedDurationsReviewed) {
    add('estimated_duration', 'Review and explicitly confirm estimated completed workout durations.');
  }
  if (!attestation.allTrainingRecorded || !attestation.providersAndManualLogsReviewed) {
    add('coverage_unattested', 'Review every completed source and any off-app training or rest days.');
  }
  if (!attestation.duplicateRecordsReconciled) {
    add('duplicate_review', 'Confirm that overlapping Garmin, TrainingPeaks and strength records are reconciled.');
  }
  if (!attestation.symptomContextReviewed) {
    add('symptom_unreviewed', 'Review symptoms and training interruption context before progression.');
  }
  if (attestation.planningState !== 'ordinary_progression') {
    add('not_ordinary_progression', 'Illness, injury, rehabilitation and other interruptions require a separate plan.');
  }
  if (attestation.clinicalContext !== 'none_reported') {
    add('clinical_review_required', 'Active or unknown clinical restrictions cannot be cleared here.');
  }
  if (attestation.notes.trim().length < 8) {
    add('review_note_required', 'Document which sources and training context were reviewed (at least 8 characters).');
  }
  return {
    canApprove: issues.length === 0,
    sourceSignature: baselineSourceSignature(evidence),
    candidate: baselineCandidate(evidence),
    issues,
  };
}

/** User-triggered approval only; the caller must persist this as an immutable snapshot. */
export function approveWeekBaseline(input: {
  evidence: TrainingWeekEvidence;
  planningWeekStart: string;
  reviewedAt: string;
  nowLocalDate: string;
  attestation: CoverageReviewAttestation;
  targetWeekCompletedCount?: number;
}): { status: 'approved'; snapshot: ApprovedWeekSnapshot } | {
  status: 'rejected'; issues: BaselineReviewIssue[];
} {
  const assessment = assessWeekForBaseline(
    input.evidence, input.planningWeekStart, input.nowLocalDate, input.attestation,
    input.targetWeekCompletedCount ?? 0,
  );
  if (!assessment.canApprove) return { status: 'rejected', issues: assessment.issues };
  const baseline: ApprovedCompletedBaseline = {
    ...assessment.candidate,
    evidenceStatus: 'complete',
    eligibility: 'approved_for_policy',
    symptomContextReviewed: true,
    approvedAt: input.reviewedAt,
    approvalNote: 'Athlete-attested completed sources, duplicates, symptom context: '
      + input.attestation.notes.trim(),
  };
  const result = freezeExperimentalTrainingAllowance({
    baseline, planningWeekStart: input.planningWeekStart,
    planningState: input.attestation.planningState, frozenAt: input.reviewedAt,
  });
  if (result.status !== 'ready') return {
    status: 'rejected',
    issues: result.reasons.map(detail => ({ code: result.status, detail })),
  };
  return {
    status: 'approved',
    snapshot: {
      schemaVersion: 1,
      id: 'review:' + input.planningWeekStart + ':' + input.reviewedAt,
      planningWeekStart: input.planningWeekStart,
      completedWeekStart: input.evidence.weekStartDate,
      reviewedAt: input.reviewedAt,
      sourceSignature: assessment.sourceSignature,
      evidenceBasis: 'athlete_attested_not_source_audited',
      attestation: { ...input.attestation, notes: input.attestation.notes.trim() },
      baseline,
      frozenAllowance: result.allowance,
    },
  };
}

export function assessSavedBaseline(input: {
  snapshot: ApprovedWeekSnapshot;
  evidence: TrainingWeekEvidence;
  clinicalContext: 'none_reported' | 'active' | 'unknown';
  planningState: PlanningInterruptionState;
}): { usableForPolicyComparison: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.snapshot.schemaVersion !== 1
      || input.snapshot.sourceSignature !== baselineSourceSignature(input.evidence)) {
    reasons.push('Training history changed since approval; review and refreeze the baseline.');
  }
  if (input.clinicalContext !== 'none_reported') {
    reasons.push('New or unresolved clinical restrictions take precedence.');
  }
  if (input.planningState !== 'ordinary_progression') {
    reasons.push('Ordinary progression is suspended; another planning review is required.');
  }
  if (input.snapshot.baseline.eligibility !== 'approved_for_policy') {
    reasons.push('Stored baseline is not approved.');
  }
  return { usableForPolicyComparison: reasons.length === 0, reasons };
}
