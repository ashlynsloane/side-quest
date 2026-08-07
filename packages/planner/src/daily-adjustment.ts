import type {
  PainExperienceKind,
  PainFunctionalInterference,
  PainProtectionLevel,
  ProtectiveTrainingRequestDecision,
} from './athlete-context-intelligence';
import type { RecommendationConfidence, SessionPriority, UnifiedDiscipline, UnifiedTrainingSession } from './unified-training';

export type AdjustmentReason = 'fatigue' | 'time' | 'access' | 'weather' | 'pain' | 'illness' | 'preference' | 'travel' | 'other';
export type RequestedAdjustment = 'easier' | 'shorter' | 'different' | 'move' | 'skip';
export type FatigueKind = 'sleepy' | 'muscle_soreness' | 'heavy_legs' | 'systemic' | 'low_motivation' | 'illness_like' | 'unknown';

export interface SessionAdjustmentRequest {
  sessionId: string;
  reason: AdjustmentReason;
  requestedAction: RequestedAdjustment;
  availableMinutes?: number;
  availableDisciplines?: UnifiedDiscipline[];
  preferredTargetDate?: string;
  preferredReplacementDiscipline?: UnifiedDiscipline;
  fatigueKind?: FatigueKind;
  symptomSeverity?: 0 | 1 | 2 | 3 | 4 | 5;
  focalPain?: boolean;
  painKind?: PainExperienceKind;
  painFunctionalInterference?: PainFunctionalInterference;
  painProtectionLevel?: PainProtectionLevel;
  selfReportedPain0to10?: number;
  protectiveTrainingDecision?: ProtectiveTrainingRequestDecision;
  athletePrefersRecovery?: boolean;
}

export interface AdjustmentContext {
  plannedSession: UnifiedTrainingSession;
  weekSessions: UnifiedTrainingSession[];
  availableDates: string[];
  recentFatigueTrend?: 'stable' | 'worsening' | 'improving';
  recentBoneStress?: boolean;
  returnToRun?: boolean;
  minimumStrengthMinutesRemaining?: number;
  primaryProgressionDiscipline?: UnifiedDiscipline;
}

export interface AdjustmentOption {
  id: string;
  action: 'modify' | 'replace' | 'move' | 'skip';
  recommendationLevel: 'recommended' | 'acceptable' | 'not_recommended';
  title: string;
  description: string;
  targetDate?: string;
  replacementDiscipline?: UnifiedDiscipline;
  durationMinutes?: number;
  rationale: string[];
  weeklyConsequences: string[];
  protectsMentalHealth: boolean;
  protectsPhysicalHealth: boolean;
  requiresApproval: boolean;
  confidence: RecommendationConfidence;
}

export interface DailyAdjustmentResult {
  headline: string;
  recommendedOptionId: string;
  options: AdjustmentOption[];
  safetyMessage?: string;
}

