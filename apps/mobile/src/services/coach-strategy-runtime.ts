import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';
import {
  coachStrategyWindowStateForWeek,
  type CoachStrategyWindowState,
} from '@circuit/planner/coach-strategy-window';

import { getLatestTrainingBlock } from './database';
import { loadCoachDialogueV2, saveCoachDialogueV2 } from './coach-dialogue-v2';
import {
  latestUndoableCoachStrategyRevision,
  markCoachStrategyRevisionReverted,
  recordCoachStrategyScheduleRevision,
  type CoachStrategyScheduleRevision,
} from './coach-strategy-history-state';
import {
  clearApprovedCoachStrategy,
  loadApprovedCoachStrategy,
  loadApprovedCoachStrategySchedule,
  removeApprovedCoachStrategyWindow,
  replaceApprovedCoachStrategySchedule,
  saveApprovedCoachStrategyWindow,
  type ApprovedCoachStrategyScheduleState,
  type ApprovedCoachStrategyState,
  type ApprovedCoachStrategyWindowState,
} from './coach-strategy-state';
import {
  loadStrategyConversationState,
  setStrategyConversationEditingWindow,
  setStrategyConversationNewWindow,
} from './strategy-conversation-state';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export interface CoachStrategyReview {
  blockId: string;
  draft?: CoachSemanticStrategyChange;
  approved?: ApprovedCoachStrategyState;
  schedule: ApprovedCoachStrategyScheduleState;
  approvedWindowState?: CoachStrategyWindowState;
  editingWindowId?: string;
  creatingNewWindow?: boolean;
  suggestedWindowStart?: string;
  draftTurnId?: string;
  hasUnapprovedChanges: boolean;
  latestRevision?: CoachStrategyScheduleRevision;
}

export async function loadCoachStrategyReview(): Promise<CoachStrategyReview | null> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) return null;
  const dialogue = loadCoachDialogueV2(block.id);
  const conversation = loadStrategyConversationState(block.id);
  const schedule = loadApprovedCoachStrategySchedule(block.id);
  const approved = loadApprovedCoachStrategy(block.id) ?? undefined;
  const draft = dialogue.strategyDraft;
  const editingWindow = conversation.editingWindowId
    ? schedule.windows.find((window) => window.id === conversation.editingWindowId)
    : undefined;
  const draftMatches = draft
    ? editingWindow
      ? sameStrategy(draft, editingWindow.strategy)
      : schedule.windows.some((window) => sameStrategy(draft, window.strategy))
    : true;
  return {
    blockId: block.id,
    draft,
    approved,
    schedule,
    approvedWindowState: approved ? coachStrategyWindowStateForWeek(approved.strategy, currentWeekStart()) : undefined,
    editingWindowId: conversation.editingWindowId,
    creatingNewWindow: conversation.creatingNewWindow,
    suggestedWindowStart: conversation.suggestedWindowStart,
    draftTurnId: dialogue.updatedAtTurnId,
    hasUnapprovedChanges: Boolean(draft && !draftMatches),
    latestRevision: latestUndoableCoachStrategyRevision(block.id) ?? undefined,
  };
}

