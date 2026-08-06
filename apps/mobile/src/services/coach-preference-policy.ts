import type { CoachPreferencePolicyResult } from '@circuit/domain';

export interface CoachControlCard {
  title: string;
  summary: string;
  automaticCount: number;
  approvalCount: number;
  reviewCount: number;
  blockedCount: number;
  autonomyLabel: string;
  safeguards: string[];
}

export function buildCoachControlCard(result: CoachPreferencePolicyResult): CoachControlCard {
  const autonomyLabel = result.autonomyLevel === 'advisory_only'
    ? 'Recommendations only'
    : result.autonomyLevel === 'ask_before_changes'
      ? 'Ask before changes'
      : 'Minor changes allowed';
  const automaticCount = result.allowedDecisionIds.length;
  const approvalCount = result.approvalRequiredDecisionIds.length;
  const reviewCount = result.reviewOnlyDecisionIds.length;
  const blockedCount = result.blockedDecisionIds.length;
  return {
    title: 'Coach controls',
    summary: automaticCount
      ? `${automaticCount} bounded ${automaticCount === 1 ? 'change is' : 'changes are'} within your current settings.`
      : approvalCount || reviewCount
        ? 'Current recommendations are waiting for your review.'
        : blockedCount
          ? 'Current recommendations conflict with your coaching settings.'
          : 'No coach decisions need attention.',
    automaticCount, approvalCount, reviewCount, blockedCount, autonomyLabel, safeguards: result.safeguards,
  };
}