export function buildDailyAdjustmentOptions(request: SessionAdjustmentRequest, context: AdjustmentContext): DailyAdjustmentResult {
  const session = context.plannedSession;
  const hasStructuredPainAssessment = Boolean(request.painProtectionLevel);
  const legacyPainConcern = !hasStructuredPainAssessment && Boolean(
    request.focalPain
    || (request.reason === 'pain' && (request.symptomSeverity ?? 0) >= 3),
  );
  const safetyConcern = Boolean(
    request.reason === 'illness'
    || request.painProtectionLevel === 'protect'
    || legacyPainConcern
    || request.fatigueKind === 'illness_like'
    || (context.recentBoneStress && request.reason === 'pain' && request.painKind !== 'menstrual'),
  );

  if (safetyConcern) {
    const rest = skipOption(session, 'recommended', [
      'Focal, worsening, function-limiting, or illness-like symptoms take priority over plan completion.',
      typeof request.selfReportedPain0to10 === 'number'
        ? `The ${request.selfReportedPain0to10}/10 rating is context, not the sole safety threshold.`
        : 'A numeric pain score is not required for the planner to protect a function-limiting symptom.',
      'The app should pause incompatible progression rather than diagnose the cause.',
    ], ['Today’s training load is removed.', 'The week should be reviewed before impact or heavy loading resumes.']);
    return {
      headline: 'Protect health today',
      recommendedOptionId: rest.id,
      options: [rest],
      safetyMessage: 'Stop the incompatible session. Severe, worsening, persistent, or otherwise concerning symptoms warrant appropriate medical assessment.',
    };
  }

  if (request.protectiveTrainingDecision && request.protectiveTrainingDecision.action !== 'allow') {
    return protectiveEscalationOptions(session, request.protectiveTrainingDecision);
  }

  const options: AdjustmentOption[] = [];
  if (request.reason === 'time' || request.requestedAction === 'shorter') {
    const available = Math.max(10, request.availableMinutes ?? Math.round(session.durationMinutes * 0.5));
    if (available < session.durationMinutes) options.push(shortenOption(session, available));
  }

  if (request.reason === 'fatigue' || request.requestedAction === 'easier') {
    options.push(easierOption(session, context));
  }

  if (request.reason === 'access' || request.reason === 'weather' || request.requestedAction === 'different') {
    const replacement = chooseReplacement(
      session,
      request.availableDisciplines ?? [],
      context,
      request.preferredReplacementDiscipline,
    );
    if (replacement) options.push(replacement);
  }

  const move = chooseMove(session, context, request.preferredTargetDate);
  if (move) options.push(move);
  options.push(skipOption(session, session.priority === 'optional' || request.athletePrefersRecovery ? 'recommended' : 'acceptable', [
    session.priority === 'optional'
      ? 'Optional work can be dropped before the week is compressed.'
      : 'Skipping one session can be preferable to forcing it into a worse position.',
    'Mental and physical health take priority over completion percentage.',
  ], [
    `${session.discipline} volume decreases by ${session.durationMinutes} minutes.`,
    session.keySession ? 'The session objective remains unmet and the week may need review.' : 'Key sessions remain protected.',
  ]));

  const unique = dedupeOptions(options).slice(0, 3);
  const recommended = selectRecommended(unique, request, context);
  return {
    headline: recommended.title,
    recommendedOptionId: recommended.id,
    options: unique.map((option) => ({ ...option, recommendationLevel: option.id === recommended.id ? 'recommended' : option.recommendationLevel })),
  };
}

function protectiveEscalationOptions(
  session: UnifiedTrainingSession,
  decision: ProtectiveTrainingRequestDecision,
): DailyAdjustmentResult {
  const cap = Math.max(15, Math.min(session.durationMinutes, decision.maximumSuggestedDurationMinutes ?? 45));
  const continuity: AdjustmentOption = {
    id: `easier_protect_${session.id}_${cap}`,
    action: 'modify',
    recommendationLevel: 'recommended',
    title: decision.action === 'protect' ? `Keep it easy and cap at ${cap} minutes` : `Hold the load and cap at ${cap} minutes`,
    description: decision.action === 'protect'
      ? 'Do not use this session to replace or repay the training that was interrupted by pain. Use only a low-load tolerance check if symptoms allow.'
      : 'Keep the next session below the planned escalation while the recent pain interruption is still relevant.',
    durationMinutes: cap,
    rationale: decision.explanations,
    weeklyConsequences: [
      'No compensatory intensity or volume is added.',
      'Progression stays on hold until ordinary training tolerance is re-established.',
    ],
    protectsMentalHealth: true,
    protectsPhysicalHealth: true,
    requiresApproval: false,
    confidence: decision.confidence === 'low' ? 'low' : decision.confidence,
  };
  const rest = skipOption(session, 'acceptable', [
    'A recent function-limiting pain event makes recovery a valid choice even if motivation to compensate is high.',
    ...decision.explanations,
  ], ['Today’s planned load is removed.', 'Missed training is not compressed into the next day.']);
  return {
    headline: decision.action === 'protect' ? 'Do not repay the missed workout with more load' : 'Hold the escalation',
    recommendedOptionId: continuity.id,
    options: [continuity, rest],
    safetyMessage: decision.explanations.join(' '),
  };
}

