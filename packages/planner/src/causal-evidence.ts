import type {
  CausalAssumption,
  CausalEffectEstimate,
  CausalEvidenceAssessment,
  CausalEvidenceStrength,
  CausalQuestion,
  CausalThreat,
  MatchedTrainingBlockPair,
  TrainingBlock,
} from '@circuit/domain';

export function createCausalQuestion(input: CausalQuestion): CausalQuestion {
  if (input.outcomeKeys.length === 0) throw new Error('A causal question requires at least one outcome.');
  return { ...input, outcomeKeys: [...new Set(input.outcomeKeys)] };
}

export function screenCausalAssumptions(input: {
  assumptions: CausalAssumption[];
  threats: CausalThreat[];
}): { assumptionsSatisfied: boolean; blockingThreats: CausalThreat[] } {
  const assumptionsSatisfied = input.assumptions.every((item) => item.satisfied === true);
  const blockingThreats = input.threats.filter((item) => item.severity === 'high' && !item.mitigated);
  return { assumptionsSatisfied, blockingThreats };
}

export function matchComparableTrainingBlocks(input: {
  exposed: TrainingBlock[];
  comparisons: TrainingBlock[];
  minimumScore?: number;
}): MatchedTrainingBlockPair[] {
  const minimumScore = input.minimumScore ?? 0.75;
  const unused = new Set(input.comparisons.map((block) => block.blockId));
  const pairs: MatchedTrainingBlockPair[] = [];
  for (const exposed of input.exposed) {
    const candidates = input.comparisons
      .filter((candidate) => unused.has(candidate.blockId))
      .map((candidate) => ({ candidate, ...contextMatch(exposed, candidate) }))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (!best) continue;
    const comparable = best.score >= minimumScore && !exposed.excluded && !best.candidate.excluded;
    pairs.push({
      pairId: `${exposed.blockId}:${best.candidate.blockId}`,
      exposedBlockId: exposed.blockId,
      comparisonBlockId: best.candidate.blockId,
      method: best.score === 1 ? 'exact_context_match' : 'nearest_context_match',
      matchScore: best.score,
      comparable,
      mismatchReasons: comparable ? best.reasons : [...best.reasons, 'Match quality did not satisfy the causal evidence threshold.'],
    });
    if (comparable) unused.delete(best.candidate.blockId);
  }
  return pairs;
}

export function estimateMatchedOutcomeDifference(input: {
  question: CausalQuestion;
  outcomeKey: string;
  pairs: MatchedTrainingBlockPair[];
  blocks: TrainingBlock[];
}): CausalEffectEstimate {
  const byId = new Map(input.blocks.map((block) => [block.blockId, block]));
  const differences: number[] = [];
  const usedPairs: string[] = [];
  for (const pair of input.pairs.filter((item) => item.comparable)) {
    const exposed = byId.get(pair.exposedBlockId)?.metrics.find((metric) => metric.key === input.outcomeKey && metric.observed)?.value;
    const comparison = byId.get(pair.comparisonBlockId)?.metrics.find((metric) => metric.key === input.outcomeKey && metric.observed)?.value;
    if (typeof exposed === 'number' && typeof comparison === 'number') {
      differences.push(exposed - comparison);
      usedPairs.push(pair.pairId);
    }
  }
  const mean = differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : undefined;
  const direction = mean === undefined ? 'indeterminate' : Math.abs(mean) < 0.01 ? 'neutral' : mean > 0 ? 'beneficial' : 'harmful';
  return {
    estimateId: `${input.question.questionId}:${input.outcomeKey}`,
    questionId: input.question.questionId,
    outcomeKey: input.outcomeKey,
    direction,
    standardizedDifference: mean,
    uncertainty: usedPairs.length >= 6 ? 'high' : 'very_high',
    evidenceStrength: evidenceStrengthFromPairs(usedPairs.length),
    causalClaimAllowed: false,
    pairIds: usedPairs,
    limitations: [
      'This matched observational estimate does not establish causality.',
      'Unmeasured and time-varying confounding may remain.',
      'The estimate cannot independently change plans or promote coaching policies.',
    ],
  };
}

