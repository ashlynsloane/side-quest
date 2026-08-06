import type { CoachAttentionQueueResult } from '@circuit/domain';

export interface CoachAttentionCard {
  title: string;
  summary: string;
  immediateCount: number;
  todayCount: number;
  laterCount: number;
  informationalCount: number;
  nextPromptAt?: string;
  primaryItemTitle?: string;
  primaryItemSummary?: string;
  safeguards: string[];
}

export function buildCoachAttentionCard(result: CoachAttentionQueueResult): CoachAttentionCard {
  const primary = result.items.find((item) => item.timing === 'now')
    ?? result.items.find((item) => item.timing === 'today')
    ?? result.items[0];
  const immediateCount = result.immediateItemIds.length;
  const todayCount = result.todayItemIds.length;
  const laterCount = result.deferredItemIds.length;
  const informationalCount = result.informationalItemIds.length;
  return {
    title: 'Coach attention',
    summary: immediateCount
      ? `${immediateCount} ${immediateCount === 1 ? 'decision needs' : 'decisions need'} attention now.`
      : todayCount
        ? `${todayCount} ${todayCount === 1 ? 'decision is' : 'decisions are'} grouped for review today.`
        : laterCount
          ? 'Lower-priority coaching is available when you are ready.'
          : informationalCount
            ? 'Coach updates are available, with no action required.'
            : 'No coach decisions need attention.',
    immediateCount,
    todayCount,
    laterCount,
    informationalCount,
    nextPromptAt: result.nextPromptAt,
    primaryItemTitle: primary?.title,
    primaryItemSummary: primary?.summary,
    safeguards: result.safeguards,
  };
}
