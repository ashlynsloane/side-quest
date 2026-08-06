import type {
  CoachingStrategyOutcome,
  LongitudinalAssociation,
  LongitudinalConfidence,
  LongitudinalOutcomeWindow,
  OutcomeComparator,
  OutcomeDrift,
  OutcomeTrajectory,
  StrategyOutcomeEvidence,
  StrategyPerformanceReport,
  TrainingBlock,
  TrainingBlockContext,
  TrainingBlockMetric,
  TrainingBlockOutcome,
} from '@circuit/domain';

const DAY = 86_400_000;
const weekCount = { rolling_4_week: 4, rolling_8_week: 8, rolling_12_week: 12 } as const;

export function createLongitudinalOutcomeWindow(input: {
  windowId: string;
  kind: LongitudinalOutcomeWindow['kind'];
  endAt: string;
  startAt?: string;
}): LongitudinalOutcomeWindow {
  const end = new Date(input.endAt);
  if (Number.isNaN(end.getTime())) throw new Error('Invalid longitudinal window end date.');
  const weeks = input.kind in weekCount ? weekCount[input.kind as keyof typeof weekCount] : undefined;
  const start = input.startAt ? new Date(input.startAt) : weeks ? new Date(end.getTime() - weeks * 7 * DAY) : undefined;
  if (!start || Number.isNaN(start.getTime())) throw new Error('Custom and macrocycle windows require a valid start date.');
  if (start >= end) throw new Error('Longitudinal window start must precede end.');
  return { windowId: input.windowId, kind: input.kind, startAt: start.toISOString(), endAt: end.toISOString(), bounded: true };
}

export function createTrainingBlock(input: Omit<TrainingBlock, 'excluded' | 'exclusionReasons'> & { exclusionReasons?: string[] }): TrainingBlock {
  const reasons = input.exclusionReasons ?? [];
  return { ...input, excluded: reasons.length > 0, exclusionReasons: reasons };
}

export function summarizeTrainingBlock(block: TrainingBlock): TrainingBlockOutcome {
  const observed = block.metrics.filter((metric) => metric.observed);
  const completeness = block.metrics.length === 0 ? 0 : observed.length / block.metrics.length;
  return {
    blockId: block.blockId,
    dimensions: block.metrics,
    completeness,
    confidence: confidenceFromCount(observed.length, completeness),
  };
}

export function compareTrainingBlocks(current: TrainingBlock, comparison: TrainingBlock): OutcomeComparator {
  const reasons: string[] = [];
  if (current.excluded || comparison.excluded) reasons.push('One or both blocks are excluded.');
  for (const key of ['phase', 'goal', 'raceDistance', 'injuryState'] as const) {
    const left = current.context[key];
    const right = comparison.context[key];
    if (left && right && left !== right) reasons.push(`${key} differs.`);
  }
  const currentDays = durationDays(current.window);
  const comparisonDays = durationDays(comparison.window);
  if (Math.abs(currentDays - comparisonDays) > 8) reasons.push('Outcome windows are materially different lengths.');
  return { currentBlockId: current.blockId, comparisonBlockId: comparison.blockId, comparable: reasons.length === 0, reasons };
}

export function computeStrategyOutcomes(input: {
  strategyId: string;
  blocks: TrainingBlock[];
  associationForBlock: (block: TrainingBlock) => LongitudinalAssociation;
}): CoachingStrategyOutcome {
  const evidence: StrategyOutcomeEvidence[] = input.blocks.map((block) => {
    const comparable = !block.excluded;
    const association = comparable ? input.associationForBlock(block) : 'not_comparable';
    return {
      evidenceId: `${input.strategyId}:${block.blockId}`,
      strategyId: input.strategyId,
      blockId: block.blockId,
      association,
      comparable,
      observedOnly: true,
      sourceIds: [...block.decisionIds],
      notes: comparable ? ['Observed longitudinal association; not a causal estimate.'] : [...block.exclusionReasons],
    };
  });
  const comparable = evidence.filter((item) => item.comparable);
  const count = (association: LongitudinalAssociation) => comparable.filter((item) => item.association === association).length;
  return {
    strategyId: input.strategyId,
    comparableBlocks: comparable.length,
    positiveBlocks: count('positive'),
    neutralBlocks: count('neutral'),
    negativeBlocks: count('negative'),
    inconclusiveBlocks: count('inconclusive'),
    confidence: confidenceFromCount(comparable.length, comparable.length / Math.max(1, evidence.length)),
    applicableContexts: input.blocks.filter((block) => !block.excluded).map((block) => block.context),
    evidence,
  };
}

