import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Strategy Coach wiring', () => {
  it('routes the public whole-athlete planner through strategy, quality, rhythm, long-ride, and day-spread shaping', () => {
    const plannerPackage = source('packages/planner/package.json');
    const composedPlanner = source('packages/planner/src/whole-athlete-week-block.ts');
    expect(plannerPackage).toContain('"./whole-athlete-week": "./src/whole-athlete-week-block.ts"');
    expect(composedPlanner).toContain("from './whole-athlete-week-strategy'");
    expect(composedPlanner).toContain("from './bike-quality-anchor'");
    expect(composedPlanner).toContain("from './whole-athlete-week-rhythm'");
    expect(composedPlanner).toContain("from './bike-long-ride-anchor'");
    expect(composedPlanner).toContain("from './discipline-day-spread'");
    expect(composedPlanner).toContain('const strategicPlan = buildStrategyWholeAthleteWeek(input)');
    expect(composedPlanner).toContain('const qualityShapedPlan = applyBikeQualityAnchor(strategicPlan, input)');
    expect(composedPlanner).toContain('const rhythmedPlan = applyTrainingBlockRhythm(qualityShapedPlan, input)');
    expect(composedPlanner).toContain('const longRidePlan = applyWeekendLongRideAnchor(rhythmedPlan, input)');
    expect(composedPlanner).toContain('return applyDisciplineDaySpread(longRidePlan, input)');
  });

  it('configures Race Intent and the full approved season schedule as separate weekly layers', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    const overlay = source('packages/planner/src/whole-athlete-week-strategy.ts');
    expect(runtime).toContain('loadRaceIntent');
    expect(runtime).toContain('loadApprovedCoachStrategySchedule');
    expect(runtime).toContain('approvedSchedule.windows.map');
    expect(runtime).toContain('configureWholeAthleteStrategyLayers');
    expect(overlay).toContain('activeSeasonStrategyForWeek');
    expect(overlay).toContain('mergeRaceIntentWithCoachStrategy(configuredRaceIntent, approved)');
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
    expect(privacy).toContain('approvedCoachStrategySchedule');
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
