import type { CalendarAdjustmentProposal, CalendarIntelligenceResult } from '@circuit/domain';

export interface CalendarCoachCard {
  title: string;
  body: string;
  confidence: string;
  approvalRequired: boolean;
}

function proposalBody(proposal: CalendarAdjustmentProposal): string {
  if (proposal.action === 'move') return `Move to ${proposal.proposedStartsAt}. ${proposal.reasons.join(' ')}`;
  if (proposal.action === 'shorten') return `Use a ${proposal.proposedDurationMinutes}-minute version. ${proposal.reasons.join(' ')}`;
  if (proposal.action === 'remove') return `Skip this supporting session. ${proposal.reasons.join(' ')}`;
  return proposal.reasons.join(' ');
}

export function calendarCoachCards(result: CalendarIntelligenceResult): CalendarCoachCard[] {
  return result.proposals.map((proposal) => ({
    title: proposal.action === 'keep' ? 'Protected session' : 'Calendar adjustment',
    body: proposalBody(proposal),
    confidence: proposal.confidence,
    approvalRequired: proposal.requiresAthleteApproval,
  }));
}