export function assessCausalEvidence(input: {
  assessmentId: string;
  question: CausalQuestion;
  assumptions: CausalAssumption[];
  threats: CausalThreat[];
  matchedPairs: MatchedTrainingBlockPair[];
  estimates: CausalEffectEstimate[];
}): CausalEvidenceAssessment {
  const screening = screenCausalAssumptions(input);
  const usablePairs = input.matchedPairs.filter((pair) => pair.comparable).length;
  const evidenceStrength = minimumStrength(input.estimates.map((estimate) => estimate.evidenceStrength));
  const promotionBlocked = !screening.assumptionsSatisfied || screening.blockingThreats.length > 0 || usablePairs < 3;
  const status = promotionBlocked
    ? usablePairs === 0 ? 'insufficient_evidence' : 'screened'
    : input.estimates.some((estimate) => estimate.direction === 'beneficial') ? 'supported' : 'weakened';
  return {
    assessmentId: input.assessmentId,
    question: input.question,
    assumptions: input.assumptions,
    threats: input.threats,
    matchedPairs: input.matchedPairs,
    estimates: input.estimates,
    status,
    evidenceStrength,
    promotionBlocked,
    explanation: buildCausalEvidenceExplanation({ usablePairs, evidenceStrength, promotionBlocked, blockingThreats: screening.blockingThreats }),
    auditable: true,
  };
}

export function buildCausalEvidenceExplanation(input: {
  usablePairs: number;
  evidenceStrength: CausalEvidenceStrength;
  promotionBlocked: boolean;
  blockingThreats: CausalThreat[];
}): string[] {
  const lines = [
    `${input.usablePairs} matched within-athlete block pairs were usable.`,
    `Causal evidence strength is ${input.evidenceStrength}.`,
    'Results remain observational and must not be described as proof of causality.',
    'Causal evidence cannot bypass athlete, clinician, safety, or governance authority.',
  ];
  if (input.blockingThreats.length) lines.push(`${input.blockingThreats.length} unresolved high-severity causal threat(s) remain.`);
  if (input.promotionBlocked) lines.push('Automatic policy promotion is blocked.');
  return lines;
}

function contextMatch(left: TrainingBlock, right: TrainingBlock): { score: number; reasons: string[] } {
  const scalarKeys = ['phase', 'goal', 'raceDistance', 'injuryState', 'experienceLevel'] as const;
  let compared = 0;
  let matches = 0;
  const reasons: string[] = [];

  for (const key of scalarKeys) {
    const a = left.context[key];
    const b = right.context[key];
    if (a === undefined && b === undefined) continue;
    compared += 1;
    if (a === b) matches += 1;
    else reasons.push(`${key} differs.`);
  }

  const leftConstraints = normalizeContextValues(left.context.scheduleConstraints);
  const rightConstraints = normalizeContextValues(right.context.scheduleConstraints);
  if (leftConstraints.length > 0 || rightConstraints.length > 0) {
    compared += 1;
    if (arraysEqual(leftConstraints, rightConstraints)) matches += 1;
    else reasons.push('scheduleConstraints differ.');
  }

  return { score: compared === 0 ? 0 : matches / compared, reasons };
}

function normalizeContextValues(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function evidenceStrengthFromPairs(count: number): CausalEvidenceStrength {
  if (count >= 12) return 'moderate';
  if (count >= 6) return 'low';
  if (count >= 3) return 'very_low';
  return 'none';
}

function minimumStrength(values: CausalEvidenceStrength[]): CausalEvidenceStrength {
  const order: CausalEvidenceStrength[] = ['none', 'very_low', 'low', 'moderate'];
  if (values.length === 0) return 'none';
  return values.reduce((minimum, value) => order.indexOf(value) < order.indexOf(minimum) ? value : minimum, 'moderate');
}