export async function approveCurrentCoachStrategyDraft(): Promise<ApprovedCoachStrategyWindowState> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const dialogue = loadCoachDialogueV2(block.id);
  if (!dialogue.strategyDraft) throw new Error('There is no strategy draft to approve yet.');
  const conversation = loadStrategyConversationState(block.id);
  const previousSchedule = loadApprovedCoachStrategySchedule(block.id);
  let approved: ApprovedCoachStrategyWindowState;
  try {
    approved = saveApprovedCoachStrategyWindow(
      block.id,
      dialogue.strategyDraft,
      dialogue.updatedAtTurnId,
      conversation.editingWindowId,
    );
  } catch (caught) {
    throw new Error(caught instanceof Error
      ? `That strategy window cannot be added to the season plan: ${caught.message}`
      : 'That strategy window cannot be added to the season plan.');
  }
  const nextSchedule = loadApprovedCoachStrategySchedule(block.id);
  const existedBefore = previousSchedule.windows.some((window) => window.id === approved.id);

  try {
    await refreshLatestWholeAthletePlan();
    setStrategyConversationEditingWindow(conversation, undefined);
    recordCoachStrategyScheduleRevision({
      blockId: block.id,
      action: existedBefore ? 'update' : 'add',
      changedWindowId: approved.id,
      before: previousSchedule.windows,
      after: nextSchedule.windows,
    });
  } catch (caught) {
    replaceApprovedCoachStrategySchedule(block.id, previousSchedule.windows);
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback reconciliation */ }
    throw new Error(caught instanceof Error
      ? `The strategy was not applied because the block could not be reconciled safely: ${caught.message}`
      : 'The strategy was not applied because the block could not be reconciled safely.');
  }
  return approved;
}

export async function discardCurrentCoachStrategyDraft(): Promise<void> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) return;
  const dialogue = loadCoachDialogueV2(block.id);
  const conversation = loadStrategyConversationState(block.id);
  const schedule = loadApprovedCoachStrategySchedule(block.id);
  const editing = conversation.editingWindowId
    ? schedule.windows.find((window) => window.id === conversation.editingWindowId)
    : undefined;
  saveCoachDialogueV2(block.id, {
    ...dialogue,
    strategyDraft: editing?.strategy ? cloneStrategy(editing.strategy) : undefined,
  });
  setStrategyConversationEditingWindow(conversation, editing?.id);
}

export async function beginEditingApprovedCoachStrategyWindow(windowId: string): Promise<CoachStrategyReview> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const schedule = loadApprovedCoachStrategySchedule(block.id);
  const window = schedule.windows.find((candidate) => candidate.id === windowId);
  if (!window) throw new Error('That season strategy window is no longer available.');
  const dialogue = loadCoachDialogueV2(block.id);
  saveCoachDialogueV2(block.id, { ...dialogue, strategyDraft: cloneStrategy(window.strategy) });
  const conversation = loadStrategyConversationState(block.id);
  setStrategyConversationEditingWindow(conversation, window.id);
  const review = await loadCoachStrategyReview();
  if (!review) throw new Error('Side Quest could not reopen that season strategy window.');
  return review;
}

export async function beginNewCoachStrategyWindow(): Promise<CoachStrategyReview> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const schedule = loadApprovedCoachStrategySchedule(block.id);
  const suggestedStart = suggestedNewWindowStart(schedule);
  const dialogue = loadCoachDialogueV2(block.id);
  saveCoachDialogueV2(block.id, { ...dialogue, strategyDraft: undefined });
  const conversation = loadStrategyConversationState(block.id);
  setStrategyConversationNewWindow(conversation, suggestedStart);
  const review = await loadCoachStrategyReview();
  if (!review) throw new Error('Side Quest could not start a new strategy window.');
  return review;
}

export async function stopApprovedCoachStrategy(windowId?: string): Promise<void> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) {
    clearApprovedCoachStrategy();
    return;
  }
  const block = saved.block;
  const previousSchedule = loadApprovedCoachStrategySchedule(block.id);
  const relevant = loadApprovedCoachStrategy(block.id);
  const targetId = windowId ?? relevant?.id;
  if (!targetId) return;
  const previousDialogue = loadCoachDialogueV2(block.id);
  const previousConversation = loadStrategyConversationState(block.id);
  const nextSchedule = removeApprovedCoachStrategyWindow(block.id, targetId);
  if (previousConversation.editingWindowId === targetId) {
    setStrategyConversationEditingWindow(previousConversation, undefined);
    saveCoachDialogueV2(block.id, { ...previousDialogue, strategyDraft: undefined });
  }
  try {
    await refreshLatestWholeAthletePlan();
    recordCoachStrategyScheduleRevision({
      blockId: block.id,
      action: 'remove',
      changedWindowId: targetId,
      before: previousSchedule.windows,
      after: nextSchedule.windows,
    });
  } catch (caught) {
    replaceApprovedCoachStrategySchedule(block.id, previousSchedule.windows);
    saveCoachDialogueV2(block.id, previousDialogue);
    setStrategyConversationEditingWindow(previousConversation, previousConversation.editingWindowId);
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback reconciliation */ }
    throw new Error(caught instanceof Error
      ? `The prior season strategy was restored because replanning failed: ${caught.message}`
      : 'The prior season strategy was restored because replanning failed.');
  }
}

