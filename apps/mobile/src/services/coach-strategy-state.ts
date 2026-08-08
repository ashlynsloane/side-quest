import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';
import { validateCoachTurnFrame } from '@circuit/planner/coach-semantic-frame';
import Storage from 'expo-sqlite/kv-store';

export const COACH_STRATEGY_KEY = 'circuit.coach-strategy.v1';

export interface ApprovedCoachStrategyState {
  version: 1;
  blockId: string;
  strategy: CoachSemanticStrategyChange;
  approvedAt: string;
  sourceTurnId?: string;
}

export function loadApprovedCoachStrategy(blockId: string): ApprovedCoachStrategyState | null {
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
      strategy,
      approvedAt: parsed.approvedAt,
      sourceTurnId: typeof parsed.sourceTurnId === 'string' ? parsed.sourceTurnId : undefined,
    };
  } catch {
    return null;
  }
}

export function saveApprovedCoachStrategy(
  blockId: string,
  strategy: CoachSemanticStrategyChange,
  sourceTurnId?: string,
): ApprovedCoachStrategyState {
  const validated = validatePersistedStrategy(strategy);
  if (!validated) throw new Error('The strategy draft is incomplete or invalid and cannot be approved yet.');
  const state: ApprovedCoachStrategyState = {
    version: 1,
    blockId,
    strategy: validated,
    approvedAt: new Date().toISOString(),
    sourceTurnId,
  };
  Storage.setItemSync(COACH_STRATEGY_KEY, JSON.stringify(state));
  return state;
}

export function clearApprovedCoachStrategy(): void {
  Storage.removeItemSync(COACH_STRATEGY_KEY);
}

export function exportApprovedCoachStrategyState(): ApprovedCoachStrategyState | null {
  const raw = Storage.getItemSync(COACH_STRATEGY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApprovedCoachStrategyState>;
    if (parsed.version !== 1 || typeof parsed.blockId !== 'string') return null;
    return loadApprovedCoachStrategy(parsed.blockId);
  } catch {
    return null;
  }
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
