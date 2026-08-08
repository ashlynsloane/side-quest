import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Strategy Coach wiring', () => {
  it('routes the public whole-athlete planner through the bounded strategy overlay', () => {
    const plannerPackage = source('packages/planner/package.json');
    expect(plannerPackage).toContain('"./whole-athlete-week": "./src/whole-athlete-week-strategy.ts"');
  });

  it('merges baseline race intent with only athlete-approved Strategy Coach state during reconciliation', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('loadRaceIntent');
    expect(runtime).toContain('loadApprovedCoachStrategy');
    expect(runtime).toContain('mergeRaceIntentWithCoachStrategy(raceIntent, approvedStrategy)');
    expect(runtime).toContain('configureWholeAthleteCoachStrategy');
  });

  it('keeps strategy turns out of the Daily Coach workout-adaptation path', () => {
    const runtime = source('apps/mobile/src/services/coach-closed-loop-runtime.ts');
    expect(runtime).toContain("semanticTurn?.frame.intent === 'strategy_change'");
    expect(runtime).toContain('Nothing changed yet');
    expect(runtime.indexOf("semanticTurn?.frame.intent === 'strategy_change'")).toBeLessThan(runtime.indexOf('buildCoachMessageProposal(effectiveMessage'));
  });

  it('shows explicit apply, discard, and stop controls for Strategy Coach', () => {
    const panel = source('apps/mobile/src/components/coach-operating-inbox.tsx');
    expect(panel).toContain('approveCurrentCoachStrategyDraft');
    expect(panel).toContain('discardCurrentCoachStrategyDraft');
    expect(panel).toContain('stopApprovedCoachStrategy');
    expect(panel).toContain('Nothing in the training plan changes until you approve');
  });

  it('includes approved strategy in local export and erase controls', () => {
    const privacy = source('apps/mobile/src/services/local-training-data-privacy.ts');
    expect(privacy).toContain('approvedCoachStrategy');
    expect(privacy).toContain('clearApprovedCoachStrategy()');
  });

  it('keeps model credentials server-side behind authenticated Supabase invocation', () => {
    const edge = source('supabase/functions/coach-language-interpret/index.ts');
    const mobile = source('apps/mobile/src/services/coach-remote-language-interpreter.ts');
    expect(edge).toContain('await requireUser(req)');
    expect(edge).toContain("Deno.env.get('OPENAI_API_KEY')");
    expect(edge).toContain('store: false');
    expect(edge).toContain("type: 'json_schema'");
    expect(mobile).toContain("supabase.functions.invoke('coach-language-interpret'");
    expect(mobile).not.toContain('OPENAI_API_KEY');
  });

  it('requires an explicit public feature flag before the phone calls the remote interpreter', () => {
    const remote = source('apps/mobile/src/services/coach-remote-language-interpreter.ts');
    expect(remote).toContain('EXPO_PUBLIC_COACH_LANGUAGE_ENABLED');
    expect(remote).toContain("=== 'true'");
  });
});
