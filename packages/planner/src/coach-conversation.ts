import {
  interpretCoachMessage,
  type CoachMessageInterpretation,
  type CoachQuickSignal,
  type CoachTargetDiscipline,
} from './coach-message-adaptation';

export type CoachConversationIntent =
  | 'new_signal'
  | 'refine_move'
  | 'refine_duration'
  | 'refine_replacement'
  | 'worsening'
  | 'improving'
  | 'confirm'
  | 'cancel'
  | 'follow_up';

export interface CoachConversationContext {
  previousInterpretation?: CoachMessageInterpretation;
  previousTargetDiscipline?: CoachTargetDiscipline;
  previousSessionDate?: string;
  referenceDate: string;
}

export interface CoachConversationResolution {
  intent: CoachConversationIntent;
  interpretation: CoachMessageInterpretation;
  targetDiscipline?: CoachTargetDiscipline;
  preferredTargetDate?: string;
  preferredReplacementDiscipline?: CoachTargetDiscipline;
  recentFatigueTrend?: 'stable' | 'worsening' | 'improving';
  keepPriorTarget: boolean;
  confirmProposal: boolean;
  cancelProposal: boolean;
  conversationSignals: string[];
}

export function resolveCoachConversationMessage(
  message: string,
  quickSignal: CoachQuickSignal | undefined,
  context: CoachConversationContext,
): CoachConversationResolution {
  const text = message.trim().toLowerCase();
  const fresh = interpretCoachMessage(message, quickSignal);
  const previous = context.previousInterpretation;
  const cancellation = isCancellation(text);
  const confirmation = isConfirmation(text);
  const symptomResolved = explicitlyResolvesSafetyConcern(text);
  const worsening = isWorsening(text);
  const improving = isImproving(text);
  const preferredTargetDate = parseRequestedDate(text, context.referenceDate);
  const preferredReplacementDiscipline = parseReplacementPreference(text);
  const explicitMove = Boolean(preferredTargetDate) || /\b(move|reschedule|shift|push|tomorrow|tonight|later)\b/.test(text);
  const explicitDuration = fresh.availableMinutes !== undefined;
  const replacementLanguage = /\b(rather|replace|swap\s+(?:it|this))\b/.test(text)
    || (/\binstead\b/.test(text) && !explicitMove);
  const explicitReplacement = Boolean(preferredReplacementDiscipline) || replacementLanguage;
  const explicitNewSafety = fresh.reason === 'pain' || fresh.reason === 'illness';
  const lowInformationFollowUp = fresh.confidence === 'low' || isEllipticalFollowUp(text);

  let interpretation = fresh;
  let recentFatigueTrend: CoachConversationResolution['recentFatigueTrend'];
  let intent: CoachConversationIntent = 'new_signal';

  if (cancellation) intent = 'cancel';
  else if (confirmation) intent = 'confirm';
  else if (explicitNewSafety) intent = 'new_signal';
  else if (worsening) intent = 'worsening';
  else if (improving) intent = 'improving';
  else if (explicitDuration) intent = 'refine_duration';
  else if (explicitReplacement) intent = 'refine_replacement';
  else if (explicitMove) intent = 'refine_move';
  else if (previous) intent = 'follow_up';

  if (previous && !explicitNewSafety && !symptomResolved) {
    const previousWasSafety = previous.reason === 'pain' || previous.reason === 'illness';
    if (previousWasSafety && (lowInformationFollowUp || explicitMove || explicitDuration || explicitReplacement || worsening)) {
      interpretation = {
        ...previous,
        targetDiscipline: explicitReplacement
          ? previous.targetDiscipline
          : fresh.targetDiscipline ?? previous.targetDiscipline,
        signals: unique([...previous.signals, ...fresh.signals.filter((signal) => signal !== 'General workout preference')]),
        confidence: previous.confidence === 'high' ? 'high' : 'moderate',
        summary: previous.summary,
      };
    } else if (previous.reason === 'fatigue' && (worsening || improving || lowInformationFollowUp || explicitMove || explicitDuration || explicitReplacement)) {
      interpretation = mergeFatigueFollowUp(previous, fresh, {
        worsening,
        improving,
        explicitDuration,
        explicitMove,
        explicitReplacement,
      });
    }
  }

  if (symptomResolved && previous && (previous.reason === 'pain' || previous.reason === 'illness')) {
    interpretation = {
      ...fresh,
      reason: explicitDuration ? 'time' : 'preference',
      requestedAction: explicitMove ? 'move' : explicitDuration ? 'shorter' : explicitReplacement ? 'different' : 'different',
      focalPain: undefined,
      symptomSeverity: undefined,
      fatigueKind: undefined,
      painContext: undefined,
      signals: unique([
        ...fresh.signals.filter((signal) => signal !== 'General workout preference' && !signal.startsWith('Pain context:') && !signal.includes('self-report')),
        'Prior safety concern reported resolved',
      ]),
      summary: explicitMove
        ? 'The prior safety concern was reported resolved; re-check the requested date against the current week.'
        : 'The prior safety concern was reported resolved; build a fresh option from the current request.',
      confidence: 'moderate',
    };
  }

  if (worsening) recentFatigueTrend = 'worsening';
  else if (improving) recentFatigueTrend = 'improving';
  else if (interpretation.reason === 'fatigue') recentFatigueTrend = 'stable';

  if (!explicitNewSafety && interpretation.reason !== 'pain' && interpretation.reason !== 'illness') {
    if (explicitDuration && fresh.availableMinutes !== undefined) {
      interpretation = {
        ...interpretation,
        reason: interpretation.reason === 'fatigue' ? 'fatigue' : 'time',
        requestedAction: 'shorter',
        availableMinutes: fresh.availableMinutes,
        signals: unique([...interpretation.signals, `${fresh.availableMinutes} minutes available`]),
        summary: `${fresh.availableMinutes} minutes is the current constraint; preserve the highest-priority work that still fits.`,
      };
    } else if (explicitReplacement) {
      interpretation = {
        ...interpretation,
        reason: interpretation.reason === 'fatigue' ? interpretation.reason : 'preference',
        requestedAction: 'different',
        signals: unique([
          ...interpretation.signals.filter((signal) => !signal.startsWith('Targets ')),
          preferredReplacementDiscipline ? `Prefers ${preferredReplacementDiscipline}` : 'Prefers a different session',
        ]),
        summary: preferredReplacementDiscipline
          ? `The athlete prefers ${preferredReplacementDiscipline}; the planner should offer it only if it fits the rest of the week.`
          : 'The athlete prefers a different session; choose a replacement only if it improves the whole week.',
      };
    } else if (explicitMove) {
      interpretation = {
        ...interpretation,
        reason: interpretation.reason === 'fatigue' ? interpretation.reason : 'preference',
        requestedAction: 'move',
        signals: unique([
          ...interpretation.signals,
          preferredTargetDate ? `Requested ${preferredTargetDate}` : 'Requested a schedule move',
        ]),
        summary: preferredTargetDate
          ? `The athlete requested ${preferredTargetDate}; use it only if recovery spacing still works.`
          : 'The athlete wants to move the session; find the cleanest place in the current week.',
      };
    }
  }

  const targetDiscipline = explicitReplacement && context.previousTargetDiscipline
    ? context.previousTargetDiscipline
    : fresh.targetDiscipline
      ?? interpretation.targetDiscipline
      ?? context.previousTargetDiscipline;
  interpretation = { ...interpretation, targetDiscipline };

  const keepPriorTarget = Boolean(
    context.previousTargetDiscipline
    && (explicitReplacement || !fresh.targetDiscipline)
    && (previous || lowInformationFollowUp || explicitMove || explicitDuration || explicitReplacement || worsening || improving),
  );

  const conversationSignals = unique([
    ...(keepPriorTarget ? ['Continues prior session'] : []),
    ...(preferredTargetDate ? [`Requested date: ${preferredTargetDate}`] : []),
    ...(preferredReplacementDiscipline ? [`Preferred replacement: ${preferredReplacementDiscipline}`] : []),
    ...(worsening ? ['Condition worsening'] : []),
    ...(improving ? ['Condition improving'] : []),
  ]);

  return {
    intent,
    interpretation,
    targetDiscipline,
    preferredTargetDate,
    preferredReplacementDiscipline,
    recentFatigueTrend,
    keepPriorTarget,
    confirmProposal: confirmation,
    cancelProposal: cancellation,
    conversationSignals,
  };
}

