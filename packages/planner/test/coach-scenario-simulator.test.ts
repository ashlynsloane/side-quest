import { describe, expect, it } from 'vitest';
import type { CoachScenarioSimulatorInput } from '@circuit/domain';
import { simulateCoachScenarios } from '../src/coach-scenario-simulator';

const input: CoachScenarioSimulatorInput = {
  generatedAt: '2026-07-29T10:00:00-06:00',
  maximumInjuryRisk: 0.65,
  protectedSessionIds: ['key-bike'],
  candidates: [
    {
      scenarioId: 'keep-plan', kind: 'keep', title: 'Keep plan', description: 'Complete all sessions.',
      projection: { adaptation: 0.78, recovery: 0.42, performance: 0.48, injuryRisk: 0.68, calendarFit: 0.9, preferenceFit: 0.8, disruption: 0.05 },
    },
    {
      scenarioId: 'move-strength', kind: 'move', title: 'Move strength', description: 'Move strength to Thursday.',
      projection: { adaptation: 0.82, recovery: 0.8, performance: 0.86, injuryRisk: 0.28, calendarFit: 0.78, preferenceFit: 0.86, disruption: 0.3 },
    },
    {
      scenarioId: 'shorten-strength', kind: 'shorten', title: 'Shorten strength', description: 'Preserve the main strength stimulus.',
      projection: { adaptation: 0.75, recovery: 0.72, performance: 0.8, injuryRisk: 0.35, calendarFit: 0.9, preferenceFit: 0.82, disruption: 0.12 },
    },
  ],
};

describe('simulateCoachScenarios', () => {
  it('ranks the best eligible future and exposes alternatives', () => {
    const result = simulateCoachScenarios(input);
    expect(result.recommendedScenarioId).toBe('move-strength');
    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarioById['move-strength']?.recommended).toBe(true);
  });

  it('lets hard constraints override a high utility projection', () => {
    const result = simulateCoachScenarios(input);
    expect(result.scenarioById['keep-plan']?.eligible).toBe(false);
    expect(result.scenarioById['keep-plan']?.constraintViolations.join(' ')).toContain('injury risk');
  });

  it('protects named key sessions from replacement or removal', () => {
    const result = simulateCoachScenarios({
      ...input,
      candidates: [{
        scenarioId: 'remove-bike', sessionId: 'key-bike', kind: 'remove', title: 'Remove bike', description: 'Remove the key bike.',
        projection: { adaptation: 1, recovery: 1, performance: 1, injuryRisk: 0, calendarFit: 1, preferenceFit: 1, disruption: 0 },
      }],
    });
    expect(result.recommendedScenarioId).toBeUndefined();
    expect(result.scenarios[0]?.eligible).toBe(false);
  });
});
