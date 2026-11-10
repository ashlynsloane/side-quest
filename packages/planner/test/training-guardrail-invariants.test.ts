import { describe, expect, it } from 'vitest';
import { evaluateTrainingAddition, type DailyTrainingCeiling, type TrainingEvent } from '../src/daily-training-guardrails';

let seed = 20261109;
function next(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
}
function base(limit: number): DailyTrainingCeiling {
  return {
    date: '2026-11-09',
    planned: [{ activity: 'strength', minutes: limit, regions: ['general'] }],
    recovery: { general: 'stable' }, restrictUnplanned: true,
    recoveryObservedAt: { general: '2026-11-09T22:00:00Z' },
  };
}
function completed(minutes: number): TrainingEvent {
  return {
    id: `performed-${minutes}`,
    kind: 'completed',
    occurredAt: '2026-11-09T15:00:00Z',
    trainingDate: '2026-11-09',
    activity: { activity: 'strength', minutes, regions: ['general'] },
  };
}
const proposed = (minutes: number) => ({
  activity: 'strength', scheduled: true, minutes, regions: ['general' as const],
});

describe('training-ceiling safety invariants: 300 deterministic scenarios', () => {
  it('adding completed load never creates authorization', () => {
    for (let i = 0; i < 300; i++) {
      const limit = 20 + Math.floor(next() * 80);
      const proposal = 1 + Math.floor(next() * 120);
      const already = Math.floor(next() * limit);
      const additional = 1 + Math.floor(next() * limit);
      const initial = evaluateTrainingAddition(base(limit), proposed(proposal), [completed(already)]);
      const after = evaluateTrainingAddition(base(limit), proposed(proposal), [completed(already + additional)]);
      if (initial.decision !== 'allow') expect(after.decision).not.toBe('allow');
    }
  });
  it('increasing the requested dose never converts a refusal to allow', () => {
    for (let i = 0; i < 300; i++) {
      const limit = 15 + Math.floor(next() * 70);
      const previous = Math.floor(next() * 20);
      const requested = 1 + Math.floor(next() * 90);
      const more = requested + 1 + Math.floor(next() * 40);
      const input = [completed(previous)];
      const before = evaluateTrainingAddition(base(limit), proposed(requested), input);
      const after = evaluateTrainingAddition(base(limit), proposed(more), input);
      if (before.decision !== 'allow') expect(after.decision).not.toBe('allow');
    }
  });
  it('missing recovery does not authorize a proposal otherwise denied', () => {
    for (let i = 0; i < 300; i++) {
      const limit = 10 + Math.floor(next() * 90);
      const minutes = 1 + Math.floor(next() * 90);
      const uncertain = { ...base(limit), recovery: { general: 'uncertain' as const } };
      expect(evaluateTrainingAddition(uncertain, proposed(minutes)).decision).not.toBe('allow');
    }
  });
});
