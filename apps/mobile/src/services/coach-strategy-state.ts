import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';
import { validateCoachTurnFrame } from '@circuit/planner/coach-semantic-frame';
import {
  resolveSeasonStrategyForWeek,
  upsertSeasonStrategyEntry,
  validateSeasonStrategySchedule,
  type SeasonStrategyEntry,
} from '@circuit/planner/season-strategy';
import Storage from 'expo-sqlite/kv-store';

export const COACH_STRATEGY_KEY = 'circuit.coach-strategy.v1';
export const COACH_STRATEGY_SCHEDULE_KEY = 'circuit.coach-strategy-schedule.v1';

export interface ApprovedCoachStrategyState {
  version: 1;
  blockId: string;
  id?: string;
  strategy: CoachSemanticStrategyChange;
  approvedAt: string;
  sourceTurnId?: string;
}

export interface ApprovedCoachStrategyScheduleState {
  version: 1;
  blockId: string;
  windows: ApprovedCoachStrategyWindowState[];
  updatedAt: string;
}

export interface ApprovedCoachStrategyWindowState {
  id: string;
  strategy: CoachSemanticStrategyChange;
  approvedAt: string;
  sourceTurnId?: string;
}

export function loadApprovedCoachStrategy(
  blockId: string,
  referenceWeekStart: string = currentWeekStart(),
): ApprovedCoachStrategyState | null {
  const schedule = loadApprovedCoachStrategySchedule(blockId);
  if (!schedule.windows.length) return null;
  const resolved = resolveSeasonStrategyForWeek(schedule.windows, referenceWeekStart);
  const selected = resolved.entry ?? schedule.windows.at(-1);
  return selected ? approvedState(blockId, selected) : null;
}

export function loadApprovedCoachStrategySchedule(blockId: string): ApprovedCoachStrategyScheduleState {
  const scheduled = loadScheduleFromStorage(blockId);
  if (scheduled) return scheduled;
  const legacy = loadLegacyStrategy(blockId);
  if (!legacy) return emptySchedule(blockId);
  return {
    version: 1,
    blockId,
    windows: [{
      id: legacy.id ?? legacyWindowId(legacy.strategy, legacy.approvedAt),
      strategy: cloneStrategy(legacy.strategy),
      approvedAt: legacy.approvedAt,
      sourceTurnId: legacy.sourceTurnId,
    }],
    updatedAt: legacy.approvedAt,
  };
}

/**
 * Backward-compatible single-strategy save. New Strategy Coach approval should
 * use saveApprovedCoachStrategyWindow so an existing season schedule is not
 * silently replaced.
 */
export function saveApprovedCoachStrategy(
  blockId: string,
  strategy: CoachSemanticStrategyChange,
  sourceTurnId?: string,
): ApprovedCoachStrategyState {
  const validated = validatePersistedStrategy(strategy);
  if (!validated) throw new Error('The strategy draft is incomplete or invalid and cannot be approved yet.');
  const approvedAt = new Date().toISOString();
  const state: ApprovedCoachStrategyState = {
    version: 1,
    blockId,
    strategy: validated,
    approvedAt,
    sourceTurnId,
  };
  Storage.setItemSync(COACH_STRATEGY_KEY, JSON.stringify(state));
  return state;
}

export function saveApprovedCoachStrategyWindow(
  blockId: string,
  strategy: CoachSemanticStrategyChange,
  sourceTurnId?: string,
  replaceWindowId?: string,
): ApprovedCoachStrategyWindowState {
  const validated = validatePersistedStrategy(strategy);
  if (!validated) throw new Error('The strategy draft is incomplete or invalid and cannot be approved yet.');

  const schedule = loadApprovedCoachStrategySchedule(blockId);
  const sameBounds = schedule.windows.find((window) => sameWindowBounds(window.strategy, validated));
  const approvedAt = new Date().toISOString();
  const entry: ApprovedCoachStrategyWindowState = {
    id: replaceWindowId ?? sameBounds?.id ?? createWindowId(validated, approvedAt),
    strategy: validated,
    approvedAt,
    sourceTurnId,
  };
  const windows = upsertSeasonStrategyEntry(schedule.windows, entry).map(toWindowState);
  persistSchedule({ version: 1, blockId, windows, updatedAt: approvedAt });
  mirrorLegacy(blockId, entry);
  return cloneWindow(entry);
}

