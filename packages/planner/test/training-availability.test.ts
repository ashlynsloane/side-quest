import { describe, expect, it } from 'vitest';

import {
  findTrainingAvailabilityPlacements,
  trainingDayPart,
  weekdayIndex,
  type TrainingAvailabilityWindow,
} from '../src/training-availability';

const date = '2026-08-11'; // Tuesday.

function window(id: string, startHour: number, endHour: number): TrainingAvailabilityWindow {
  return {
    id,
    date,
    startsAt: new Date(`2026-08-11T${String(startHour).padStart(2, '0')}:00:00-06:00`).toISOString(),
    endsAt: new Date(`2026-08-11T${String(endHour).padStart(2, '0')}:00:00-06:00`).toISOString(),
    localStartMinutes: startHour * 60,
    localEndMinutes: endHour * 60,
    source: 'recurring',
  };
}

describe('training availability placement', () => {
  it('only returns placements that fully fit a saved window', () => {
    const placements = findTrainingAvailabilityPlacements({
      date,
      discipline: 'bike',
      durationMinutes: 75,
      windows: [window('am', 6, 8)],
    });
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((item) => item.localStartMinutes >= 360 && item.localEndMinutes <= 480)).toBe(true);
  });

  it('uses AM/PM as a soft preference rather than a hard availability rule', () => {
    const windows = [window('am', 6, 9), window('pm', 17, 20)];
    const morning = findTrainingAvailabilityPlacements({
      date,
      discipline: 'swim',
      durationMinutes: 60,
      windows,
      preference: { discipline: 'swim', preferredDayPart: 'morning' },
    });
    const evening = findTrainingAvailabilityPlacements({
      date,
      discipline: 'swim',
      durationMinutes: 60,
      windows,
      preference: { discipline: 'swim', preferredDayPart: 'evening' },
    });
    expect(trainingDayPart(morning[0]!.localStartMinutes)).toBe('morning');
    expect(trainingDayPart(evening[0]!.localStartMinutes)).toBe('evening');
  });

  it('keeps a required gap from an already scheduled session on a double day', () => {
    const windows = [window('am', 6, 9), window('pm', 17, 20)];
    const occupiedStart = new Date('2026-08-11T06:30:00-06:00');
    const placements = findTrainingAvailabilityPlacements({
      date,
      discipline: 'swim',
      durationMinutes: 60,
      windows,
      occupied: [{
        startsAt: occupiedStart.toISOString(),
        endsAt: new Date(occupiedStart.getTime() + 75 * 60_000).toISOString(),
      }],
      minimumGapMinutes: 180,
    });
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((item) => item.localStartMinutes >= 17 * 60)).toBe(true);
  });

  it('uses Monday-zero weekday indexing for athlete preferences', () => {
    expect(weekdayIndex('2026-08-10')).toBe(0);
    expect(weekdayIndex('2026-08-16')).toBe(6);
  });
});
