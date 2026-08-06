import type { CoachDecisionReassessment } from '@circuit/domain';

export interface CoachDecisionReviewCard {
  title: string;
  body: string;
  status: CoachDecisionReassessment['freshness'];
  action: string;
}

export interface CoachDecisionUpdateCard {
  title: string;
  updates: string[];
  technicalDetailsAvailable: boolean;
}

export function createCoachDecisionReviewCard(
  reassessment: CoachDecisionReassessment,
): CoachDecisionReviewCard {
  const title = reassessment.freshness === 'current'
    ? 'This recommendation is still current'
    : reassessment.freshness === 'review_due'
      ? 'Time to reassess'
      : reassessment.freshness === 'stale'
        ? 'This recommendation has expired'
        : 'Your situation changed';

  return {
    title,
    body: reassessment.explanation[0] ?? 'No reassessment explanation is available.',
    status: reassessment.freshness,
    action: reassessment.fullRecomputationRequired
      ? 'Re-run the coaching decision with current information.'
      : reassessment.athleteConfirmationRequired
        ? 'Confirm before applying a change.'
        : 'No action is needed.',
  };
}

export function createCoachDecisionUpdateCard(
  reassessment: CoachDecisionReassessment,
): CoachDecisionUpdateCard {
  return {
    title: 'What changed',
    updates: reassessment.explanation.slice(1),
    technicalDetailsAvailable: reassessment.provenance.length > 0,
  };
}
