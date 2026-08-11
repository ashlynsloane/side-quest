import Storage from 'expo-sqlite/kv-store';

import type { ApprovedCoachStrategyWindowState } from './coach-strategy-state';

export const COACH_STRATEGY_HISTORY_KEY = 'circuit.coach-strategy-history.v1';
const MAX_REVISIONS = 40;

export type CoachStrategyRevisionAction = 'add' | 'update' | 'remove' | 'undo';

export interface CoachStrategyScheduleRevision {
  id: string;
  blockId: string;
  action: CoachStrategyRevisionAction;
  changedWindowId?: string;
  before: ApprovedCoachStrategyWindowState[];
  after: ApprovedCoachStrategyWindowState[];
  createdAt: string;
  revertedAt?: string;
  revertsRevisionId?: string;
}

interface CoachStrategyHistoryState {
  version: 1;
  revisions: CoachStrategyScheduleRevision[];
}

export function listCoachStrategyScheduleRevisions(blockId?: string): CoachStrategyScheduleRevision[] {
  const state = loadState();
  return state.revisions
    .filter((revision) => !blockId || revision.blockId === blockId)
    .map(cloneRevision)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function recordCoachStrategyScheduleRevision(input: {
  blockId: string;
  action: Exclude<CoachStrategyRevisionAction, 'undo'>;
  changedWindowId?: string;
  before: ApprovedCoachStrategyWindowState[];
  after: ApprovedCoachStrategyWindowState[];
}): CoachStrategyScheduleRevision {
  const createdAt = new Date().toISOString();
  const revision: CoachStrategyScheduleRevision = {
    id: `season_revision_${createdAt.replace(/[^0-9]/g, '')}_${Math.random().toString(36).slice(2, 7)}`,
    blockId: input.blockId,
    action: input.action,
    changedWindowId: input.changedWindowId,
    before: input.before.map(cloneWindow),
    after: input.after.map(cloneWindow),
    createdAt,
  };
  const state = loadState();
  saveState({ version: 1, revisions: [...state.revisions, revision].slice(-MAX_REVISIONS) });
  return cloneRevision(revision);
}

export function markCoachStrategyRevisionReverted(
  revisionId: string,
  afterUndo: ApprovedCoachStrategyWindowState[],
): CoachStrategyScheduleRevision | null {
  const state = loadState();
  const target = state.revisions.find((revision) => revision.id === revisionId);
  if (!target || target.revertedAt) return null;
  const revertedAt = new Date().toISOString();
  target.revertedAt = revertedAt;
  const undo: CoachStrategyScheduleRevision = {
    id: `season_revision_${revertedAt.replace(/[^0-9]/g, '')}_${Math.random().toString(36).slice(2, 7)}`,
    blockId: target.blockId,
    action: 'undo',
    changedWindowId: target.changedWindowId,
    before: target.after.map(cloneWindow),
    after: afterUndo.map(cloneWindow),
    createdAt: revertedAt,
    revertsRevisionId: target.id,
  };
  saveState({ version: 1, revisions: [...state.revisions, undo].slice(-MAX_REVISIONS) });
  return cloneRevision(undo);
}

export function latestUndoableCoachStrategyRevision(blockId: string): CoachStrategyScheduleRevision | null {
  return listCoachStrategyScheduleRevisions(blockId)
    .find((revision) => revision.action !== 'undo' && !revision.revertedAt) ?? null;
}

export function clearCoachStrategyHistoryState(): void {
  Storage.removeItemSync(COACH_STRATEGY_HISTORY_KEY);
}

export function exportCoachStrategyHistoryState(): CoachStrategyHistoryState | null {
  const raw = Storage.getItemSync(COACH_STRATEGY_HISTORY_KEY);
  if (!raw) return null;
  return loadState();
}

function loadState(): CoachStrategyHistoryState {
  const raw = Storage.getItemSync(COACH_STRATEGY_HISTORY_KEY);
  if (!raw) return { version: 1, revisions: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<CoachStrategyHistoryState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.revisions)) return { version: 1, revisions: [] };
    return {
      version: 1,
      revisions: parsed.revisions.filter(isRevision).slice(-MAX_REVISIONS).map(cloneRevision),
    };
  } catch {
    return { version: 1, revisions: [] };
  }
}

function saveState(state: CoachStrategyHistoryState): void {
  Storage.setItemSync(COACH_STRATEGY_HISTORY_KEY, JSON.stringify(state));
}

function isRevision(value: unknown): value is CoachStrategyScheduleRevision {
  const revision = value as Partial<CoachStrategyScheduleRevision> | null | undefined;
  return Boolean(
    revision
    && typeof revision.id === 'string'
    && typeof revision.blockId === 'string'
    && (revision.action === 'add' || revision.action === 'update' || revision.action === 'remove' || revision.action === 'undo')
    && Array.isArray(revision.before)
    && Array.isArray(revision.after)
    && typeof revision.createdAt === 'string',
  );
}

function cloneRevision(revision: CoachStrategyScheduleRevision): CoachStrategyScheduleRevision {
  return {
    ...revision,
    before: revision.before.map(cloneWindow),
    after: revision.after.map(cloneWindow),
  };
}

function cloneWindow(window: ApprovedCoachStrategyWindowState): ApprovedCoachStrategyWindowState {
  return {
    ...window,
    strategy: {
      ...window.strategy,
      disciplineObjectives: { ...window.strategy.disciplineObjectives },
      racePriority: window.strategy.racePriority ? { ...window.strategy.racePriority } : undefined,
    },
  };
}
