import type { PlannedStrengthSession } from '@circuit/domain';
import { createWorkoutVariant } from '@circuit/generator';

import {
  assessPainContext,
  interpretAthleteContextMessage,
  type MenstrualContextSignal,
  type PainCalibration,
  type PainContextAssessment,
  type PainContextReport,
  type ProtectiveTrainingRequestDecision,
  type TrainingHeadspaceSignal,
} from './athlete-context-intelligence';
import {
  buildDailyAdjustmentOptions,
  type AdjustmentOption,
  type AdjustmentReason,
  type DailyAdjustmentResult,
  type FatigueKind,
  type RequestedAdjustment,
  type SessionAdjustmentRequest,
} from './daily-adjustment';
import type { UnifiedDiscipline, UnifiedTrainingSession } from './unified-training';

export type CoachQuickSignal =
  | 'legs_sore'
  | 'low_energy'
  | 'short_on_time'
  | 'pain_or_tightness'
  | 'not_feeling_it'
  | 'schedule_changed';

export type CoachAffectedArea = 'lower_body' | 'upper_body' | 'general' | 'unknown';
export type CoachInterpretationConfidence = 'low' | 'moderate' | 'high';
export type CoachTargetDiscipline = 'swim' | 'bike' | 'run' | 'strength';

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
  targetDiscipline?: CoachTargetDiscipline;
  painContext?: PainContextReport;
  menstrualContext?: MenstrualContextSignal;
  headspace?: TrainingHeadspaceSignal;
  compensatoryTrainingIntent?: boolean;
  requestedLargeTrainingLoad?: boolean;
  confidence: CoachInterpretationConfidence;
  signals: string[];
  summary: string;
}

export interface BuildCoachMessageAdaptationInput {
  message?: string;
  quickSignal?: CoachQuickSignal;
  session: UnifiedTrainingSession;
  weekSessions: UnifiedTrainingSession[];
  availableDates: string[];
  availableDisciplines?: UnifiedDiscipline[];
  interpretation?: CoachMessageInterpretation;
  preferredTargetDate?: string;
  preferredReplacementDiscipline?: UnifiedDiscipline;
  painCalibration?: PainCalibration;
  protectiveTrainingDecision?: ProtectiveTrainingRequestDecision;
  recentFatigueTrend?: 'stable' | 'worsening' | 'improving';
  recentBoneStress?: boolean;
  returnToRun?: boolean;
}

export interface CoachMessageAdaptation {
  message: string;
  quickSignal?: CoachQuickSignal;
  sessionId: string;
  interpretation: CoachMessageInterpretation;
  painAssessment?: PainContextAssessment;
  adjustment: DailyAdjustmentResult;
}