export function removeApprovedCoachStrategyWindow(blockId: string, windowId: string): ApprovedCoachStrategyScheduleState {
  const schedule = loadApprovedCoachStrategySchedule(blockId);
  const windows = schedule.windows.filter((window) => window.id !== windowId).map(cloneWindow);
  const next: ApprovedCoachStrategyScheduleState = {
    version: 1,
    blockId,
    windows,
    updatedAt: new Date().toISOString(),
  };
  persistSchedule(next);
  const relevant = selectRelevantWindow(windows, currentWeekStart());
  if (relevant) mirrorLegacy(blockId, relevant);
  else Storage.removeItemSync(COACH_STRATEGY_KEY);
  return cloneSchedule(next);
}

export function replaceApprovedCoachStrategySchedule(
  blockId: string,
  windows: ApprovedCoachStrategyWindowState[],
): ApprovedCoachStrategyScheduleState {
  const entries: SeasonStrategyEntry[] = windows.map((window) => ({
    ...window,
    strategy: cloneStrategy(window.strategy),
  }));
  const validation = validateSeasonStrategySchedule(entries);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  for (const entry of entries) {
    if (!validatePersistedStrategy(entry.strategy)) throw new Error(`Strategy window ${entry.id} is invalid.`);
  }
  const next: ApprovedCoachStrategyScheduleState = {
    version: 1,
    blockId,
    windows: entries.map(toWindowState),
    updatedAt: new Date().toISOString(),
  };
  persistSchedule(next);
  const relevant = selectRelevantWindow(next.windows, currentWeekStart());
  if (relevant) mirrorLegacy(blockId, relevant);
  else Storage.removeItemSync(COACH_STRATEGY_KEY);
  return cloneSchedule(next);
}

export function clearApprovedCoachStrategy(): void {
  Storage.removeItemSync(COACH_STRATEGY_KEY);
  Storage.removeItemSync(COACH_STRATEGY_SCHEDULE_KEY);
}

export function exportApprovedCoachStrategyState(): ApprovedCoachStrategyState | null {
  const raw = Storage.getItemSync(COACH_STRATEGY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApprovedCoachStrategyState>;
    if (parsed.version !== 1 || typeof parsed.blockId !== 'string') return null;
    return loadLegacyStrategy(parsed.blockId);
  } catch {
    return null;
  }
}

export function exportApprovedCoachStrategyScheduleState(): ApprovedCoachStrategyScheduleState | null {
  const raw = Storage.getItemSync(COACH_STRATEGY_SCHEDULE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApprovedCoachStrategyScheduleState>;
    if (parsed.version !== 1 || typeof parsed.blockId !== 'string') return null;
    return loadScheduleFromStorage(parsed.blockId);
  } catch {
    return null;
  }
}

