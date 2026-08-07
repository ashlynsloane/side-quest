import type { PlannedStrengthSession } from '@circuit/domain';
import { createWorkoutVariant } from '@circuit/generator';

import {
  buildDailyAdjustmentOptions,
  type AdjustmentOption,
  type AdjustmentReason,
  type DailyAdjustmentResult,
  type FatigueKind,
  type RequestedAdjustment,
  type SessionAdjustmentRequest,
} from './daily-adjustment';
import { normalizeStrengthSession, type UnifiedTrainingSession } from './unified-training';

export type CoachQuickSignal =
  | 'legs_sore'
  | 'low_energy'
  | 'short_on_time'
  | 'pain_or_tightness'
  | 'not_feeling_it'
  | 'schedule_changed';

export type CoachAffectedArea = 'lower_body' | 'upper_body' | 'general' | 'unknown';
export type CoachInterpretationConfidence = 'low' | 'moderate' | 'high';

export const COACH_QUICK_SIGNALS: ReadonlyArray<{ id: CoachQuickSignal; label: string }> = [
  { id: 'legs_sore', label: 'Legs sore' },
  { id: 'low_energy', label: 'Low energy' },
  { id: 'short_on_time', label: 'Short on time' },
  { id: 'pain_or_tightness', label: 'Something hurts' },
  { id: 'not_feeling_it', label: 'Not feeling it' },
  { id: 'schedule_changed', label: 'Schedule changed' },
];

export interface CoachMessageInterpretation {
  reason: AdjustmentReason;
  requestedAction: RequestedAdjustment;
  fatigueKind?: FatigueKind;
  symptomSeverity?: 0 | 1 | 2 | 3 | 4 | 5;
  focalPain?: boolean;
  availableMinutes?: number;
  athletePrefersRecovery?: boolean;
  affectedArea: CoachAffectedArea;
  confidence: CoachInterpretationConfidence;
  signals: string[];
  summary: string;
}

export interface BuildCoachMessageAdaptationInput {
  message?: string;
  quickSignal?: CoachQuickSignal;
  session: PlannedStrengthSession;
  weekSessions: UnifiedTrainingSession[];
  availableDates: string[];
  recentFatigueTrend?: 'stable' | 'worsening' | 'improving';
  recentBoneStress?: boolean;
  returnToRun?: boolean;
}

export interface CoachMessageAdaptation {
  message: string;
  quickSignal?: CoachQuickSignal;
  sessionId: string;
  interpretation: CoachMessageInterpretation;
  adjustment: DailyAdjustmentResult;
}

