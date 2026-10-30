import { describe, expect, it } from 'vitest';
import { createManualEnduranceActivity } from '../src/manual-endurance';

const input = {
  id: 'manual-test-1', name: 'Easy recovery ride', discipline: 'bike' as const,
  localDate: '2026-11-02', durationMinutes: 65, intensity: 'easy' as const,
  recordedAt: '2026-11-02T20:10:00.000Z',
};
describe('manual completed endurance workouts', () => {
  it('records only provided values as completed evidence', () => {
    const row = createManualEnduranceActivity(input);
    expect(row.source).toBe('manual');
    expect(row.manual).toBe(true);
    expect(row.movingTimeSeconds).toBe(3900);
    expect(row.elapsedTimeSeconds).toBe(3900);
    expect(row.distanceMeters).toBeUndefined();
    expect(row.discipline).toBe('bike');
    expect(row.startLocal).toBe('2026-11-02T12:00:00');
  });
  it('preserves measured running distance and does not invent it when unknown', () => {
    const known = createManualEnduranceActivity({
      ...input, discipline: 'run', name: 'Run', durationMinutes: 32, distanceKm: 5,
    });
    const unknown = createManualEnduranceActivity({
      ...input, discipline: 'run', name: 'Run', durationMinutes: 32,
    });
    expect(known.distanceMeters).toBe(5000);
    expect(unknown.distanceMeters).toBeUndefined();
  });
  it('rejects zero, negative, excessive or non-finite training duration', () => {
    for (const value of [0, -10, 1441, Infinity, Number.NaN]) {
      expect(() => createManualEnduranceActivity({
        ...input, durationMinutes: value,
      })).toThrow(/duration/);
    }
  });
  it('rejects invalid dates and distance measurements', () => {
    expect(() => createManualEnduranceActivity({
      ...input, localDate: '2026-02-30',
    })).toThrow(/Invalid local/);
    expect(() => createManualEnduranceActivity({
      ...input, distanceKm: -2,
    })).toThrow(/Distance/);
  });
  it('does not allow an actual completed workout to be entered for tomorrow', () => {
    expect(() => createManualEnduranceActivity({
      ...input, localDate: '2026-11-03',
    })).toThrow(/future date/);
  });
  it('gives each entry an explicit stable identity suitable for local idempotency', () => {
    const row = createManualEnduranceActivity(input);
    expect(row.id).toBe('manual-test-1');
    expect(row.externalId).toBe(row.id);
    expect(row.importedAt).toBe(input.recordedAt);
  });
});
