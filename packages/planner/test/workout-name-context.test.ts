import { describe, expect, it } from 'vitest';

import {
  effectiveWorkoutNamePhase,
  generatedWorkoutNamingMetadata,
  isHolidayNamingWindow,
  parseGeneratedWorkoutNamingMetadata,
  weeksUntilRace,
  workoutNameSeason,
} from '../../../apps/mobile/src/services/workout-name-context';

describe('workout naming context', () => {
  it('derives calendar seasons and the narrow holiday window', () => {
    expect(workoutNameSeason('2026-02-10')).toBe('winter');
    expect(workoutNameSeason('2026-04-10')).toBe('spring');
    expect(workoutNameSeason('2026-08-10')).toBe('summer');
    expect(workoutNameSeason('2026-10-10')).toBe('fall');
    expect(isHolidayNamingWindow('2026-12-22')).toBe(true);
    expect(isHolidayNamingWindow('2027-01-02')).toBe(true);
    expect(isHolidayNamingWindow('2026-12-10')).toBe(false);
  });

  it('promotes the final seven days to race-week voice', () => {
    expect(weeksUntilRace('2026-10-25', '2026-10-29')).toBeCloseTo(4 / 7, 5);
    expect(effectiveWorkoutNamePhase('taper', 4 / 7)).toBe('race_week');
    expect(effectiveWorkoutNamePhase('build', 4)).toBe('build');
    expect(effectiveWorkoutNamePhase(undefined, 2)).toBe('taper');
  });

  it('round-trips generated plan metadata without exposing raw race names', () => {
    const line = generatedWorkoutNamingMetadata({
      phase: 'build',
      goalType: 'ironman_70_3',
      raceDate: '2026-10-29',
      raceName: '70.3 Nice · Côte d’Azur',
    });
    expect(line).toContain('raceName=');
    expect(line).not.toContain('70.3 Nice · Côte d’Azur');
    expect(parseGeneratedWorkoutNamingMetadata(`Planner rationale\n${line}`)).toMatchObject({
      phase: 'build',
      goalType: 'ironman_70_3',
      raceDate: '2026-10-29',
      raceName: '70.3 Nice · Côte d’Azur',
      triathlon: true,
    });
  });
});
