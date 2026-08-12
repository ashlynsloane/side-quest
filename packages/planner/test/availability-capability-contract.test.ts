import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepo(path: string): string {
  return readFileSync(resolve(process.cwd(), '../../', path), 'utf8');
}

describe('availability is capability, not frequency', () => {
  it('stores sport weekday selections as possible days in the planner contract', () => {
    const source = readRepo('apps/mobile/src/services/training-availability.ts');
    expect(source).toContain("const availableDays: WeeklySchedulePreference['availableDays'] = {};");
    expect(source).toContain('availableDays[preference.discipline] = days;');
    expect(source).not.toContain('preferredDays[preference.discipline] = days;');
  });

  it('passes actual window capacity without manufacturing key days', () => {
    const source = readRepo('apps/mobile/src/services/training-availability.ts');
    const start = source.indexOf('export function plannerWeeklySchedule(');
    const end = source.indexOf('export function applyAvailabilityToWholeAthleteWeeks', start);
    const fn = source.slice(start, end);
    expect(fn).toContain('maxContinuousMinutesByDay');
    expect(fn).toContain('totalAvailableMinutesByDay');
    expect(fn).not.toContain('hardBikeDay');
    expect(fn).not.toContain('longBikeDay');
    expect(fn).not.toContain('hardRunDay');
    expect(fn).not.toContain('longRunDay');
    expect(fn).not.toContain('groupSwimDays');
  });

  it('enforces possible-day constraints without turning every possible day into a session', () => {
    const source = readRepo('packages/planner/src/whole-athlete-week.ts');
    expect(source).toContain('const sportAvailableDays = input.weeklySchedule?.availableDays?.[discipline];');
    expect(source).toContain('function automaticRoleAvailabilityPenalty(');
  });
});
