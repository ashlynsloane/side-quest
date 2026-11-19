import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../apps/mobile/src/app/goal-plan.tsx',
  import.meta.url), 'utf8');
const firstWeek = readFileSync(new URL('../../../apps/mobile/src/app/onboarding-first-week.tsx',
  import.meta.url), 'utf8');

describe('native first-week and advanced planner baseline evidence contract', () => {
  it('never converts available hours into fabricated completed endurance hours', () => {
    expect(source).not.toContain('Math.max(0, parseHours(onboardingParams.hours) - 4)');
    expect(source).not.toContain('maxRunMilesLast12Weeks: 20');
    expect(source).toContain('currentEnduranceHours: 0,');
    expect(source).toContain("runMileageEvidence: 'unknown'");
    expect(source).toContain("enduranceHoursEvidence: value.trim() ? 'athlete_reported' : undefined");
    expect(source).toContain("runMileageEvidence: value.trim() ? 'athlete_reported' : 'unknown'");
  });
  it('gates race plans when endurance or running evidence is absent', () => {
    expect(source).toContain('disciplines.length > 0 && !capacity.enduranceHoursEvidence');
    expect(source).toContain("disciplines.includes('run')");
    expect(source).toContain("capacity.runMileageEvidence === 'unknown'");
  });
  it('filters protected-region exercise candidates before first-week generation', () => {
    expect(firstWeek).toContain('const safeExercises = excludedSet.size > 0');
    expect(firstWeek).toContain('exercise.bodyRegions.every((load) => !excludedSet.has(load.region))');
    expect(firstWeek).toContain('exercises: safeExercises');
    expect(firstWeek).toContain('inspectPlannedSessionCoherence(session.workout, session)');
    expect(firstWeek).toContain('No incompatible strength session was saved.');
  });
  it('retains modality interests but does not invent endurance minutes', () => {
    expect(firstWeek).toContain("cardioDoseStatus: 'requires_review'");
    expect(firstWeek).toContain('not yet scheduled — review recent dose and movement eligibility');
  });
});
