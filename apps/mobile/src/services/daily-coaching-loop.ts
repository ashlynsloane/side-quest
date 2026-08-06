import type { AdaptiveCheckIn, DailyCoachBrief, DailyCoachDecision, DailyCoachSession } from '@circuit/domain';

export interface DailyCoachCard {
  title: string;
  badge?: string;
  body: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
}

export function buildMorningBriefCard(brief: DailyCoachBrief): DailyCoachCard {
  return { title: brief.headline, badge: 'Today', body: brief.summary.join(' '), primaryActionLabel: brief.pendingDecisionIds.length ? 'Review decisions' : undefined, secondaryActionLabel: 'See today' };
}

export function buildDailyPriorityCards(brief: DailyCoachBrief): DailyCoachCard[] {
  return brief.priorities.map((priority) => ({ title: priority.headline, badge: priority.protected ? 'Stays here' : 'Priority', body: priority.rationale, primaryActionLabel: priority.sessionId ? 'View session' : undefined }));
}

export function buildPendingDailyDecisionCard(decision: DailyCoachDecision): DailyCoachCard {
  return { title: decision.headline, badge: decision.status === 'pending_athlete' ? 'Your decision' : decision.status.replaceAll('_',' '), body: decision.explanation.join(' '), primaryActionLabel: decision.options.length ? 'Compare options' : undefined, secondaryActionLabel: 'Why?' };
}

export function buildAdaptiveCheckInCard(checkIn: AdaptiveCheckIn): DailyCoachCard {
  return { title: checkIn.prompt, badge: checkIn.requiredBeforeDecision ? 'Needed now' : 'Quick check-in', body: checkIn.reason, primaryActionLabel: 'Answer' };
}

export function buildTodayTimelineSections(input: { brief: DailyCoachBrief; sessions: DailyCoachSession[]; decisions: DailyCoachDecision[]; checkIns: AdaptiveCheckIn[] }): Array<{ id: string; title: string; cards: DailyCoachCard[] }> {
  return [
    { id: 'brief', title: 'Morning brief', cards: [buildMorningBriefCard(input.brief)] },
    { id: 'priorities', title: 'Today\'s priorities', cards: buildDailyPriorityCards(input.brief) },
    { id: 'decisions', title: 'Pending decisions', cards: input.decisions.map(buildPendingDailyDecisionCard) },
    { id: 'check-ins', title: 'Check-ins', cards: input.checkIns.map(buildAdaptiveCheckInCard) },
  ].filter((section) => section.cards.length > 0);
}
