import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Unified Goal Setup V2', () => {
  it('replaces the athlete-facing legacy form with one five-stage setup workspace', () => {
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    expect(route).toContain("type SetupStep = 'goal' | 'outcome' | 'capacity' | 'setup' | 'review'");
    expect(route).toContain('1 · GOAL');
    expect(route).toContain('2 · RACE OUTCOME');
    expect(route).toContain('3 · WEEKLY CAPACITY');
    expect(route).toContain('4 · SCHEDULE + SETUP');
    expect(route).toContain('5 · REVIEW');
    expect(route).not.toContain('LegacyGoalPlanScreen');
  });

  it('uses the same Goal Setup for first-run onboarding and later goal edits', () => {
    const onboarding = source('apps/mobile/src/app/onboarding.tsx');
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    expect(onboarding).toContain("/goal-plan?onboarding=1");
    expect(route).toContain("params.onboarding === '1'");
    expect(route).toContain('onboarding.complete()');
  });

  it('keeps every supported goal family in the unified setup contract', () => {
    const runtime = source('apps/mobile/src/services/goal-setup-runtime.ts');
    for (const goal of [
      'triathlon_sprint', 'triathlon_olympic', 'ironman_70_3', 'ironman_full', 'swimrun',
      'road_10k', 'road_half_marathon', 'road_marathon', 'trail_50k', 'trail_100k',
      'swim_speed', 'general_offseason',
    ]) expect(runtime).toContain(`type: '${goal}'`);
  });

  it('derives strength dose from capacity instead of asking the athlete to set an arbitrary dose', () => {
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    const runtime = source('apps/mobile/src/services/goal-setup-runtime.ts');
    expect(route).toContain('RECOMMENDED STARTING DOSE');
    expect(route).toContain('totalWeeklyHours');
    expect(route).toContain('currentEnduranceHours');
    expect(runtime).toContain('recommendStrengthDose');
  });

  it('builds Race Intent as part of plan creation rather than a post-hoc bolt-on', () => {
    const runtime = source('apps/mobile/src/services/goal-setup-runtime.ts');
    expect(runtime).toContain('buildRaceIntentForDraft');
    expect(runtime).toContain('primaryDiscipline');
    expect(runtime).toContain('tradeoffTolerance');
    expect(runtime).toContain('applyRaceIntent');
  });

  it('hydrates existing Race Intent so ordinary plan edits do not erase saved strategy', () => {
    const runtime = source('apps/mobile/src/services/goal-setup-runtime.ts');
    expect(runtime).toContain('loadRaceIntent(existingBlock.id)');
    expect(runtime).toContain('hydrateDraftWithRaceIntent');
    expect(runtime).toContain('overallObjective: intent.overallObjective');
    expect(runtime).toContain("primaryPriority === 'maximize' ? 'maximize' : 'primary_focus'");
    expect(runtime).toContain('disciplineTargetKind: target?.kind');
  });

  it('preserves planner, protection, equipment, and reconciliation behavior behind the new UI', () => {
    const runtime = source('apps/mobile/src/services/goal-setup-runtime.ts');
    expect(runtime).toContain('generateTrainingBlock');
    expect(runtime).toContain('adaptTrainingBlock');
    expect(runtime).toContain('getLatestPTProfile');
    expect(runtime).toContain('getActiveTrainingCheckIn');
    expect(runtime).toContain('ensureDefaultEquipmentProfiles');
    expect(runtime).toContain('preferredStrengthDays');
    expect(runtime).toContain('enduranceSchedule');
    expect(runtime).toContain('saveTrainingBlock');
    expect(runtime).toContain('refreshLatestWholeAthletePlan');
  });

  it('requires explicit review/application before replacing the saved plan', () => {
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    expect(route).toContain('Ready to build the plan.');
    expect(route).toContain('Apply and rebuild plan');
    expect(route).toContain('Build my plan');
    expect(route).toContain('buildAndSaveGoalSetup(activeDraft, exercises)');
  });
});
