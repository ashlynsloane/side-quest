import type { CoachLanguageInterpreter, CoachLanguageInterpreterInput } from './coach-language-interpreter';
import { runCoachLanguageInterpreter } from './coach-language-interpreter';
import type {
  CoachConversationHorizon,
  CoachEventTemporalRole,
  CoachSemanticAction,
  CoachSemanticIntent,
  CoachTurnFrameV2,
} from './coach-semantic-frame';

export interface CoachInterpreterEvalExpectation {
  intent?: CoachSemanticIntent;
  horizon?: CoachConversationHorizon;
  action?: CoachSemanticAction;
  mustIncludeEventRole?: CoachEventTemporalRole;
  mustNotTargetCompleted?: boolean;
  minimumUnresolved?: number;
}

export interface CoachInterpreterEvalCase {
  id: string;
  input: CoachLanguageInterpreterInput;
  expected: CoachInterpreterEvalExpectation;
}

export interface CoachInterpreterEvalCaseResult {
  id: string;
  passed: boolean;
  failures: string[];
  frame?: CoachTurnFrameV2;
}

export interface CoachInterpreterEvalReport {
  interpreterId: string;
  total: number;
  passed: number;
  failed: number;
  cases: CoachInterpreterEvalCaseResult[];
}

export async function evaluateCoachLanguageInterpreter(
  interpreter: CoachLanguageInterpreter,
  cases: CoachInterpreterEvalCase[] = COACH_LANGUAGE_EVAL_CASES,
): Promise<CoachInterpreterEvalReport> {
  const results: CoachInterpreterEvalCaseResult[] = [];
  for (const testCase of cases) {
    const interpreted = await runCoachLanguageInterpreter(interpreter, testCase.input);
    if (!interpreted.ok || !interpreted.frame) {
      results.push({ id: testCase.id, passed: false, failures: interpreted.errors });
      continue;
    }
    const failures = evaluateFrame(interpreted.frame, testCase.expected);
    results.push({ id: testCase.id, passed: failures.length === 0, failures, frame: interpreted.frame });
  }
  const passed = results.filter((result) => result.passed).length;
  return {
    interpreterId: interpreter.id,
    total: results.length,
    passed,
    failed: results.length - passed,
    cases: results,
  };
}

export function evaluateFrame(
  frame: CoachTurnFrameV2,
  expected: CoachInterpreterEvalExpectation,
): string[] {
  const failures: string[] = [];
  if (expected.intent && frame.intent !== expected.intent) failures.push(`Expected intent ${expected.intent}, received ${frame.intent}.`);
  if (expected.horizon && frame.horizon !== expected.horizon) failures.push(`Expected horizon ${expected.horizon}, received ${frame.horizon}.`);
  if (expected.action && frame.requestedChange?.action !== expected.action) failures.push(`Expected action ${expected.action}, received ${frame.requestedChange?.action ?? 'none'}.`);
  if (expected.mustIncludeEventRole && !frame.events.some((event) => event.temporalRole === expected.mustIncludeEventRole)) {
    failures.push(`Expected an event with role ${expected.mustIncludeEventRole}.`);
  }
  if (expected.mustNotTargetCompleted && targetsCompletedEvent(frame)) failures.push('A completed event was used as an editable target.');
  if (expected.minimumUnresolved !== undefined && frame.unresolved.length < expected.minimumUnresolved) {
    failures.push(`Expected at least ${expected.minimumUnresolved} unresolved slot(s).`);
  }
  return failures;
}

