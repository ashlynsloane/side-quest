import type { BodyRegion } from '@circuit/domain';

export type RegionalStrengthStatusKind =
  | 'strength_opportunity'
  | 'sport_loaded_strength_needed'
  | 'on_plan'
  | 'recently_loaded'
  | 'review_before_loading'
  | 'restricted'
  | 'not_targeted';

export type RegionalSportDemandBand =
  | 'insufficient_history'
  | 'low'
  | 'typical'
  | 'above_usual'
  | 'much_above_usual';

export type RegionalRecoveryContext =
  | 'likely_ready'
  | 'recently_loaded'
  | 'recovery_uncertain'
  | 'review_before_loading'
  | 'restricted';

export type RegionalStatusConfidence = 'low' | 'moderate' | 'high';

export interface RegionalStatusInput {
  region: BodyRegion;
  plannedExposures: number;
  completedExposures: number;
  currentSportLoad: number;
  baselineSportLoad: number;
  baselineHistoryDays: number;
  recentDirectAt?: string;
  recentSportAt?: string;
  readinessBand?: 'ready' | 'steady' | 'reduced' | 'recover';
  muscleFreshness?: number;
  painSeverity?: number;
  restricted?: boolean;
  restrictionReason?: string;
  now?: string;
}

export interface RegionalStatusResult {
  region: BodyRegion;
  status: RegionalStrengthStatusKind;
  statusLabel: string;
  statusColor: string;
  plannedExposures: number;
  completedExposures: number;
  remainingExposures: number;
  coverageLabel: string;
  sportDemand: RegionalSportDemandBand;
  sportDemandLabel: string;
  sportDemandRatio?: number;
  recoveryContext: RegionalRecoveryContext;
  recoveryLabel: string;
  recommendation: string;
  explanation: string;
  confidence: RegionalStatusConfidence;
  warning: boolean;
}

const STATUS_COLORS: Record<RegionalStrengthStatusKind, string> = {
  strength_opportunity: '#8E6DB5',
  sport_loaded_strength_needed: '#C6922E',
  on_plan: '#1E6B46',
  recently_loaded: '#4E789B',
  review_before_loading: '#B45D2D',
  restricted: '#A53D45',
  not_targeted: '#AEB8B1',
};

export function classifyRegionalStrengthStatus(input: RegionalStatusInput): RegionalStatusResult {
  const plannedExposures = Math.max(0, Math.round(input.plannedExposures));
  const completedExposures = Math.max(0, Math.round(input.completedExposures));
  const remainingExposures = Math.max(0, plannedExposures - completedExposures);
  const sport = classifySportDemand(input.currentSportLoad, input.baselineSportLoad, input.baselineHistoryDays);
  const recovery = classifyRecoveryContext(input, sport.band);

  let status: RegionalStrengthStatusKind;
  if (input.restricted || recovery === 'restricted') {
    status = 'restricted';
  } else if (recovery === 'review_before_loading') {
    status = 'review_before_loading';
  } else if (plannedExposures === 0) {
    status = recovery === 'recently_loaded' || recovery === 'recovery_uncertain' || sport.band === 'much_above_usual'
      ? 'recently_loaded'
      : 'not_targeted';
  } else if (remainingExposures > 0) {
    status = sport.band === 'above_usual' || sport.band === 'much_above_usual' || isRecent(input.recentSportAt, input.now, 48)
      ? 'sport_loaded_strength_needed'
      : 'strength_opportunity';
  } else if (recovery === 'recently_loaded' || recovery === 'recovery_uncertain' || sport.band === 'above_usual' || sport.band === 'much_above_usual') {
    status = 'recently_loaded';
  } else {
    status = 'on_plan';
  }

  const coverageLabel = plannedExposures > 0
    ? `${completedExposures} of ${plannedExposures} planned direct-strength exposure${plannedExposures === 1 ? '' : 's'} completed`
    : completedExposures > 0
      ? `${completedExposures} unplanned direct-strength exposure${completedExposures === 1 ? '' : 's'} completed`
      : 'No direct-strength target in the current training week';

  const statusLabel = statusLabelFor(status);
  const recommendation = recommendationFor(status, remainingExposures, input.restrictionReason);
  const explanation = explanationFor(status, coverageLabel, sport.label, recoveryLabelFor(recovery));
  const confidence = confidenceFor(input, sport.band, recovery);

  return {
    region: input.region,
    status,
    statusLabel,
    statusColor: STATUS_COLORS[status],
    plannedExposures,
    completedExposures,
    remainingExposures,
    coverageLabel,
    sportDemand: sport.band,
    sportDemandLabel: sport.label,
    sportDemandRatio: sport.ratio,
    recoveryContext: recovery,
    recoveryLabel: recoveryLabelFor(recovery),
    recommendation,
    explanation,
    confidence,
    warning: status === 'review_before_loading' || status === 'restricted',
  };
}

