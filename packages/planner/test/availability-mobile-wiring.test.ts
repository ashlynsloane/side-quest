import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('availability intelligence mobile wiring', () => {
  it('stores recurring weekly windows, dated exceptions, and soft sport preferences', () => {
    const availability = source('apps/mobile/src/services/training-availability.ts');
    expect(availability).toContain("mode: 'unavailable' | 'replace' | 'block'");
    expect(availability).toContain('weekly: WeeklyAvailabilityDay[]');
    expect(availability).toContain('preferredWeekdays: number[]');
    expect(availability).toContain('preferredDayPart: TrainingDayPart');
    expect(availability).toContain('applyExceptions');
    expect(availability).toContain('subtractWindow');
  });

  it('schedules the actual whole-athlete plan before generated calendar events are persisted', () => {
    const plan = source('apps/mobile/src/services/whole-athlete-plan.ts');
    expect(plan).toContain('loadTrainingAvailabilityProfile()');
    expect(plan).toContain('applyAvailabilityToWholeAthleteWeeks(');
    expect(plan).toContain('availabilityProfile,');
    expect(plan).toContain('preferredRestDayOffset: 0');
    expect(plan).toContain('previousWeek = progressedPlan.sessions');
    expect(plan).toContain('plannedSessionToCalendarEvent(session, input.block.id)');
    expect(plan).toContain('allDay: !session.scheduledStartAt');
  });

  it('keeps availability optional and makes generated doubles use separated windows', () => {
    const availability = source('apps/mobile/src/services/training-availability.ts');
    expect(availability).toContain('if (!profile.enabled) return weeks as AvailabilityScheduledWeekPlan[]');
    expect(availability).toContain('minimumGapMinutes: sameDay.length ? 180 : 0');
    expect(availability).toContain('originalDayCandidates');
    expect(availability).toContain('originalDayCandidates.length');
    expect(availability).toContain('if (gapMinutes >= 360) return 18');
    expect(availability).toContain('Intentional double day:');
  });

  it('surfaces availability in You and shows scheduled times in Week', () => {
    const profile = source('apps/mobile/src/app/(tabs)/profile.tsx');
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    const settings = source('apps/mobile/src/app/availability-settings.tsx');
    expect(profile).toContain('title="Training availability"');
    expect(profile).toContain("router.push('/availability-settings' as Href)");
    expect(week).toContain('scheduledSessions');
    expect(week).toContain('formatScheduledTime');
    expect(week).toContain('loadTrainingAvailabilityProfile().enabled');
    expect(settings).toContain('YOUR NORMAL WEEK');
    expect(settings).toContain('EXCEPTIONS');
    expect(settings).toContain('SPORT PREFERENCES');
    expect(settings).toContain('Save and update plan');
  });
});
