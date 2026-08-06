import type {
  AthleteAppealAssessment,
  AthleteDecisionResponse,
  AthleteResponseSummary,
} from '@circuit/domain';
import { buildAthleteResponseSummary } from '@circuit/planner';

export interface AthleteResponseCardModel {
  title: string;
  status: string;
  summary: string;
  nextAction: string;
  rows: string[];
  technicalDetailsAvailable: boolean;
}

export function buildAthleteResponseCard(
  response: AthleteDecisionResponse,
  assessment?: AthleteAppealAssessment,
): AthleteResponseCardModel {
  const summary: AthleteResponseSummary = buildAthleteResponseSummary(response, assessment);
  return {
    title: summary.headline,
    status: summary.status,
    summary: summary.explanation,
    nextAction: summary.nextAction,
    rows: assessment?.explanation ?? response.requestedChanges,
    technicalDetailsAvailable: summary.technicalDetailsAvailable,
  };
}

export function buildAppealStatusCard(assessment: AthleteAppealAssessment): AthleteResponseCardModel {
  return {
    title: 'Appeal status',
    status: assessment.disposition.replaceAll('_', ' '),
    summary: assessment.explanation[0] ?? 'The appeal was reviewed.',
    nextAction: assessment.clinicianReviewRequired
      ? 'Clinician review is required.'
      : assessment.fullReassessmentRequired
        ? 'The coaching decision will be recomputed.'
        : assessment.automaticOverrideAllowed
          ? 'Confirm the eligible alternative.'
          : 'Review available options.',
    rows: assessment.explanation,
    technicalDetailsAvailable: true,
  };
}
