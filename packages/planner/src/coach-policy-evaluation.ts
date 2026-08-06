import type {
  CoachDecisionOutcome,
  CoachPolicyEvaluation,
  CoachPolicyEvaluationContext,
  CoachPolicyExperiment,
  CoachPolicyExperimentArm,
  CoachPolicyOutcomeAssessment,
  CoachPolicyPerformanceSummary,
  CoachPolicyPrediction,
  CoachPolicyPromotionDecision,
  CoachScenarioScore,
  TwinGovernanceState,
} from '@circuit/domain';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function createPolicyEvaluation(input: {
  evaluationId: string;
  policyRuleId: string;
  context: CoachPolicyEvaluationContext;
  baseline: CoachScenarioScore;
  shadow: CoachScenarioScore;
  policyAdjustedScore: number;
  createdAt: string;
}): CoachPolicyEvaluation {
  const baselinePrediction: CoachPolicyPrediction = {
    scenarioId: input.baseline.scenarioId,
    score: input.baseline.utilityScore,
    rank: input.baseline.rank,
    recordedAt: input.createdAt,
  };
  const shadowPrediction: CoachPolicyPrediction = {
    scenarioId: input.shadow.scenarioId,
    score: input.policyAdjustedScore,
    rank: input.shadow.rank,
    recordedAt: input.createdAt,
  };
  return {
    evaluationId: input.evaluationId,
    policyRuleId: input.policyRuleId,
    state: 'shadow',
    context: { ...input.context, contextTags: [...input.context.contextTags] },
    baselinePrediction,
    shadowPrediction,
    comparison: {
      baselineScenarioId: baselinePrediction.scenarioId,
      policyScenarioId: shadowPrediction.scenarioId,
      baselineScore: baselinePrediction.score,
      policyAdjustedScore: shadowPrediction.score,
      policyAdjustment: shadowPrediction.score - input.shadow.utilityScore,
      comparability: 'not_assessable',
      comparabilityReasons: ['Awaiting athlete choice and observed outcome.'],
    },
    outcomes: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    safeguards: [
      'Shadow policies do not alter the displayed recommendation.',
      'Unselected options remain counterfactual and receive no observed-outcome credit.',
      'Missing outcomes remain inconclusive rather than successful.',
      'Policy promotion is bounded, auditable, reversible, and cannot change a plan automatically.',
    ],
  };
}

export function recordShadowPolicyPrediction(
  evaluation: CoachPolicyEvaluation,
  athleteSelectedScenarioId: string | undefined,
  comparableContext: boolean,
  reasons: string[],
  updatedAt: string,
): CoachPolicyEvaluation {
  const selectedPolicy = athleteSelectedScenarioId === evaluation.comparison.policyScenarioId;
  const comparability = !comparableContext
    ? 'not_assessable'
    : selectedPolicy
      ? 'direct'
      : athleteSelectedScenarioId
        ? 'indirect'
        : 'not_assessable';
  return {
    ...evaluation,
    state: 'collecting_evidence',
    comparison: {
      ...evaluation.comparison,
      athleteSelectedScenarioId,
      comparability,
      comparabilityReasons: reasons.length > 0 ? [...reasons] : [
        comparability === 'direct'
          ? 'The athlete selected the option favored by the shadow policy.'
          : comparability === 'indirect'
            ? 'The athlete selected a different option; only preference evidence is available.'
            : 'The decision is not assessable for this policy.',
      ],
    },
    updatedAt,
  };
}

export function assessPolicyOutcome(input: {
  decisionId: string;
  evaluation: CoachPolicyEvaluation;
  outcome?: CoachDecisionOutcome;
  excluded?: boolean;
}): CoachPolicyOutcomeAssessment {
  if (input.excluded) {
    return { decisionId: input.decisionId, classification: 'not_comparable', excluded: true, reasons: ['Decision was excluded from learning.'] };
  }
  if (input.evaluation.comparison.comparability !== 'direct') {
    return {
      decisionId: input.decisionId,
      classification: 'not_comparable',
      selectedScenarioId: input.evaluation.comparison.athleteSelectedScenarioId,
      excluded: false,
      reasons: ['Unselected policy options remain counterfactual and receive no outcome credit.'],
    };
  }
  if (!input.outcome) {
    return {
      decisionId: input.decisionId,
      classification: 'inconclusive',
      selectedScenarioId: input.evaluation.comparison.athleteSelectedScenarioId,
      excluded: false,
      reasons: ['No observed outcome was available.'],
    };
  }
  const harmful = input.outcome.painIncreased === true || input.outcome.requiredAnotherAdjustment === true;
  const beneficial = input.outcome.athleteHelpful === true && input.outcome.painIncreased !== true && input.outcome.protectedSessionCompleted !== false;
  return {
    decisionId: input.decisionId,
    observedAt: input.outcome.observedAt,
    classification: harmful ? 'harmful' : beneficial ? 'beneficial' : 'neutral',
    selectedScenarioId: input.evaluation.comparison.athleteSelectedScenarioId,
    completion: input.outcome.workoutCompleted,
    recoveryAcceptable: input.outcome.sorenessDurationHours === undefined ? undefined : input.outcome.sorenessDurationHours <= 48,
    protectedSessionPreserved: input.outcome.protectedSessionCompleted,
    painIncreased: input.outcome.painIncreased,
    athleteHelpful: input.outcome.athleteHelpful,
    excluded: false,
    reasons: harmful
      ? ['Observed pain or another required adjustment triggered harm review.']
      : beneficial
        ? ['The selected policy option had a favorable observed outcome.']
        : ['The observed outcome was valid but neither clearly beneficial nor harmful.'],
  };
}