function loadScheduleFromStorage(blockId: string): ApprovedCoachStrategyScheduleState | null {
  const raw = Storage.getItemSync(COACH_STRATEGY_SCHEDULE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApprovedCoachStrategyScheduleState>;
    if (parsed.version !== 1 || parsed.blockId !== blockId || !Array.isArray(parsed.windows)) return null;
    const windows: ApprovedCoachStrategyWindowState[] = [];
    for (const candidate of parsed.windows) {
      if (!candidate || typeof candidate !== 'object') return null;
      const value = candidate as Partial<ApprovedCoachStrategyWindowState>;
      if (typeof value.id !== 'string' || typeof value.approvedAt !== 'string') return null;
      const strategy = validatePersistedStrategy(value.strategy);
      if (!strategy) return null;
      windows.push({
        id: value.id,
        strategy,
        approvedAt: value.approvedAt,
        sourceTurnId: typeof value.sourceTurnId === 'string' ? value.sourceTurnId : undefined,
      });
    }
    const validation = validateSeasonStrategySchedule(windows);
    if (!validation.valid) return null;
    return {
      version: 1,
      blockId,
      windows: windows.map(cloneWindow),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : windows.at(-1)?.approvedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function loadLegacyStrategy(blockId: string): ApprovedCoachStrategyState | null {
  const raw = Storage.getItemSync(COACH_STRATEGY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApprovedCoachStrategyState>;
    if (parsed.version !== 1 || parsed.blockId !== blockId || typeof parsed.approvedAt !== 'string') return null;
    const strategy = validatePersistedStrategy(parsed.strategy);
    if (!strategy) return null;
    return {
      version: 1,
      blockId,
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      strategy,
      approvedAt: parsed.approvedAt,
      sourceTurnId: typeof parsed.sourceTurnId === 'string' ? parsed.sourceTurnId : undefined,
    };
  } catch {
    return null;
  }
}

function persistSchedule(state: ApprovedCoachStrategyScheduleState): void {
  Storage.setItemSync(COACH_STRATEGY_SCHEDULE_KEY, JSON.stringify(state));
}

function mirrorLegacy(blockId: string, window: ApprovedCoachStrategyWindowState): void {
  Storage.setItemSync(COACH_STRATEGY_KEY, JSON.stringify({
    version: 1,
    blockId,
    id: window.id,
    strategy: window.strategy,
    approvedAt: window.approvedAt,
    sourceTurnId: window.sourceTurnId,
  } satisfies ApprovedCoachStrategyState));
}

function approvedState(blockId: string, entry: SeasonStrategyEntry): ApprovedCoachStrategyState {
  return {
    version: 1,
    blockId,
    id: entry.id,
    strategy: cloneStrategy(entry.strategy),
    approvedAt: entry.approvedAt ?? new Date().toISOString(),
    sourceTurnId: entry.sourceTurnId,
  };
}

function selectRelevantWindow(
  windows: ApprovedCoachStrategyWindowState[],
  referenceWeekStart: string,
): ApprovedCoachStrategyWindowState | undefined {
  const resolved = resolveSeasonStrategyForWeek(windows, referenceWeekStart);
  return resolved.entry ? toWindowState(resolved.entry) : windows.at(-1);
}

function validatePersistedStrategy(value: unknown): CoachSemanticStrategyChange | null {
  const result = validateCoachTurnFrame({
    version: 2,
    turnId: 'persisted-strategy',
    intent: 'strategy_change',
    horizon: 'long_term',
    events: [],
    symptoms: [],
    strategyChange: value,
    constraints: [],
    unresolved: [],
    confidence: 1,
    source: 'language_model',
  });
  return result.valid ? result.frame?.strategyChange ?? null : null;
}

function sameWindowBounds(left: CoachSemanticStrategyChange, right: CoachSemanticStrategyChange): boolean {
  return (left.startsAt ?? null) === (right.startsAt ?? null)
    && (left.endsAt ?? null) === (right.endsAt ?? null);
}

function createWindowId(strategy: CoachSemanticStrategyChange, approvedAt: string): string {
  const focus = strategy.primaryFocus ?? 'strategy';
  const start = strategy.startsAt ?? 'now';
  return `season_${focus}_${start}_${approvedAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
}

function legacyWindowId(strategy: CoachSemanticStrategyChange, approvedAt: string): string {
  return `legacy_${strategy.primaryFocus ?? 'strategy'}_${strategy.startsAt ?? 'open'}_${approvedAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
}

function toWindowState(entry: SeasonStrategyEntry): ApprovedCoachStrategyWindowState {
  return {
    id: entry.id,
    strategy: cloneStrategy(entry.strategy),
    approvedAt: entry.approvedAt ?? new Date().toISOString(),
    sourceTurnId: entry.sourceTurnId,
  };
}

function cloneWindow(window: ApprovedCoachStrategyWindowState): ApprovedCoachStrategyWindowState {
  return {
    ...window,
    strategy: cloneStrategy(window.strategy),
  };
}

function cloneSchedule(state: ApprovedCoachStrategyScheduleState): ApprovedCoachStrategyScheduleState {
  return { ...state, windows: state.windows.map(cloneWindow) };
}

function cloneStrategy(strategy: CoachSemanticStrategyChange): CoachSemanticStrategyChange {
  return {
    ...strategy,
    disciplineObjectives: { ...strategy.disciplineObjectives },
    racePriority: strategy.racePriority ? { ...strategy.racePriority } : undefined,
  };
}

function emptySchedule(blockId: string): ApprovedCoachStrategyScheduleState {
  return { version: 1, blockId, windows: [], updatedAt: new Date(0).toISOString() };
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + delta);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}
