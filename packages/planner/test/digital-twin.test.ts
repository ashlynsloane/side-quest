import { describe, expect, it } from 'vitest';
import {
  createDigitalTwin,
  predictScenarioOutcome,
  summarizeTwinConfidence,
  updateDigitalTwin,
} from '../src/digital-twin';

describe('digital twin', () => {
  it('starts conservatively with low confidence and population defaults', () => {
    const twin = createDigitalTwin('athlete-1', '2026-07-29T09:00:00');
    const prediction = predictScenarioOutcome(twin, {
      scenarioId: 'keep',
      workoutType: 'strength',
      load: 0.7,
      recoveryWindowHours: 24,
    });
    expect(prediction.confidence).toBe('low');
    expect(prediction.personalizedWeight).toBe(0);
    expect(prediction.expectedAdaptation).toBeGreaterThan(0);
  });

  it('learns gradually and never permits an abrupt single-observation rewrite', () => {
    const twin = createDigitalTwin('athlete-1', '2026-07-29T09:00:00');
    const result = updateDigitalTwin(twin, {
      observationId: 'response-1',
      observedAt: '2026-07-30T09:00:00',
      workoutType: 'strength',
      recoveredAfterHours: 100,
      completedAsPlanned: true,
      sessionRpe: 10,
      sorenessAfter: 9,
      readinessBefore: 8,
      readinessNextDay: 2,
    });
    expect(result.twin.recovery.recoveryHalfLifeHours.estimate).toBeLessThan(40);
    expect(result.update.changedParameters).toContain('recoveryHalfLifeHours');
  });

  it('accumulates confidence and reduces uncertainty with repeated evidence', () => {
    let twin = createDigitalTwin('athlete-1', '2026-07-29T09:00:00');
    for (let index = 0; index < 15; index += 1) {
      twin = updateDigitalTwin(twin, {
        observationId: `response-${index}`,
        observedAt: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00`,
        workoutType: 'endurance',
        recoveredAfterHours: 26,
        completedAsPlanned: true,
        readinessBefore: 7,
        readinessNextDay: 7,
      }).twin;
    }
    expect(twin.recovery.recoveryHalfLifeHours.confidence).toBe('moderate');
    expect(twin.recovery.recoveryHalfLifeHours.uncertainty).toBeLessThan(0.3);
    expect(summarizeTwinConfidence(twin).totalEvidence).toBeGreaterThan(0);
  });

  it('personalizes scenario outcomes without granting plan-change authority', () => {
    let twin = createDigitalTwin('athlete-1', '2026-07-29T09:00:00');
    for (let index = 0; index < 12; index += 1) {
      twin = updateDigitalTwin(twin, {
        observationId: `response-${index}`,
        observedAt: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00`,
        workoutType: 'mixed',
        recoveredAfterHours: 42,
        completedAsPlanned: true,
      }).twin;
    }
    const prediction = predictScenarioOutcome(twin, {
      scenarioId: 'compressed-day',
      workoutType: 'mixed',
      load: 0.9,
      recoveryWindowHours: 18,
      consecutiveHardDays: 3,
      calendarCompression: 0.8,
    });
    expect(prediction.personalizedWeight).toBeGreaterThan(0);
    expect(twin.safeguards.join(' ')).toContain('athlete approval');
  });
});
