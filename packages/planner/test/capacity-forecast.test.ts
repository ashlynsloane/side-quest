import { describe, expect, it } from 'vitest';
import type { CapacityForecastInput, ForecastSessionDemand } from '@circuit/domain';
import { forecastCapacity } from '../src/capacity-forecast';

const generatedAt = '2026-07-29T12:00:00.000Z';
const session = (overrides: Partial<ForecastSessionDemand> = {}): ForecastSessionDemand => ({
  sessionId: 'heavy-pull',
  startsAt: generatedAt,
  title: 'Heavy pull',
  discipline: 'strength',
  priority: 'important',
  curves: [{ resource: 'grip', demand: 60, peakDelayHours: 0, halfLifeHours: 24, fullRecoveryHours: 72, shape: 'exponential', confidence: 'moderate', source: 'generic' }],
  ...overrides,
});

function input(overrides: Partial<CapacityForecastInput> = {}): CapacityForecastInput {
  return { generatedAt, horizonHours: 72, intervalHours: 12, completedSessions: [session()], plannedSessions: [], ...overrides };
}

describe('capacity forecast', () => {
  it('recovers capacity over time', () => {
    const result = forecastCapacity(input());
    const grip = result.points.filter((point) => point.resource === 'grip');
    expect(grip[0].availableCapacity).toBe(40);
    expect(grip.at(-1)?.availableCapacity).toBeGreaterThan(grip[0].availableCapacity);
  });

  it('detects a planned session below its resource threshold', () => {
    const planned = session({ sessionId: 'swim', startsAt: '2026-07-30T00:00:00.000Z', title: 'Swim', curves: [{ resource: 'grip', demand: 20, peakDelayHours: 0, halfLifeHours: 12, fullRecoveryHours: 36, shape: 'linear', confidence: 'moderate', source: 'generic' }] });
    const result = forecastCapacity(input({ plannedSessions: [planned], resourceThresholds: { grip: 70 } }));
    expect(result.conflicts.some((item) => item.affectedSessionId === 'swim' && item.resource === 'grip')).toBe(true);
  });

  it('models delayed peak demand', () => {
    const delayed = session({ curves: [{ resource: 'hamstrings', demand: 70, peakDelayHours: 24, halfLifeHours: 24, fullRecoveryHours: 96, shape: 'delayed_peak', confidence: 'moderate', source: 'generic' }] });
    const result = forecastCapacity(input({ completedSessions: [delayed], horizonHours: 48 }));
    const values = result.points.filter((point) => point.resource === 'hamstrings');
    expect(values[2].availableCapacity).toBeLessThan(values[0].availableCapacity);
  });

  it('does not present forecasts as diagnosis or certainty', () => {
    const result = forecastCapacity(input());
    expect(result.explanations.join(' ').toLowerCase()).toContain('not a diagnosis');
    expect(result.explanations.join(' ').toLowerCase()).toContain('not a');
  });
});
