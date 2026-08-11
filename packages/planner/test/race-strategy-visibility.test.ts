import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('race strategy visibility', () => {
  it('shows the same effective race strategy context on Plan and Coach', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    const coachInbox = source('apps/mobile/src/components/coach-operating-inbox.tsx');
    expect(plan).toContain('RaceStrategyContextCard');
    expect(plan).toContain('surface="plan"');
    expect(coachInbox).toContain('RaceStrategyContextCard');
    expect(coachInbox).toContain('surface="coach"');
  });

  it('keeps Race Intent as baseline and layers only an active Strategy Coach window on top', () => {
    const context = source('apps/mobile/src/services/race-strategy-context.ts');
    expect(context).toContain('mergeRaceIntentWithCoachStrategy');
    expect(context).toContain('loadApprovedCoachStrategy');
    expect(context).toContain("approvedStrategyWindowState === 'active'");
    expect(context).toContain('RACE INTENT + STRATEGY COACH');
    expect(context).toContain('first claim on discretionary progression');
  });

  it('gives Plan a direct handoff between race priorities and the season-focus workspace', () => {
    const card = source('apps/mobile/src/components/race-strategy-context-card.tsx');
    expect(card).toContain('Edit race priorities');
    expect(card).toContain('Season focus');
    expect(card).toContain("router.push('/race-intent'");
    expect(card).toContain("router.push('/(tabs)/coach-strategy'");
  });

  it('explains how the effective strategy is expressed in the generated week', () => {
    const card = source('apps/mobile/src/components/race-strategy-context-card.tsx');
    const weekly = source('apps/mobile/src/services/weekly-strategy-context.ts');
    expect(card).toContain('loadCurrentWeeklyStrategyContext');
    expect(card).toContain('weeklyStrategyStateLabel');
    expect(card).toContain('RACE TARGET');
    expect(card).toContain('weeklyDisciplineLine');
    expect(weekly).toContain('buildWeeklyStrategyExpression');
  });

  it('shows race-target evidence without presenting it as a readiness score', () => {
    const card = source('apps/mobile/src/components/race-strategy-context-card.tsx');
    const loader = source('apps/mobile/src/services/race-target-evidence.ts');
    const planner = source('packages/planner/src/race-target-evidence.ts');
    expect(card).toContain('targetEvidence.evidenceLabel');
    expect(card).toContain('targetEvidence.caveat');
    expect(loader).toContain('buildRaceTargetEvidence');
    expect(planner).toContain('not a race projection or readiness score');
    expect(planner).toContain('does not treat arbitrary training duration as a race-distance time benchmark');
  });

  it('reuses only the active block’s latest fully shaped reconciled planner result', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    const weekly = source('apps/mobile/src/services/weekly-strategy-context.ts');
    expect(runtime).toContain('getLatestWholeAthletePlanSnapshot(blockId?: string)');
    expect(runtime).toContain('latestReconciledPlan = { blockId: saved.block.id, generated: shaped }');
    expect(runtime).toContain('latestReconciledPlan.blockId !== blockId');
    expect(runtime).toContain('applyTrainingOutingsToGeneratedBlock');
    expect(weekly).toContain('getLatestWholeAthletePlanSnapshot(race.blockId)');
  });
});