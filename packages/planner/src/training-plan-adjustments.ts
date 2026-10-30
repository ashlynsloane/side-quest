import type { TrainingCalendarEvent } from '@circuit/domain';
import {
  type FrozenTrainingAllowance, type TrainingExposureRecord,
} from './experimental-training-guardrails';
import { buildTrainingWeekEvidence } from './core-training-week-evidence';
import {
  comparePlannedWeekWithFrozenLimits, type PlanningWeekComparison,
} from './training-week-comparison';

export type PlanAdjustmentAction = 'shorten_20_percent' | 'defer';
export type PlanAdjustmentDecision = 'accepted' | 'declined' | 'restored';
export interface PlanAdjustmentEvent {
  id: string;
  sourceEventId: string;
  sourceSignature: string;
  action: PlanAdjustmentAction;
  decision: PlanAdjustmentDecision;
  proposedMinutes: number | null;
  createdAt: string;
}
export interface PlanAdjustmentCandidate {
  id: string;
  eventId: string;
  localDate: string;
  sport: 'run' | 'bike' | 'swim';
  title: string;
  currentMinutes: number;
  proposedMinutes: number | null;
  action: PlanAdjustmentAction;
  current: PlanningWeekComparison;
  preview: PlanningWeekComparison;
  summary: string;
}
export interface PlanAdjustmentPreview {
  weekStartDate: string;
  eligibleForProposal: boolean;
  explanations: string[];
  current: PlanningWeekComparison;
  candidates: PlanAdjustmentCandidate[];
  exposureSignature: string;
}
const SOURCE = 'Calendar: side_quest_generated_plan';

