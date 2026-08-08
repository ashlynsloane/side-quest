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

  it('keeps Race Intent as baseline and layers approved Strategy Coach changes on top', () => {
    const context = source('apps/mobile/src/services/race-strategy-context.ts');
    expect(context).toContain('mergeRaceIntentWithCoachStrategy');
    expect(context).toContain('loadApprovedCoachStrategy');
    expect(context).toContain('RACE INTENT + STRATEGY COACH');
    expect(context).toContain('first claim on discretionary progression');
  });

  it('gives Plan a direct handoff between race priorities and Strategy Coach', () => {
    const card = source('apps/mobile/src/components/race-strategy-context-card.tsx');
    expect(card).toContain('Edit race priorities');
    expect(card).toContain('Talk strategy');
    expect(card).toContain("router.push('/race-intent'");
    expect(card).toContain("router.push('/(tabs)/coach'");
  });
});