export function classifySportDemand(
  currentSportLoad: number,
  baselineWeeklyLoad: number,
  baselineHistoryDays: number,
): { band: RegionalSportDemandBand; label: string; ratio?: number } {
  const current = Math.max(0, currentSportLoad);
  const baseline = Math.max(0, baselineWeeklyLoad);
  if (baselineHistoryDays < 14 || baseline < 0.05) {
    return current > 0
      ? { band: 'insufficient_history', label: 'Not enough personal history for comparison' }
      : { band: 'low', label: 'Low recent sport demand' };
  }
  const ratio = current / baseline;
  if (ratio < 0.65) return { band: 'low', label: 'Lower than usual for you', ratio };
  if (ratio <= 1.35) return { band: 'typical', label: 'Typical for you', ratio };
  if (ratio <= 2) return { band: 'above_usual', label: 'Above usual for you', ratio };
  return { band: 'much_above_usual', label: 'Much above usual for you', ratio };
}

function classifyRecoveryContext(
  input: RegionalStatusInput,
  sportDemand: RegionalSportDemandBand,
): RegionalRecoveryContext {
  if (input.restricted) return 'restricted';
  if ((input.painSeverity ?? 0) >= 3 || input.readinessBand === 'recover' || (input.muscleFreshness ?? 5) <= 1) {
    return 'review_before_loading';
  }
  if ((input.painSeverity ?? 0) >= 1 || input.readinessBand === 'reduced' || (input.muscleFreshness ?? 5) === 2) {
    return 'recovery_uncertain';
  }
  if (
    isRecent(input.recentDirectAt, input.now, 48)
    || isRecent(input.recentSportAt, input.now, 36)
    || sportDemand === 'much_above_usual'
  ) {
    return 'recently_loaded';
  }
  return 'likely_ready';
}

function confidenceFor(
  input: RegionalStatusInput,
  sportDemand: RegionalSportDemandBand,
  recovery: RegionalRecoveryContext,
): RegionalStatusConfidence {
  if (input.restricted || (input.painSeverity ?? 0) >= 1 || recovery === 'restricted' || recovery === 'review_before_loading') return 'high';
  if (sportDemand === 'insufficient_history' || input.readinessBand === undefined) return 'low';
  return 'moderate';
}

function statusLabelFor(status: RegionalStrengthStatusKind): string {
  switch (status) {
    case 'strength_opportunity': return 'Strength opportunity';
    case 'sport_loaded_strength_needed': return 'Sport-loaded, strength still needed';
    case 'on_plan': return 'On plan';
    case 'recently_loaded': return 'Recently loaded';
    case 'review_before_loading': return 'Review before loading';
    case 'restricted': return 'Restricted';
    case 'not_targeted': return 'Not targeted this week';
  }
}

function recoveryLabelFor(context: RegionalRecoveryContext): string {
  switch (context) {
    case 'likely_ready': return 'No current recovery concern detected';
    case 'recently_loaded': return 'Recently loaded';
    case 'recovery_uncertain': return 'Recovery uncertain';
    case 'review_before_loading': return 'Review before additional loading';
    case 'restricted': return 'Active restriction';
  }
}

function recommendationFor(
  status: RegionalStrengthStatusKind,
  remaining: number,
  restrictionReason?: string,
): string {
  switch (status) {
    case 'strength_opportunity':
      return `Complete ${remaining} remaining planned direct-strength exposure${remaining === 1 ? '' : 's'} if today's check-in remains stable.`;
    case 'sport_loaded_strength_needed':
      return `Retain the planned direct-strength stimulus. Adjust total volume only if readiness or symptoms are reduced; sport load cannot erase a direct-strength gap.`;
    case 'on_plan':
      return 'The current training-week strength target has been met. Continue the approved plan rather than adding work only to balance the map.';
    case 'recently_loaded':
      return 'Keep the planned stimulus when appropriate, but use today’s readiness and symptoms to decide whether the full or reduced dose fits.';
    case 'review_before_loading':
      return 'Review symptoms and readiness before adding more high-load work. Side Quest does not diagnose injury or prove recovery.';
    case 'restricted':
      return restrictionReason
        ? `Follow the active restriction: ${restrictionReason}`
        : 'Do not add loading that conflicts with the active restriction.';
    case 'not_targeted':
      return 'No universal body-part quota is applied. This region is not a direct-strength target in the current training week.';
  }
}

function explanationFor(
  status: RegionalStrengthStatusKind,
  coverage: string,
  sport: string,
  recovery: string,
): string {
  if (status === 'not_targeted') return `${coverage}. Sport demand: ${sport}. Recovery context: ${recovery}.`;
  return `${coverage}. Sport demand: ${sport}. Recovery context: ${recovery}.`;
}

function isRecent(value: string | undefined, now: string | undefined, hours: number): boolean {
  if (!value) return false;
  const reference = now ? new Date(now).getTime() : Date.now();
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return reference - timestamp >= 0 && reference - timestamp <= hours * 3_600_000;
}