function mergeFatigueFollowUp(
  previous: CoachMessageInterpretation,
  fresh: CoachMessageInterpretation,
  flags: {
    worsening: boolean;
    improving: boolean;
    explicitDuration: boolean;
    explicitMove: boolean;
    explicitReplacement: boolean;
  },
): CoachMessageInterpretation {
  const requestedAction = flags.explicitDuration
    ? 'shorter'
    : flags.explicitReplacement
      ? 'different'
      : flags.explicitMove
        ? 'move'
        : flags.worsening
          ? 'easier'
          : previous.requestedAction;
  const summary = flags.worsening
    ? `${areaPrefix(previous)}fatigue is worsening, so recovery protection should increase rather than preserving the original load.`
    : flags.improving
      ? `${areaPrefix(previous)}fatigue is improving, but the week should still be re-checked before restoring load.`
      : previous.summary;
  return {
    ...previous,
    ...copyDefinedFatigueFields(fresh),
    requestedAction,
    availableMinutes: fresh.availableMinutes ?? previous.availableMinutes,
    targetDiscipline: flags.explicitReplacement ? previous.targetDiscipline : fresh.targetDiscipline ?? previous.targetDiscipline,
    confidence: flags.worsening ? 'high' : previous.confidence,
    signals: unique([
      ...previous.signals,
      ...fresh.signals.filter((signal) => signal !== 'General workout preference' && !(flags.explicitReplacement && signal.startsWith('Targets '))),
      ...(flags.worsening ? ['Worsening fatigue'] : []),
      ...(flags.improving ? ['Improving fatigue'] : []),
    ]),
    summary,
  };
}

