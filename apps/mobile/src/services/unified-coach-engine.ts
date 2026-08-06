import type { UnifiedCoachEngineResult } from '@circuit/domain';

export interface UnifiedCoachCard {
  tone: 'stable' | 'attention' | 'safety';
  eyebrow: string;
  title: string;
  body: string;
  decisionCount: number;
  requiresApproval: boolean;
  bullets: string[];
}

export function buildUnifiedCoachCard(result: UnifiedCoachEngineResult): UnifiedCoachCard {
  const tone = result.status === 'safety_hold' ? 'safety' : result.status === 'stable' ? 'stable' : 'attention';
  return {
    tone,
    eyebrow: 'Side Quest Coach',
    title: result.status === 'stable' ? 'Your plan still fits' : result.status === 'safety_hold' ? 'Pause and review' : 'A plan adjustment is ready',
    body: result.coachSummary[0] ?? 'The coach combined recovery, calendar, goal, and training-block context.',
    decisionCount: result.decisions.length,
    requiresApproval: result.requiresAthleteApproval,
    bullets: result.decisions.slice(0, 3).map((decision) => decision.explanation),
  };
}
