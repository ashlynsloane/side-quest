import type { CoachDecisionRecord } from '@circuit/domain';
import { evaluateDecisionOutcome } from '@circuit/planner';

export interface CoachDecisionCard {
  decisionId: string;
  title: string;
  recommendation?: string;
  athleteChoice?: string;
  confidence: string;
  reviewState: CoachDecisionRecord['reviewState'];
}

export interface CoachDecisionTimelineItem {
  occurredAt: string;
  label: string;
  detail: string;
}

export interface CoachDecisionOutcomeSummary {
  decisionId: string;
  observations: string[];
  eligibleForLearning: boolean;
}

export interface CoachLearningExplanation {
  decisionId: string;
  preferenceSignals: string[];
  complianceSignals: string[];
  modelSignals: string[];
  confidence?: string;
  safeguards: string[];
}

export function buildCoachDecisionCard(record: CoachDecisionRecord): CoachDecisionCard {
  return {
    decisionId: record.decisionId,
    title: record.explanation.headline,
    recommendation: record.options.find((option) => option.optionId === record.recommendedOptionId)?.label,
    athleteChoice: record.options.find((option) => option.optionId === record.selection?.selectedOptionId)?.label,
    confidence: record.explanation.confidence,
    reviewState: record.reviewState,
  };
}

export function buildDecisionTimeline(record: CoachDecisionRecord): CoachDecisionTimelineItem[] {
  const items: CoachDecisionTimelineItem[] = [{ occurredAt: record.createdAt, label: 'Recommendation created', detail: record.explanation.headline }];
  if (record.selection) items.push({ occurredAt: record.selection.selectedAt, label: 'Athlete decision', detail: record.selection.kind });
  if (record.outcome) items.push({ occurredAt: record.outcome.observedAt, label: 'Outcome observed', detail: evaluateDecisionOutcome(record).join(' ') });
  return items;
}

export function buildDecisionOutcomeSummary(record: CoachDecisionRecord): CoachDecisionOutcomeSummary {
  return { decisionId: record.decisionId, observations: evaluateDecisionOutcome(record), eligibleForLearning: record.learning?.eligibleForLearning ?? false };
}

export function buildCoachLearningExplanation(record: CoachDecisionRecord): CoachLearningExplanation {
  return {
    decisionId: record.decisionId,
    preferenceSignals: record.learning?.preferenceSignals ?? [],
    complianceSignals: record.learning?.complianceSignals ?? [],
    modelSignals: record.learning?.modelSignals ?? [],
    confidence: record.learning?.confidence,
    safeguards: record.learning?.safeguards ?? ['No learning result has been approved for this decision.'],
  };
}
