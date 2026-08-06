import type { SeasonAdjustmentProposal, SeasonOperationEvent, SeasonTimeline } from '@circuit/domain';

export interface SeasonCard {
  title: string;
  badge: string;
  body: string;
  actionLabel?: string;
}

export function buildSeasonEventCard(event: SeasonOperationEvent): SeasonCard {
  return {
    title: event.title,
    badge: event.kind.replaceAll('_', ' '),
    body: `${event.startsOn}–${event.endsOn} · ${event.severity.replaceAll('_', ' ')}`,
    actionLabel: 'Review event',
  };
}

export function buildSeasonTimelineCards(timeline: SeasonTimeline): SeasonCard[] {
  return timeline.events.map(buildSeasonEventCard);
}

export function buildSeasonAdjustmentCard(proposal: SeasonAdjustmentProposal): SeasonCard {
  return {
    title: 'Season adjustment',
    badge: proposal.requiresAthleteApproval ? 'Approval needed' : 'No change needed',
    body: proposal.explanation.join(' '),
    actionLabel: proposal.requiresAthleteApproval ? 'Review changes' : undefined,
  };
}
