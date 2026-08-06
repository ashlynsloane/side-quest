import type {
  CoachPolicyEvaluation,
  CoachPolicyExperiment,
  CoachPolicyPerformanceSummary,
  CoachPolicyPromotionDecision,
} from '@circuit/domain';

export interface CoachPolicyEvaluationCard {
  id: string;
  title: string;
  status: CoachPolicyEvaluation['state'];
  baselineScenarioId: string;
  shadowScenarioId: string;
  currentInfluence: 'none' | 'bounded';
  explanation: string[];
}

export interface CoachPolicyPerformanceCard {
  policyRuleId: string;
  comparableWeeks: number;
  beneficial: number;
  neutral: number;
  harmful: number;
  inconclusive: number;
  evidenceQuality: CoachPolicyPerformanceSummary['evidenceQuality'];
  contextCoverage: CoachPolicyPerformanceSummary['contextCoverage'];
}

export interface CoachPolicyExperimentCard {
  id: string;
  hypothesis: string;
  status: CoachPolicyExperiment['status'];
  requiresConsent: boolean;
  stopConditions: string[];
}

export function buildPolicyEvaluationCard(evaluation: CoachPolicyEvaluation): CoachPolicyEvaluationCard {
  return {
    id: evaluation.evaluationId,
    title: 'How this coaching rule is performing',
    status: evaluation.state,
    baselineScenarioId: evaluation.baselinePrediction.scenarioId,
    shadowScenarioId: evaluation.shadowPrediction.scenarioId,
    currentInfluence: evaluation.state === 'promoted' ? 'bounded' : 'none',
    explanation: [...evaluation.comparison.comparabilityReasons],
  };
}

export function buildPolicyPerformanceCard(summary: CoachPolicyPerformanceSummary): CoachPolicyPerformanceCard {
  return {
    policyRuleId: summary.policyRuleId,
    comparableWeeks: summary.comparableOutcomeCount,
    beneficial: summary.beneficialCount,
    neutral: summary.neutralCount,
    harmful: summary.harmfulCount,
    inconclusive: summary.inconclusiveCount,
    evidenceQuality: summary.evidenceQuality,
    contextCoverage: summary.contextCoverage,
  };
}

export function buildPolicyExperimentCard(experiment: CoachPolicyExperiment): CoachPolicyExperimentCard {
  return {
    id: experiment.experimentId,
    hypothesis: experiment.hypothesis,
    status: experiment.status,
    requiresConsent: !experiment.athleteConsent,
    stopConditions: [...experiment.stopConditions],
  };
}

export function buildPolicyPromotionNotice(decision: CoachPolicyPromotionDecision): string[] {
  return [
    decision.eligible ? 'This rule is eligible for bounded promotion.' : 'This rule remains in shadow evaluation.',
    ...decision.reasons,
  ];
}
