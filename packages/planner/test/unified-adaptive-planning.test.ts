import { describe, expect, it } from 'vitest';
import { buildUnifiedAdaptivePlan } from '../src/unified-adaptive-planning';

const base = {
  planningDate: '2026-07-28', athleteId: 'athlete-1', currentState: 'build' as const,
  lifeContext: {}, candidateSessionIds: ['strength-1', 'swim-1'], keySessionIds: ['swim-1'],
};

describe('buildUnifiedAdaptivePlan', () => {
  it('allows life and mental health to override progression', () => {
    const result = buildUnifiedAdaptivePlan({ ...base, lifeContext: { lifeStress: 'overwhelming', mentalEnergy: 'depleted' }, progressionDecision: { readiness: 'ready', action: 'progress', selections: [], blockedVariables: [], explanations: [] } });
    expect(result.state).toBe('recover');
    expect(result.progressionAllowed).toBe(false);
    expect(result.overriddenAlternatives.length).toBeGreaterThan(0);
  });

  it('protects key training while reducing supporting work', () => {
    const result = buildUnifiedAdaptivePlan({ ...base, lifeContext: { athleteRequestedRest: true } });
    expect(result.directives.find((item) => item.sessionId === 'swim-1')?.action).toBe('keep');
    expect(result.directives.find((item) => item.sessionId === 'strength-1')?.action).toBe('reduce');
  });

  it('never creates a calorie-restriction recommendation', () => {
    const result = buildUnifiedAdaptivePlan(base);
    expect(JSON.stringify(result).toLowerCase()).not.toContain('reduce calories');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('weight loss');
  });
});
