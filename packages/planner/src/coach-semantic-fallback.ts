import { resolveCoachConversationMessage, type CoachConversationContext } from './coach-conversation';
import { interpretCoachMessage, type CoachQuickSignal, type CoachTargetDiscipline } from './coach-message-adaptation';
import type { CoachSemanticTrainingEvent, CoachTurnFrameV2 } from './coach-semantic-frame';

export interface CoachSemanticFallbackContext extends CoachConversationContext {
  turnId: string;
  previousTargetEventId?: string;
  knownPlannedEvents?: Array<{
    eventId: string;
    title: string;
    discipline?: CoachTargetDiscipline;
    date: string;
  }>;
}

export function buildDeterministicCoachTurnFrame(
  message: string,
  quickSignal: CoachQuickSignal | undefined,
  context: CoachSemanticFallbackContext,
): CoachTurnFrameV2 {
  const fresh = interpretCoachMessage(message, quickSignal);
  const resolution = resolveCoachConversationMessage(message, quickSignal, context);
  const retrospective = resolution.conversationSignals.includes('Sport mention describes completed or prior training');
  const movementChanged = /\b(limp|limping|changed\s+(?:my\s+)?movement|changed\s+(?:my\s+)?stride|altered\s+(?:my\s+)?stride|changed\s+(?:my\s+)?form)\b/i.test(message);
  const trainingChanged = /\b(modified|cut\s+(?:it|the\s+workout)\s+short|stopped|quit|couldn['’]?t\s+finish|could\s+not\s+finish|changed\s+(?:my\s+)?training)\b/i.test(message);
  const events: CoachSemanticTrainingEvent[] = [];

  if (retrospective && fresh.targetDiscipline) {
    events.push({
      semanticId: `turn:${context.turnId}:source`,
      discipline: fresh.targetDiscipline,
      temporalRole: 'completed',
      relationToTurn: 'symptom_source',
    });
  }

  if (resolution.focusDate) {
    const planned = (context.knownPlannedEvents ?? []).filter((event) => event.date === resolution.focusDate);
    for (const event of planned) {
      events.push({
        semanticId: `event:${event.eventId}`,
        eventId: event.eventId,
        discipline: event.discipline,
        temporalRole: 'planned',
        date: event.date,
        relationToTurn: 'context',
      });
    }
  }

  const modificationIntent = resolution.intent === 'refine_move'
    || resolution.intent === 'refine_duration'
    || resolution.intent === 'refine_replacement';
  const explicitTarget = modificationIntent
    ? findKnownTarget(context, resolution.targetDiscipline, resolution.preferredTargetDate)
    : undefined;
  if (explicitTarget && !events.some((event) => event.eventId === explicitTarget.eventId)) {
    events.push({
      semanticId: `event:${explicitTarget.eventId}`,
      eventId: explicitTarget.eventId,
      discipline: explicitTarget.discipline,
      temporalRole: 'planned',
      date: explicitTarget.date,
      relationToTurn: 'change_target',
    });
  }

  const sourceEventSemanticId = retrospective && fresh.targetDiscipline ? `turn:${context.turnId}:source` : undefined;
  const symptom = fresh.painContext ? {
    semanticId: `turn:${context.turnId}:symptom`,
    bodyArea: fresh.affectedArea === 'unknown' ? undefined : fresh.affectedArea,
    category: painCategory(fresh.painContext.kind),
    severity0to10: fresh.painContext.score0to10,
    changedMovement: movementChanged || fresh.painContext.functionalInterference === 'modified_session'
      || fresh.painContext.functionalInterference === 'daily_activity'
      || fresh.painContext.functionalInterference === 'rest_or_night',
    changedTraining: trainingChanged || fresh.painContext.functionalInterference === 'modified_session'
      || fresh.painContext.functionalInterference === 'stopped_session',
    stoppedTraining: fresh.painContext.stoppedSession,
    trajectory: fresh.painContext.worsening ? 'worse' as const : 'unknown' as const,
    sourceEventSemanticId,
  } : movementChanged ? {
    semanticId: `turn:${context.turnId}:symptom`,
    bodyArea: fresh.affectedArea === 'unknown' ? undefined : fresh.affectedArea,
    category: 'unknown' as const,
    changedMovement: true,
    changedTraining: trainingChanged,
    stoppedTraining: false,
    trajectory: 'unknown' as const,
    sourceEventSemanticId,
  } : undefined;

  const intent = inferIntent(message, fresh, resolution.intent, retrospective, Boolean(resolution.focusDate), Boolean(symptom));
  const action = intent === 'ask_about_future_training'
    ? 'evaluate' as const
    : intent === 'request_extra_training'
      ? 'add' as const
      : intent === 'modify_planned_session'
        ? mapRequestedAction(resolution.interpretation.requestedAction)
        : 'none' as const;
  const targetEvent = events.find((event) => event.relationToTurn === 'change_target');
  const requestedDiscipline = retrospective && !hasForwardTrainingRequest(message, fresh.targetDiscipline)
    ? undefined
    : resolution.targetDiscipline;

  return {
    version: 2,
    turnId: context.turnId,
    intent,
    horizon: resolution.focusDate ? horizonForDate(resolution.focusDate, context.referenceDate) : inferHorizon(message),
    events,
    symptoms: symptom ? [symptom] : [],
    requestedChange: action === 'none' ? undefined : {
      action,
      targetEventSemanticId: targetEvent?.semanticId,
      targetEventId: targetEvent?.eventId,
      discipline: requestedDiscipline,
      date: resolution.focusDate ?? resolution.preferredTargetDate,
      durationMinutes: fresh.availableMinutes,
    },
    correction: /^\s*(actually|well\s+actually)\b/i.test(message)
      ? { target: symptom ? 'symptom_function' : 'general', note: 'Athlete is revising recent conversation context.' }
      : undefined,
    constraints: resolution.interpretation.signals,
    unresolved: [],
    confidence: resolution.interpretation.confidence === 'high' ? 0.9 : resolution.interpretation.confidence === 'moderate' ? 0.65 : 0.35,
    source: 'deterministic_fallback',
  };
}

function findKnownTarget(
  context: CoachSemanticFallbackContext,
  discipline: CoachTargetDiscipline | undefined,
  date: string | undefined,
) {
  const known = context.knownPlannedEvents ?? [];
  if (context.previousTargetEventId) {
    const previous = known.find((event) => event.eventId === context.previousTargetEventId);
    if (previous) return previous;
  }
  return known.find((event) => (!discipline || event.discipline === discipline) && (!date || event.date === date));
}

function inferIntent(
  message: string,
  fresh: ReturnType<typeof interpretCoachMessage>,
  legacyIntent: ReturnType<typeof resolveCoachConversationMessage>['intent'],
  retrospective: boolean,
  dateFocus: boolean,
  hasSymptom: boolean,
): CoachTurnFrameV2['intent'] {
  if (dateFocus) return 'ask_about_future_training';
  if (/^\s*(actually|well\s+actually)\b/i.test(message)) return 'correct_previous_statement';
  if (retrospective && hasSymptom) return 'report_symptom';
  if (retrospective) return 'report_completed_training';
  if (legacyIntent === 'refine_move' || legacyIntent === 'refine_duration' || legacyIntent === 'refine_replacement') return 'modify_planned_session';
  if (fresh.compensatoryTrainingIntent || fresh.requestedLargeTrainingLoad) return 'request_extra_training';
  if (hasSymptom || fresh.reason === 'illness') return 'report_symptom';
  return 'general_update';
}

function mapRequestedAction(action: ReturnType<typeof interpretCoachMessage>['requestedAction']): 'move' | 'shorten' | 'replace' | 'skip' | 'none' {
  if (action === 'move') return 'move';
  if (action === 'shorter') return 'shorten';
  if (action === 'different') return 'replace';
  if (action === 'skip') return 'skip';
  return 'none';
}

function inferHorizon(message: string): CoachTurnFrameV2['horizon'] {
  const text = message.toLowerCase();
  if (/\b(yesterday|earlier|already|finished|completed|after\s+my|during\s+my)\b/.test(text)) return 'past';
  if (/\btomorrow\b/.test(text)) return 'tomorrow';
  if (/\btoday|tonight\b/.test(text)) return 'today';
  if (/\b(this\s+week|weekend)\b/.test(text)) return 'this_week';
  return 'unknown';
}

function horizonForDate(date: string, referenceDate: string): CoachTurnFrameV2['horizon'] {
  if (date === referenceDate) return 'today';
  if (date === addDays(referenceDate, 1)) return 'tomorrow';
  return 'this_week';
}

function painCategory(kind: NonNullable<ReturnType<typeof interpretCoachMessage>['painContext']>['kind']): 'soreness' | 'exertion' | 'menstrual' | 'musculoskeletal' | 'illness' | 'unknown' {
  if (kind === 'post_exercise_soreness') return 'soreness';
  if (kind === 'training_exertion') return 'exertion';
  if (kind === 'menstrual') return 'menstrual';
  if (kind === 'focal_musculoskeletal') return 'musculoskeletal';
  if (kind === 'systemic') return 'illness';
  return 'unknown';
}

function hasForwardTrainingRequest(message: string, discipline: CoachTargetDiscipline | undefined): boolean {
  if (!discipline) return false;
  const text = message.toLowerCase();
  const sport = discipline === 'swim' ? 'swim|swimming|pool'
    : discipline === 'bike' ? 'bike|biking|ride|riding|cycle|cycling|trainer'
      : discipline === 'run' ? 'run|running|jog|jogging|track'
        : 'strength|lift|lifting|weights|gym';
  return new RegExp(`\\b(?:want|plan|planning|going|need|would\\s+like|can\\s+i|could\\s+i)\\b[^.!?]{0,28}\\b(?:${sport})\\b`).test(text)
    || new RegExp(`\\b(?:${sport})\\b[^.!?]{0,24}\\b(?:tomorrow|later|next|tonight)\\b`).test(text)
    || /\b(move|reschedule|shift|push)\b/.test(text);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