export function attachPolicyEvaluationOutcome(
  evaluation: CoachPolicyEvaluation,
  assessment: CoachPolicyOutcomeAssessment,
  updatedAt: string,
): CoachPolicyEvaluation {
  return { ...evaluation, outcomes: [...evaluation.outcomes, assessment], updatedAt };
}

export function comparePolicyAndBaseline(evaluation: CoachPolicyEvaluation): CoachPolicyEvaluation['comparison'] {
  return { ...evaluation.comparison, comparabilityReasons: [...evaluation.comparison.comparabilityReasons] };
}

export function summarizePolicyPerformance(evaluations: CoachPolicyEvaluation[]): CoachPolicyPerformanceSummary {
  const policyRuleId = evaluations[0]?.policyRuleId ?? 'unknown-policy';
  const outcomes = evaluations.flatMap((item) => item.outcomes).filter((item) => !item.excluded && item.classification !== 'not_comparable');
  const comparableOutcomeCount = outcomes.length;
  const beneficialCount = outcomes.filter((item) => item.classification === 'beneficial').length;
  const neutralCount = outcomes.filter((item) => item.classification === 'neutral').length;
  const harmfulCount = outcomes.filter((item) => item.classification === 'harmful').length;
  const inconclusiveCount = outcomes.filter((item) => item.classification === 'inconclusive').length;
  const quality = evaluations.length === 0 ? 0 : evaluations.reduce((sum, item) => sum + clamp01(item.context.evidenceQuality), 0) / evaluations.length;
  return {
    policyRuleId,
    comparableOutcomeCount,
    beneficialCount,
    neutralCount,
    harmfulCount,
    inconclusiveCount,
    contextCoverage: comparableOutcomeCount >= 10 ? 'broad' : comparableOutcomeCount >= 6 ? 'moderate' : 'narrow',
    evidenceQuality: quality >= 0.8 ? 'high' : quality >= 0.5 ? 'moderate' : 'low',
    explanation: [
      `${comparableOutcomeCount} comparable observed outcome(s).`,
      `${beneficialCount} beneficial, ${neutralCount} neutral, ${harmfulCount} harmful, ${inconclusiveCount} inconclusive.`,
    ],
  };
}

export function evaluatePolicyPromotion(
  summary: CoachPolicyPerformanceSummary,
  governance?: TwinGovernanceState,
): CoachPolicyPromotionDecision {
  const driftBlocked = Boolean(governance && (
    governance.frozenParameters.length > 0 ||
    Object.values(governance.drift).some((item) => item && item.reliability !== 'stable')
  ));
  const harmful = summary.harmfulCount > 0;
  const enoughEvidence = summary.comparableOutcomeCount >= 6;
  const consistent = summary.beneficialCount > summary.neutralCount + summary.harmfulCount;
  const eligible = enoughEvidence && consistent && !harmful && !driftBlocked && summary.evidenceQuality !== 'low';
  return {
    policyRuleId: summary.policyRuleId,
    eligible,
    targetState: harmful || driftBlocked ? 'suspended' : eligible ? 'eligible_for_promotion' : 'collecting_evidence',
    boundedInfluence: eligible ? 0.5 : 0,
    reasons: [
      enoughEvidence ? 'Comparable-outcome threshold met.' : 'At least six comparable outcomes are required.',
      harmful ? 'Harmful outcomes suspend promotion.' : 'No harmful outcome blocked promotion.',
      driftBlocked ? 'Digital Twin governance blocked promotion.' : 'No unresolved governance drift blocked promotion.',
      'Any promotion remains bounded and reversible.',
    ],
    reversible: true,
  };
}

export function suspendUnderperformingPolicy(evaluation: CoachPolicyEvaluation, reason: string, updatedAt: string): CoachPolicyEvaluation {
  return { ...evaluation, state: 'suspended', updatedAt, safeguards: [...evaluation.safeguards, `Suspended: ${reason}`] };
}

export function buildPolicyEvaluationExplanation(evaluation: CoachPolicyEvaluation): string[] {
  return [
    `Baseline recommendation: ${evaluation.baselinePrediction.scenarioId}.`,
    `Shadow policy preference: ${evaluation.shadowPrediction.scenarioId}.`,
    `Current influence: ${evaluation.state === 'promoted' ? 'bounded' : 'none'}.`,
    ...evaluation.comparison.comparabilityReasons,
  ];
}

export function createPolicyExperiment(input: {
  experimentId: string;
  policyRuleId: string;
  hypothesis: string;
  contextTags: string[];
  arms: CoachPolicyExperimentArm[];
  athleteConsent: boolean;
  createdAt: string;
  expiresAt: string;
  clinicianRestrictions: string[];
}): CoachPolicyExperiment {
  const unsafeArm = input.arms.some((arm) => arm.prohibited || arm.prohibitionReasons.length > 0);
  const status = unsafeArm ? 'unsafe' : input.athleteConsent ? 'active' : 'awaiting_consent';
  return {
    experimentId: input.experimentId,
    policyRuleId: input.policyRuleId,
    hypothesis: input.hypothesis,
    contextTags: [...input.contextTags],
    arms: input.arms.map((arm) => ({ ...arm, prohibitionReasons: [...arm.prohibitionReasons] })),
    athleteConsent: input.athleteConsent,
    status,
    stopConditions: ['Stop for increased pain, illness, worsening recovery, or athlete withdrawal.'],
    safetyExclusions: [
      ...input.clinicianRestrictions,
      'Clinician restrictions, injury guardrails, and protected-session safety cannot be experiment variables.',
    ],
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}
