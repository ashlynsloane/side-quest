/** Read-only daily reconciliation of scheduled and observed training.
 * A missing completion is NOT evidence of a missed workout; source coverage
 * is unverified and plans cannot be automatically moved to another day.
 */
import {
  reconcileGuardrailExposure,
  type TrainingExposureRecord,
} from './experimental-training-guardrails';

export interface DailyTrainingReview {
  asOfLocalDate: string;
  completedCount: number;
  upcomingPlannedCount: number;
  todayPlannedCount: number;
  pastUnverifiedCount: number;
  pastUnverifiedIds: string[];
  needsSourceReview: boolean;
  advice: string;
  autoRescheduledCount: 0;
}

export function buildDailyTrainingReview(input: {
  records: TrainingExposureRecord[];
  asOfLocalDate: string;
  sourceCoverageVerified: boolean;
  historyPossiblyTruncated?: boolean;
  historyAuditIssues?: string[];
}): DailyTrainingReview {
  const { asOfLocalDate } = input;
  const timestamp = Date.parse(asOfLocalDate + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfLocalDate)
    || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== asOfLocalDate) {
    throw new Error('Daily training review requires a valid athlete-local date.');
  }
  const resolved = reconcileGuardrailExposure(input.records);
  const planned = resolved.records.filter(record => record.status === 'planned');
  const completed = resolved.records.filter(record => record.status === 'completed');
  const unlinkedSameDay = planned.some(plan => completed.some(actual =>
    actual.localDate === plan.localDate && actual.sport === plan.sport));
  const needsSourceReview = !input.sourceCoverageVerified
    || Boolean(input.historyPossiblyTruncated)
    || Boolean(input.historyAuditIssues?.length)
    || resolved.issues.length > 0 || unlinkedSameDay
    || resolved.records.some(record => Boolean(record.possibleDuplicate
      || record.crossesLocalMidnight));
  const past = planned.filter(record => record.localDate < asOfLocalDate);
  const today = planned.filter(record => record.localDate === asOfLocalDate);
  const future = planned.filter(record => record.localDate > asOfLocalDate);
  return {
    asOfLocalDate,
    completedCount: completed.length,
    upcomingPlannedCount: future.length,
    todayPlannedCount: today.length,
    pastUnverifiedCount: past.length,
    pastUnverifiedIds: past.map(record => record.recordId).sort(),
    needsSourceReview,
    advice: past.length > 0
      ? 'Earlier planned sessions have no linked completion. Review your training history before deciding what to adjust; they are not automatically missed, and nothing is added to a future day.'
      : needsSourceReview
        ? 'Training source coverage or record matching needs review. No automatic catch-up or progression is inferred.'
        : 'No earlier unmatched plans in the supplied records. This does not establish readiness or clearance for additional training.',
    autoRescheduledCount: 0,
  };
}
