import type { CoachSemanticStrategyChange } from './coach-semantic-frame';
import { validateCoachTurnFrame, type CoachTurnFrameV2 } from './coach-semantic-frame';

export interface CoachLanguageInterpreterInput {
  message: string;
  referenceDate: string;
  turnId?: string;
  knownPlannedEvents?: Array<{
    eventId: string;
    title: string;
    discipline?: 'swim' | 'bike' | 'run' | 'strength';
    date: string;
  }>;
  dialogueSummary?: {
    activeConcern?: string;
    activeTargetEventId?: string;
    focusDate?: string;
    pendingQuestion?: string;
    strategyDraft?: CoachSemanticStrategyChange;
  };
}

export interface CoachLanguageInterpreter {
  id: string;
  interpret(input: CoachLanguageInterpreterInput): Promise<unknown>;
}

export interface CoachLanguageInterpretationResult {
  ok: boolean;
  frame?: CoachTurnFrameV2;
  errors: string[];
  interpreterId: string;
}

export async function runCoachLanguageInterpreter(
  interpreter: CoachLanguageInterpreter,
  input: CoachLanguageInterpreterInput,
): Promise<CoachLanguageInterpretationResult> {
  let raw: unknown;
  try {
    raw = await interpreter.interpret(input);
  } catch (caught) {
    return {
      ok: false,
      errors: [caught instanceof Error ? caught.message : 'The language interpreter failed.'],
      interpreterId: interpreter.id,
    };
  }
  const candidate = attachRuntimeMetadata(raw, input.turnId);
  const validation = validateCoachTurnFrame(candidate);
  return {
    ok: validation.valid,
    frame: validation.frame,
    errors: validation.errors,
    interpreterId: interpreter.id,
  };
}

/**
 * Contract for a future server-backed language model. The model is only an
 * interpretation layer: it returns semantic facts and never receives authority
 * to create, prescribe, or mutate training sessions directly.
 */
export function coachInterpreterSystemContract(): string {
  return [
    'Return only CoachTurnFrameV2 semantic fields; runtime metadata such as turnId/source may be supplied by the adapter.',
    'Describe what the athlete said; do not prescribe training.',
    'Mark past/completed workouts as temporalRole=completed.',
    'Do not make a completed workout the target of a requested change.',
    'Separate the workout that caused a symptom from the workout the athlete wants changed.',
    'Mentioning a date is not the same as requesting a move.',
    'Use functionChanged when the athlete says function changed but does not distinguish movement from training.',
    'Use unresolved when the target, time, symptom function, requested action, or strategy tradeoff is ambiguous.',
    'Corrections should identify which prior fact is being replaced.',
    'For long-horizon goals, use intent=strategy_change and populate strategyChange rather than inventing weekly sessions.',
    'Only one discipline may hold primary_focus or maximize at a time. If the athlete asks to maximize multiple disciplines, leave strategyChange unresolved and ask which one is the top focus.',
    'A strategyChange may describe discipline objectives and tradeoff tolerance, but it may not prescribe the resulting training allocation.',
    'Do not diagnose injuries, illnesses, or menstrual disorders.',
  ].join('\n');
}

function attachRuntimeMetadata(raw: unknown, turnId?: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown>;
  return {
    ...value,
    turnId: typeof value.turnId === 'string' && value.turnId.trim() ? value.turnId : turnId,
    source: value.source === 'test_fixture' || value.source === 'deterministic_fallback' || value.source === 'language_model'
      ? value.source
      : 'language_model',
  };
}
