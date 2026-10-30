import { describe, expect, it } from 'vitest';
import type { PerformanceGoal, PlannedStrengthSession, TrainingCalendarEvent } from '@circuit/domain';
import { buildFirstWeekTrainingSummary } from '../src/first-week-training-summary';
import { resolveFirstWeekCapacity } from '../src/first-week-capacity';
import {
  addLocalCalendarDays, localCalendarDate, localMondayOf, nextLocalMonday,
} from '../src/first-week-dates';

const strength = (id: string, date: string, duration = 2700) => ({
  id, date, title: 'Strength ' + id, completionStatus: 'planned',
  workout: { estimatedElapsedSeconds: duration },
} as unknown as PlannedStrengthSession);
const event = (id: string, date: string, discipline: 'run' | 'swim' | 'bike',
  duration: number | null, sourceId = 'side_quest_generated_plan'): TrainingCalendarEvent => ({
  id, sourceId, title: discipline.toUpperCase() + ' session',
  startAt: date + 'T12:00:00.000Z', endAt: date + 'T14:00:00.000Z',
  allDay: true, discipline,
  description: duration === null ? 'Planned session'
    : 'Side Quest generated · ' + duration + ' min · easy',
});
const goal = (profile?: PerformanceGoal['capacityProfile']): PerformanceGoal => ({
  type: 'ironman_70_3', sessionsPerWeek: 3,
  defaultSessionMinutes: 40, disciplines: ['swim', 'bike', 'run'],
  capacityProfile: profile,
} as PerformanceGoal);

describe('first useful training week from real generated workouts', () => {
  it('combines swim, bike, run and strength into exactly seven weekday slots', () => {
    const result = buildFirstWeekTrainingSummary({
      weekStartDate: '2026-11-02', timezone: 'America/Denver',
      strengthSessions: [strength('one', '2026-11-03'), strength('two', '2026-11-05')],
      generatedEvents: [
        event('swim', '2026-11-02', 'swim', 45),
        event('bike', '2026-11-07', 'bike', 90),
        event('run', '2026-11-08', 'run', 35),
      ],
    });
    expect(result.days).toHaveLength(7);
    expect(result.days.map(x => x.date)[0]).toBe('2026-11-02');
    expect(result.days.map(x => x.date).at(-1)).toBe('2026-11-08');
    expect(result.counts).toEqual({ strength: 2, swim: 1, bike: 1, run: 1 });
    expect(result.sessions.map(s => s.sport).sort()).toEqual([
      'bike', 'run', 'strength', 'strength', 'swim',
    ]);
    expect(result.knownPlannedMinutes).toBe(260);
    expect(result.evidenceStatus).toBe('provisional_unverified');
    expect(result.days.find(day => day.date === '2026-11-04')?.sessions).toEqual([]);
  });
  it('does not invent minutes when the generated event has no valid dose', () => {
    const result = buildFirstWeekTrainingSummary({
      weekStartDate: '2026-11-02', timezone: 'America/Denver',
      strengthSessions: [], generatedEvents: [event('a', '2026-11-03', 'run', null)],
    });
    expect(result.unknownDurationCount).toBe(1);
    expect(result.knownPlannedMinutes).toBe(0);
    expect(result.sessions[0]?.plannedMinutes).toBeNull();
  });
  it('ignores unrelated, external and adjacent-week events rather than claiming them as generated', () => {
    const result = buildFirstWeekTrainingSummary({
      weekStartDate: '2026-11-02', timezone: 'America/Denver',
      strengthSessions: [strength('past', '2026-10-28')],
      generatedEvents: [
        event('external', '2026-11-03', 'bike', 90, 'trainingpeaks_ics'),
        event('previous', '2026-11-01', 'run', 30),
        event('future', '2026-11-09', 'swim', 60),
      ],
    });
    expect(result.sessions).toEqual([]);
  });
  it('keeps all-day local dates independent from a UTC clock offset', () => {
    const r = buildFirstWeekTrainingSummary({
      weekStartDate: '2026-11-02', timezone: 'Pacific/Kiritimati',
      strengthSessions: [], generatedEvents: [event('r', '2026-11-02', 'run', 35)],
    });
    expect(r.days[0]?.sessions[0]?.date).toBe('2026-11-02');
  });
  it('refuses to normalize a non-Monday training week', () => {
    expect(() => buildFirstWeekTrainingSummary({
      weekStartDate: '2026-11-03', timezone: 'America/Denver',
      strengthSessions: [], generatedEvents: [],
    })).toThrow(/Monday/);
  });
});
describe('training availability versus observed exposure', () => {
  it('preserves new-athlete provisional context without claiming observed tolerance', () => {
    const result = resolveFirstWeekCapacity(goal({
      totalWeeklyHours: 10, currentEnduranceHours: 7,
      enduranceHoursEvidence: 'unverified_planning_assumption',
      runStatus: 'return_to_run', maxRunMilesLast12Weeks: 0, runMileageEvidence: 'unknown',
      boneStressInjuryHistory: 'remote', swimProficiency: 'average',
      bikeProficiency: 'average', runProficiency: 'developing',
      strengthExperience: 'intermediate',
    }));
    expect(result.currentEnduranceHours).toBe(7);
    expect(result.runStatus).toBe('return_to_run');
    expect(result.evidence).toBe('provisional_availability');
    expect(result.needsRecentTrainingReview).toBe(true);
  });
  it('never makes up endurance hours or normal run status on a legacy goal', () => {
    const result = resolveFirstWeekCapacity(goal());
    expect(result.currentEnduranceHours).toBe(0);
    expect(result.runStatus).toBe('not_running');
    expect(result.evidence).toBe('unknown');
    expect(result.totalWeeklyHours).toBe(2);
    expect(result.needsRecentTrainingReview).toBe(true);
  });
  it('distinguishes athlete report from source-observed endurance', () => {
    const base = {
      totalWeeklyHours: 8, currentEnduranceHours: 4, runStatus: 'normal' as const,
      maxRunMilesLast12Weeks: 20, boneStressInjuryHistory: 'none' as const,
      swimProficiency: 'average' as const, bikeProficiency: 'average' as const,
      runProficiency: 'average' as const, strengthExperience: 'intermediate' as const,
    };
    expect(resolveFirstWeekCapacity(goal({
      ...base, enduranceHoursEvidence: 'athlete_reported',
    })).needsRecentTrainingReview).toBe(true);
    expect(resolveFirstWeekCapacity(goal({
      ...base, enduranceHoursEvidence: 'source_observed',
    })).needsRecentTrainingReview).toBe(false);
  });
});
describe('local date safety in athlete onboarding', () => {
  it('does not roll Saturday sessions into Friday across UTC offsets', () => {
    expect(addLocalCalendarDays('2026-11-02', 5)).toBe('2026-11-07');
    expect(localMondayOf('2026-11-08')).toBe('2026-11-02');
  });
  it('handles DST, leap years and year transitions', () => {
    expect(addLocalCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addLocalCalendarDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addLocalCalendarDays('2026-11-01', 1)).toBe('2026-11-02');
  });
  it('next Monday is always in the future even when today is Monday', () => {
    expect(nextLocalMonday(new Date(2026, 10, 2, 12))).toBe('2026-11-09');
    expect(nextLocalMonday(new Date(2026, 10, 1, 12))).toBe('2026-11-02');
    expect(localCalendarDate(new Date(2026, 10, 2, 12))).toBe('2026-11-02');
  });
});
