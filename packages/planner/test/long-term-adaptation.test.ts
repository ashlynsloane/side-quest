import { describe, expect, it } from 'vitest';
import { trackLongTermAdaptation } from '../src/long-term-adaptation';

const generatedAt = '2026-07-29T00:00:00.000Z';

describe('long-term adaptation tracking', () => {
  it('builds objective-specific trajectories from repeated evidence', () => {
    const result = trackLongTermAdaptation({
      generatedAt,
      objectives: ['aerobic_base', 'max_strength'],
      evidence: [
        { evidenceId: 'a1', occurredAt: '2026-07-02T00:00:00.000Z', objective: 'aerobic_base', adaptationLoad: 4, source: 'completed_session' },
        { evidenceId: 'a2', occurredAt: '2026-07-16T00:00:00.000Z', objective: 'aerobic_base', adaptationLoad: 5, source: 'completed_session' },
        { evidenceId: 'a3', occurredAt: '2026-07-25T00:00:00.000Z', objective: 'aerobic_base', adaptationLoad: 6, source: 'athlete_response', responseQuality: 0.9 },
      ],
    });
    expect(result.trajectories).toHaveLength(2);
    expect(result.trajectories.find((item) => item.objective === 'aerobic_base')?.estimatedLevel).toBeGreaterThan(50);
    expect(result.trajectories.find((item) => item.objective === 'max_strength')?.confidence).toBe('low');
  });

  it('discounts old evidence and forecasts detraining conservatively', () => {
    const result = trackLongTermAdaptation({
      generatedAt,
      objectives: ['vo2_max'],
      evidence: [
        { evidenceId: 'v1', occurredAt: '2026-04-01T00:00:00.000Z', objective: 'vo2_max', adaptationLoad: 8, source: 'performance_marker' },
      ],
      forecastHorizonsDays: [28],
    });
    const trajectory = result.trajectories[0]!;
    expect(trajectory.estimatedLevel).toBeLessThan(55);
    expect(result.forecasts[0]!.projectedLevelWithoutNewStimulus).toBeLessThanOrEqual(trajectory.estimatedLevel);
  });

  it('keeps low-confidence estimates from sounding diagnostic', () => {
    const result = trackLongTermAdaptation({ generatedAt, objectives: ['max_strength'], evidence: [] });
    expect(result.trajectories[0]!.confidence).toBe('low');
    expect(result.safeguards.join(' ')).toMatch(/non-diagnostic|single workout|symptoms/i);
  });
});
