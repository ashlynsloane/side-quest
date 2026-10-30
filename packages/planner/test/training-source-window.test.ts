import { describe, expect, it } from 'vitest';
import { trainingSourceQueryEnvelope } from '../src/training-source-window';
import { localTrainingDate } from '../src/core-training-week-evidence';

describe('timezone-safe week history query', () => {
  it('encloses Monday-Sunday and includes a conservative UTC margin', () => {
    expect(trainingSourceQueryEnvelope('2026-10-26')).toEqual({
      localWeekStart: '2026-10-26',
      localWeekEnd: '2026-11-01',
      from: '2026-10-24T00:00:00.000Z',
      to: '2026-11-04T00:00:00.000Z',
    });
  });
  it('includes a Sunday-night Denver workout when UTC is already Monday', () => {
    const window = trainingSourceQueryEnvelope('2026-10-26');
    const activity = '2026-11-02T03:40:00.000Z';
    expect(activity >= window.from && activity <= window.to).toBe(true);
    expect(localTrainingDate(activity, 'America/Denver')).toBe('2026-11-01');
  });
  it('includes an activity at the local-week boundary for UTC+14', () => {
    const window = trainingSourceQueryEnvelope('2026-10-26');
    const activity = '2026-10-25T11:00:00.000Z';
    expect(activity >= window.from && activity <= window.to).toBe(true);
    expect(localTrainingDate(activity, 'Pacific/Kiritimati')).toBe('2026-10-26');
  });
  it('must filter buffered records by the actual local week before summing', () => {
    const window = trainingSourceQueryEnvelope('2026-10-26');
    const activity = '2026-11-03T07:00:00.000Z';
    expect(activity >= window.from && activity <= window.to).toBe(true);
    expect(localTrainingDate(activity, 'America/Denver')).toBe('2026-11-03');
    expect(localTrainingDate(activity, 'America/Denver') > window.localWeekEnd).toBe(true);
  });
  it('rejects invalid and non-Monday week starts', () => {
    expect(() => trainingSourceQueryEnvelope('2026-10-27')).toThrow(/Monday/);
    expect(() => trainingSourceQueryEnvelope('2026-02-30')).toThrow(/Invalid/);
  });
});
