import { describe, expect, it } from 'vitest';
import { decideProgressionControl } from '../src/progression-control';

const response = { completedAsPlanned: true, perceivedDifficulty: 'appropriate' as const, sorenessResolvedHours: 24 };

function candidate(variable: 'load' | 'reps' | 'duration' | 'frequency' | 'novelty' | 'complexity', currentValue: number, proposedValue: number, priority = 0) {
  return { variable, currentValue, proposedValue, relativeChange: (proposedValue - currentValue) / Math.max(1, currentValue), rationale: `Progress ${variable}.`, priority };
}

describe('V24.7 progression control', () => {
  it('progresses one major variable at a time', () => {
    const decision = decideProgressionControl({
      sessionId: 'strength-1', strengthLoadAction: 'progress', response,
      candidates: [candidate('load', 20, 25, 2), candidate('reps', 8, 10, 1)],
    });
    expect(decision.action).toBe('progress');
    expect(decision.selections).toHaveLength(1);
    expect(decision.selections[0]?.variable).toBe('load');
  });

  it('allows two variables only with a strong established baseline and high confidence', () => {
    const decision = decideProgressionControl({
      sessionId: 'strength-2', strengthLoadAction: 'progress',
      response: { ...response, perceivedDifficulty: 'too_easy' }, establishedBaseline: true, confidence: 'high',
      candidates: [candidate('reps', 8, 10, 2), candidate('load', 20, 22.5, 1), candidate('frequency', 3, 4)],
    });
    expect(decision.selections).toHaveLength(2);
    expect(decision.selections.map((item) => item.variable)).toEqual(['reps', 'load']);
  });

  it('holds progression during consolidation or structural constraint', () => {
    const decision = decideProgressionControl({
      sessionId: 'strength-3', strengthLoadAction: 'consolidate', response,
      candidates: [candidate('reps', 8, 10)],
    });
    expect(decision.action).toBe('hold');
    expect(decision.readiness).toBe('cautious');
  });

  it('blocks novelty when the novelty budget requires familiar exercises', () => {
    const decision = decideProgressionControl({
      sessionId: 'strength-4', strengthLoadAction: 'progress', response,
      noveltyDecision: { maximumNovelExercises: 0, maximumHighDemandNovelExercises: 0, selectedExerciseIds: [], deferredExerciseIds: [], profiles: [], reasons: [] },
      candidates: [candidate('novelty', 0, 1, 5), candidate('reps', 8, 10, 1)],
    });
    expect(decision.blockedVariables).toContain('novelty');
    expect(decision.selections[0]?.variable).toBe('reps');
  });

  it('reduces rather than progresses after pain affects another workout', () => {
    const decision = decideProgressionControl({
      sessionId: 'strength-5', strengthLoadAction: 'restrict',
      response: { ...response, painDuringOrAfter: true, affectedNextWorkout: true },
      candidates: [candidate('duration', 40, 30, 3), candidate('load', 20, 25, 2)],
    });
    expect(decision.action).toBe('reduce');
    expect(decision.selections[0]?.variable).toBe('duration');
    expect(decision.selections[0]?.targetValue).toBe(30);
  });
});