export async function undoLatestCoachStrategyScheduleChange(): Promise<CoachStrategyScheduleRevision> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const revision = latestUndoableCoachStrategyRevision(block.id);
  if (!revision) throw new Error('There is no season strategy change to undo.');
  const currentSchedule = loadApprovedCoachStrategySchedule(block.id);
  const dialogue = loadCoachDialogueV2(block.id);
  const conversation = loadStrategyConversationState(block.id);
  replaceApprovedCoachStrategySchedule(block.id, revision.before);
  saveCoachDialogueV2(block.id, { ...dialogue, strategyDraft: undefined });
  setStrategyConversationEditingWindow(conversation, undefined);
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    replaceApprovedCoachStrategySchedule(block.id, currentSchedule.windows);
    saveCoachDialogueV2(block.id, dialogue);
    setStrategyConversationEditingWindow(conversation, conversation.editingWindowId);
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback reconciliation */ }
    throw new Error(caught instanceof Error
      ? `The season strategy change could not be undone safely: ${caught.message}`
      : 'The season strategy change could not be undone safely.');
  }
  const undo = markCoachStrategyRevisionReverted(revision.id, revision.before);
  if (!undo) throw new Error('The season strategy was restored, but Side Quest could not update its revision history.');
  return undo;
}

function suggestedNewWindowStart(schedule: ApprovedCoachStrategyScheduleState): string {
  const current = currentWeekStart();
  if (!schedule.windows.length) return current;
  if (schedule.windows.some((window) => !window.strategy.endsAt)) {
    throw new Error('The final season block is open-ended. Give that block an end date before adding another block after it.');
  }
  const lastEnd = schedule.windows
    .map((window) => window.strategy.endsAt!)
    .sort()
    .at(-1);
  if (!lastEnd) return current;
  const afterLast = addDays(planningWeekStart(lastEnd), 7);
  return afterLast > current ? afterLast : current;
}

function planningWeekStart(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sameStrategy(
  left: CoachSemanticStrategyChange,
  right: CoachSemanticStrategyChange | undefined,
): boolean {
  if (!right) return false;
  return stableStrategy(left) === stableStrategy(right);
}

function stableStrategy(value: CoachSemanticStrategyChange): string {
  return JSON.stringify({
    startsAt: value.startsAt ?? null,
    endsAt: value.endsAt ?? null,
    primaryFocus: value.primaryFocus ?? null,
    disciplineObjectives: {
      swim: value.disciplineObjectives.swim ?? null,
      bike: value.disciplineObjectives.bike ?? null,
      run: value.disciplineObjectives.run ?? null,
      strength: value.disciplineObjectives.strength ?? null,
    },
    tradeoffTolerance: value.tradeoffTolerance ?? null,
    racePriority: value.racePriority ? {
      discipline: value.racePriority.discipline ?? null,
      objective: value.racePriority.objective ?? null,
      target: value.racePriority.target ?? null,
    } : null,
  });
}

function cloneStrategy(value: CoachSemanticStrategyChange): CoachSemanticStrategyChange {
  return {
    ...value,
    disciplineObjectives: { ...value.disciplineObjectives },
    racePriority: value.racePriority ? { ...value.racePriority } : undefined,
  };
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + delta);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}
