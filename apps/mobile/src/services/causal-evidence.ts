import type { CausalEvidenceAssessment, CausalEffectEstimate, CausalThreat } from '@circuit/domain';

export interface CausalEvidenceCard {
  title: string;
  summary: string;
  evidenceLabel: string;
  blocked: boolean;
  limitations: string[];
}

export interface CausalThreatCard {
  title: string;
  severity: CausalThreat['severity'];
  resolved: boolean;
}

export interface MatchedComparisonCard {
  matchedPairs: number;
  exactMatches: number;
  nearestMatches: number;
  note: string;
}

export function toCausalEvidenceCard(assessment: CausalEvidenceAssessment): CausalEvidenceCard {
  return {
    title: 'What may be helping',
    summary: assessment.explanation.join(' '),
    evidenceLabel: `Evidence: ${assessment.evidenceStrength.replace('_', ' ')}`,
    blocked: assessment.promotionBlocked,
    limitations: [
      'Matched observational evidence only; this does not establish causality.',
      ...assessment.estimates.flatMap((estimate: CausalEffectEstimate) => estimate.limitations),
    ],
  };
}

export function toCausalThreatCards(threats: CausalThreat[]): CausalThreatCard[] {
  return threats.map((threat) => ({ title: threat.description, severity: threat.severity, resolved: threat.mitigated }));
}

export function toMatchedComparisonCard(assessment: CausalEvidenceAssessment): MatchedComparisonCard {
  const usable = assessment.matchedPairs.filter((pair) => pair.comparable);
  return {
    matchedPairs: usable.length,
    exactMatches: usable.filter((pair) => pair.method === 'exact_context_match').length,
    nearestMatches: usable.filter((pair) => pair.method === 'nearest_context_match').length,
    note: 'Comparisons are screened for context similarity and remain observational.',
  };
}
