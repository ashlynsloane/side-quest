import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), '../../apps/mobile/src/services/whole-athlete-plan.ts'),
  'utf8',
);
const runtime = readFileSync(
  resolve(process.cwd(), '../../apps/mobile/src/services/whole-athlete-plan-runtime.ts'),
  'utf8',
);

describe('mobile race-horizon wiring', () => {
  it('builds the horizon once, resolves every generated week from it, and passes that context to the planner', () => {
    expect(source).toContain('const developmentPlan = input.goal.eventDate');
    expect(source).toContain('raceHorizonWeekForDate(developmentPlan, week.weekStartDate)');
    expect(source).toContain('const resolvedPhase = developmentWeek?.phase ?? week.phase;');
    expect(source).toContain('phase: resolvedPhase,');
    expect(source).toContain('developmentWeek,');
  });

  it('uses macro load as a planning ceiling rather than redefining athlete availability as a target', () => {
    expect(source).toContain('const absoluteWeeklyCeilingMinutes = Math.max(0, Math.round(input.capacity.totalWeeklyHours * 60));');
    expect(source).toContain('developmentWeek.targetLoadFactor');
    expect(source).toContain('availableMinutes: weekPlanningCeilingMinutes,');
    expect(source).toContain('Availability remains a ceiling, not a target.');
  });
  it('keeps the full horizon attached to the reconciled mobile snapshot for later Week/Coach UI', () => {
    expect(runtime).toContain('export function getLatestRaceHorizonDevelopmentPlan(');
    expect(runtime).toContain('const shapedWithDevelopment: GeneratedWholeAthleteBlock = {');
    expect(runtime).toContain('developmentPlan: generated.developmentPlan,');
  });

});