function shortenOption(session: UnifiedTrainingSession, availableMinutes: number): AdjustmentOption {
  const duration = Math.min(session.durationMinutes, availableMinutes);
  const preservesPurpose = !session.keySession || duration >= Math.max(20, Math.round(session.durationMinutes * 0.55));
  return {
    id: `shorten_${session.id}_${duration}`,
    action: 'modify',
    recommendationLevel: preservesPurpose ? 'recommended' : 'acceptable',
    title: `Shorten to ${duration} minutes`,
    description: preservesPurpose ? 'Keep the session’s highest-priority work and remove optional volume.' : 'Use a continuity dose; this does not fully replace the original key-session objective.',
    durationMinutes: duration,
    rationale: ['Preserve warm-up and the main objective before accessories or extra volume.', 'Do not increase intensity to compensate for lost time.'],
    weeklyConsequences: [`Weekly training time decreases by ${session.durationMinutes - duration} minutes.`, preservesPurpose ? 'The primary objective is substantially preserved.' : 'The original objective remains only partially completed.'],
    protectsMentalHealth: true,
    protectsPhysicalHealth: true,
    requiresApproval: false,
    confidence: 'high',
  };
}

function easierOption(session: UnifiedTrainingSession, context: AdjustmentContext): AdjustmentOption {
  const worsening = context.recentFatigueTrend === 'worsening';
  return {
    id: `easier_${session.id}`,
    action: 'modify',
    recommendationLevel: worsening ? 'recommended' : 'acceptable',
    title: worsening ? 'Convert to recovery work' : 'Use an easier version',
    description: worsening ? 'Remove intensity and use easy movement only if it feels restorative.' : 'Reduce intensity and volume while keeping the same discipline or movement pattern.',
    durationMinutes: Math.max(15, Math.round(session.durationMinutes * (worsening ? 0.4 : 0.65))),
    rationale: [
      'Fatigue is information, not a failure to follow the plan.',
      worsening ? 'A worsening multi-day trend supports recovery rather than forcing intensity.' : 'A lighter session can preserve routine without adding the planned recovery cost.',
    ],
    weeklyConsequences: ['Today’s hard-session objective is removed.', 'Upcoming key sessions remain in place unless fatigue continues.'],
    protectsMentalHealth: true,
    protectsPhysicalHealth: true,
    requiresApproval: false,
    confidence: worsening ? 'high' : 'moderate',
  };
}

function chooseReplacement(
  session: UnifiedTrainingSession,
  available: UnifiedDiscipline[],
  context: AdjustmentContext,
  preferred?: UnifiedDiscipline,
): AdjustmentOption | null {
  const candidates = available.filter((discipline) => discipline !== session.discipline && discipline !== 'rest');
  const ordered = preferred && candidates.includes(preferred)
    ? [preferred, ...candidates.filter((discipline) => discipline !== preferred)]
    : candidates;
  const safe = ordered.find((discipline) => isSafeReplacement(session, discipline, context));
  if (!safe) return null;
  const honoredPreference = preferred === safe;
  return {
    id: `replace_${session.id}_${safe}`,
    action: 'replace',
    recommendationLevel: session.priority === 'optional' ? 'acceptable' : 'not_recommended',
    title: `Replace with easy ${safe}`,
    description: honoredPreference
      ? `Use an easy ${safe} session because it fits the athlete’s preference without violating the current recovery constraints.`
      : `Use a low-load ${safe} session because the planned ${session.discipline} environment or preference no longer fits the week.`,
    replacementDiscipline: safe,
    durationMinutes: Math.min(45, session.durationMinutes),
    rationale: [
      honoredPreference
        ? `The requested ${safe} replacement was checked against the rest of the week before being offered.`
        : 'The requested replacement was unavailable or conflicted with current load constraints, so the planner selected the safest available alternative.',
      'A replacement should not imitate the missing session by adding extra intensity.',
      'A different sport is only useful when it does not overload the same tissues or compromise the week’s key work.',
    ],
    weeklyConsequences: [`${session.discipline} frequency decreases unless the original session is moved.`, `${safe} volume increases modestly without adding a new hard day.`],
    protectsMentalHealth: true,
    protectsPhysicalHealth: true,
    requiresApproval: session.keySession,
    confidence: honoredPreference ? 'high' : 'moderate',
  };
}

function isSafeReplacement(
  session: UnifiedTrainingSession,
  discipline: UnifiedDiscipline,
  context: AdjustmentContext,
): boolean {
  if ((context.returnToRun || context.recentBoneStress) && discipline === 'run') return false;
  if (session.lowerBodyDemand === 'high' && (discipline === 'run' || discipline === 'strength')) return false;
  return discipline !== 'rest';
}

