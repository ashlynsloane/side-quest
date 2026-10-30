import type { FrozenTrainingAllowance } from './experimental-training-guardrails';
import type { TrainingWeekEvidence } from './core-training-week-evidence';

/**
 * Explain the athlete-selected week ceilings without labeling a plan medically
 * safe, encouraging training to reach a cap, or treating incomplete records as
 * proof that a plan is within its limit.
 */
export interface TrainingDimensionComparison {
  dimension: 'running_distance' | 'cycling_duration' | 'combined_duration';
  unit: 'km' | 'min';
  proposedKnownSubtotal: number;
  ceiling: number | null;
  differenceFromCeiling: number | null;
  status: 'over_ceiling' | 'possible_overage' | 'uncertain'
    | 'below_ceiling_provisional' | 'no_approved_progression';
  reasons: string[];
}
export interface PlanningWeekComparison {
  weekStartDate: string;
  evidenceStatus: 'partial_records' | 'athlete_attested_not_provider_verified';
  comparisons: TrainingDimensionComparison[];
  unresolvedActivities: string[];
  anyOverage: boolean;
  anyUnknown: boolean;
  message: string;
}
export function comparePlannedWeekWithFrozenLimits(
  evidence: TrainingWeekEvidence,
  allowance: FrozenTrainingAllowance,
): PlanningWeekComparison {
  if (evidence.weekStartDate !== allowance.planningWeekStart
    || evidence.timezone !== allowance.timezone) {
    throw new Error('Cannot compare a plan to an allowance for another week or time zone.');
  }
  const unresolved = [...evidence.sourceConflicts,
    ...evidence.unresolvedRecords.map(issue => issue.recordId + ': ' + issue.reason)];
  const ambiguous = evidence.sourceConflicts.length > 0
    || evidence.unresolvedRecords.some(issue => /duplicate|overlap/i.test(issue.reason));
  const issuesByDimension = {
    running_distance: evidence.unresolvedRecords.some(issue =>
      /running distance/i.test(issue.reason)),
    cycling_duration: evidence.unresolvedRecords.some(issue =>
      /duration/i.test(issue.reason))
      && evidence.plannedOrCompleted.cyclingMinutes >= 0,
    combined_duration: evidence.unresolvedRecords.some(issue =>
      /duration/i.test(issue.reason)),
  };
  const dimensions: Array<{
    key: TrainingDimensionComparison['dimension'];
    subtotal: number; ceiling: number | null; unit: 'km' | 'min';
  }> = [
    { key: 'running_distance', subtotal: evidence.plannedOrCompleted.runDistanceKm,
      ceiling: allowance.runDistanceCapKm, unit: 'km' },
    { key: 'cycling_duration', subtotal: evidence.plannedOrCompleted.cyclingMinutes,
      ceiling: allowance.cyclingMinutesCap, unit: 'min' },
    { key: 'combined_duration', subtotal: evidence.plannedOrCompleted.combinedMinutes,
      ceiling: allowance.combinedMinutesCap, unit: 'min' },
  ];
  const comparisons: TrainingDimensionComparison[] = dimensions.map(item => {
    const reasons: string[] = [];
    const missingFields = issuesByDimension[item.key];
    const over = item.ceiling != null && item.subtotal > item.ceiling + 1e-9;
    if (ambiguous) reasons.push('Some records may represent duplicate or conflicting sessions.');
    if (missingFields) reasons.push('Some session quantities are unknown or estimated.');
    if (evidence.missingCoverage) reasons.push('All activity sources and rest dates are not provider-verified.');
    if (item.ceiling === null) reasons.push('No approved increase from a zero baseline in this dimension.');
    let status: TrainingDimensionComparison['status'];
    if (item.ceiling === null) status = 'no_approved_progression';
    else if (over) status = ambiguous ? 'possible_overage' : 'over_ceiling';
    else if (missingFields || ambiguous) status = 'uncertain';
    else status = 'below_ceiling_provisional';
    return {
      dimension: item.key, unit: item.unit,
      proposedKnownSubtotal: item.subtotal, ceiling: item.ceiling,
      differenceFromCeiling: item.ceiling == null ? null : item.ceiling - item.subtotal,
      status, reasons,
    };
  });
  return {
    weekStartDate: evidence.weekStartDate,
    evidenceStatus: evidence.missingCoverage ? 'partial_records'
      : 'athlete_attested_not_provider_verified',
    comparisons, unresolvedActivities: unresolved,
    anyOverage: comparisons.some(c => c.status === 'over_ceiling'
      || c.status === 'possible_overage'),
    anyUnknown: comparisons.some(c => c.status === 'uncertain'
      || c.status === 'no_approved_progression' || c.status === 'possible_overage'),
    message: 'Upper planning constraints only; no remaining-minute target or medical clearance. '
      + 'Review unknown workouts and rolling 7-day windows before changing the plan.',
  };
}
