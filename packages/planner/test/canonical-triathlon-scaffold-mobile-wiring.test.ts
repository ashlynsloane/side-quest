import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepo(path: string): string {
  return readFileSync(resolve(process.cwd(), '../../', path), 'utf8');
}

describe('canonical triathlon scaffold mobile wiring', () => {
  const availability = readRepo('apps/mobile/src/services/training-availability.ts');
  const mobilePlan = readRepo('apps/mobile/src/services/whole-athlete-plan.ts');

  it('migrates the historical Sunday-rest default to Monday', () => {
    expect(availability).toContain('restWeekday: 0');
    expect(availability).toContain(
      'savedVersion < 2 && savedRestWeekday === 6 ? 0 : savedRestWeekday',
    );
  });

  it('treats selected sport weekdays as capability rather than key-session ownership', () => {
    expect(availability).toContain("availableDays");
    expect(availability).not.toContain('const qualitySwimDay =');
    expect(availability).not.toContain('groupSwimDays: [qualitySwimDay]');
  });

  it('hands the availability schedule to the product planner', () => {
    expect(mobilePlan).toContain('plannerWeeklySchedule(availabilityProfile)');
    expect(mobilePlan).toContain('resolveWeeklySchedulePreference(');
    expect(mobilePlan).toContain('buildWholeAthleteWeek({');
    expect(mobilePlan).toContain('weeklySchedule,');
  });
});
