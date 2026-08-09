import { describe, expect, it } from 'vitest';
import { deriveAllDisciplineContinuity, deriveDisciplineContinuity } from '../src/training-continuity';

describe('training continuity', () => {
  it('derives the gap from the latest completed exposure in that discipline', () => {
    const result = deriveDisciplineContinuity({
      discipline: 'bike',
      asOf: '2026-08-10T12:00:00.000Z',
      exposures: [
        { discipline: 'bike', completedAt: '2026-07-27T12:00:00.000Z' },
        { discipline: 'swim', completedAt: '2026-08-08T12:00:00.000Z' },
        { discipline: 'strength', completedAt: '2026-08-09T12:00:00.000Z' },
      ],
      interruptionReason: 'vacation',
    });

    expect(result.continuity?.daysSinceExposure).toBe(14);
    expect(result.continuity?.interruptionReason).toBe('vacation');
    expect(result.latestExposureAt).toBe('2026-07-27T12:00:00.000Z');
  });

  it('keeps each sport independent when training continued during travel', () => {
    const result = deriveAllDisciplineContinuity({
      asOf: '2026-08-10T12:00:00.000Z',
      interruptionReason: 'vacation',
      exposures: [
        { discipline: 'swim', completedAt: '2026-08-08T12:00:00.000Z' },
        { discipline: 'swim', completedAt: '2026-08-05T12:00:00.000Z' },
        { discipline: 'bike', completedAt: '2026-07-27T12:00:00.000Z' },
        { discipline: 'run', completedAt: '2026-07-25T12:00:00.000Z' },
        { discipline: 'strength', completedAt: '2026-07-26T12:00:00.000Z' },
      ],
    });

    expect(result.swim?.continuity?.daysSinceExposure).toBe(2);
    expect(result.bike?.continuity?.daysSinceExposure).toBe(14);
    expect(result.run?.continuity?.daysSinceExposure).toBe(16);
    expect(result.strength?.continuity?.daysSinceExposure).toBe(15);
  });

  it('does not invent a long layoff when the app has no comparable history', () => {
    const result = deriveDisciplineContinuity({
      discipline: 'run',
      asOf: '2026-08-10T12:00:00.000Z',
      exposures: [{ discipline: 'bike', completedAt: '2026-08-09T12:00:00.000Z' }],
    });

    expect(result.continuity).toBeNull();
    expect(result.comparableExposureCount).toBe(0);
  });

  it('ignores future-dated exposures when deriving current continuity', () => {
    const result = deriveDisciplineContinuity({
      discipline: 'swim',
      asOf: '2026-08-10T12:00:00.000Z',
      exposures: [
        { discipline: 'swim', completedAt: '2026-08-12T12:00:00.000Z' },
        { discipline: 'swim', completedAt: '2026-08-07T12:00:00.000Z' },
      ],
    });

    expect(result.continuity?.daysSinceExposure).toBe(3);
    expect(result.latestExposureAt).toBe('2026-08-07T12:00:00.000Z');
  });
});
