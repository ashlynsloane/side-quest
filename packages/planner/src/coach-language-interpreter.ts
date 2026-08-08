import { validateCoachTurnFrame, type CoachTurnFrameV2 } from './coach-semantic-frame';

export interface CoachLanguageInterpreterInput {
  message: string;
  referenceDate: string;
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
  const validation = validateCoachTurnFrame(raw);
  return {
    ok: validation.valid,
    frame: validation.frame,
    errors: validation.errors,
    interpreterId: interpreter.id,
  };
}

/**
 * This is the contract for a future server-backed language model. The model is
 * only an interpretation layer: it returns a semantic frame. It never receives
 * authority to create or mutate training sessions directly.
 */
export function coachInterpreterSystemContract(): string {
  return [
    'Return only a CoachTurnFrameV2-compatible object.',
    'Describe what the athlete said; do not prescribe training.',
    'Mark past/completed workouts as temporalRole=completed.',
    'Do not make a completed workout the target of a requested change.',
    'Separate the workout that caused a symptom from the workout the athlete wants changed.',
    'Mentioning a date is not the same as requesting a move.',
    'Use unresolved when the target, time, symptom function, or requested action is ambiguous.',
    'Corrections should identify which prior fact is being replaced.',
    'Do not diagnose injuries, illnesses, or menstrual disorders.',
  ].join('\n');
}
