import {
  buildStrategyMacrocycle,
  type StrategyMacrocycleView,
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
    approvedStrategy: review.approved?.strategy,
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
  const state = data.macrocycle.approvedWindowState;
  if (!state) return 'Race Intent baseline';
  if (state === 'scheduled') return 'Strategy scheduled';
  if (state === 'expired') return 'Strategy window ended';
  return 'Strategy active';
}

export function strategyWindowSummary(data: StrategyWorkspaceData): string {
  const macro = data.macrocycle;
  if (!data.review.approved) return 'No Strategy Coach override is approved. Race Intent is driving the long-horizon allocation.';
  if (macro.approvedWindowState === 'scheduled') {
    return `The approved strategy begins ${formatDate(macro.approvedStartsAt) ?? 'in a future planning week'}. Until then, Race Intent remains the planning baseline.`;
  }
  if (macro.approvedWindowState === 'expired') {
    return `The approved strategy window ended ${formatDate(macro.approvedEndsAt) ?? 'before this planning week'}. The planner has returned to Race Intent automatically.`;
  }
  if (macro.approvedEndsAt) {
    const returnLabel = macro.returnToRaceIntentWeek ? ` The first full planning week back on Race Intent begins ${formatDate(macro.returnToRaceIntentWeek)}.` : '';
    return `The approved Strategy Coach override is active through ${formatDate(macro.approvedEndsAt)}.${returnLabel}`;
  }
  return 'The approved Strategy Coach override is open-ended. Race Intent remains underneath it as the protected baseline.';
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
