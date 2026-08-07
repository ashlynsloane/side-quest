import type { CoachMessageInterpretation } from './coach-message-adaptation';

export type CoachClarificationKind =
  | 'function'
  | 'pain_type'
  | 'target_session'
  | 'constraint'
  | 'none';

export interface CoachClarificationDecision {
  required: boolean;
  kind: CoachClarificationKind;
  question?: string;
  reason?: string;
  confidence: 'low' | 'moderate' | 'high';
}

export function decideCoachClarification(
  message: string,
  interpretation: CoachMessageInterpretation,
): CoachClarificationDecision {
  const text = message.trim().toLowerCase();
  const vagueBodyConcern = /\b(feels?\s+(?:weird|off|wrong|funny)|doesn['’]?t\s+feel\s+right|something\s+with\s+my)\b/.test(text)
    && interpretation.affectedArea !== 'unknown';
  const uncertainPain = interpretation.painContext?.kind === 'unknown'
    && !interpretation.painContext.stoppedSession
    && interpretation.painContext.functionalInterference !== 'daily_activity'
    && interpretation.painContext.functionalInterference !== 'rest_or_night';

  if (vagueBodyConcern || uncertainPain) {
    return {
      required: true,
      kind: 'function',
      question: 'Did it change your movement or training?',
      reason: 'Functional effect is more useful than guessing whether an unfamiliar body sensation is soreness, exertion, or injury-like pain.',
      confidence: 'high',
    };
  }

  if (interpretation.reason === 'pain' && !interpretation.painContext) {
    return {
      required: true,
      kind: 'pain_type',
      question: 'What does the discomfort feel like?',
      reason: 'Side Quest should distinguish soreness, exertional discomfort, menstrual symptoms, and focal injury-like pain before changing load.',
      confidence: 'high',
    };
  }

  const explicitlyReferencesWorkout = Boolean(
    interpretation.targetDiscipline
    || /\b(workout|session|today|tomorrow|ride|run|swim|lift|strength)\b/.test(text),
  );
  if (interpretation.confidence === 'low' && !explicitlyReferencesWorkout) {
    return {
      required: true,
      kind: 'constraint',
      question: 'What changed about today’s training?',
      reason: 'The message does not contain enough actionable training context to choose a safe adaptation.',
      confidence: 'moderate',
    };
  }

  if (interpretation.confidence === 'low' && !interpretation.targetDiscipline) {
    return {
      required: true,
      kind: 'target_session',
      question: 'Which workout are you talking about?',
      reason: 'Side Quest should not guess which sport or session to rewrite when the target is unclear.',
      confidence: 'moderate',
    };
  }

  return { required: false, kind: 'none', confidence: interpretation.confidence };
}