function chooseMove(
  session: UnifiedTrainingSession,
  context: AdjustmentContext,
  preferredTargetDate?: string,
): AdjustmentOption | null {
  const occupiedHardDates = new Set(context.weekSessions.filter((item) => item.id !== session.id && (item.intensity === 'hard' || item.recoveryCost >= 4)).map((item) => item.date));
  const impactDates = new Set(context.weekSessions.filter((item) => item.id !== session.id && item.impact !== 'none').map((item) => item.date));
  const available = [...new Set(context.availableDates)].filter((date) => date !== session.date);
  const ordered = preferredTargetDate && available.includes(preferredTargetDate)
    ? [preferredTargetDate, ...available.filter((date) => date !== preferredTargetDate)]
    : available;
  const isSafeDate = (date: string) => {
    if (occupiedHardDates.has(date)) return false;
    if ((context.returnToRun || context.recentBoneStress) && session.impact !== 'none' && impactDates.has(date)) return false;
    return true;
  };
  const target = ordered.find(isSafeDate);
  if (!target) return null;
  const honoredPreference = target === preferredTargetDate;
  return {
    id: `move_${session.id}_${target}`,
    action: 'move',
    recommendationLevel: session.keySession ? 'recommended' : 'acceptable',
    title: `Move to ${target}`,
    description: honoredPreference
      ? 'The requested date fits the week without creating another hard or impact-heavy cluster.'
      : preferredTargetDate
        ? 'The requested date conflicts with the current recovery spacing, so this is the cleaner alternative.'
        : 'Preserve the original session without creating another hard or impact-heavy day.',
    targetDate: target,
    rationale: [
      honoredPreference
        ? 'The requested date was checked against hard-session and impact spacing.'
        : preferredTargetDate
          ? `The requested date (${preferredTargetDate}) was not used because it did not fit the current spacing constraints.`
          : 'Key objectives should be moved only when the new placement is physiologically cleaner than forcing them today.',
      'Optional work is dropped before key work is compressed.',
    ],
    weeklyConsequences: ['Weekly training dose is preserved.', 'The surrounding sessions should be revalidated after the move.'],
    protectsMentalHealth: true,
    protectsPhysicalHealth: true,
    requiresApproval: true,
    confidence: honoredPreference ? 'high' : 'moderate',
  };
}

function skipOption(session: UnifiedTrainingSession, level: AdjustmentOption['recommendationLevel'], rationale: string[], weeklyConsequences: string[]): AdjustmentOption {
  return {
    id: `skip_${session.id}`,
    action: 'skip',
    recommendationLevel: level,
    title: 'Recover and skip it',
    description: 'Do not replace the session today. Resume from the best next decision rather than trying to earn back missed work.',
    rationale,
    weeklyConsequences,
    protectsMentalHealth: true,
    protectsPhysicalHealth: true,
    requiresApproval: session.keySession,
    confidence: 'high',
  };
}

function selectRecommended(options: AdjustmentOption[], request: SessionAdjustmentRequest, context: AdjustmentContext): AdjustmentOption {
  if (request.athletePrefersRecovery || context.recentFatigueTrend === 'worsening') return options.find((item) => item.action === 'skip' || item.id.startsWith('easier_')) ?? options[0]!;
  if (request.requestedAction === 'shorter') return options.find((item) => item.action === 'modify' && item.id.startsWith('shorten_')) ?? options[0]!;
  if (request.requestedAction === 'easier') return options.find((item) => item.action === 'modify' && item.id.startsWith('easier_')) ?? options[0]!;
  if (request.requestedAction === 'move') return options.find((item) => item.action === 'move') ?? options[0]!;
  if (request.requestedAction === 'different' && request.preferredReplacementDiscipline) return options.find((item) => item.action === 'replace') ?? options[0]!;
  if (request.reason === 'time') return options.find((item) => item.action === 'modify' && item.id.startsWith('shorten_')) ?? options[0]!;
  if (request.reason === 'access' || request.reason === 'weather') return options.find((item) => item.action === 'move') ?? options.find((item) => item.action === 'replace') ?? options[0]!;
  if (request.reason === 'fatigue') return options.find((item) => item.id.startsWith('easier_')) ?? options.find((item) => item.action === 'skip') ?? options[0]!;
  return options[0]!;
}

function dedupeOptions(options: AdjustmentOption[]): AdjustmentOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.action)) return false;
    seen.add(option.action);
    return true;
  });
}