export function rawGeneratedEventSignature(event: TrainingCalendarEvent): string {
  return JSON.stringify([
    1, event.id, event.sourceId, event.title, event.startAt, event.endAt ?? null,
    event.allDay, event.discipline ?? null, event.description ?? null,
  ]);
}
export function planExposureSignature(records: TrainingExposureRecord[]): string {
  return JSON.stringify(records.map(record => [
    record.recordId, record.canonicalActivityId, record.localDate, record.sport,
    record.status, record.durationMinutes, record.runDistanceKm ?? null,
    record.linkedPlanRecordId ?? null, Boolean(record.possibleDuplicate),
    Boolean(record.crossesLocalMidnight), record.source,
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
export function applyAcceptedPlanAdjustments(
  rawEvents: TrainingCalendarEvent[], decisions: PlanAdjustmentEvent[],
): { events: TrainingCalendarEvent[]; staleEventIds: string[] } {
  const latest = new Map<string, PlanAdjustmentEvent>();
  // Caller supplies in chronological order; stable order for identical timestamps.
  for (const decision of decisions) latest.set(decision.sourceEventId, decision);
  const staleEventIds: string[] = [];
  const events: TrainingCalendarEvent[] = [];
  for (const event of rawEvents) {
    const decision = latest.get(event.id);
    if (!decision || decision.decision !== 'accepted') {
      events.push(event);
      continue;
    }
    if (event.sourceId !== 'side_quest_generated_plan'
      || rawGeneratedEventSignature(event) !== decision.sourceSignature) {
      staleEventIds.push(event.id);
      events.push(event);
      continue;
    }
    if (decision.action === 'defer') continue;
    if (decision.action === 'shorten_20_percent' &&
      decision.proposedMinutes != null && decision.proposedMinutes > 0) {
      // Never edit the raw generator event. Overlay only its displayed/planned dose.
      const base = event.description ?? '';
      const duration = decision.proposedMinutes;
      events.push({
        ...event,
        endAt: new Date(Date.parse(event.startAt) + duration * 60000).toISOString(),
        description: base.replace(/Side Quest generated · \d+ min/,
          'Side Quest generated · ' + duration + ' min')
          + '\nAthlete-approved time adjustment (original plan retained in source).',
      });
    } else {
      staleEventIds.push(event.id);
      events.push(event);
    }
  }
  return { events, staleEventIds };
}

export function buildPlanAdjustmentPreview(input: {
  weekStartDate: string;
  timezone: string;
  allowance: FrozenTrainingAllowance;
  records: TrainingExposureRecord[];
  todayLocalDate: string;
  eligible: boolean;
}): PlanAdjustmentPreview {
  const evidence = buildTrainingWeekEvidence({
    weekStartDate: input.weekStartDate,
    timezone: input.timezone,
    plannedAndCompleted: input.records,
    coverage: 'unverified',
  });
  const current = comparePlannedWeekWithFrozenLimits(evidence, input.allowance);
  const reasons: string[] = [];
  if (!input.eligible) reasons.push('The frozen baseline is not active or an interruption requires review.');
  if (evidence.sourceConflicts.length) {
    reasons.push('Reconcile probable duplicate or unlinked source records before adjusting the plan.');
  }
  if (!current.anyOverage) reasons.push('No numerical overage is established; no training reduction is suggested.');
  const eligibleForProposal = input.eligible && evidence.sourceConflicts.length === 0
    && current.anyOverage;
  const candidates: PlanAdjustmentCandidate[] = [];
  if (eligibleForProposal) {
    for (const record of input.records) {
      if (record.source !== SOURCE || record.status !== 'planned'
        || record.localDate < input.todayLocalDate
        || !['run', 'bike', 'swim'].includes(record.sport)
        || record.durationMinutes == null || !Number.isFinite(record.durationMinutes)
        || record.durationMinutes < 20 || record.possibleDuplicate
        || record.crossesLocalMidnight) continue;
      const runCheck = current.comparisons.find(c => c.dimension === 'running_distance');
      const bikeCheck = current.comparisons.find(c => c.dimension === 'cycling_duration');
      const combinedCheck = current.comparisons.find(c => c.dimension === 'combined_duration');
      const relevant = (record.sport === 'run'
        && (runCheck?.status === 'over_ceiling' || runCheck?.status === 'possible_overage'))
        || (record.sport === 'bike'
        && (bikeCheck?.status === 'over_ceiling' || bikeCheck?.status === 'possible_overage'))
        || combinedCheck?.status === 'over_ceiling'
        || combinedCheck?.status === 'possible_overage';
      if (!relevant) continue;
      for (const action of ['shorten_20_percent', 'defer'] as const) {
        const minutes = action === 'defer'
          ? null : Math.max(10, Math.floor(record.durationMinutes * 0.8));
        if (minutes !== null && minutes >= record.durationMinutes) continue;
        const changed = input.records.flatMap(row => {
          if (row.recordId !== record.recordId) return [row];
          if (minutes === null) return [];
          return [{ ...row, durationMinutes: minutes }];
        });
        const previewEvidence = buildTrainingWeekEvidence({
          weekStartDate: input.weekStartDate,
          timezone: input.timezone,
          plannedAndCompleted: changed,
          coverage: 'unverified',
        });
        const preview = comparePlannedWeekWithFrozenLimits(previewEvidence, input.allowance);
        candidates.push({
          id: record.recordId + ':' + action,
          eventId: record.recordId.slice('calendar:'.length),
          localDate: record.localDate,
          sport: record.sport as PlanAdjustmentCandidate['sport'],
          title: record.recordId,
          currentMinutes: record.durationMinutes,
          proposedMinutes: minutes, action, current, preview,
          summary: minutes === null
            ? 'Defer this generated session; preserve the original plan in the audit.'
            : 'Reduce this planned session by ' + (record.durationMinutes - minutes)
              + ' minutes. This changes time, not clinical permission or running distance.',
        });
      }
    }
  }
  return {
    weekStartDate: input.weekStartDate,
    eligibleForProposal,
    explanations: reasons,
    current, candidates,
    exposureSignature: planExposureSignature(input.records),
  };
}
