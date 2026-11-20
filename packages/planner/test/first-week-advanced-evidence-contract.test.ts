import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../apps/mobile/src/app/goal-plan.tsx',
  import.meta.url), 'utf8');
const firstWeek = readFileSync(new URL('../../../apps/mobile/src/app/onboarding-first-week.tsx',
  import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../../../apps/mobile/src/app/onboarding.tsx',
  import.meta.url), 'utf8');

describe('native first-week and advanced planner baseline evidence contract', () => {
  it('isolates in-memory onboarding drafts when athlete identity changes', () => {
    expect(onboarding).toContain('return <AthleteOnboardingDraft key={draftKey} draftKey={draftKey} />;');
    expect(onboarding).toContain('function AthleteOnboardingDraft({ draftKey }: { draftKey: string })');
    expect(onboarding).toContain('loadDraft(draftKey)');
    expect(onboarding).toContain('saveDraft(draftKey, {');
  });
  it('never converts available hours into fabricated completed endurance hours', () => {
    expect(source).not.toContain('Math.max(0, parseHours(onboardingParams.hours) - 4)');
    expect(source).not.toContain('maxRunMilesLast12Weeks: 20');
    expect(source).toContain('currentEnduranceHours: 0,');
    expect(firstWeek).toContain('currentEnduranceHours: 0,');
    expect(firstWeek).not.toContain('assumedEnduranceAllocation');
    expect(firstWeek).not.toContain("enduranceHoursEvidence: 'unverified_planning_assumption'");
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
  it('clears stale athlete setup context instead of retaining the previous goal', () => {
    expect(source).toContain('setSavedFirstWeekSetup(goal?.firstWeekSetup);');
    expect(source).not.toContain('if (goal?.firstWeekSetup) setSavedFirstWeekSetup(goal.firstWeekSetup);');
  });
  it('uses native-safe parameter routing for editing or recovering first-week drafts', () => {
    expect(firstWeek).not.toContain('new URLSearchParams(');
    expect(firstWeek).toContain("router.replace({ pathname: '/goal-plan', params: { ...params, onboarding: '1' } } as Href)");
    expect(firstWeek).toContain("router.push({ pathname: '/goal-plan', params: { ...params, onboarding: '1' } } as Href)");
  });
  it('retains modality interests but does not invent endurance minutes', () => {
    expect(firstWeek).toContain("cardioDoseStatus: 'requires_review'");
    expect(firstWeek).toContain('not yet scheduled — review recent dose and movement eligibility');
    expect(firstWeek).toContain('firstWeek?.counts[entry.mode] ?? 0');
    expect(firstWeek).toContain('proposed in this week — confirm readiness and actual dose before training');
    expect(firstWeek).toContain("entry.mode === 'swim' || entry.mode === 'bike' || entry.mode === 'run'");
  });
});
