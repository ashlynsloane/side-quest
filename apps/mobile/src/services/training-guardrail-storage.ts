import type { DailyTrainingCeiling, TrainingEvent } from '@circuit/planner';
import 'expo-sqlite/localStorage/install';

const VERSION = 1;
const PREFIX = 'sidequest.training-guardrails.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store {
  const candidate = (globalThis as unknown as { localStorage?: Store }).localStorage;
  if (!candidate) throw new Error('Training guardrail storage is unavailable');
  return candidate;
}
function scopedKey(userId: string, suffix: string): string {
  if (!userId.trim()) throw new Error('A user ID is required for guardrail persistence');
  return `${PREFIX}.${encodeURIComponent(userId)}.${suffix}`;
}
function parse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    const envelope: unknown = JSON.parse(value);
    if (!envelope || typeof envelope !== 'object' || !('version' in envelope) ||
        !('data' in envelope) || envelope.version !== VERSION) return null;
    return envelope.data as T;
  } catch {
    return null;
  }
}
function save<T>(key: string, data: T, store: Store): void {
  store.setItem(key, JSON.stringify({ version: VERSION, data }));
}

export function saveDailyCeiling(userId: string, ceiling: DailyTrainingCeiling, store: Store = storage()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ceiling.date)) throw new Error('Invalid ceiling date');
  save(scopedKey(userId, `ceiling.${ceiling.date}`), ceiling, store);
}

export function loadDailyCeiling(userId: string, date: string, store: Store = storage()): DailyTrainingCeiling | null {
  const result = parse<DailyTrainingCeiling>(store.getItem(scopedKey(userId, `ceiling.${date}`)));
  if (!result || result.date !== date || !Array.isArray(result.planned) || !result.recovery) return null;
  return result;
}

export function loadTrainingEvents(userId: string, store: Store = storage()): TrainingEvent[] {
  const result = parse<TrainingEvent[]>(store.getItem(scopedKey(userId, 'events')));
  return Array.isArray(result) ? result : [];
}

/** Idempotent append for retries; does not infer completion from a prescription. */
export function recordTrainingEvent(userId: string, event: TrainingEvent, store: Store = storage()): TrainingEvent[] {
  if (!event.id || !event.occurredAt || !['prescribed','completed','unplanned','override','recovery','assessment'].includes(event.kind)) {
    throw new Error('Invalid training event');
  }
  const history = loadTrainingEvents(userId, store);
  if (history.some((item) => item.id === event.id)) return history;
  const next = [...history, event];
  save(scopedKey(userId, 'events'), next, store);
  return next;
}
