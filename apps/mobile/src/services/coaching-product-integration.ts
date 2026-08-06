import type {
  ExecutablePlanChangeSet,
  PlanChangeApplicationResult,
  PlanChangePreview,
} from '@circuit/domain';

export interface CoachingActionCard {
  title: string;
  badge: string;
  body: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  destructiveActionLabel?: string;
}

export function buildPlanChangePreviewCard(preview: PlanChangePreview): CoachingActionCard {
  return {
    title: preview.headline,
    badge: preview.blockedActionIds.length ? 'Blocked' : preview.requiresAthleteApproval ? 'Your approval' : 'Ready',
    body: preview.summary.join(' '),
    primaryActionLabel: preview.blockedActionIds.length ? 'Resolve conflict' : preview.requiresAthleteApproval ? 'Approve changes' : 'Apply update',
    secondaryActionLabel: 'See plan difference',
    destructiveActionLabel: preview.requiresAthleteApproval ? 'Keep current plan' : undefined,
  };
}

export function buildAppliedPlanChangeCard(
  changeSet: ExecutablePlanChangeSet,
  result: PlanChangeApplicationResult,
): CoachingActionCard {
  return {
    title: result.status === 'applied' ? 'Plan updated' : result.status === 'already_applied' ? 'Already updated' : 'Plan unchanged',
    badge: result.status.replaceAll('_', ' '),
    body: result.explanation.join(' '),
    primaryActionLabel: result.undoToken ? 'Undo update' : undefined,
    secondaryActionLabel: 'View decision',
    destructiveActionLabel: result.status === 'blocked' ? 'Dismiss' : undefined,
  };
}

export function buildTodayCoachActionCard(changeSet: ExecutablePlanChangeSet): CoachingActionCard {
  const changedCount = changeSet.actions.filter((action) => action.kind !== 'preserve_session').length;
  return {
    title: changeSet.blockedReasons.length ? 'Your plan needs input' : 'A plan update is ready',
    badge: changeSet.blockedReasons.length ? 'Conflict' : `${changedCount} change${changedCount === 1 ? '' : 's'}`,
    body: changeSet.blockedReasons.length
      ? changeSet.blockedReasons.join(' ')
      : 'Review exactly what will move, change, or stay protected before anything is applied.',
    primaryActionLabel: 'Review update',
  };
}
