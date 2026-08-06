import type {
  StrengthLoadBaseline,
  StrengthLoadDecision,
  StrengthSessionResponse,
  StrengthTrainingConsistency,
  StrengthTrainingHistoryEntry,
} from '@circuit/domain';
import { evaluateStrengthLoad } from '@circuit/planner';

export function baselineFromOnboarding({
  consistencyLastSixWeeks,
  desiredSessionsPerWeek,
  assessedAt = new Date().toISOString(),
}: {
  consistencyLastSixWeeks: StrengthTrainingConsistency;
  desiredSessionsPerWeek: number;
  assessedAt?: string;
}): StrengthLoadBaseline {
  const establishedSessionsPerWeek = consistencyLastSixWeeks === 'none' ? 0
    : consistencyLastSixWeeks === 'occasional' ? 0.5
      : consistencyLastSixWeeks === 'one_per_week' ? 1
        : consistencyLastSixWeeks === 'two_per_week' ? 2
          : 3;
  return {
    consistencyLastSixWeeks,
    establishedSessionsPerWeek,
    desiredSessionsPerWeek: Math.max(1, Math.min(5, Math.round(desiredSessionsPerWeek))),
    assessedAt,
  };
}

export function strengthLoadSummary(decision: StrengthLoadDecision): string {
  if (decision.action === 'restrict') return 'Strength has been reduced to a minimum exposure while your recent response settles.';
  if (decision.action === 'consolidate') return `This week is capped at ${decision.allowedSessions} shorter strength sessions so your current training can be absorbed.`;
  if (decision.action === 'hold') return `This week is capped at ${decision.allowedSessions} strength sessions while frequency tolerance develops.`;
  return `The planned ${decision.allowedSessions} strength sessions fit your established recent tolerance.`;
}

export function makeStrengthLoadDecision({
  requestedSessions,
  weekStartDate,
  baseline,
  history,
  responses,
  rampWeekIndex,
}: {
  requestedSessions: number;
  weekStartDate: string;
  baseline?: StrengthLoadBaseline;
  history?: StrengthTrainingHistoryEntry[];
  responses?: StrengthSessionResponse[];
  rampWeekIndex?: number;
}): StrengthLoadDecision {
  return evaluateStrengthLoad({ requestedSessions, weekStartDate, baseline, history, responses, rampWeekIndex });
}
