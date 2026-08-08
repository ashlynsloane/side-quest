import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Strategy Coach workspace wiring', () => {
  it('provides a Today / Strategy mode switch without adding a bottom tab', () => {
    const today = source('apps/mobile/src/components/coach-operating-inbox.tsx');
    const strategyRoute = source('apps/mobile/src/app/coach-strategy.tsx');
    const switcher = source('apps/mobile/src/components/coach-mode-switch.tsx');
    expect(today).toContain('<CoachModeSwitch active="today"');
    expect(strategyRoute).toContain('<CoachModeSwitch active="strategy"');
    expect(switcher).toContain("'/coach-strategy'");
    expect(switcher).toContain("'/(tabs)/coach'");
  });

  it('keeps Strategy conversation separate from the Daily workout proposal runtime', () => {
    const strategyRuntime = source('apps/mobile/src/services/strategy-conversation-runtime.ts');
    const strategyState = source('apps/mobile/src/services/strategy-conversation-state.ts');
    expect(strategyRuntime).toContain('interpretCoachTurnV2');
    expect(strategyRuntime).not.toContain('buildCoachMessageProposalClosedLoop');
    expect(strategyRuntime).not.toContain('applyCoachMessageProposalClosedLoop');
    expect(strategyState).toContain("circuit.strategy-conversation.v1");
  });

  it('renders phase roadmap, per-week strategy source, and strategy-window handoff', () => {
    const workspace = source('apps/mobile/src/components/coach-strategy-workspace.tsx');
    const service = source('apps/mobile/src/services/strategy-workspace.ts');
    expect(workspace).toContain('PHASE ROADMAP');
    expect(workspace).toContain('BLOCK TIMELINE');
    expect(workspace).toContain("week.source === 'strategy_coach'");
    expect(workspace).toContain('Race Intent is back in control');
    expect(service).toContain('buildStrategyMacrocycle');
    expect(service).toContain('returnToRaceIntentWeek');
  });

  it('uses weekly strategy layers instead of pre-merging a dated override over Race Intent', () => {
    const planner = source('packages/planner/src/whole-athlete-week-strategy.ts');
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(planner).toContain('configureWholeAthleteStrategyLayers');
    expect(planner).toContain('resolveConfiguredStrategy(input.weekStartDate)');
    expect(planner).toContain('coachStrategyAppliesToWeek');
    expect(runtime).toContain('configureWholeAthleteStrategyLayers(raceIntent, approvedStrategy)');
    expect(runtime).not.toContain('configureWholeAthleteCoachStrategy(mergeRaceIntentWithCoachStrategy');
  });

  it('includes the separate Strategy thread in local export and erase controls', () => {
    const privacy = source('apps/mobile/src/services/local-training-data-privacy.ts');
    expect(privacy).toContain('strategyConversation: exportStrategyConversationState()');
    expect(privacy).toContain('clearStrategyConversationState()');
  });
});
