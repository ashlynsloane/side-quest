import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function mobileSource(): string {
  return readFileSync(
    resolve(process.cwd(), '../../apps/mobile/src/services/whole-athlete-plan.ts'),
    'utf8',
  );
}

describe('mobile pre-plan strength anchoring', () => {
  it('anchors generated Side Quest strength before whole-athlete composition', () => {
    const source = mobileSource();

    const scheduleIndex = source.indexOf(
      'const weeklySchedule = plannerWeeklySchedule(availabilityProfile);',
    );
    const strengthIndex = source.indexOf(
      'const fixedStrength = alignSideQuestStrengthToWeeklyScaffold(',
    );
    const plannerIndex = source.indexOf('const basePlan = buildWholeAthleteWeek({');

    expect(scheduleIndex).toBeGreaterThan(-1);
    expect(strengthIndex).toBeGreaterThan(scheduleIndex);
    expect(plannerIndex).toBeGreaterThan(strengthIndex);
    expect(source).toContain('weeklySchedule.preferredDays?.strength');
    expect(source).toContain('weeklySchedule.availableDays?.strength');
    expect(source).toContain('weeklySchedule.restDays');
    expect(source).toContain('      weeklySchedule,');
  });

  it('uses Wed/Fri only as the automatic triathlon fallback', () => {
    const source = mobileSource();

    expect(source).toContain('explicitPreferred?.length');
    expect(source).toContain('? [...explicitPreferred]');
    expect(source).toContain('? [2, 4]');
    expect(source).toContain('const legal = (weekday: number)');
    expect(source).toContain("goalType === 'ironman_70_3'");
    expect(source).toContain("goalType === 'ironman_full'");
  });

  it('does not alter true calendar/manual fixed commitments', () => {
    const source = mobileSource();

    expect(source).toContain(
      'fixedSessions: [...fixedCalendar, ...fixedApprovedEndurance, ...fixedStrength]',
    );
    expect(source).toContain(
      ".map((event) => ({ ...normalizeCalendarEvent(event), priority: 'required' as const }))",
    );
  });
});
