import Storage from 'expo-sqlite/kv-store';

export const STRATEGY_CONVERSATION_KEY = 'circuit.strategy-conversation.v1';
const MAX_TURNS = 40;
const MAX_STATE_AGE_DAYS = 7;

export interface StrategyConversationTurn {
  id: string;
  role: 'athlete' | 'coach';
  text: string;
  createdAt: string;
}

export interface StrategyConversationState {
  version: 1;
  blockId: string;
  turns: StrategyConversationTurn[];
  updatedAt: string;
}

export function loadStrategyConversationState(blockId: string): StrategyConversationState {
  const raw = Storage.getItemSync(STRATEGY_CONVERSATION_KEY);
  if (!raw) return emptyState(blockId);
  try {
    const parsed = JSON.parse(raw) as Partial<StrategyConversationState>;
    if (
      parsed.version !== 1
      || parsed.blockId !== blockId
      || !Array.isArray(parsed.turns)
      || !isFresh(parsed.updatedAt)
    ) return emptyState(blockId);
    return {
      version: 1,
      blockId,
      turns: parsed.turns.filter(isTurn).slice(-MAX_TURNS),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyState(blockId);
  }
}

export function appendStrategyConversationTurn(
  state: StrategyConversationState,
  role: StrategyConversationTurn['role'],
  text: string,
): StrategyConversationState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const createdAt = new Date().toISOString();
  const next: StrategyConversationState = {
    ...state,
    turns: [
      ...state.turns,
      {
        id: `strategy_turn_${createdAt.replace(/[^0-9]/g, '')}_${state.turns.length}`,
        role,
        text: trimmed,
        createdAt,
      },
    ].slice(-MAX_TURNS),
    updatedAt: createdAt,
  };
  Storage.setItemSync(STRATEGY_CONVERSATION_KEY, JSON.stringify(next));
  return next;
}

export function clearStrategyConversationState(): void {
  Storage.removeItemSync(STRATEGY_CONVERSATION_KEY);
}

export function exportStrategyConversationState(): StrategyConversationState | null {
  const raw = Storage.getItemSync(STRATEGY_CONVERSATION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StrategyConversationState>;
    if (typeof parsed.blockId !== 'string') return null;
    return loadStrategyConversationState(parsed.blockId);
  } catch {
    return null;
  }
}

function emptyState(blockId: string): StrategyConversationState {
  return { version: 1, blockId, turns: [], updatedAt: new Date().toISOString() };
}

function isTurn(value: unknown): value is StrategyConversationTurn {
  const turn = value as Partial<StrategyConversationTurn> | null | undefined;
  return Boolean(
    turn
    && typeof turn.id === 'string'
    && (turn.role === 'athlete' || turn.role === 'coach')
    && typeof turn.text === 'string'
    && typeof turn.createdAt === 'string',
  );
}

function isFresh(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= MAX_STATE_AGE_DAYS * 24 * 60 * 60 * 1000;
}
