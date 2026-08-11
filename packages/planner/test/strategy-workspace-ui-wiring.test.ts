import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Strategy Coach workspace wiring', () => {
  it('provides a Today / Strategy mode switch without adding a sixth bottom tab', () => {
    const today = source('apps/mobile/src/components/coach-operating-inbox.tsx');
    const strategyRoute = source('apps/mobile/src/app/(tabs)/coach-strategy.tsx');
    const tabs = source('apps/mobile/src/app/(tabs)/_layout.tsx');
    const switcher = source('apps/mobile/src/components/coach-mode-switch.tsx');
    expect(today).toContain('<CoachModeSwitch active="today"');
    expect(strategyRoute).toContain('<CoachModeSwitch active="strategy"');
    expect(switcher).toContain("'/(tabs)/coach-strategy'");
    expect(switcher).toContain("'/(tabs)/coach'");
    expect(tabs).toContain('<Tabs.Screen name="coach-strategy" options={{ href: null }} />');
  });

  it('keeps Strategy conversation separate from the Daily workout proposal runtime', () => {
    const strategyRuntime = source('apps/mobile/src/services/strategy-conversation-runtime.ts');
    const strategyState = source('apps/mobile/src/services/strategy-conversation-state.ts');
    expect(strategyRuntime).toContain('interpretCoachTurnV2');
    expect(strategyRuntime).not.toContain('buildCoachMessageProposalClosedLoop');
    expect(strategyRuntime).not.toContain('applyCoachMessageProposalClosedLoop');
    expect(strategyState).toContain("circuit.strategy-conversation.v1");
  });

  it('renders athlete-facing phases, upcoming weeks, and season handoffs', () => {
    const workspace = source('apps/mobile/src/components/coach-strategy-workspace.tsx');
    const season = source('apps/mobile/src/components/season-strategy-plan.tsx');
    const service = source('apps/mobile/src/services/strategy-workspace.ts');
    expect(workspace).toContain('PHASES');
    expect(workspace).toContain('WEEK BY WEEK');
    expect(workspace).toContain("week.source === 'strategy_coach'");
    expect(workspace).toContain("'Focus block' : 'Race priorities'");
    expect(season).toContain('SEASON FOCUS');
    expect(season).toContain('UPCOMING CHANGES');
    expect(service).toContain('buildStrategyMacrocycle');
    expect(service).toContain('seasonWindows');
  });

  it('uses a season schedule as weekly overlays instead of pre-merging one dated strategy', () => {
    const planner = source('packages/planner/src/whole-athlete-week-strategy.ts');
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(planner).toContain('configureWholeAthleteStrategyLayers');
    expect(planner).toContain('resolveConfiguredStrategy(input.weekStartDate)');
    expect(planner).toContain('activeSeasonStrategyForWeek');
    expect(runtime).toContain('loadApprovedCoachStrategySchedule');
    expect(runtime).toContain('approvedSchedule.windows.map');
    expect(runtime).not.toContain('configureWholeAthleteCoachStrategy(mergeRaceIntentWithCoachStrategy');
  });

  it('includes Strategy chat, season schedule, and season history in local export and erase controls', () => {
    const privacy = source('apps/mobile/src/services/local-training-data-privacy.ts');
    expect(privacy).toContain('strategyConversation: exportStrategyConversationState()');
    expect(privacy).toContain('approvedCoachStrategySchedule: exportApprovedCoachStrategyScheduleState()');
    expect(privacy).toContain('coachStrategyHistory: exportCoachStrategyHistoryState()');
    expect(privacy).toContain('clearStrategyConversationState()');
    expect(privacy).toContain('clearCoachStrategyHistoryState()');
  });
});
