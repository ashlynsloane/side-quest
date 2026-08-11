import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Side Quest UI consolidation', () => {
  it('provides compact hierarchy primitives instead of forcing every concept into a card', () => {
    const ui = source('apps/mobile/src/components/product-ui.tsx');
    expect(ui).toContain('ProductHero');
    expect(ui).toContain('ProductSection');
    expect(ui).toContain('ProductDisclosure');
    expect(ui).toContain('ProductChoiceRow');
    expect(ui).toContain('ProductMetric');
  });

  it('makes Week the command center and folds block/status metadata into the page hierarchy', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('ProductHero');
    expect(plan).toContain('ProductMetric');
    expect(plan).toContain('THIS WEEK');
    expect(plan).toContain('PLAN TOOLS');
    expect(plan).toContain('RaceStrategyContextCard');
    expect(plan).not.toContain('V23StatusCard');
    expect(plan).not.toContain('styles.blockSummary');
  });

  it('turns Race Intent into a progressive decision flow with one visible top-focus rule', () => {
    const race = source('apps/mobile/src/app/race-intent.tsx');
    expect(race).toContain('DECISION FLOW');
    expect(race).toContain('ProductDisclosure');
    expect(race).toContain('1 · Outcome');
    expect(race).toContain('2 · Focus');
    expect(race).toContain('3 · Tradeoffs');
    expect(race).toContain('4 · Target');
    expect(race).toContain('One top focus at a time');
    expect(race).toContain('Apply race priorities');
  });

  it('keeps ordinary Coach context collapsed so messaging remains primary', () => {
    const inbox = source('apps/mobile/src/components/coach-operating-inbox.tsx');
    expect(inbox).toContain('ProductDisclosure');
    expect(inbox).toContain('const urgent = strategyIsDraft || protectionCount > 0');
    expect(inbox).toContain('Plan context');
    expect(inbox).toContain('Nothing in the training plan changes until you approve');
  });

  it('replaces the legacy goal form with the same progressive product hierarchy', () => {
    const goalPlan = source('apps/mobile/src/app/goal-plan.tsx');
    expect(goalPlan).toContain('ProductHero');
    expect(goalPlan).toContain('SetupProgress');
    expect(goalPlan).toContain('1 · GOAL');
    expect(goalPlan).toContain('5 · REVIEW');
    expect(goalPlan).toContain('Build my plan');
    expect(goalPlan).not.toContain('LegacyGoalPlanScreen');
    expect(goalPlan).not.toContain('raceIntentDock');
  });
});
