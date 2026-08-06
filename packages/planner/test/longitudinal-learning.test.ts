import { describe, expect, test } from 'vitest';
import {
  compareTrainingBlocks,
  computeStrategyOutcomes,
  createLongitudinalOutcomeWindow,
  createTrainingBlock,
  detectOutcomeDrift,
  generateOutcomeReport,
  summarizeTrainingBlock,
} from '../src/longitudinal-learning';

const block = (id: string, phase = 'base', excluded = false) => createTrainingBlock({
  blockId: id,
  window: createLongitudinalOutcomeWindow({ windowId: `${id}-window`, kind: 'rolling_4_week', endAt: `2026-0${id === 'a' ? 5 : '6'}-01T00:00:00.000Z` }),
  context: { phase, goal: '70.3' },
  decisionIds: [`decision-${id}`],
  policyIds: ['protect-long-ride'],
  metrics: [{ key: 'recovery', value: id === 'a' ? 1 : 2, observed: true, sourceIds: [`metric-${id}`] }],
  exclusionReasons: excluded ? ['Injury state changed.'] : [],
});

describe('longitudinal outcome learning', () => {
  test('constructs bounded rolling windows', () => {
    const window = createLongitudinalOutcomeWindow({ windowId: 'w', kind: 'rolling_8_week', endAt: '2026-07-01T00:00:00.000Z' });
    expect(window.bounded).toBe(true);
    expect(new Date(window.endAt).getTime() - new Date(window.startAt).getTime()).toBe(56 * 86_400_000);
  });

  test('excludes incomparable training blocks', () => {
    expect(compareTrainingBlocks(block('a'), block('b', 'peak')).comparable).toBe(false);
  });

  test('missing outcomes reduce confidence', () => {
    const empty = createTrainingBlock({ ...block('a'), blockId: 'empty', metrics: [{ key: 'pain', observed: false, sourceIds: [] }] });
    expect(summarizeTrainingBlock(empty).confidence).toBe('low');
  });

  test('keeps attribution observational rather than causal', () => {
    const strategy = computeStrategyOutcomes({ strategyId: 'protect-long-ride', blocks: [block('a'), block('b')], associationForBlock: () => 'positive' });
    const report = generateOutcomeReport({ strategy, trajectories: [] });
    expect(report.causalClaimAllowed).toBe(false);
    expect(report.explanation.join(' ')).toContain('not a causal claim');
    expect(strategy.evidence.every((item) => item.observedOnly)).toBe(true);
  });

  test('does not credit excluded blocks', () => {
    const strategy = computeStrategyOutcomes({ strategyId: 'x', blocks: [block('a', 'base', true)], associationForBlock: () => 'positive' });
    expect(strategy.comparableBlocks).toBe(0);
    expect(strategy.positiveBlocks).toBe(0);
    expect(strategy.evidence[0]?.association).toBe('not_comparable');
  });

  test('detects changing longitudinal associations', () => {
    const blocks = [block('a'), block('b'), block('a'), block('b')];
    let index = 0;
    const strategy = computeStrategyOutcomes({ strategyId: 'x', blocks, associationForBlock: () => index++ < 2 ? 'positive' : 'negative' });
    expect(detectOutcomeDrift(strategy).detected).toBe(true);
  });
});
