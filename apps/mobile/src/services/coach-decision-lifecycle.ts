import type { CoachDecisionLifecycleResult } from '@circuit/domain';

export interface CoachDecisionInboxCard {
  title: string;
  summary: string;
  pendingCount: number;
  acceptedCount: number;
  canApply: boolean;
  canUndo: boolean;
  safeguards: string[];
}

export function buildCoachDecisionInboxCard(result: CoachDecisionLifecycleResult): CoachDecisionInboxCard {
  const acceptedCount = result.actionableDecisionIds.length;
  const appliedCount = result.records.filter((record) => record.status === 'applied').length;
  return {
    title: 'Coach decisions',
    summary: acceptedCount
      ? `${acceptedCount} approved ${acceptedCount === 1 ? 'change is' : 'changes are'} ready to apply.`
      : result.pendingDecisionIds.length
        ? `${result.pendingDecisionIds.length} ${result.pendingDecisionIds.length === 1 ? 'proposal needs' : 'proposals need'} your review.`
        : 'No coach proposal currently needs action.',
    pendingCount: result.pendingDecisionIds.length,
    acceptedCount,
    canApply: acceptedCount > 0,
    canUndo: appliedCount > 0,
    safeguards: result.safeguards,
  };
}