export function interpretCoachMessage(message = '', quickSignal?: CoachQuickSignal): CoachMessageInterpretation {
  const text = message.trim().toLowerCase();
  const signals: string[] = [];

  let reason: AdjustmentReason = 'preference';
  let requestedAction: RequestedAdjustment = 'different';
  let fatigueKind: FatigueKind | undefined;
  let symptomSeverity: 0 | 1 | 2 | 3 | 4 | 5 | undefined;
  let focalPain = false;
  let availableMinutes: number | undefined;
  let athletePrefersRecovery = false;
  let affectedArea: CoachAffectedArea = 'unknown';
  let matched = 0;

  if (quickSignal) {
    matched += 2;
    if (quickSignal === 'legs_sore') {
      reason = 'fatigue';
      requestedAction = 'easier';
      fatigueKind = 'muscle_soreness';
      affectedArea = 'lower_body';
      signals.push('Lower-body soreness');
    } else if (quickSignal === 'low_energy') {
      reason = 'fatigue';
      requestedAction = 'easier';
      fatigueKind = 'systemic';
      affectedArea = 'general';
      signals.push('Low energy');
    } else if (quickSignal === 'short_on_time') {
      reason = 'time';
      requestedAction = 'shorter';
      signals.push('Less time available');
    } else if (quickSignal === 'pain_or_tightness') {
      reason = 'pain';
      requestedAction = 'skip';
      focalPain = true;
      symptomSeverity = 3;
      signals.push('Pain or tightness');
    } else if (quickSignal === 'not_feeling_it') {
      reason = 'fatigue';
      requestedAction = 'easier';
      fatigueKind = 'low_motivation';
      affectedArea = 'general';
      signals.push('Low motivation');
    } else if (quickSignal === 'schedule_changed') {
      reason = 'preference';
      requestedAction = 'move';
      signals.push('Schedule changed');
    }
  }

  const lowerBody = /\b(legs?|quads?|quadriceps|hamstrings?|calves?|calf|glutes?|hips?|knees?|ankles?|feet|foot)\b/.test(text);
  const upperBody = /\b(arms?|shoulders?|back|chest|lats?|biceps|triceps|wrists?|hands?)\b/.test(text);
  if (lowerBody) affectedArea = 'lower_body';
  else if (upperBody) affectedArea = 'upper_body';

  const illness = /\b(sick|ill|fever|flu|chills|vomit|vomiting|nausea|nauseous|infection)\b/.test(text);
  const pain = /\b(pain|painful|hurt|hurts|hurting|sharp|injur|injured|injury|twinge|niggle)\b/.test(text);
  const soreness = /\b(sore|soreness|aching|achy|stiff|stiffness)\b/.test(text);
  const heavyLegs = /\bheavy\s+legs?\b|\blegs?\s+(?:feel\s+)?heavy\b/.test(text);
  const lowEnergy = /\b(tired|fatigued|fatigue|exhausted|drained|wiped|low\s+energy|no\s+energy|poor\s+sleep|bad\s+sleep|sleepy)\b/.test(text);
  const lowMotivation = /\b(not\s+feeling\s+(?:it|this)|don['’]?t\s+want\s+to|dont\s+want\s+to|unmotivated|no\s+motivation|dreading)\b/.test(text);
  const scheduleChanged = /\b(schedule\s+changed|plans?\s+changed|can['’]?t\s+(?:do|make)\s+(?:it|this|today)|cannot\s+(?:do|make)|meeting|travel|travelling|traveling|busy|move\s+(?:it|this)|later\s+today|another\s+day)\b/.test(text);
  const explicitRecovery = /\b(rest\s+day|take\s+(?:today|the\s+day)\s+off|skip\s+(?:it|this|today)|need\s+to\s+rest|rather\s+rest)\b/.test(text);

  availableMinutes = parseAvailableMinutes(text);
  if (availableMinutes !== undefined) {
    matched += 1;
    signals.push(`${availableMinutes} minutes available`);
  }

  if (illness) {
    matched += 3;
    reason = 'illness';
    requestedAction = 'skip';
    fatigueKind = 'illness_like';
    symptomSeverity = /\b(severe|very|really|fever|vomit|chills)\b/.test(text) ? 4 : 3;
    affectedArea = 'general';
    signals.push('Illness-like symptoms');
  } else if (pain) {
    matched += 3;
    reason = 'pain';
    requestedAction = 'skip';
    focalPain = true;
    symptomSeverity = /\b(severe|sharp|worsening|worse|can['’]?t\s+walk|cannot\s+walk)\b/.test(text)
      ? 4
      : /\b(mild|little|slight)\b/.test(text)
        ? 2
        : 3;
    signals.push(affectedArea === 'lower_body' ? 'Lower-body pain' : affectedArea === 'upper_body' ? 'Upper-body pain' : 'Pain');
  } else if (soreness || heavyLegs || lowEnergy || lowMotivation) {
    matched += 2;
    reason = 'fatigue';
    if (availableMinutes !== undefined) requestedAction = 'shorter';
    else requestedAction = explicitRecovery ? 'skip' : 'easier';

    if (heavyLegs) {
      fatigueKind = 'heavy_legs';
      affectedArea = 'lower_body';
      signals.push('Heavy legs');
    } else if (soreness) {
      fatigueKind = 'muscle_soreness';
      signals.push(affectedArea === 'lower_body' ? 'Lower-body soreness' : affectedArea === 'upper_body' ? 'Upper-body soreness' : 'Muscle soreness');
    } else if (lowMotivation) {
      fatigueKind = 'low_motivation';
      affectedArea = affectedArea === 'unknown' ? 'general' : affectedArea;
      signals.push('Low motivation');
    } else {
      fatigueKind = /\bsleep|sleepy\b/.test(text) ? 'sleepy' : 'systemic';
      affectedArea = affectedArea === 'unknown' ? 'general' : affectedArea;
      signals.push('Low energy');
    }
  } else if (availableMinutes !== undefined || /\b(short\s+on\s+time|less\s+time|only\s+have)\b/.test(text)) {
    matched += 2;
    reason = 'time';
    requestedAction = 'shorter';
    signals.push('Time constraint');
  } else if (scheduleChanged) {
    matched += 2;
    reason = 'preference';
    requestedAction = 'move';
    signals.push('Schedule conflict');
  }

  if (explicitRecovery) {
    athletePrefersRecovery = true;
    requestedAction = 'skip';
    signals.push('Prefers recovery today');
    matched += 1;
  }

  const confidence: CoachInterpretationConfidence = matched >= 3 ? 'high' : matched >= 1 ? 'moderate' : 'low';
  const uniqueSignals = [...new Set(signals)];
  const summary = buildInterpretationSummary(reason, requestedAction, affectedArea, availableMinutes);

  return {
    reason,
    requestedAction,
    fatigueKind,
    symptomSeverity,
    focalPain: focalPain || undefined,
    availableMinutes,
    athletePrefersRecovery: athletePrefersRecovery || undefined,
    affectedArea,
    confidence,
    signals: uniqueSignals.length ? uniqueSignals : ['General workout preference'],
    summary,
  };
}

export function buildCoachMessageAdaptation(input: BuildCoachMessageAdaptationInput): CoachMessageAdaptation {
  const interpretation = interpretCoachMessage(input.message, input.quickSignal);
  const request: SessionAdjustmentRequest = {
    sessionId: input.session.id,
    reason: interpretation.reason,
    requestedAction: interpretation.requestedAction,
    availableMinutes: interpretation.availableMinutes,
    fatigueKind: interpretation.fatigueKind,
    symptomSeverity: interpretation.symptomSeverity,
    focalPain: interpretation.focalPain,
    athletePrefersRecovery: interpretation.athletePrefersRecovery,
  };

  const adjustment = buildDailyAdjustmentOptions(request, {
    plannedSession: normalizeStrengthSession(input.session),
    weekSessions: input.weekSessions,
    availableDates: input.availableDates,
    recentFatigueTrend: input.recentFatigueTrend,
    recentBoneStress: input.recentBoneStress,
    returnToRun: input.returnToRun,
  });

  return {
    message: input.message?.trim() ?? '',
    quickSignal: input.quickSignal,
    sessionId: input.session.id,
    interpretation,
    adjustment,
  };
}

export function applyCoachStrengthAdjustment(
  session: PlannedStrengthSession,
  option: AdjustmentOption,
): PlannedStrengthSession {
  const note = `Coach adaptation: ${option.title}`;

  if (option.action === 'skip') {
    return {
      ...session,
      completionStatus: 'skipped',
      placementNote: appendText(session.placementNote, note),
    };
  }

  if (option.action === 'move') {
    if (!option.targetDate) throw new Error('The selected move does not have a target date.');
    return {
      ...session,
      date: option.targetDate,
      completionStatus: 'modified',
      placementNote: appendText(session.placementNote, note),
    };
  }

  if (option.action === 'replace') {
    throw new Error('Cross-discipline replacements must be applied by the whole-athlete planner.');
  }

  const currentMinutes = Math.max(1, Math.round(session.workout.estimatedElapsedSeconds / 60));
  const requestedMinutes = option.durationMinutes ?? currentMinutes;
  const level = requestedMinutes <= currentMinutes * 0.55 ? 'minimum' : 'reduced';
  const easier = option.id.startsWith('easier_');
  const workout = createWorkoutVariant(session.workout, level);

  return {
    ...session,
    intendedLoad: easier ? downshiftLoad(session.intendedLoad) : session.intendedLoad,
    workout,
    completionStatus: 'modified',
    rationale: appendText(session.rationale, option.description),
    placementNote: appendText(session.placementNote, note),
  };
}

function parseAvailableMinutes(text: string): number | undefined {
  const minuteMatch = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (minuteMatch?.[1]) return clampMinutes(Number(minuteMatch[1]));

  const hourMatch = text.match(/\b(\d(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/);
  if (hourMatch?.[1]) return clampMinutes(Math.round(Number(hourMatch[1]) * 60));

  if (/\bhalf\s+(?:an\s+)?hour\b/.test(text)) return 30;
  if (/\b(?:an|one)\s+hour\b/.test(text)) return 60;
  return undefined;
}

function clampMinutes(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(10, Math.min(240, Math.round(value)));
}

function buildInterpretationSummary(
  reason: AdjustmentReason,
  requestedAction: RequestedAdjustment,
  affectedArea: CoachAffectedArea,
  availableMinutes?: number,
): string {
  const area = affectedArea === 'lower_body' ? 'lower-body ' : affectedArea === 'upper_body' ? 'upper-body ' : '';
  if (reason === 'pain' || reason === 'illness') return `Protect against ${area}${reason} before preserving training load.`;
  if (reason === 'fatigue') return `${area}fatigue is limiting today’s training stress.`;
  if (reason === 'time') return `${availableMinutes ? `${availableMinutes} minutes` : 'Less time'} is available, so preserve the highest-priority work.`;
  if (requestedAction === 'move') return 'The schedule changed, so find a cleaner place for the session.';
  return 'The planned session does not fit today; adapt it without compensating elsewhere.';
}

function downshiftLoad(value: PlannedStrengthSession['intendedLoad']): PlannedStrengthSession['intendedLoad'] {
  if (value === 'high') return 'moderate';
  return 'light';
}

function appendText(existing: string | undefined, next: string): string {
  if (!existing?.trim()) return next;
  if (existing.includes(next)) return existing;
  return `${existing} ${next}`;
}
