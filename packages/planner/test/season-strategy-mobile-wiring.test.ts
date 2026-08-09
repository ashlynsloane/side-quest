import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Season Strategy mobile wiring', () => {
  it('exports and consumes the non-overlapping season schedule model', () => {
    const pkg = source('packages/planner/package.json');
    const model = source('packages/planner/src/season-strategy.ts');
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(pkg).toContain('"./season-strategy": "./src/season-strategy.ts"');
    expect(model).toContain('validateSeasonStrategySchedule');
    expect(model).toContain('overlap the same planning week');
    expect(model).toContain('activeSeasonStrategyForWeek');
    expect(runtime).toContain('loadApprovedCoachStrategySchedule');
    expect(runtime).toContain('approvedSchedule.windows.map');
  });

  it('persists multiple approved windows while preserving the legacy compatibility record', () => {
    const state = source('apps/mobile/src/services/coach-strategy-state.ts');
    expect(state).toContain("circuit.coach-strategy-schedule.v1");
    expect(state).toContain('saveApprovedCoachStrategyWindow');
    expect(state).toContain('loadApprovedCoachStrategySchedule');
    expect(state).toContain('mirrorLegacy');
    expect(state).toContain('replaceApprovedCoachStrategySchedule');
  });

  it('edits one season window at a time and adds new windows without rewriting existing ones', () => {
    const runtime = source('apps/mobile/src/services/coach-strategy-runtime.ts');
    const conversation = source('apps/mobile/src/services/strategy-conversation-state.ts');
    expect(runtime).toContain('beginEditingApprovedCoachStrategyWindow');
    expect(runtime).toContain('beginNewCoachStrategyWindow');
    expect(runtime).toContain('conversation.editingWindowId');
    expect(runtime).toContain('suggestedNewWindowStart');
    expect(conversation).toContain('editingWindowId?: string');
    expect(conversation).toContain('creatingNewWindow?: boolean');
    expect(conversation).toContain('suggestedWindowStart?: string');
  });

  it('places deterministic relative-duration drafts into the next available season slot', () => {
    const conversation = source('apps/mobile/src/services/strategy-conversation-runtime.ts');
    expect(conversation).toContain('placeRelativeFallbackDraft');
    expect(conversation).toContain('conversation.creatingNewWindow');
    expect(conversation).toContain('conversation.suggestedWindowStart');
    expect(conversation).toContain('semantic.usedFallback');
  });

  it('shows season focus blocks, upcoming changes, editing, removal, and safe undo in Strategy mode', () => {
    const route = source('apps/mobile/src/app/(tabs)/coach-strategy.tsx');
    const panel = source('apps/mobile/src/components/season-strategy-plan.tsx');
    expect(route).toContain('SeasonStrategyPlanPanel');
    expect(panel).toContain('SEASON FOCUS');
    expect(panel).toContain('UPCOMING CHANGES');
    expect(panel).toContain('Edit focus');
    expect(panel).toContain('Remove');
    expect(panel).toContain('+ Add focus block');
    expect(panel).toContain('Undo last change');
  });

  it('versions successful season changes and includes schedule/history in privacy controls', () => {
    const runtime = source('apps/mobile/src/services/coach-strategy-runtime.ts');
    const history = source('apps/mobile/src/services/coach-strategy-history-state.ts');
    const privacy = source('apps/mobile/src/services/local-training-data-privacy.ts');
    expect(runtime).toContain('recordCoachStrategyScheduleRevision');
    expect(runtime).toContain('undoLatestCoachStrategyScheduleChange');
    expect(history).toContain("circuit.coach-strategy-history.v1");
    expect(privacy).toContain('approvedCoachStrategySchedule');
    expect(privacy).toContain('coachStrategyHistory');
  });
});
