import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Coaching OS mobile wiring', () => {
  it('canonicalizes the whole-athlete plan while goal setup remains open', () => {
    const route = source('apps/mobile/src/app/goal-plan.tsx');
    const legacy = source('apps/mobile/src/components/legacy-goal-plan-screen.tsx');
    expect(route).toContain('refreshLatestWholeAthletePlan');
    expect(route).toContain('blockSignature');
    expect(route).toContain('LegacyGoalPlanScreen');
    expect(legacy).toContain('generateTrainingBlock');
    expect(legacy).toContain('saveTrainingBlock');
  });

  it('refreshes observed Coach execution after integration and plan reconciliation', () => {
    const runtime = source('apps/mobile/src/services/integration-runtime.ts');
    expect(runtime).toContain('refreshLatestWholeAthletePlan');
    expect(runtime).toContain('refreshCoachObservedOutcomes');
  });

  it('keeps clarification, attention, and closed-loop history visible on Coach', () => {
    const coach = source('apps/mobile/src/app/(tabs)/coach.tsx');
    const closedLoop = source('apps/mobile/src/components/coach-closed-loop.tsx');
    expect(coach).toContain('CoachOperatingInboxPanel');
    expect(coach).toContain("result.reason === 'needs_clarification'");
    expect(closedLoop).toContain('RECENT COACH DECISIONS');
    expect(closedLoop).toContain('completed as adjusted');
  });
});
