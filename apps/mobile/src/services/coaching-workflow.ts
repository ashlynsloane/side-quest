import type { CoachingWorkflowInbox, ProtectedRecurringCommitment, ScheduleProtectionResult } from '@circuit/domain';

export interface CoachingInboxCard {
  title: string;
  badge: string;
  body: string;
  actionLabel?: string;
}

export function buildCoachingInboxCards(inbox: CoachingWorkflowInbox): CoachingInboxCard[] {
  return inbox.items.map((item) => ({
    title: item.title,
    badge: item.athleteActionRequired ? 'Action needed' : item.status.replaceAll('_', ' '),
    body: item.summary,
    actionLabel: item.athleteActionRequired ? 'Review' : undefined,
  }));
}

export function buildProtectedCommitmentCard(commitment: ProtectedRecurringCommitment): CoachingInboxCard {
  return {
    title: commitment.title,
    badge: commitment.immovable ? 'Stays here' : 'Preferred time',
    body: `${commitment.localStartTime} · ${commitment.durationMinutes} min · ${commitment.timezone}`,
    actionLabel: 'Edit commitment',
  };
}

export function buildScheduleConflictCard(result: ScheduleProtectionResult): CoachingInboxCard | undefined {
  if (result.allowed && result.conflicts.length === 0) return undefined;
  return {
    title: result.allowed ? 'Schedule overlap' : 'Protected time conflict',
    badge: result.allowed ? 'Review' : 'Cannot schedule',
    body: result.explanation.join(' '),
    actionLabel: result.requiresAthleteOverride ? 'Choose another time' : 'Review options',
  };
}
