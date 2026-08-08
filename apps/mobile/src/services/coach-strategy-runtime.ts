import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';

import { getLatestTrainingBlock } from './database';
import { loadCoachDialogueV2 } from './coach-dialogue-v2';
import {
  clearApprovedCoachStrategy,
  loadApprovedCoachStrategy,
  saveApprovedCoachStrategy,
  type ApprovedCoachStrategyState,
} from './coach-strategy-state';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export interface CoachStrategyReview {
  blockId: string;
  draft?: CoachSemanticStrategyChange;
  approved?: ApprovedCoachStrategyState;
  draftTurnId?: string;
  hasUnapprovedChanges: boolean;
}

export async function loadCoachStrategyReview(): Promise<CoachStrategyReview | null> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) return null;
  const dialogue = loadCoachDialogueV2(block.id);
  const approved = loadApprovedCoachStrategy(block.id) ?? undefined;
  const draft = dialogue.strategyDraft;
  return {
    blockId: block.id,
    draft,
    approved,
    draftTurnId: dialogue.updatedAtTurnId,
    hasUnapprovedChanges: Boolean(draft && !sameStrategy(draft, approved?.strategy)),
  };
}

export async function approveCurrentCoachStrategyDraft(): Promise<ApprovedCoachStrategyState> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const dialogue = loadCoachDialogueV2(block.id);
  if (!dialogue.strategyDraft) throw new Error('There is no strategy draft to approve yet.');
  const approved = saveApprovedCoachStrategy(block.id, dialogue.strategyDraft, dialogue.updatedAtTurnId);
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    clearApprovedCoachStrategy();
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback reconciliation */ }
    throw new Error(caught instanceof Error
      ? `The strategy was not applied because the week could not be reconciled safely: ${caught.message}`
      : 'The strategy was not applied because the week could not be reconciled safely.');
  }
  return approved;
}

export async function stopApprovedCoachStrategy(): Promise<void> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) {
    clearApprovedCoachStrategy();
    return;
  }
  const previous = loadApprovedCoachStrategy(saved.block.id);
  clearApprovedCoachStrategy();
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    if (previous) saveApprovedCoachStrategy(previous.blockId, previous.strategy, previous.sourceTurnId);
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback reconciliation */ }
    throw new Error(caught instanceof Error
      ? `The prior strategy was restored because replanning failed: ${caught.message}`
      : 'The prior strategy was restored because replanning failed.');
  }
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
