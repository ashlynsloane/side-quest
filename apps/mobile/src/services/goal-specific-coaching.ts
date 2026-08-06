import type { GoalSpecificCoachingResult } from '@circuit/domain';

export interface GoalCoachingCard {
  title: string;
  subtitle: string;
  priorities: string[];
  alerts: string[];
  footer: string;
}

export function buildGoalCoachingCard(result: GoalSpecificCoachingResult): GoalCoachingCard {
  const important = result.findings.filter((finding) => finding.severity === 'important');
  return {
    title: result.profile.label,
    subtitle: result.coachSummary[0] ?? 'Goal-specific coaching context',
    priorities: result.profile.disciplinePriorities
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4)
      .map((item) => `${item.discipline}: ${item.rationale}`),
    alerts: important.map((finding) => finding.message),
    footer: 'Any schedule change remains a proposal until you approve it.',
  };
}
