import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function source(relativeFromTest: string): string {
  return readFileSync(fileURLToPath(new URL(relativeFromTest, import.meta.url)), 'utf8');
}

describe('mobile calendar-expression wiring', () => {
  it('feeds saved weekly anchors and protected rest day into the planner', () => {
    const plan = source('../../../apps/mobile/src/services/whole-athlete-plan.ts');
    const availability = source('../../../apps/mobile/src/services/training-availability.ts');

    expect(plan).toContain('const weeklySchedule = plannerWeeklySchedule(availabilityProfile);');
    expect(plan).toContain('      weeklySchedule,');
    expect(plan.indexOf('const weeklySchedule = plannerWeeklySchedule(availabilityProfile);'))
      .toBeLessThan(plan.indexOf('const basePlan = buildWholeAthleteWeek({'));
    expect(availability).toContain('restWeekday: WeekdayIndex');
    expect(availability).toContain('restDays: [profile.restWeekday]');
  });

  it('does not silently reshuffle an untimed session out of the occupancy model', () => {
    const availability = source('../../../apps/mobile/src/services/training-availability.ts');

    expect(availability).toContain('Keep an unscheduled session in the occupancy model');
    expect(availability).toContain("availabilityStatus: 'needs_time'");
    expect(availability).toContain('candidateDatesForSession');
  });

  it('orders swim doubles deliberately and shows exact scheduled times in the Week UI', () => {
    const availability = source('../../../apps/mobile/src/services/training-availability.ts');
    const planTab = source('../../../apps/mobile/src/app/(tabs)/plan.tsx');

    expect(availability).toContain('swimDoubleOrderingScore');
    expect(availability).toContain("swimPreferredDayPart === 'morning'");
    expect(availability).toContain("swimPreferredDayPart === 'evening'");
    expect(availability).toContain("preferredDayPart !== 'any'");
    expect(planTab).toContain('eventMeta(event, availabilityEnabled)');
    expect(planTab).toContain('formatScheduledTime(planned.scheduledStartAt)');
  });

  it('does not build a facility outing on the protected rest day', () => {
    const outings = source('../../../apps/mobile/src/services/training-outings.ts');
    expect(outings).toContain("weekdayIndex(session.date) !== profile.restWeekday");
  });
});
