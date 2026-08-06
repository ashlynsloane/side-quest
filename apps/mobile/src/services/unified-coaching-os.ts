import type { UnifiedCoachingOsDecision, UnifiedCoachSummary } from '@circuit/domain';

export interface UnifiedCoachDecisionCard {
  title: string;
  body: string;
  confidence: string;
  action: string;
  status: UnifiedCoachingOsDecision['disposition'];
}

export interface UnifiedCoachDetailsCard {
  title: string;
  checks: Array<{ label: string; status: string; summary: string }>;
  provenanceCount: number;
}

export function createUnifiedCoachDecisionCard(summary: UnifiedCoachSummary, decision: UnifiedCoachingOsDecision): UnifiedCoachDecisionCard {
  return {
    title: summary.headline,
    body: summary.recommendation ? `${summary.recommendation}. ${summary.reason}` : summary.reason,
    confidence: summary.confidenceLabel,
    action: summary.nextAction,
    status: decision.disposition,
  };
}

export function createUnifiedCoachDetailsCard(decision: UnifiedCoachingOsDecision): UnifiedCoachDetailsCard {
  return {
    title: 'How Side Quest reached this decision',
    checks: decision.stageResults.map((stage) => ({
      label: stage.stage.replaceAll('_', ' '),
      status: stage.status,
      summary: stage.summary,
    })),
    provenanceCount: decision.provenance.length,
  };
}