export function evaluateStrategyTrajectory(metricKey: string, blocks: TrainingBlock[]): OutcomeTrajectory {
  const points = blocks.map((block) => {
    const metric = block.metrics.find((candidate) => candidate.key === metricKey);
    return { blockId: block.blockId, value: metric?.value, direction: metric?.direction ?? 'insufficient_evidence' as const };
  });
  const observed = points.filter((point) => typeof point.value === 'number');
  let overallDirection: OutcomeTrajectory['overallDirection'] = 'insufficient_evidence';
  if (observed.length >= 2) {
    const delta = observed[observed.length - 1]!.value! - observed[0]!.value!;
    overallDirection = Math.abs(delta) < 0.01 ? 'stable' : delta > 0 ? 'improving' : 'declining';
  }
  return { metricKey, points, overallDirection };
}

export function detectOutcomeDrift(strategy: CoachingStrategyOutcome): OutcomeDrift {
  const comparable = strategy.evidence.filter((item) => item.comparable && item.association !== 'inconclusive');
  const midpoint = Math.floor(comparable.length / 2);
  const previous = dominantAssociation(comparable.slice(0, midpoint));
  const current = dominantAssociation(comparable.slice(midpoint));
  const detected = Boolean(previous && current && previous !== current);
  return {
    strategyId: strategy.strategyId,
    detected,
    previousAssociation: previous,
    currentAssociation: current,
    reasons: detected ? [`Observed association changed from ${previous} to ${current}.`] : [],
  };
}

export function updateLongitudinalEvidence(existing: StrategyOutcomeEvidence[], additions: StrategyOutcomeEvidence[]): StrategyOutcomeEvidence[] {
  const byId = new Map(existing.map((item) => [item.evidenceId, item]));
  for (const item of additions) byId.set(item.evidenceId, item);
  return [...byId.values()];
}

export function generateOutcomeReport(input: {
  strategy: CoachingStrategyOutcome;
  trajectories: OutcomeTrajectory[];
}): StrategyPerformanceReport {
  const drift = detectOutcomeDrift(input.strategy);
  return {
    strategy: input.strategy,
    trajectories: input.trajectories,
    drift,
    limitations: [
      'Associations are observational and do not establish causality.',
      'Missing data and context mismatch reduce confidence.',
      'Longitudinal evidence cannot bypass athlete, clinician, or governance authority.',
    ],
    explanation: buildOutcomeExplanation(input.strategy, drift),
    causalClaimAllowed: false,
    auditable: true,
  };
}

export function buildOutcomeExplanation(strategy: CoachingStrategyOutcome, drift = detectOutcomeDrift(strategy)): string[] {
  const lines = [
    `${strategy.comparableBlocks} comparable training blocks contributed evidence.`,
    `${strategy.positiveBlocks} positive, ${strategy.neutralBlocks} neutral, ${strategy.negativeBlocks} negative, and ${strategy.inconclusiveBlocks} inconclusive associations were observed.`,
    `Confidence is ${strategy.confidence}.`,
    'This is an observed association, not a causal claim.',
  ];
  if (drift.detected) lines.push(...drift.reasons);
  return lines;
}

function durationDays(window: LongitudinalOutcomeWindow): number {
  return (new Date(window.endAt).getTime() - new Date(window.startAt).getTime()) / DAY;
}

function confidenceFromCount(count: number, completeness: number): LongitudinalConfidence {
  if (count >= 8 && completeness >= 0.8) return 'high';
  if (count >= 3 && completeness >= 0.5) return 'medium';
  return 'low';
}

function dominantAssociation(evidence: StrategyOutcomeEvidence[]): LongitudinalAssociation | undefined {
  if (evidence.length === 0) return undefined;
  const candidates: LongitudinalAssociation[] = ['positive', 'neutral', 'negative'];
  return candidates.sort((a, b) => evidence.filter((item) => item.association === b).length - evidence.filter((item) => item.association === a).length)[0];
}

export function comparableContext(context: TrainingBlockContext): string {
  return [context.phase, context.goal, context.raceDistance, context.injuryState].filter(Boolean).join('|');
}

export function observedMetric(key: string, value: number, sourceIds: string[] = []): TrainingBlockMetric {
  return { key, value, observed: true, sourceIds };
}
