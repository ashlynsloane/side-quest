import type { UnifiedAdaptivePlanningDecision } from '@circuit/domain';

export interface UnifiedCoachCard {
  title: string;
  focus: string;
  confidenceLabel: string;
  notes: string[];
  showWhyPlanChanged: boolean;
}

export function buildUnifiedCoachCard(decision: UnifiedAdaptivePlanningDecision): UnifiedCoachCard {
  return {
    title: decision.headline,
    focus: decision.focus,
    confidenceLabel: `${decision.confidence[0].toUpperCase()}${decision.confidence.slice(1)} confidence`,
    notes: decision.coachNotes,
    showWhyPlanChanged: decision.evidence.length > 0 || decision.overriddenAlternatives.length > 0,
  };
}

export function buildWhyPlanChanged(decision: UnifiedAdaptivePlanningDecision): string[] {
  return [
    ...decision.evidence.map((item) => item.summary),
    ...decision.overriddenAlternatives,
  ];
}