export const COACH_LANGUAGE_EVAL_CASES: CoachInterpreterEvalCase[] = [
  {
    id: 'retrospective-symptom-source',
    input: { message: 'My hip got weird near the end of the ride I already finished.', referenceDate: '2026-08-07' },
    expected: { intent: 'report_symptom', horizon: 'past', mustIncludeEventRole: 'completed', mustNotTargetCompleted: true },
  },
  {
    id: 'future-day-question',
    input: { message: 'What about tomorrow?', referenceDate: '2026-08-07' },
    expected: { intent: 'ask_about_future_training', horizon: 'tomorrow', action: 'evaluate' },
  },
  {
    id: 'explicit-move',
    input: { message: 'Move my run to Friday.', referenceDate: '2026-08-07' },
    expected: { intent: 'modify_planned_session', action: 'move' },
  },
  {
    id: 'completed-versus-planned',
    input: { message: 'I rode this morning and started limping afterward. I am supposed to run tomorrow. What should I do with the run?', referenceDate: '2026-08-07' },
    expected: { intent: 'modify_planned_session', mustIncludeEventRole: 'completed', mustNotTargetCompleted: true },
  },
  {
    id: 'correction-function',
    input: { message: 'Actually I was wrong — I did start limping.', referenceDate: '2026-08-07', dialogueSummary: { activeConcern: 'hip symptom', pendingQuestion: 'Did it change movement or training?' } },
    expected: { intent: 'correct_previous_statement' },
  },
  {
    id: 'time-constraint',
    input: { message: 'I only have 30 minutes for the bike today.', referenceDate: '2026-08-07' },
    expected: { intent: 'modify_planned_session', horizon: 'today', action: 'shorten' },
  },
  {
    id: 'retrospective-not-reschedule',
    input: { message: 'I already did the bike today. What about tomorrow?', referenceDate: '2026-08-07' },
    expected: { intent: 'ask_about_future_training', horizon: 'tomorrow', action: 'evaluate', mustIncludeEventRole: 'completed', mustNotTargetCompleted: true },
  },
  {
    id: 'hypothetical-extra-load',
    input: { message: 'What if I rode 100 miles tomorrow to make up for the run I missed?', referenceDate: '2026-08-07' },
    expected: { intent: 'request_extra_training', horizon: 'tomorrow', action: 'add' },
  },
  {
    id: 'symptom-no-request',
    input: { message: 'My knee is sore after yesterday, but I am not asking to change anything yet.', referenceDate: '2026-08-07' },
    expected: { intent: 'report_symptom', horizon: 'past', mustNotTargetCompleted: true },
  },
  {
    id: 'menstrual-context',
    input: { message: 'My cramps are bad today. I would rather do the bike indoors.', referenceDate: '2026-08-07' },
    expected: { horizon: 'today' },
  },
  {
    id: 'life-stress-not-physical',
    input: { message: 'Work is awful and I am stressed, but physically I feel normal.', referenceDate: '2026-08-07' },
    expected: { intent: 'general_update' },
  },
  {
    id: 'ambiguous-it',
    input: { message: 'Can we move it?', referenceDate: '2026-08-07' },
    expected: { intent: 'modify_planned_session', action: 'move', minimumUnresolved: 1 },
  },
  {
    id: 'long-term-bike-focus',
    input: { message: 'For the next four months I want cycling to be my main focus while I maintain my swim and run.', referenceDate: '2026-08-07' },
    expected: { intent: 'strategy_change', horizon: 'long_term' },
  },
  {
    id: 'race-split-priority',
    input: { message: 'For this 70.3 I care most about getting the fastest bike split I can, even if the swim only stays at maintenance.', referenceDate: '2026-08-07' },
    expected: { intent: 'strategy_change', horizon: 'long_term' },
  },
  {
    id: 'explanation-only',
    input: { message: 'Why are you holding my run progression?', referenceDate: '2026-08-07' },
    expected: { intent: 'ask_explanation' },
  },
];

function targetsCompletedEvent(frame: CoachTurnFrameV2): boolean {
  const change = frame.requestedChange;
  if (!change) return false;
  const target = change.targetEventSemanticId
    ? frame.events.find((event) => event.semanticId === change.targetEventSemanticId)
    : change.targetEventId
      ? frame.events.find((event) => event.eventId === change.targetEventId)
      : undefined;
  return target?.temporalRole === 'completed';
}
