import type { DailyFeedbackAdvice } from './daily-feedback-advice';

/** Read-only, athlete-reviewable options; never apply or persist a workout change. */
export interface DailySessionChoice {
  id: string;
  kind: 'keep' | 'reduce' | 'defer';
  title: string;
  proposedMinutes: number | null;
  explanation: string;
  requiresAthleteApproval: true;
}
export interface DailySessionChoices {
  sessionId: string | null;
  sessionDate: string | null;
  sourceMinutes: number | null;
  state: 'no_session' | 'symptom_hold' | 'needs_review' | 'options';
  options: DailySessionChoice[];
  autoAppliedCount: 0;
  caveat: string;
}

function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/**
 * A proposed shorter duration is a ceiling, not a target or clinical permission.
 * No catch-up volume, intensity increase, alternative sport or move is generated.
 */
export function buildDailySessionChoices(input: {
  advice: DailyFeedbackAdvice;
  nextSession: {
    id: string;
    date: string;
    status: 'planned' | 'modified' | 'completed' | 'skipped';
    estimatedMinutes: number | null;
  } | null;
  todayLocalDate: string;
}): DailySessionChoices {
  const base = {
    sessionId: input.nextSession?.id ?? null,
    sessionDate: input.nextSession?.date ?? null,
    sourceMinutes: input.nextSession?.estimatedMinutes ?? null,
    autoAppliedCount: 0 as const,
    caveat: 'Review only. Original plan is unchanged. No new training, catch-up volume, medical clearance, or automatic approval.',
  };
  const session = input.nextSession;
  if (!session || !isValidLocalDate(input.todayLocalDate)
    || !isValidLocalDate(session.date) || !session.id.trim()
    || (session.status !== 'planned' && session.status !== 'modified')
    || session.date < input.todayLocalDate) {
    return { ...base, state: 'no_session', options: [] };
  }
  const defer: DailySessionChoice = {
    id: session.id + ':defer', kind: 'defer', title: 'Consider rest or deferral',
    proposedMinutes: null,
    explanation: 'Do not automatically move this session or add its volume later. Review whether rest or a revised schedule is appropriate.',
    requiresAthleteApproval: true,
  };
  if (input.advice.kind === 'protect') {
    return {
      ...base, state: 'symptom_hold', options: [defer],
      caveat: 'Active symptoms or very low readiness: the original dose is not offered as a recommended action. This is not medical clearance; no plan changes have been made.',
    };
  }
  if (input.advice.kind === 'hold' || input.advice.kind === 'review'
    && input.advice.headline === 'Reconcile training records first') {
    return { ...base, state: 'needs_review', options: [defer] };
  }
  // A missing or corrupt time estimate must never be displayed as a
  // reviewable dose, including in the nominal "keep" path.
  if (session.estimatedMinutes === null
    || !Number.isFinite(session.estimatedMinutes)
    || session.estimatedMinutes <= 0) {
    return { ...base, state: 'needs_review', options: [defer],
      caveat: 'Original duration is missing or invalid. Review the source workout before considering a training dose; no changes have been made.' };
  }
  const keep: DailySessionChoice = {
    id: session.id + ':keep', kind: 'keep',
    title: 'Review the original plan', proposedMinutes: session.estimatedMinutes,
    explanation: 'Original scheduled dose only; not authorization to proceed when symptoms or restrictions are present.',
    requiresAthleteApproval: true,
  };
  const options = input.advice.kind === 'review' ? [defer] : [keep, defer];
  const minutes = session.estimatedMinutes;
  if (input.advice.kind === 'review' && minutes !== null
    && Number.isFinite(minutes) && minutes >= 20) {
    const reduced = Math.floor(minutes * 0.8);
    if (reduced > 0 && reduced < minutes) {
      options.unshift({
        id: session.id + ':reduce', kind: 'reduce',
        title: 'Review a shorter version',
        proposedMinutes: reduced,
        explanation: 'Provisional planning cap only (20% less time); intensity must not increase. This is not a validated rehabilitation dose.',
        requiresAthleteApproval: true,
      });
    }
  }
  return { ...base, state: 'options', options };
}
