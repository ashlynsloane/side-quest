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

export interface CoachClarificationAnswerResolution {
  resolved: boolean;
  effectiveMessage?: string;
  noTrainingChange?: boolean;
  coachResponse?: string;
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

export function resolveCoachClarificationAnswer(
  kind: CoachClarificationKind,
  originalMessage: string,
  answer: string,
): CoachClarificationAnswerResolution {
  const text = answer.trim().toLowerCase();
  if (!text) return { resolved: false };

  if (kind === 'function') {
    const stopped = /\b(stop|stopped|quit|aborted|couldn['’]?t\s+finish|could\s+not\s+finish)\b/.test(text);
    const modified = stopped || /\b(yes|yeah|yep|it\s+did|limp|limping|stride|form|modify|modified|changed\s+(?:my\s+)?movement|backed\s+off)\b/.test(text);
    const denied = !modified && /\b(no|nope|not\s+really|didn['’]?t|did\s+not|unchanged|movement\s+was\s+normal|trained\s+normally)\b/.test(text);
    if (stopped) {
      return {
        resolved: true,
        effectiveMessage: `${originalMessage} I had to stop the workout because of this pain. ${answer}`,
      };
    }
    if (modified) {
      return {
        resolved: true,
        effectiveMessage: `${originalMessage} I had to modify the workout because of this pain. ${answer}`,
      };
    }
    if (denied) {
      return {
        resolved: true,
        noTrainingChange: true,
        coachResponse: 'Got it. Since it did not change your movement or training and you have not described a clearer warning signal, Side Quest will not treat that sensation alone as a reason to rewrite the plan. Update Coach if it becomes focal, worsens, or starts changing function.',
      };
    }
    return { resolved: false };
  }

  if (kind === 'pain_type') {
    const usefulDescriptor = /\b(sore|soreness|burn|burning|cramp|cramps|sharp|ache|aching|tight|tightness|stiff|stiffness|throb|pain|injur|sprain|strain|period|menstrual)\b/.test(text);
    return usefulDescriptor
      ? { resolved: true, effectiveMessage: `${originalMessage} ${answer}` }
      : { resolved: false };
  }

  if (kind === 'target_session' || kind === 'constraint') {
    return { resolved: true, effectiveMessage: `${originalMessage} ${answer}` };
  }

  return { resolved: true, effectiveMessage: `${originalMessage} ${answer}` };
}
