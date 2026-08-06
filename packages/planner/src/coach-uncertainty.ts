import type {
  CoachDecisionStability,
  CoachEvidenceConflict,
  CoachEvidenceUpdateTrigger,
  CoachInformationGap,
  CoachRecommendationStrength,
  CoachUncertaintyAssessment,
  CoachUncertaintyDimension,
  CoachUncertaintyExplanation,
  CoachUncertaintyLevel,
  CoachUncertaintySource,
} from '@circuit/domain';

const severity: Record<CoachUncertaintyLevel, number> = {
  very_low: 0,
  low: 1,
  moderate: 2,
  high: 3,
  very_high: 4,
  unknown: 5,
};

export function identifyUncertaintySources(input: {
  dimensions: CoachUncertaintyDimension[];
  conflicts?: CoachEvidenceConflict[];
  informationGaps?: CoachInformationGap[];
}): CoachUncertaintySource[] {
  const sources: CoachUncertaintySource[] = [];
  for (const dimension of input.dimensions) {
    if (severity[dimension.level] < severity.moderate) continue;
    sources.push({
      sourceId: `dimension:${dimension.kind}`,
      kind: dimension.kind === 'context' ? 'context_mismatch' : dimension.kind === 'model' ? 'model_disagreement' : dimension.kind === 'outcome' ? 'outcome_variability' : 'missing_data',
      level: dimension.level,
      description: dimension.reasons.join(' ') || `${dimension.kind} uncertainty is ${dimension.level}.`,
      evidenceIds: [...dimension.evidenceIds],
      resolvable: dimension.kind !== 'outcome',
    });
  }
  for (const conflict of input.conflicts ?? []) {
    sources.push({
      sourceId: `conflict:${conflict.conflictId}`,
      kind: 'conflicting_evidence',
      level: conflict.material ? 'high' : 'moderate',
      description: conflict.description,
      evidenceIds: [...conflict.evidenceIds],
      resolvable: true,
    });
  }
  for (const gap of input.informationGaps ?? []) {
    if (!gap.materialToDecision) continue;
    sources.push({
      sourceId: `gap:${gap.gapId}`,
      kind: 'missing_data',
      level: gap.couldChangeRecommendation ? 'high' : 'moderate',
      description: gap.description,
      evidenceIds: [],
      resolvable: gap.requestFromAthlete,
    });
  }
  return sources;
}

export function detectEvidenceConflicts(input: Array<{ id: string; conclusion: 'favor' | 'oppose' | 'neutral'; description: string }>): CoachEvidenceConflict[] {
  const favor = input.filter((item) => item.conclusion === 'favor');
  const oppose = input.filter((item) => item.conclusion === 'oppose');
  if (favor.length === 0 || oppose.length === 0) return [];
  return [{
    conflictId: `conflict:${[...favor, ...oppose].map((item) => item.id).sort().join(':')}`,
    evidenceIds: [...favor, ...oppose].map((item) => item.id),
    description: `Supporting and opposing evidence are both present: ${[...favor, ...oppose].map((item) => item.description).join('; ')}`,
    material: true,
    preserved: true,
  }];
}

export function detectInformationGaps(input: Array<{ field: string; observed: boolean; materialToDecision: boolean; couldChangeRecommendation: boolean; description?: string }>): CoachInformationGap[] {
  return input.filter((item) => !item.observed).map((item) => ({
    gapId: `gap:${item.field}`,
    field: item.field,
    description: item.description ?? `${item.field} is not currently known.`,
    materialToDecision: item.materialToDecision,
    couldChangeRecommendation: item.couldChangeRecommendation,
    requestFromAthlete: item.materialToDecision && item.couldChangeRecommendation,
  }));
}

export function evaluateDecisionStability(input: {
  baselineRecommendation: string;
  alternativeRecommendations: string[];
  blockingSafetyRule?: boolean;
}): CoachDecisionStability {
  const changed = input.alternativeRecommendations.some((item) => item !== input.baselineRecommendation);
  const stable = input.blockingSafetyRule === true || !changed;
  return {
    stable,
    testedAlternatives: input.alternativeRecommendations.length,
    recommendationChanged: changed,
    reasons: input.blockingSafetyRule ? ['A binding safety rule keeps the decision stable.'] : stable ? ['Reasonable evidence variations preserve the recommendation.'] : ['Reasonable evidence variations produce different recommendations.'],
    requiresAthleteConfirmation: !stable,
  };
}

export function classifyRecommendationStrength(input: {
  dimensions: CoachUncertaintyDimension[];
  conflicts: CoachEvidenceConflict[];
  stability: CoachDecisionStability;
  safetyProhibitsAction?: boolean;
}): CoachRecommendationStrength {
  if (input.safetyProhibitsAction) return 'do_not_recommend';
  const worst = input.dimensions.reduce<CoachUncertaintyLevel>((current, item) => severity[item.level] > severity[current] ? item.level : current, 'very_low');
  if (worst === 'unknown' || worst === 'very_high') return 'insufficient_evidence';
  if (!input.stability.stable || input.conflicts.some((item) => item.material)) return 'tentative';
  if (worst === 'high') return 'tentative';
  if (worst === 'moderate') return 'moderate';
  return 'strong';
}

