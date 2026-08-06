import type { MultiWeekOptimizationProposal } from '@circuit/domain';

export interface MultiWeekOptimizationCoachCard {
  title: string;
  body: string;
  confidence: string;
  approvalRequired: boolean;
  recommendedCandidateId: string;
}

export function multiWeekOptimizationCoachCard(
  proposal: MultiWeekOptimizationProposal,
): MultiWeekOptimizationCoachCard {
  const evaluation = proposal.evaluations.find((item) => item.candidateId === proposal.recommendedCandidateId);
  return {
    title: 'Training block proposal',
    body: [
      ...proposal.reasons,
      evaluation ? `Whole-block score: ${evaluation.totalScore}.` : '',
      'Review the affected weeks before applying this proposal.',
    ].filter(Boolean).join(' '),
    confidence: proposal.confidence,
    approvalRequired: proposal.requiresAthleteApproval,
    recommendedCandidateId: proposal.recommendedCandidateId,
  };
}
