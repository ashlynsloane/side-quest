import type { PostSessionCoachSummary, SessionReadinessAssessment } from '@circuit/domain';

export interface SessionCoachCard {
  title: string;
  badge: string;
  body: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
}

export function buildSessionReadinessCard(assessment: SessionReadinessAssessment): SessionCoachCard {
  return {
    title: assessment.headline,
    badge: assessment.requiresClinicalReview ? 'Review needed' : 'Before you start',
    body: assessment.reasons.join(' '),
    primaryActionLabel: assessment.recommendation === 'proceed' ? 'Start session' : 'Review options',
    secondaryActionLabel: 'Why?',
  };
}

export function buildPostSessionCoachCard(summary: PostSessionCoachSummary): SessionCoachCard {
  return {
    title: summary.headline,
    badge: 'After your session',
    body: summary.observations.join(' '),
    primaryActionLabel: summary.nextAction === 'offer_plan_change' ? 'Review plan options' : summary.nextAction === 'clinical_review' ? 'Review guidance' : undefined,
    secondaryActionLabel: 'Done',
  };
}