export function determineEvidenceUpdateTriggers(gaps: CoachInformationGap[]): CoachEvidenceUpdateTrigger[] {
  return gaps.filter((gap) => gap.materialToDecision && gap.couldChangeRecommendation).map((gap) => ({
    triggerId: `trigger:${gap.gapId}`,
    field: gap.field,
    condition: `${gap.field} becomes available or changes materially`,
    reason: gap.description,
  }));
}

export function buildUncertaintyExplanation(input: {
  strength: CoachRecommendationStrength;
  sources: CoachUncertaintySource[];
  conflicts: CoachEvidenceConflict[];
  gaps: CoachInformationGap[];
  stability: CoachDecisionStability;
}): CoachUncertaintyExplanation {
  const label = input.strength.replaceAll('_', ' ');
  return {
    headline: `${label.charAt(0).toUpperCase()}${label.slice(1)} recommendation`,
    summary: [
      ...input.sources.slice(0, 3).map((source) => source.description),
      ...input.stability.reasons,
    ],
    conflicts: input.conflicts.map((item) => item.description),
    missingInformation: input.gaps.filter((gap) => gap.materialToDecision).map((gap) => gap.description),
    whatWouldChangeThis: input.gaps.filter((gap) => gap.couldChangeRecommendation).map((gap) => `New information about ${gap.field} could change this recommendation.`),
    avoidsNumericPrecision: true,
  };
}

export function applyUncertaintyGuardrails(input: {
  strength: CoachRecommendationStrength;
  stability: CoachDecisionStability;
  governanceApproved: boolean;
  bindingSafetyRule?: boolean;
}): { automaticPlanChangeAllowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.governanceApproved) reasons.push('Existing governance has not approved the action.');
  if (!input.stability.stable) reasons.push('The decision is unstable and requires athlete confirmation.');
  if (input.strength === 'tentative' || input.strength === 'insufficient_evidence') reasons.push('Recommendation strength is too low for an automatic plan change.');
  if (input.strength === 'do_not_recommend') reasons.push('The action is prohibited by a safety or authority rule.');
  if (input.bindingSafetyRule) reasons.push('Binding safety restrictions remain authoritative regardless of uncertainty.');
  return { automaticPlanChangeAllowed: reasons.length === 0 && (input.strength === 'strong' || input.strength === 'moderate'), reasons };
}

export function assessCoachUncertainty(input: {
  assessmentId: string;
  recommendationId: string;
  dimensions: CoachUncertaintyDimension[];
  evidence: Array<{ id: string; conclusion: 'favor' | 'oppose' | 'neutral'; description: string }>;
  candidateGaps: Array<{ field: string; observed: boolean; materialToDecision: boolean; couldChangeRecommendation: boolean; description?: string }>;
  baselineRecommendation: string;
  alternativeRecommendations: string[];
  governanceApproved: boolean;
  safetyProhibitsAction?: boolean;
  bindingSafetyRule?: boolean;
}): CoachUncertaintyAssessment {
  const conflicts = detectEvidenceConflicts(input.evidence);
  const informationGaps = detectInformationGaps(input.candidateGaps);
  const stability = evaluateDecisionStability({ baselineRecommendation: input.baselineRecommendation, alternativeRecommendations: input.alternativeRecommendations, blockingSafetyRule: input.bindingSafetyRule });
  const sources = identifyUncertaintySources({ dimensions: input.dimensions, conflicts, informationGaps });
  const recommendationStrength = classifyRecommendationStrength({ dimensions: input.dimensions, conflicts, stability, safetyProhibitsAction: input.safetyProhibitsAction });
  const updateTriggers = determineEvidenceUpdateTriggers(informationGaps);
  const explanation = buildUncertaintyExplanation({ strength: recommendationStrength, sources, conflicts, gaps: informationGaps, stability });
  const guardrails = applyUncertaintyGuardrails({ strength: recommendationStrength, stability, governanceApproved: input.governanceApproved, bindingSafetyRule: input.bindingSafetyRule });
  return {
    assessmentId: input.assessmentId,
    recommendationId: input.recommendationId,
    dimensions: input.dimensions.map((item) => ({ ...item, reasons: [...item.reasons], evidenceIds: [...item.evidenceIds] })),
    sources,
    conflicts,
    informationGaps,
    stability,
    recommendationStrength,
    updateTriggers,
    explanation: { ...explanation, summary: [...explanation.summary, ...guardrails.reasons] },
    automaticPlanChangeAllowed: guardrails.automaticPlanChangeAllowed,
    governanceRequired: true,
    auditable: true,
  };
}
