import type { DailyTrainingReview } from './daily-training-review';

/**
 * Conservative, read-only daily coaching interpretation. No mutation, dose
 * prescription, automatic reschedule, or inference of symptom-free readiness.
 * Every suggestion must be explicitly reviewed by the athlete.
 */
export interface DailyFeedbackAdvice {
  kind: 'protect' | 'review' | 'hold' | 'maintain';
  headline: string;
  explanation: string;
  evidence: string[];
  approvalRequired: true;
  autoChangedSessions: 0;
}

export function buildDailyFeedbackAdvice(input: {
  daily: DailyTrainingReview;
  readinessBand: 'ready' | 'steady' | 'reduced' | 'recover' | null;
  /** The latest completed workout feedback from the selected local week. */
  recentDifficulty: 'too_easy' | 'appropriate' | 'too_hard' | null;
  /** Active symptom/rehabilitation restriction, NOT a numerical symptom score. */
  activeRestriction: boolean;
  /** Evidence from sources might be incomplete or ambiguous. */
  historyIncomplete: boolean;
}): DailyFeedbackAdvice {
  const evidence: string[] = [];
  if (input.readinessBand) evidence.push('Readiness: ' + input.readinessBand);
  if (input.recentDifficulty) evidence.push('Recent recorded difficulty: ' + input.recentDifficulty);
  if (input.daily.pastUnverifiedCount > 0) {
    evidence.push(input.daily.pastUnverifiedCount + ' earlier plans without linked completions');
  }
  if (input.activeRestriction) {
    return {
      kind: 'protect',
      headline: 'Review symptom restrictions before training',
      explanation: 'An active symptom restriction takes priority over readiness scores and completion goals. Do not add missed volume or increase loading. Review an appropriate modified or recovery option.',
      evidence: [...evidence, 'Active symptom/restriction check-in'],
      approvalRequired: true, autoChangedSessions: 0,
    };
  }
  if (input.readinessBand === 'recover') {
    return {
      kind: 'protect',
      headline: 'Consider a recovery-focused day',
      explanation: 'Today’s reported readiness is low. Review rest or a reduced session rather than adding volume to catch up. This is not a diagnosis or a clearance decision.',
      evidence, approvalRequired: true, autoChangedSessions: 0,
    };
  }
  if (input.recentDifficulty === 'too_hard' || input.readinessBand === 'reduced') {
    return {
      kind: 'review',
      headline: 'Review the next training dose',
      explanation: 'Recent high difficulty or reduced readiness warrants reviewing the next session before proceeding. Do not increase intensity or volume to recover missed training.',
      evidence, approvalRequired: true, autoChangedSessions: 0,
    };
  }
  if (input.daily.needsSourceReview || input.historyIncomplete ||
    input.daily.pastUnverifiedCount > 0) {
    return {
      kind: 'review',
      headline: 'Reconcile training records first',
      explanation: 'Unmatched earlier plans or incomplete source coverage cannot establish missed training or recovery capacity. Review history before changing the upcoming week.',
      evidence: [...evidence, 'Training record coverage requires review'],
      approvalRequired: true, autoChangedSessions: 0,
    };
  }
  if (!input.readinessBand && !input.recentDifficulty) {
    return {
      kind: 'hold',
      headline: 'More feedback is needed',
      explanation: 'No current readiness or difficulty signal is available. Keep the existing plan visible without inventing a reason to progress.',
      evidence, approvalRequired: true, autoChangedSessions: 0,
    };
  }
  return {
    kind: 'maintain',
    headline: 'Keep the plan under review',
    explanation: 'Available feedback does not establish a reason to alter the existing schedule. Positive readiness or an easy session alone is not permission to increase training.',
    evidence, approvalRequired: true, autoChangedSessions: 0,
  };
}
