import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('training outings and human scheduling', () => {
  it('keeps return-to-run ahead of ordinary support work when availability is scarce', () => {
    const availability = source('apps/mobile/src/services/training-availability.ts');
    expect(availability).toContain("session.discipline === 'run' && /return-to-run/i.test(session.title)");
    expect(availability).toContain('return 0;');
    expect(availability).toContain('Math.abs(dayDifference(item.date, date)) < 2');
  });

  it('extends existing training locations with facility capabilities instead of creating a second location store', () => {
    const locations = source('apps/mobile/src/app/equipment-profiles.tsx');
    const outings = source('apps/mobile/src/services/training-outings.ts');
    expect(outings).toContain("'pool' | 'treadmill' | 'bike_trainer' | 'track'");
    expect(outings).toContain('TrainingLocationProfile = EquipmentProfile &');
    expect(locations).toContain("{ id: 'pool', label: 'Pool' }");
    expect(locations).toContain('facilities:unique(facilities)');
  });

  it('only stacks a conservative pool plus support-strength outing', () => {
    const outings = source('apps/mobile/src/services/training-outings.ts');
    expect(outings).toContain('canStackSwimAndStrength');
    expect(outings).toContain("location.facilities?.includes('pool')");
    expect(outings).toContain('if (strength.keySession) return false');
    expect(outings).toContain("if (strength.lowerBodyDemand === 'high') return false");
    expect(outings).toContain('STACK_TRANSITION_MINUTES = 10');
  });

  it('applies outings to planner truth and renders them as one trip in Week', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(runtime).toContain('applyTrainingOutingsToGeneratedBlock');
    expect(runtime).toContain('replaceTrainingCalendarEvents(SIDE_QUEST_PLAN_SOURCE_ID, reconciled.generatedEvents)');
    expect(week).toContain('groupDayItems');
    expect(week).toContain('ONE TRIP');
    expect(week).toContain('Combined visit');
  });

  it('surfaces an incomplete return-to-run protocol instead of treating one exposure as intended', () => {
    const outings = source('apps/mobile/src/services/training-outings.ts');
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(outings).toContain('Return-to-run protocol calls for 2 separated run/walk exposures this week');
    expect(week).toContain('PLAN NEEDS ATTENTION');
  });
});
