import {
  buildStrategyMacrocycle,
  type StrategyMacrocycleView,
  type StrategySeasonWindowView,
} from '@circuit/planner/strategy-macrocycle';

import { getLatestTrainingBlock } from './database';
import { loadCoachStrategyReview, type CoachStrategyReview } from './coach-strategy-runtime';
import { loadRaceIntentEditorState } from './race-intent-runtime';
import { loadStrategyCoachConversation } from './strategy-conversation-runtime';
import type { StrategyConversationState } from './strategy-conversation-state';
import {
  getLatestWholeAthletePlanSnapshot,
  refreshLatestWholeAthletePlan,
} from './whole-athlete-plan-runtime';

export interface StrategyWorkspaceData {
  blockId: string;
  goalName: string;
  eventDate?: string;
  customizedRaceIntent: boolean;
  review: CoachStrategyReview;
  conversation: StrategyConversationState;
  macrocycle: StrategyMacrocycleView;
}

export async function loadStrategyWorkspace(): Promise<StrategyWorkspaceData | null> {
  const [saved, editor, review, conversation] = await Promise.all([
    getLatestTrainingBlock(),
    loadRaceIntentEditorState(),
    loadCoachStrategyReview(),
    loadStrategyCoachConversation(),
  ]);
  const block = saved?.block;
  if (!block || !editor || !review || !conversation || editor.blockId !== block.id || review.blockId !== block.id) return null;

  let generated = getLatestWholeAthletePlanSnapshot(block.id);
  if (!generated?.weeks.length) generated = await refreshLatestWholeAthletePlan();
  if (!generated?.weeks.length) return null;

  const generatedByStart = new Map(generated.weeks.map((week) => [week.weekStartDate, week]));
  const weeks = block.weeks.flatMap((week) => {
    const plan = generatedByStart.get(week.weekStartDate);
    return plan ? [{ phase: week.phase, plan }] : [];
  });
  const macrocycle = buildStrategyMacrocycle({
    raceIntent: editor.intent,
    approvedStrategies: review.schedule.windows,
    weeks,
    referenceWeekStart: currentWeekStart(),
  });
  if (!macrocycle) return null;

  return {
    blockId: block.id,
    goalName: block.goal.name,
    eventDate: block.goal.eventDate,
    customizedRaceIntent: editor.customized,
    review,
    conversation,
    macrocycle,
  };
}

export function strategyWindowLabel(data: StrategyWorkspaceData): string {
  const macro = data.macrocycle;
  if (!data.review.schedule.windows.length) return 'Race Intent baseline';
  if (macro.approvedWindowState === 'active') return 'Season block active';
  if (macro.approvedWindowState === 'scheduled') return 'Season block scheduled';
  return 'Season blocks complete';
}

export function strategyWindowSummary(data: StrategyWorkspaceData): string {
  const macro = data.macrocycle;
  const windows = data.review.schedule.windows;
  if (!windows.length) return 'No Strategy Coach blocks are approved. Race Intent is driving the long-horizon allocation.';

  const active = macro.activeWindowId
    ? macro.seasonWindows.find((window) => window.id === macro.activeWindowId)
    : undefined;
  const next = macro.nextWindowId
    ? macro.seasonWindows.find((window) => window.id === macro.nextWindowId)
    : undefined;

  if (active) {
    const end = formatDate(active.endsAt) ?? 'an open-ended finish';
    const nextText = next ? ` Next: ${next.label} begins ${formatDate(next.startsAt) ?? 'in a future planning week'}.` : '';
    return `${active.label} is controlling the current strategy window through ${end}.${nextText} Race Intent remains the baseline in any gap between approved blocks.`;
  }
  if (next) {
    return `${next.label} begins ${formatDate(next.startsAt) ?? 'in a future planning week'}. Until then, Race Intent controls the plan. ${windows.length} approved season block${windows.length === 1 ? '' : 's'} ${windows.length === 1 ? 'is' : 'are'} saved.`;
  }
  return `${windows.length} approved Strategy Coach block${windows.length === 1 ? '' : 's'} ${windows.length === 1 ? 'has' : 'have'} finished. Race Intent is controlling the plan now.`;
}

export function seasonWindowStateLabel(window: StrategySeasonWindowView): string {
  if (window.state === 'active') return 'ACTIVE';
  if (window.state === 'scheduled') return 'UPCOMING';
  return 'COMPLETED';
}

export function phaseLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatStrategyWeek(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatDate(value: string | undefined): string | undefined {
  return value ? formatStrategyWeek(value) : undefined;
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + delta);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}
