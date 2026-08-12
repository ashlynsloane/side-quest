import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepo(path: string): string {
  return readFileSync(resolve(process.cwd(), '../../', path), 'utf8');
}

describe('mobile availability wiring', () => {
  const availability = readRepo('apps/mobile/src/services/training-availability.ts');
  const planner = readRepo('packages/planner/src/whole-athlete-week.ts');

  it('keeps post-planner availability scheduling on the planner-selected weekday', () => {
    expect(availability).toContain(
      'const sameDayWindows = windows.filter((window) => window.date === session.date);',
    );
    expect(availability).toContain(
      'session,\n      placed,\n      sameDayWindows,',
    );
  });

  it('exposes real weekday capacity to the planner', () => {
    expect(availability).toContain(
      'const totalAvailableMinutesByDay: Partial<Record<WeekdayIndex, number>> = {};',
    );
    expect(availability).toContain(
      'const maxContinuousMinutesByDay: Partial<Record<WeekdayIndex, number>> = {};',
    );
    expect(availability).toContain(
      'totalAvailableMinutesByDay[weekday] = durations.reduce',
    );
    expect(availability).toContain(
      'maxContinuousMinutesByDay[weekday] = durations.length ? Math.max(...durations) : 0;',
    );
  });

  it('uses sport weekday selections as feasibility constraints, not requested frequency', () => {
    expect(availability).toContain(
      "const availableDays: WeeklySchedulePreference['availableDays'] = {};",
    );
    expect(availability).toContain(
      'availableDays[preference.discipline] = days;',
    );
    expect(planner).toContain(
      'const sportAvailableDays = input.weeklySchedule?.availableDays?.[discipline];',
    );
    expect(planner).toContain(
      '!sportAvailableDays.includes(offset as WeekdayIndex)',
    );
  });

  it('does not manufacture hard, long, or quality-session ownership from availability chips', () => {
    const start = availability.indexOf(
      'export function plannerWeeklySchedule(',
    );
    const end = availability.indexOf(
      'export function applyAvailabilityToWholeAthleteWeeks',
      start,
    );
    const functionSource = availability.slice(start, end);

    expect(functionSource).not.toContain('hardBikeDay');
    expect(functionSource).not.toContain('longBikeDay');
    expect(functionSource).not.toContain('hardRunDay');
    expect(functionSource).not.toContain('longRunDay');
    expect(functionSource).not.toContain('groupSwimDays');
    expect(functionSource).not.toContain('qualitySwimDay');
  });
});
