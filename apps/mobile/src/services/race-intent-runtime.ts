import {
  defaultRaceIntent,
  validateRaceIntent,
  type RaceIntentV2,
} from '@circuit/planner/race-intent';

import { getLatestTrainingBlock } from './database';
import {
  clearRaceIntent,
  loadRaceIntent,
  saveRaceIntent,
  type SavedRaceIntentState,
} from './race-intent-state';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export interface RaceIntentEditorState {
  blockId: string;
  goalName: string;
  disciplines: Array<'swim' | 'bike' | 'run'>;
  intent: RaceIntentV2;
  customized: boolean;
}

export async function loadRaceIntentEditorState(): Promise<RaceIntentEditorState | null> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block || block.goal.type === 'general_offseason' || block.goal.disciplines.length === 0) return null;
  const persisted = loadRaceIntent(block.id);
  return {
    blockId: block.id,
    goalName: block.goal.name,
    disciplines: [...block.goal.disciplines],
    intent: persisted?.intent ?? defaultRaceIntent(block.goal.type, block.goal.disciplines, block.goal.priority),
    customized: Boolean(persisted),
  };
}

export async function applyRaceIntent(intent: RaceIntentV2): Promise<SavedRaceIntentState> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const validation = validateRaceIntent(intent, block.goal.disciplines);
  if (!validation.valid) throw new Error(validation.errors[0] ?? 'Review the race priorities before applying them.');
  const previous = loadRaceIntent(block.id);
  const next = saveRaceIntent(block.id, intent);
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    clearRaceIntent();
    if (previous) saveRaceIntent(previous.blockId, previous.intent);
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback */ }
    throw new Error(caught instanceof Error
      ? `Race priorities were not applied because the plan could not be reconciled safely: ${caught.message}`
      : 'Race priorities were not applied because the plan could not be reconciled safely.');
  }
  return next;
}

export async function resetRaceIntent(): Promise<void> {
  const saved = await getLatestTrainingBlock();
  const previous = saved?.block ? loadRaceIntent(saved.block.id) : null;
  clearRaceIntent();
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    if (previous) saveRaceIntent(previous.blockId, previous.intent);
    try { await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback */ }
    throw new Error(caught instanceof Error
      ? `Race priorities were restored because replanning failed: ${caught.message}`
      : 'Race priorities were restored because replanning failed.');
  }
}