function copyDefinedFatigueFields(fresh: CoachMessageInterpretation): Partial<CoachMessageInterpretation> {
  const output: Partial<CoachMessageInterpretation> = {};
  if (fresh.fatigueKind) output.fatigueKind = fresh.fatigueKind;
  if (fresh.affectedArea !== 'unknown') output.affectedArea = fresh.affectedArea;
  if (fresh.athletePrefersRecovery !== undefined) output.athletePrefersRecovery = fresh.athletePrefersRecovery;
  if (fresh.menstrualContext) output.menstrualContext = fresh.menstrualContext;
  if (fresh.headspace && fresh.headspace !== 'neutral') output.headspace = fresh.headspace;
  if (fresh.compensatoryTrainingIntent !== undefined) output.compensatoryTrainingIntent = fresh.compensatoryTrainingIntent;
  if (fresh.requestedLargeTrainingLoad !== undefined) output.requestedLargeTrainingLoad = fresh.requestedLargeTrainingLoad;
  return output;
}

function parseReplacementPreference(text: string): CoachTargetDiscipline | undefined {
  const patterns: Array<[CoachTargetDiscipline, RegExp]> = [
    ['swim', /\b(?:rather|instead|prefer|replace\s+(?:it|this)\s+with|make\s+(?:it|this))[^.!?]{0,24}\b(swim|swimming|pool)\b/],
    ['bike', /\b(?:rather|instead|prefer|replace\s+(?:it|this)\s+with|make\s+(?:it|this))[^.!?]{0,24}\b(bike|biking|ride|riding|cycle|cycling|trainer)\b/],
    ['run', /\b(?:rather|instead|prefer|replace\s+(?:it|this)\s+with|make\s+(?:it|this))[^.!?]{0,24}\b(run|running|jog|jogging|treadmill)\b/],
    ['strength', /\b(?:rather|instead|prefer|replace\s+(?:it|this)\s+with|make\s+(?:it|this))[^.!?]{0,24}\b(strength|lift|lifting|weights?)\b/],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0];
}

function parseRequestedDate(text: string, referenceDate: string): string | undefined {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;
  if (/\bday\s+after\s+tomorrow\b/.test(text)) return addDays(referenceDate, 2);
  if (/\btomorrow\b/.test(text)) return addDays(referenceDate, 1);
  if (/\btoday\b/.test(text) && /\b(move|reschedule|shift|later|tonight)\b/.test(text)) return referenceDate;

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const match = weekdays.find((weekday) => new RegExp(`\\b${weekday}\\b`).test(text));
  if (!match) return undefined;
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const targetIndex = weekdays.indexOf(match);
  let delta = (targetIndex - reference.getUTCDay() + 7) % 7;
  if (delta === 0 && /\bnext\s+/.test(text)) delta = 7;
  return addDays(referenceDate, delta);
}

function isCancellation(text: string): boolean {
  return /\b(never\s+mind|nevermind|keep\s+(?:the\s+)?original|leave\s+it|don['’]?t\s+change\s+it|do\s+not\s+change\s+it|forget\s+it)\b/.test(text);
}

function isConfirmation(text: string): boolean {
  return /^(yes|yep|yeah|do\s+it|go\s+ahead|sounds\s+good|accept|apply\s+it|that\s+works)[.!\s]*$/.test(text);
}

function isWorsening(text: string): boolean {
  return /\b(worse|worsening|more\s+sore|more\s+tired|even\s+more|feel\s+worse|feeling\s+worse|still\s+(?:really\s+)?sore|still\s+(?:really\s+)?tired)\b/.test(text);
}

function isImproving(text: string): boolean {
  return /\b(better|improving|less\s+sore|less\s+tired|more\s+energy|feel\s+good\s+now|feeling\s+better)\b/.test(text);
}

function explicitlyResolvesSafetyConcern(text: string): boolean {
  return /\b(no\s+(?:more\s+)?pain|pain\s+(?:is\s+)?gone|doesn['’]?t\s+hurt\s+(?:now|anymore)|does\s+not\s+hurt\s+(?:now|anymore)|symptoms?\s+(?:are\s+)?gone|not\s+sick\s+anymore)\b/.test(text);
}

function isEllipticalFollowUp(text: string): boolean {
  if (!text) return false;
  return /^(actually\b|instead\b|rather\b|what\s+about\b|could\s+we\b|can\s+we\b|make\s+it\b|move\s+it\b|how\s+about\b|and\b|but\b|also\b)/.test(text)
    || /\b(it|that|this)\b/.test(text);
}

function areaPrefix(interpretation: CoachMessageInterpretation): string {
  if (interpretation.affectedArea === 'lower_body') return 'Lower-body ';
  if (interpretation.affectedArea === 'upper_body') return 'Upper-body ';
  return '';
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
