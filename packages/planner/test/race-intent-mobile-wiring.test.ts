import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Race Intent V2 mobile wiring', () => {
  it('exports the race-intent planning contract', () => {
    expect(source('packages/planner/package.json')).toContain('"./race-intent": "./src/race-intent.ts"');
  });

  it('exposes race priorities from the goal-plan surface without rewriting the legacy setup screen', () => {
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    expect(route).toContain('LegacyGoalPlanScreen');
    expect(route).toContain('Race priorities');
    expect(route).toContain("router.push('/race-intent'");
  });

  it('offers multidimensional overall, discipline, tradeoff, and target controls', () => {
    const screen = source('apps/mobile/src/app/race-intent.tsx');
    expect(screen).toContain('Specific discipline performance');
    expect(screen).toContain('Placement / qualification');
    expect(screen).toContain('Minimum viable');
    expect(screen).toContain('Primary focus');
    expect(screen).toContain('Maximize');
    expect(screen).toContain('Give my focus a clear advantage');
    expect(screen).toContain('Apply race priorities');
  });

  it('reconciles only after explicit application and supports reset', () => {
    const runtime = source('apps/mobile/src/services/race-intent-runtime.ts');
    expect(runtime).toContain('validateRaceIntent');
    expect(runtime).toContain('saveRaceIntent');
    expect(runtime).toContain('refreshLatestWholeAthletePlan');
    expect(runtime).toContain('resetRaceIntent');
  });

  it('uses race intent as baseline strategy while approved Strategy Coach can refine it', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('mergeRaceIntentWithCoachStrategy(raceIntent, approvedStrategy)');
  });

  it('includes Race Intent V2 in local export and erase controls', () => {
    const privacy = source('apps/mobile/src/services/local-training-data-privacy.ts');
    expect(privacy).toContain('raceIntent: exportRaceIntentState()');
    expect(privacy).toContain('clearRaceIntent()');
  });
});
