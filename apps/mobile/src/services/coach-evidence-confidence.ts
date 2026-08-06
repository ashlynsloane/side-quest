import type {
  CoachDecisionExplanation,
  CoachEvidenceConfidenceInput,
  CoachEvidenceConfidenceResult,
} from '@circuit/domain';
import { buildCoachEvidenceConfidence } from '@circuit/planner';

export interface CoachEvidenceCard {
  decisionId: string;
  title: string;
  recommendation: string;
  confidenceLabel: string;
  confidencePercent: number;
  why: string[];
  missingEvidenceCount: number;
  rejectedAlternatives: string[];
}

export function buildCoachEvidenceResult(
  input: CoachEvidenceConfidenceInput,
): CoachEvidenceConfidenceResult {
  return buildCoachEvidenceConfidence(input);
}

export function buildCoachEvidenceCard(
  explanation: CoachDecisionExplanation,
  style: 'concise' | 'detailed' = 'concise',
): CoachEvidenceCard {
  return {
    decisionId: explanation.decisionId,
    title: explanation.title,
    recommendation: explanation.recommendation,
    confidenceLabel: explanation.confidence.label,
    confidencePercent: Math.round(explanation.confidence.score * 100),
    why: style === 'detailed' ? explanation.detailedWhy : explanation.conciseWhy,
    missingEvidenceCount: explanation.confidence.missingEvidenceCount,
    rejectedAlternatives: explanation.rejectedAlternatives,
  };
}