export function interpretCoachMessage(message = '', quickSignal?: CoachQuickSignal): CoachMessageInterpretation {
  const text = message.trim().toLowerCase();
  const athleteContext = interpretAthleteContextMessage(message);
  const signals: string[] = [...athleteContext.signals];

  let reason: AdjustmentReason = 'preference';
  let requestedAction: RequestedAdjustment = 'different';
  let fatigueKind: FatigueKind | undefined;
  let symptomSeverity: 0 | 1 | 2 | 3 | 4 | 5 | undefined;
  let focalPain = false;
  let availableMinutes: number | undefined;
  let athletePrefersRecovery = false;
  let affectedArea: CoachAffectedArea = 'unknown';
  let matched = athleteContext.signals.length > 0 ? 1 : 0;

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

  const targetDiscipline = parseTargetDiscipline(text);
  if (targetDiscipline) {
    matched += 1;
    signals.push(`Targets ${targetDiscipline}`);
  }

  const lowerBody = /\b(legs?|quads?|quadriceps|hamstrings?|calves?|calf|glutes?|hips?|knees?|ankles?|feet|foot|shins?)\b/.test(text);
  const upperBody = /\b(arms?|shoulders?|back|chest|lats?|biceps|triceps|wrists?|hands?|elbows?)\b/.test(text);
  if (lowerBody) affectedArea = 'lower_body';
  else if (upperBody) affectedArea = 'upper_body';

  const illness = /\b(sick|ill|fever|flu|chills|vomit|vomiting|nausea|nauseous|infection)\b/.test(text);
  const soreness = /\b(sore|soreness|aching|achy|stiff|stiffness|tight|tightness)\b/.test(text);
  const heavyLegs = /\bheavy\s+legs?\b|\blegs?\s+(?:feel\s+)?heavy\b/.test(text);
  const lowEnergy = /\b(tired|fatigued|fatigue|exhausted|drained|wiped|low\s+energy|no\s+energy|poor\s+sleep|bad\s+sleep|sleepy)\b/.test(text);
  const lowMotivation = /\b(not\s+feeling\s+(?:it|this)|don['’]?t\s+want\s+to|dont\s+want\s+to|do\s+not\s+want\s+to|unmotivated|no\s+motivation|dreading)\b/.test(text);
  const scheduleChanged = /\b(schedule\s+changed|plans?\s+changed|can['’]?t\s+(?:do|make)\s+(?:it|this|today)|cannot\s+(?:do|make)|meeting|travel|travelling|traveling|busy|move\s+(?:it|this)|later\s+today|another\s+day)\b/.test(text);
  const explicitRecovery = /\b(rest\s+day|take\s+(?:today|the\s+day)\s+off|skip\s+(?:it|this|today)|need\s+to\s+rest|rather\s+rest)\b/.test(text);
  const accessProblem = /\b(pool\s+(?:is\s+)?closed|gym\s+(?:is\s+)?closed|no\s+(?:pool|bike|trainer|treadmill|equipment)|equipment\s+(?:is\s+)?unavailable|can['’]?t\s+get\s+to\s+the\s+(?:pool|gym))\b/.test(text);
  const weatherProblem = /\b(rain|raining|storm|storming|snow|snowing|ice|icy|heat|hot|smoke|smoky|wind|windy|weather)\b/.test(text)
    && /\b(can['’]?t|cannot|unsafe|outside|outdoors|ride|run|running|bike|cycling)\b/.test(text);

  availableMinutes = parseAvailableMinutes(text);
  if (availableMinutes !== undefined) {
    matched += 1;
    signals.push(`${availableMinutes} minutes available`);
  }

  const contextualPain = athleteContext.pain;
  const menstrual = athleteContext.menstrual;
  if (contextualPain?.kind === 'systemic' || illness) {
    matched += 3;
    reason = 'illness';
    requestedAction = 'skip';
    fatigueKind = 'illness_like';
    symptomSeverity = 4;
    affectedArea = 'general';
    focalPain = false;
    signals.push('Illness-like symptoms');
  } else if (contextualPain?.kind === 'focal_musculoskeletal' || contextualPain?.kind === 'unknown') {
    matched += 3;
    reason = 'pain';
    requestedAction = 'skip';
    focalPain = contextualPain.focal;
    symptomSeverity = painSeverity0to5(contextualPain);
    affectedArea = contextualPain.affectedArea;
    signals.push(contextualPain.affectedArea === 'lower_body' ? 'Lower-body pain' : contextualPain.affectedArea === 'upper_body' ? 'Upper-body pain' : 'Pain');
  } else if (contextualPain?.kind === 'menstrual' || menstrual?.active) {
    matched += 2;
    reason = 'fatigue';
    affectedArea = 'general';
    focalPain = false;
    fatigueKind = menstrual?.symptoms.includes('fatigue') ? 'systemic' : 'unknown';
    if (menstrual?.preferredAdjustments.includes('rest') || explicitRecovery) requestedAction = 'skip';
    else if (menstrual?.preferredAdjustments.includes('shorter') || availableMinutes !== undefined) requestedAction = 'shorter';
    else if (menstrual?.preferredAdjustments.includes('avoid_swim')) requestedAction = 'different';
    else requestedAction = 'easier';
    signals.push('Cycle symptoms are training context, not a musculoskeletal injury classification');
  } else if (contextualPain?.kind === 'post_exercise_soreness' || soreness || heavyLegs || lowEnergy || lowMotivation) {
    matched += 2;
    reason = 'fatigue';
    if (availableMinutes !== undefined) requestedAction = 'shorter';
    else requestedAction = explicitRecovery ? 'skip' : 'easier';

    if (heavyLegs) {
      fatigueKind = 'heavy_legs';
      affectedArea = 'lower_body';
      signals.push('Heavy legs');
    } else if (contextualPain?.kind === 'post_exercise_soreness' || soreness) {
      fatigueKind = 'muscle_soreness';
      affectedArea = contextualPain?.affectedArea ?? affectedArea;
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
  } else if (contextualPain?.kind === 'training_exertion') {
    matched += 2;
    reason = /\b(too\s+hard|back\s+off|easier|overdid|overdone)\b/.test(text) ? 'fatigue' : 'preference';
    requestedAction = reason === 'fatigue' ? 'easier' : requestedAction;
    focalPain = false;
    affectedArea = contextualPain.affectedArea;
    signals.push('Expected exertional discomfort');
  } else if (availableMinutes !== undefined || /\b(short\s+on\s+time|less\s+time|only\s+have)\b/.test(text)) {
    matched += 2;
    reason = 'time';
    requestedAction = 'shorter';
    signals.push('Time constraint');
  } else if (accessProblem) {
    matched += 2;
    reason = 'access';
    requestedAction = 'different';
    signals.push('Training access changed');
  } else if (weatherProblem) {
    matched += 2;
    reason = 'weather';
    requestedAction = 'different';
    signals.push('Weather constraint');
  } else if (scheduleChanged) {
    matched += 2;
    reason = 'preference';
    requestedAction = 'move';
    signals.push('Schedule conflict');
  } else if (athleteContext.headspace === 'overwhelmed') {
    matched += 2;
    reason = 'fatigue';
    requestedAction = 'easier';
    fatigueKind = 'systemic';
    affectedArea = 'general';
    signals.push('Limited life/mental bandwidth');
  }

  if (explicitRecovery) {
    athletePrefersRecovery = true;
    requestedAction = 'skip';
    signals.push('Prefers recovery today');
    matched += 1;
  }
  if (athleteContext.compensatoryTrainingIntent) matched += 2;
  if (athleteContext.requestedLargeTrainingLoad) matched += 1;

  const confidence: CoachInterpretationConfidence = matched >= 3 ? 'high' : matched >= 1 ? 'moderate' : 'low';
  const uniqueSignals = [...new Set(signals)];
  const summary = buildInterpretationSummary(
    reason,
    requestedAction,
    affectedArea,
    availableMinutes,
    targetDiscipline,
    contextualPain,
    menstrual,
    athleteContext.compensatoryTrainingIntent,
  );

  return {
    reason,
    requestedAction,
    fatigueKind,
    symptomSeverity,
    focalPain: focalPain || undefined,
    availableMinutes,
    athletePrefersRecovery: athletePrefersRecovery || undefined,
    affectedArea,
    targetDiscipline,
    painContext: contextualPain,
    menstrualContext: menstrual,
    headspace: athleteContext.headspace,
    compensatoryTrainingIntent: athleteContext.compensatoryTrainingIntent || undefined,
    requestedLargeTrainingLoad: athleteContext.requestedLargeTrainingLoad || undefined,
    confidence,
    signals: uniqueSignals.length ? uniqueSignals : ['General workout preference'],
    summary,
  };
}

export function buildCoachMessageAdaptation(input: BuildCoachMessageAdaptationInput): CoachMessageAdaptation {
  const interpretation = input.interpretation ?? interpretCoachMessage(input.message, input.quickSignal);
  const painAssessment = interpretation.painContext
    ? assessPainContext(interpretation.painContext, input.painCalibration)
    : undefined;
  const request: SessionAdjustmentRequest = {
    sessionId: input.session.id,
    reason: painAssessment?.level === 'protect' ? 'pain' : interpretation.reason,
    requestedAction: painAssessment?.level === 'protect' ? 'skip' : interpretation.requestedAction,
    availableMinutes: interpretation.availableMinutes,
    availableDisciplines: input.availableDisciplines,
    preferredTargetDate: input.preferredTargetDate,
    preferredReplacementDiscipline: input.preferredReplacementDiscipline,
    fatigueKind: interpretation.fatigueKind,
    symptomSeverity: interpretation.symptomSeverity,
    focalPain: painAssessment?.level === 'protect' ? true : interpretation.focalPain,
    painKind: interpretation.painContext?.kind,
    painFunctionalInterference: interpretation.painContext?.functionalInterference,
    painProtectionLevel: painAssessment?.level,
    selfReportedPain0to10: interpretation.painContext?.score0to10,
    protectiveTrainingDecision: input.protectiveTrainingDecision,
    athletePrefersRecovery: interpretation.athletePrefersRecovery,
  };

  const baseAdjustment = buildDailyAdjustmentOptions(request, {
    plannedSession: input.session,
    weekSessions: input.weekSessions,
    availableDates: input.availableDates,
    recentFatigueTrend: input.recentFatigueTrend,
    recentBoneStress: input.recentBoneStress,
    returnToRun: input.returnToRun,
  });
  const adjustment = applyMenstrualPreferences(baseAdjustment, input.session, interpretation);

  return {
    message: input.message?.trim() ?? '',
    quickSignal: input.quickSignal,
    sessionId: input.session.id,
    interpretation,
    painAssessment,
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
  const easier = option.id.startsWith('easier_') || option.id.startsWith('cycle_');
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

function applyMenstrualPreferences(
  result: DailyAdjustmentResult,
  session: UnifiedTrainingSession,
  interpretation: CoachMessageInterpretation,
): DailyAdjustmentResult {
  const cycle = interpretation.menstrualContext;
  if (!cycle?.active || result.options.length === 0 || result.safetyMessage?.startsWith('Stop the incompatible')) return result;
  const preferences = cycle.preferredAdjustments;

  if (preferences.includes('rest')) {
    const skip = result.options.find((option) => option.action === 'skip');
    if (skip) return recommendOption(result, skip, 'Current cycle symptoms make rest the athlete’s stated preference.');
  }

  if (session.discipline === 'swim' && preferences.includes('avoid_swim')) {
    const alternative = result.options.find((option) => option.action === 'replace')
      ?? result.options.find((option) => option.action === 'move')
      ?? result.options.find((option) => option.action === 'skip');
    if (alternative) return recommendOption(result, alternative, 'Current menstrual symptoms make swimming undesirable today; preserve the week without forcing the swim.');
  }

  if (session.discipline === 'bike' && preferences.includes('indoor_bike')) {
    const shorter = preferences.includes('shorter');
    const easier = preferences.includes('easier');
    const duration = shorter
      ? Math.min(session.durationMinutes, interpretation.availableMinutes ?? Math.max(20, Math.round(session.durationMinutes * 0.7)))
      : easier
        ? Math.max(20, Math.round(session.durationMinutes * 0.8))
        : session.durationMinutes;
    const indoor: AdjustmentOption = {
      id: `cycle_indoor_${session.id}_${duration}`,
      action: 'modify',
      recommendationLevel: 'recommended',
      title: shorter || easier ? `Ride indoors for ${duration} minutes` : 'Ride indoors instead',
      description: easier
        ? 'Keep the ride indoors and remove the planned high-intensity demand while symptoms are active.'
        : 'Change the environment without adding compensatory intensity or volume.',
      durationMinutes: duration,
      rationale: [
        'The athlete explicitly prefers an indoor ride while menstrual symptoms are active.',
        'Environment and dose are adapted to current symptoms; this is not a phase-based performance rule.',
      ],
      weeklyConsequences: [
        shorter || easier ? 'Bike stress is reduced for this session.' : 'The planned bike duration is preserved in a more comfortable environment.',
        'The rest of the week is revalidated after approval.',
      ],
      protectsMentalHealth: true,
      protectsPhysicalHealth: true,
      requiresApproval: false,
      confidence: 'high',
    };
    const others = result.options.filter((option) => option.action !== 'modify');
    return {
      ...result,
      headline: indoor.title,
      recommendedOptionId: indoor.id,
      options: [indoor, ...others].slice(0, 3),
    };
  }

  if (session.discipline === 'run' && preferences.includes('reduce_run_intensity')) {
    const easier = result.options.find((option) => option.id.startsWith('easier_'));
    if (easier) {
      const cycleRun: AdjustmentOption = {
        ...easier,
        id: `cycle_easy_run_${session.id}`,
        recommendationLevel: 'recommended',
        title: 'Reduce run intensity',
        description: 'Keep the run easy and remove the planned quality work while current menstrual symptoms are affecting training.',
        rationale: [
          'The athlete explicitly asked to reduce run intensity while symptoms are active.',
          'The change is symptom-led and individual, not imposed from cycle phase alone.',
        ],
      };
      return {
        ...result,
        headline: cycleRun.title,
        recommendedOptionId: cycleRun.id,
        options: [cycleRun, ...result.options.filter((option) => option.id !== easier.id)].slice(0, 3),
      };
    }
  }

  return result;
}

function recommendOption(result: DailyAdjustmentResult, option: AdjustmentOption, reason: string): DailyAdjustmentResult {
  return {
    ...result,
    headline: option.title,
    recommendedOptionId: option.id,
    options: result.options.map((candidate) => ({
      ...candidate,
      recommendationLevel: candidate.id === option.id ? 'recommended' : candidate.recommendationLevel,
      rationale: candidate.id === option.id ? [...candidate.rationale, reason] : candidate.rationale,
    })),
  };
}

function parseTargetDiscipline(text: string): CoachTargetDiscipline | undefined {
  const matches: CoachTargetDiscipline[] = [];
  if (/\b(swim|swimming|pool)\b/.test(text)) matches.push('swim');
  if (/\b(bike|biking|cycle|cycling|cyclist|ride|riding|trainer)\b/.test(text)) matches.push('bike');
  if (/\b(run|running|runner|jog|jogging|treadmill|track(?:\s+workout|\s+session)?)\b/.test(text)) matches.push('run');
  if (/\b(strength|lift|lifting|weights?|gym\s+workout)\b/.test(text)) matches.push('strength');
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

function parseAvailableMinutes(text: string): number | undefined {
  const minuteMatch = text.match(/\b(?:only\s+have|have|have\s+got|got|can\s+only\s+do|can\s+do|can\s+train\s+for|available\s+for|make\s+(?:it|this)|shorten\s+(?:it|this)\s+to)\s+(?:about\s+)?(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (minuteMatch?.[1]) return clampMinutes(Number(minuteMatch[1]));

  const hourMatch = text.match(/\b(?:only\s+have|have|have\s+got|got|can\s+only\s+do|can\s+do|can\s+train\s+for|available\s+for|make\s+(?:it|this))\s+(?:about\s+)?(\d(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/);
  if (hourMatch?.[1]) return clampMinutes(Math.round(Number(hourMatch[1]) * 60));

  if (/\b(?:only\s+have|have|got|available\s+for)\s+half\s+(?:an\s+)?hour\b/.test(text)) return 30;
  if (/\b(?:only\s+have|have|got|available\s+for)\s+(?:an|one)\s+hour\b/.test(text)) return 60;
  return undefined;
}

function clampMinutes(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(10, Math.min(240, Math.round(value)));
}

function painSeverity0to5(report: PainContextReport): 0 | 1 | 2 | 3 | 4 | 5 {
  if (report.functionalInterference === 'rest_or_night' || report.functionalInterference === 'daily_activity') return 5;
  if (report.stoppedSession || report.worsening || report.newOrUnfamiliar) return 4;
  if (report.functionalInterference === 'modified_session') return 3;
  if (typeof report.score0to10 === 'number') return Math.max(0, Math.min(5, Math.ceil(report.score0to10 / 2))) as 0 | 1 | 2 | 3 | 4 | 5;
  return 2;
}

function buildInterpretationSummary(
  reason: AdjustmentReason,
  requestedAction: RequestedAdjustment,
  affectedArea: CoachAffectedArea,
  availableMinutes?: number,
  targetDiscipline?: CoachTargetDiscipline,
  painContext?: PainContextReport,
  menstrualContext?: MenstrualContextSignal,
  compensatoryTrainingIntent?: boolean,
): string {
  const area = affectedArea === 'lower_body' ? 'lower-body ' : affectedArea === 'upper_body' ? 'upper-body ' : '';
  const target = targetDiscipline ? `${targetDiscipline} session: ` : '';
  if (painContext?.kind === 'menstrual' || menstrualContext?.active) return `${target}menstrual symptoms are affecting training; adapt to current symptoms and personal preferences rather than cycle phase alone.`;
  if (painContext?.kind === 'training_exertion') return `${target}the discomfort sounds exertional rather than focal injury-like pain; adjust only if the effort no longer fits today.`;
  if (painContext?.kind === 'post_exercise_soreness') return `${target}${area}soreness is a recovery signal; use function and recovery trajectory rather than the numeric pain score alone.`;
  if (reason === 'pain') return `${target}protect against ${area}pain based on function, focality, and trajectory before relying on the numeric score.`;
  if (reason === 'illness') return `${target}protect against systemic symptoms before preserving training load.`;
  if (reason === 'fatigue') return `${target}${area}fatigue is limiting today’s training stress.`;
  if (reason === 'time') return `${target}${availableMinutes ? `${availableMinutes} minutes` : 'Less time'} is available, so preserve the highest-priority work.`;
  if (reason === 'access') return `${target}training access changed, so preserve the week without forcing the unavailable session.`;
  if (reason === 'weather') return `${target}weather changed the safe training options, so adapt the session without adding compensatory load.`;
  if (compensatoryTrainingIntent) return `${target}the athlete wants to compensate for missed or interrupted training; the planner should prevent training debt from becoming an unsafe load spike.`;
  if (requestedAction === 'move') return `${target}the schedule changed, so find a cleaner place for the session.`;
  return `${target}the planned session does not fit today; adapt it without compensating elsewhere.`;
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
