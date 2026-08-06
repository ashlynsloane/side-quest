import type { CoachMetaLearningReport, CoachStrategyTransferAssessment } from '@circuit/domain';

export interface CoachTransferCard {
  title: string;
  status: 'Reusable' | 'Adapt first' | 'Retest' | 'Do not transfer';
  body: string;
  requiresConfirmation: boolean;
}

export function buildCoachTransferCard(assessment: CoachStrategyTransferAssessment): CoachTransferCard {
  const status = assessment.recommendation === 'reuse'
    ? 'Reusable'
    : assessment.recommendation === 'adapt'
      ? 'Adapt first'
      : assessment.recommendation === 'retest'
        ? 'Retest'
        : 'Do not transfer';
  return {
    title: 'What worked before?',
    status,
    body: assessment.explanation.join(' '),
    requiresConfirmation: assessment.athleteConfirmationRequired,
  };
}

export function buildCoachMetaLearningSummary(report: CoachMetaLearningReport): string {
  return `${report.reusableStrategyIds.length} strategy or strategies fit the current context; ${report.adaptationRequiredStrategyIds.length} need adaptation or retesting; ${report.blockedStrategyIds.length} are blocked.`;
}
