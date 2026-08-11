import { describe, expect, it } from 'vitest';
import { adaptAthletePeriodContext } from '../src/athlete-period-adapter';

describe('Athlete Period training adapter', () => {
  it('keeps cycle prediction as context without a personal pattern', () => {
    const result = adaptAthletePeriodContext({
      predictedPeriodStart: '2026-08-10',
      predictionConfidence: 'high',
      symptomHistory: [],
    }, '2026-08-09');
    expect(result.forecast.mode).toBe('context_only');
    expect(result.automaticReductionAllowed).toBe(false);
  });

  it('can surface preemptive options after repeated athlete-specific responses', () => {
    const result = adaptAthletePeriodContext({
      predictedPeriodStart: '2026-08-10',
      predictionConfidence: 'high',
      symptomHistory: [
        { id: '1', occurredAt: '2026-05-10', daysFromPeriodStart: 0, symptoms: ['cramps'], affectedTraining: true, selectedAdjustments: ['indoor_bike'] },
        { id: '2', occurredAt: '2026-06-10', daysFromPeriodStart: -1, symptoms: ['cramps', 'fatigue'], affectedTraining: true, selectedAdjustments: ['indoor_bike', 'shorter'] },
        { id: '3', occurredAt: '2026-07-10', daysFromPeriodStart: 1, symptoms: ['cramps'], affectedTraining: true, selectedAdjustments: ['indoor_bike'] },
      ],
    }, '2026-08-09');
    expect(result.forecast.mode).toBe('offer_preemptive_options');
    expect(result.suggestedAdjustments).toContain('indoor_bike');
    expect(result.automaticReductionAllowed).toBe(false);
  });
});
