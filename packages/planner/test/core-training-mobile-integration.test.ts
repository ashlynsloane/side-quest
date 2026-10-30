import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function mobile(relative: string): string {
  return readFileSync(new URL('../../../apps/mobile/src/' + relative, import.meta.url), 'utf8');
}

describe('core training journey integration contract', () => {
  it('generates endurance sessions before declaring onboarding first week ready', () => {
    const screen = mobile('app/onboarding-first-week.tsx');
    expect(screen).toContain('await saveTrainingBlock(result.block)');
    expect(screen).toContain('await refreshLatestWholeAthletePlan()');
    expect(screen).toContain('buildFirstWeekTrainingSummary({');
    expect(screen).toContain('generatedEvents: enduranceEvents');
    expect(screen).toContain('await complete()');
    expect(screen).toContain('setState(\'ready\')');
  });
  it('Today, Week and Train all retain planned-session identity when opening workouts', () => {
    for (const route of ['app/(tabs)/index.tsx', 'app/(tabs)/plan.tsx',
      'app/(tabs)/train.tsx']) {
      const screen = mobile(route);
      expect(screen, route).toContain('openPlannedWorkoutPreview');
      expect(screen, route).not.toMatch(/setPreviewWorkout\((recommendation|next)\.workout\)/);
    }
    const provider = mobile('state/workout-context.tsx');
    expect(provider).toContain('sessionId: source.session.id');
    expect(provider).toContain('const planLink = buildPlanLink(plannedPreviewSource);');
  });
  it('a completed planned workout reaches the canonical ledger and repairs plan status', () => {
    const completion = mobile('app/active-workout.tsx');
    const db = mobile('services/database.ts');
    expect(completion).toContain('plannedSessionId: activePlanLink?.sessionId');
    expect(completion).toContain('completionSaveStatus === \'saving\'');
    expect(completion).toContain('completionSaveStatus === \'error\'');
    expect(completion).toContain('Retry saving workout');
    expect(completion).toContain('completionFractionRef.current');
    expect(db).toContain('if (existing) {\n    // A prior attempt can commit');
    expect(db).toContain('markPlannedSessionCompletedForWorkout(');
    expect(db).toContain('rebuildDerivedTrainingMemory()');
  });
  it('endurance planning never resurrects a fabricated five-hour legacy baseline', () => {
    const runtime = mobile('services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('capacity: resolveFirstWeekCapacity(goal)');
    expect(runtime).not.toContain('currentEnduranceHours: goal.disciplines.length ? 5 : 0');
  });
  it('offers native manual completed endurance logging and manual planned-session matching', () => {
    const logger = mobile('app/log-endurance.tsx');
    expect(logger).toContain('createManualEnduranceActivity(');
    expect(logger).toContain('await upsertEnduranceActivities([entry])');
    expect(logger).toContain('/activity-review?id=');
    expect(mobile('app/(tabs)/train.tsx')).toContain('/log-endurance');
    expect(mobile('app/(tabs)/plan.tsx')).toContain('/log-endurance');
  });
  it('onboarding drafts are keyed to a user rather than shared between profiles', () => {
    const onboarding = mobile('app/onboarding.tsx');
    expect(onboarding).toContain('const draftKey =');
    expect(onboarding).toContain('user?.id');
    expect(onboarding).toContain('saveDraft(draftKey');
  });
});
