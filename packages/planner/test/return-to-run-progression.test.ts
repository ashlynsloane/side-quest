import { describe, expect, it } from 'vitest';
import {
  recentReturnToRunDurations,
  returnToRunPrescriptionForWeek,
} from '../src/return-to-run-progression';

describe('return-to-run progression', () => {
  it('uses a conservative entry when recent bone-stress context has no recent tolerated run evidence', () => {
    expect(returnToRunPrescriptionForWeek({
      weekIndex: 0,
      recentBoneStress: true,
    })).toMatchObject({
      mode: 'walk_run',
      repeats: 6,
      runMinutes: 1,
      walkMinutes: 1,
      runningMinutes: 6,
      elapsedMinutes: 12,
    });
  });

  it('advances from three recently tolerated 16-minute run/walk exposures to 4 x 4, then 4 x 5', () => {
    const input = {
      recentBoneStress: true,
      recentCompletedRunMinutes: [16, 16, 16],
    };

    expect(returnToRunPrescriptionForWeek({ ...input, weekIndex: 0 })).toMatchObject({
      mode: 'walk_run',
      repeats: 4,
      runMinutes: 4,
      walkMinutes: 1,
      runningMinutes: 16,
      elapsedMinutes: 20,
    });

    expect(returnToRunPrescriptionForWeek({ ...input, weekIndex: 1 })).toMatchObject({
      mode: 'walk_run',
      repeats: 4,
      runMinutes: 5,
      walkMinutes: 1,
      runningMinutes: 20,
      elapsedMinutes: 24,
    });
  });

  it('does not use stale pre-injury runs to choose the current return-to-run entry point', () => {
    const durations = recentReturnToRunDurations([
      { discipline: 'run', completedAt: '2026-04-10T12:00:00.000Z', durationMinutes: 70, completedAsPlanned: true },
      { discipline: 'run', completedAt: '2026-08-03T12:00:00.000Z', durationMinutes: 16, completedAsPlanned: true },
      { discipline: 'run', completedAt: '2026-08-05T12:00:00.000Z', durationMinutes: 16, completedAsPlanned: true },
      { discipline: 'run', completedAt: '2026-08-07T12:00:00.000Z', durationMinutes: 16, completedAsPlanned: true },
    ], '2026-08-10');

    expect(durations).toEqual([16, 16, 16]);
  });

  it('grows the third exposure after continuous running returns', () => {
    const input = {
      weekIndex: 7,
      recentBoneStress: false,
      recentCompletedRunMinutes: [32, 32, 32],
    };
    const easy = returnToRunPrescriptionForWeek(input, 0, 3);
    const long = returnToRunPrescriptionForWeek(input, 2, 3);

    expect(easy.mode).toBe('continuous');
    expect(long.mode).toBe('continuous');
    expect(long.elapsedMinutes).toBeGreaterThan(easy.elapsedMinutes);
    expect(long.longExposure).toBe(true);
  });
});
