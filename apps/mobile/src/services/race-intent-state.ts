import { validateRaceIntent, type RaceIntentV2 } from '@circuit/planner/race-intent';
import Storage from 'expo-sqlite/kv-store';

export const RACE_INTENT_KEY = 'circuit.race-intent.v2';

export interface SavedRaceIntentState {
  version: 2;
  blockId: string;
  intent: RaceIntentV2;
  updatedAt: string;
}

export function loadRaceIntent(blockId: string): SavedRaceIntentState | null {
  const raw = Storage.getItemSync(RACE_INTENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedRaceIntentState>;
    if (parsed.version !== 2 || parsed.blockId !== blockId || typeof parsed.updatedAt !== 'string') return null;
    if (!isPersistableIntent(parsed.intent)) return null;
    return { version: 2, blockId, intent: parsed.intent, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function saveRaceIntent(blockId: string, intent: RaceIntentV2): SavedRaceIntentState {
  if (!isPersistableIntent(intent)) throw new Error('Race priorities are incomplete or invalid.');
  const state: SavedRaceIntentState = {
    version: 2,
    blockId,
    intent,
    updatedAt: new Date().toISOString(),
  };
  Storage.setItemSync(RACE_INTENT_KEY, JSON.stringify(state));
  return state;
}

export function clearRaceIntent(): void {
  Storage.removeItemSync(RACE_INTENT_KEY);
}

export function exportRaceIntentState(): SavedRaceIntentState | null {
  const raw = Storage.getItemSync(RACE_INTENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedRaceIntentState>;
    return typeof parsed.blockId === 'string' ? loadRaceIntent(parsed.blockId) : null;
  } catch {
    return null;
  }
}

function isPersistableIntent(value: unknown): value is RaceIntentV2 {
  const item = value as RaceIntentV2 | null | undefined;
  if (!item || item.version !== 2 || !item.disciplinePriorities || typeof item.disciplinePriorities !== 'object') return false;
  // Persisted state is structurally validated against every endurance discipline.
  // Goal-specific membership is checked again before save/apply in the editor.
  return validateRaceIntent(item, ['swim', 'bike', 'run']).valid;
}
