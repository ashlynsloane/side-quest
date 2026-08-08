import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';

import { getLatestTrainingBlock } from './database';
import { interpretCoachTurnV2, loadCoachDialogueV2, saveCoachDialogueV2 } from './coach-dialogue-v2';
import { loadCoachStrategyReview } from './coach-strategy-runtime';
import {
  appendStrategyConversationTurn,
  loadStrategyConversationState,
  type StrategyConversationState,
} from './strategy-conversation-state';

export interface StrategyCoachMessageResult {
  conversation: StrategyConversationState;
  response: string;
  draft?: CoachSemanticStrategyChange;
  needsClarification: boolean;
}

export async function sendStrategyCoachMessage(message: string): Promise<StrategyCoachMessageResult> {
  const text = message.trim();
  if (!text) throw new Error('Tell Side Quest what you want to change about the longer-term training strategy.');
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('Create a training plan before starting a Strategy Coach conversation.');

  await rebaseExpiredStrategyDraft(block.id);
  let conversation = loadStrategyConversationState(block.id);
  conversation = appendStrategyConversationTurn(conversation, 'athlete', text);
  const semantic = await interpretCoachTurnV2(text, undefined);

  if (!semantic) {
    const response = 'I could not map that into the current strategy safely. Try describing the discipline you want to emphasize, maintain, or protect and the time window you have in mind.';
    conversation = appendStrategyConversationTurn(conversation, 'coach', response);
    return { conversation, response, needsClarification: true };
  }

  if (semantic.frame.intent !== 'strategy_change') {
    const response = 'This Strategy thread is for changes that span weeks or months. Tell me what you want to emphasize, maintain, or trade away over the longer horizon; use Today for an individual workout or immediate symptom/schedule change.';
    conversation = appendStrategyConversationTurn(conversation, 'coach', response);
    return { conversation, response, draft: semantic.state.strategyDraft, needsClarification: true };
  }

  if (semantic.directive.clarification) {
    const response = semantic.directive.clarification.prompt;
    conversation = appendStrategyConversationTurn(conversation, 'coach', response);
    return { conversation, response, draft: semantic.state.strategyDraft, needsClarification: true };
  }

  let draft = semantic.state.strategyDraft;
  if (!draft) {
    const response = 'I need one more strategy detail before I can build a reviewable draft.';
    conversation = appendStrategyConversationTurn(conversation, 'coach', response);
    return { conversation, response, needsClarification: true };
  }

  if (
    semantic.usedFallback
    && conversation.creatingNewWindow
    && conversation.suggestedWindowStart
  ) {
    const placement = placeRelativeFallbackDraft(draft, conversation.suggestedWindowStart);
    if (!placement.ok) {
      conversation = appendStrategyConversationTurn(conversation, 'coach', placement.message);
      return { conversation, response: placement.message, draft, needsClarification: true };
    }
    if (placement.changed) {
      draft = placement.strategy;
      saveCoachDialogueV2(block.id, { ...semantic.state, strategyDraft: draft });
    }
  }

  const response = `${strategyDraftSummary(draft)}\n\nDraft updated. Nothing in the training plan changes until you approve it.`;
  conversation = appendStrategyConversationTurn(conversation, 'coach', response);
  return { conversation, response, draft, needsClarification: false };
}

export async function loadStrategyCoachConversation(): Promise<StrategyConversationState | null> {
  const saved = await getLatestTrainingBlock();
  return saved?.block ? loadStrategyConversationState(saved.block.id) : null;
}

async function rebaseExpiredStrategyDraft(blockId: string): Promise<void> {
  const review = await loadCoachStrategyReview();
  if (
    !review
    || review.blockId !== blockId
    || review.editingWindowId
    || review.approvedWindowState !== 'expired'
    || review.hasUnapprovedChanges
    || !review.approved
  ) return;
  const dialogue = loadCoachDialogueV2(blockId);
  if (!dialogue.strategyDraft) return;
  const prior = review.approved.strategy;
  saveCoachDialogueV2(blockId, {
    ...dialogue,
    strategyDraft: {
      ...prior,
      startsAt: undefined,
      endsAt: undefined,
      disciplineObjectives: { ...prior.disciplineObjectives },
      racePriority: prior.racePriority ? { ...prior.racePriority } : undefined,
    },
  });
}

function placeRelativeFallbackDraft(
  strategy: CoachSemanticStrategyChange,
  suggestedStart: string,
): { ok: true; strategy: CoachSemanticStrategyChange; changed: boolean } | { ok: false; message: string } {
  const today = localDate();
  const hasRelativeStart = strategy.startsAt === today;
  const hasNoStart = !strategy.startsAt;

  // The deterministic interpreter only manufactures today's date for relative
  // windows such as "next 8 weeks." Explicit future dates are left untouched.
  if (!hasRelativeStart && !hasNoStart) return { ok: true, strategy, changed: false };

  if (hasNoStart && strategy.endsAt && strategy.endsAt < suggestedStart) {
    return {
      ok: false,
      message: `That end date falls before the next available season block, which begins ${formatDate(suggestedStart)}. Give this block a later end date or edit an existing block instead.`,
    };
  }

  let endsAt = strategy.endsAt;
  if (hasRelativeStart && strategy.endsAt) {
    const spanDays = differenceDays(strategy.startsAt!, strategy.endsAt);
    endsAt = addDays(suggestedStart, Math.max(0, spanDays));
  }

  const placed: CoachSemanticStrategyChange = {
    ...strategy,
    startsAt: suggestedStart,
    endsAt,
    disciplineObjectives: { ...strategy.disciplineObjectives },
    racePriority: strategy.racePriority ? { ...strategy.racePriority } : undefined,
  };
  return { ok: true, strategy: placed, changed: placed.startsAt !== strategy.startsAt || placed.endsAt !== strategy.endsAt };
}

function strategyDraftSummary(strategy: CoachSemanticStrategyChange): string {
  const parts: string[] = [];
  if (strategy.primaryFocus) parts.push(`${label(strategy.primaryFocus)} is the top focus.`);
  const objectives = Object.entries(strategy.disciplineObjectives)
    .filter(([, objective]) => Boolean(objective))
    .map(([discipline, objective]) => `${label(discipline)} · ${String(objective).replaceAll('_', ' ')}`);
  if (objectives.length) parts.push(objectives.join('  •  '));
  if (strategy.tradeoffTolerance) parts.push(`Tradeoff · ${strategy.tradeoffTolerance.replaceAll('_', ' ')}`);
  if (strategy.startsAt || strategy.endsAt) parts.push(`Window · ${strategy.startsAt ?? 'now'} → ${strategy.endsAt ?? 'open-ended'}`);
  if (strategy.racePriority?.objective) {
    const discipline = strategy.racePriority.discipline ? `${label(strategy.racePriority.discipline)} · ` : '';
    parts.push(`Race priority · ${discipline}${strategy.racePriority.objective.replaceAll('_', ' ')}`);
  }
  return parts.join('\n') || 'Long-horizon strategy draft updated.';
}

function differenceDays(start: string, end: string): number {
  const startTime = new Date(`${start}T12:00:00Z`).getTime();
  const endTime = new Date(`${end}T12:00:00Z`).getTime();
  return Math.round((endTime - startTime) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}
