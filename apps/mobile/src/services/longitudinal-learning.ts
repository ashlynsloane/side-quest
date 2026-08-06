import type { StrategyPerformanceReport, TrainingBlock, TrainingBlockOutcome } from '@circuit/domain';

export interface TrainingBlockCard {
  blockId: string;
  title: string;
  confidence: TrainingBlockOutcome['confidence'];
  metrics: Array<{ label: string; status: string }>;
}

export interface StrategyOutcomeCard {
  strategyId: string;
  title: string;
  summary: string;
  confidence: string;
  disclosure: 'Observed association only; this does not establish causality.';
}

export interface OutcomeDriftCard {
  strategyId: string;
  visible: boolean;
  message?: string;
}

export interface LongitudinalSummary {
  blockCards: TrainingBlockCard[];
  strategyCards: StrategyOutcomeCard[];
  driftCards: OutcomeDriftCard[];
  governanceNotice: string;
}

export function buildTrainingBlockCard(block: TrainingBlock, outcome: TrainingBlockOutcome): TrainingBlockCard {
  return {
    blockId: block.blockId,
    title: `${block.window.kind.replaceAll('_', ' ')} training block`,
    confidence: outcome.confidence,
    metrics: outcome.dimensions.map((metric) => ({
      label: metric.key,
      status: metric.direction ?? (metric.observed ? 'observed' : 'missing'),
    })),
  };
}

export function buildStrategyOutcomeCard(report: StrategyPerformanceReport, title = report.strategy.strategyId): StrategyOutcomeCard {
  return {
    strategyId: report.strategy.strategyId,
    title,
    summary: report.explanation.join(' '),
    confidence: report.strategy.confidence,
    disclosure: 'Observed association only; this does not establish causality.',
  };
}

export function buildOutcomeDriftCard(report: StrategyPerformanceReport): OutcomeDriftCard {
  return {
    strategyId: report.strategy.strategyId,
    visible: report.drift.detected,
    message: report.drift.detected ? report.drift.reasons.join(' ') : undefined,
  };
}
