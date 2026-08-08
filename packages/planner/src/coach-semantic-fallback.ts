import { resolveCoachConversationMessage, type CoachConversationContext } from './coach-conversation';
import { interpretCoachMessage, type CoachQuickSignal, type CoachTargetDiscipline } from './coach-message-adaptation';
import type {
  CoachSemanticDiscipline,
  CoachSemanticStrategyChange,
  CoachSemanticSymptom,
  CoachSemanticTrainingEvent,
  CoachStrategyObjective,
  CoachTurnFrameV2,
} from './coach-semantic-frame';

export interface CoachSemanticFallbackContext extends CoachConversationContext {
  turnId: string;
  previousTargetEventId?: string;
  pendingQuestionKind?: 'clarify_target' | 'clarify_function' | 'clarify_time' | 'clarify_request';
  activeConcern?: {
    semanticId: string;
    bodyArea?: string;
    category?: CoachSemanticSymptom['category'];
  };
  strategyDraft?: CoachSemanticStrategyChange;
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
  const vagueBodyConcern = /\b(feels?\s+(?:weird|off|wrong|funny)|doesn['’]?t\s+feel\s+right|something\s+with\s+my)\b/i.test(message)
    && fresh.affectedArea !== 'unknown';
  const answeringFunction = context.pendingQuestionKind === 'clarify_function';
  const functionDenied = answeringFunction && /\b(no|nope|not\s+really|didn['’]?t|did\s+not|unchanged|movement\s+was\s+normal|trained\s+normally|training\s+was\s+normal)\b/i.test(message);
  const functionAffirmed = answeringFunction && !functionDenied && /\b(yes|yeah|yep|it\s+did|limp|limping|changed|modified|stopped|quit|backed\s+off)\b/i.test(message);
  const resolvedFunctionAnswer = functionDenied || functionAffirmed;
  const rawStrategyChange = buildStrategyChange(message, context.referenceDate, context.strategyDraft);
  const strategyConflict = hasConflictingTopFocus(rawStrategyChange);
  const strategyChange = strategyConflict ? undefined : rawStrategyChange;
  const strategyTopic = Boolean(rawStrategyChange);
  const events: CoachSemanticTrainingEvent[] = [];

  if (retrospective && fresh.targetDiscipline) {
    events.push({
      semanticId: `turn:${context.turnId}:source`,
      discipline: fresh.targetDiscipline,
      temporalRole: 'completed',
      relationToTurn: 'symptom_source',
    });
  }

  if (resolution.focusDate && !strategyTopic) {
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
  const explicitTarget = modificationIntent && !strategyTopic
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
  const symptom = strategyTopic ? undefined : buildSymptom({
    message,
    fresh,
    movementChanged,
    trainingChanged,
    vagueBodyConcern,
    resolvedFunctionAnswer,
    functionDenied,
    functionAffirmed,
    activeConcern: context.activeConcern,
    sourceEventSemanticId,
    turnId: context.turnId,
  });

  const intent = inferIntent(
    message,
    fresh,
    resolution.intent,
    retrospective,
    Boolean(resolution.focusDate),
    Boolean(symptom),
    resolvedFunctionAnswer,
    strategyTopic,
  );
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
  const horizon = rawStrategyChange
    ? strategyHorizon(rawStrategyChange, context.referenceDate)
    : resolution.focusDate
      ? horizonForDate(resolution.focusDate, context.referenceDate)
      : inferHorizon(message);

  return {
    version: 2,
    turnId: context.turnId,
    intent,
    horizon,
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
    strategyChange,
    correction: resolvedFunctionAnswer
      ? { target: 'symptom_function', note: 'This answer resolves the active functional-impact question.' }
      : /^\s*(actually|well\s+actually)\b/i.test(message)
        ? { target: symptom ? 'symptom_function' : 'general', note: 'Athlete is revising recent conversation context.' }
        : undefined,
    constraints: strategyTopic ? [] : resolution.interpretation.signals,
    unresolved: strategyConflict ? ['single_top_focus'] : [],
    confidence: strategyTopic ? 0.72 : resolution.interpretation.confidence === 'high' ? 0.9 : resolution.interpretation.confidence === 'moderate' ? 0.65 : 0.35,
    source: 'deterministic_fallback',
  };
}

function buildStrategyChange(
  message: string,
  referenceDate: string,
  previous: CoachSemanticStrategyChange | undefined,
): CoachSemanticStrategyChange | undefined {
  const text = normalize(message);
  const disciplines = mentionedDisciplines(text);
  const explicitObjectiveLanguage = /\b(main|primary|biggest)\s+focus\b|\bprioriti[sz]e\b|\bmaintain(?:ance)?\b|\bdevelop\b|\bimprov(?:e|ing)\b|\bmaximize\b|\bmaximise\b|\bminimum\s+viable\b|\bfastest\s+(?:swim|bike|run)\s+split\b/.test(text);
  const explicitLongHorizon = /\b(next|for\s+the\s+next)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:weeks?|months?)\b|\buntil\s+(?:20\d{2}-\d{2}-\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b|\bfor\s+(?:this|my|the)\s+(?:race|season|70\.3|ironman|marathon|block)\b/.test(text);
  const strategyContinuation = Boolean(previous) && (explicitObjectiveLanguage || explicitLongHorizon);
  if (!(disciplines.length && explicitObjectiveLanguage) && !explicitLongHorizon && !strategyContinuation) return undefined;

  const disciplineObjectives: CoachSemanticStrategyChange['disciplineObjectives'] = {};
  for (const discipline of disciplines) {
    const objective = objectiveForDiscipline(text, discipline);
    if (objective) disciplineObjectives[discipline] = objective;
  }

  const primaryFocus = inferPrimaryStrategyFocus(text, disciplines)
    ?? (Object.entries(disciplineObjectives).find(([, objective]) => objective === 'primary_focus' || objective === 'maximize')?.[0] as CoachSemanticDiscipline | undefined);
  if (primaryFocus && !disciplineObjectives[primaryFocus]) disciplineObjectives[primaryFocus] = 'primary_focus';

  const duration = parseStrategyWindow(text, referenceDate);
  const tradeoffTolerance = inferTradeoff(text);
  const racePriority = inferRacePriority(text, primaryFocus);
  const hasNewFact = Boolean(
    primaryFocus
    || Object.keys(disciplineObjectives).length
    || duration.startsAt
    || duration.endsAt
    || tradeoffTolerance
    || racePriority,
  );
  if (!hasNewFact) return undefined;

  return {
    ...duration,
    primaryFocus,
    disciplineObjectives,
    tradeoffTolerance,
    racePriority,
  };
}

function hasConflictingTopFocus(strategy: CoachSemanticStrategyChange | undefined): boolean {
  if (!strategy) return false;
  const top = Object.values(strategy.disciplineObjectives)
    .filter((objective) => objective === 'primary_focus' || objective === 'maximize');
  return top.length > 1;
}

function objectiveForDiscipline(text: string, discipline: CoachSemanticDiscipline): CoachStrategyObjective | undefined {
  const sport = sportPattern(discipline);
  for (const clause of strategyClauses(text).filter((candidate) => new RegExp(`\\b(?:${sport})\\b`).test(candidate))) {
    if (/\b(maximize|maximise|as\s+much\s+as\s+possible|biggest\s+possible)\b/.test(clause)) return 'maximize';
    if (/\b(?:main|primary|biggest)\s+focus\b|\bprioriti[sz]e\b|\bpriority\b/.test(clause)) return 'primary_focus';
    if (/\b(develop|improve|build)\b/.test(clause)) return 'develop';
    if (/\b(maintain|maintenance|hold\s+steady|keep\s+steady)\b/.test(clause)) return 'maintain';
    if (/\b(minimum\s+viable|bare\s+minimum)\b/.test(clause)) return 'minimum_viable';
  }
  return undefined;
}

function inferPrimaryStrategyFocus(text: string, disciplines: CoachSemanticDiscipline[]): CoachSemanticDiscipline | undefined {
  const clauses = strategyClauses(text);
  for (const discipline of disciplines) {
    const sport = sportPattern(discipline);
    const disciplineClauses = clauses.filter((clause) => new RegExp(`\\b(?:${sport})\\b`).test(clause));
    if (disciplineClauses.some((clause) => /\b(?:main|primary|biggest)\s+focus\b|\bprioriti[sz]e\b|\bpriority\b/.test(clause))) return discipline;
    if (disciplineClauses.some((clause) => /\bfastest\s+(?:swim|bike|run)\s+split\b/.test(clause))) return discipline;
  }
  return undefined;
}

function inferTradeoff(text: string): CoachSemanticStrategyChange['tradeoffTolerance'] | undefined {
  if (/\b(sacrifice|at\s+the\s+expense\s+of|don['’]?t\s+care\s+about|okay\s+if\s+.+\s+drops?)\b/.test(text)) return 'aggressive_specialization';
  if (/\bwhile\s+(?:i\s+)?maintain|even\s+if\s+.+\s+maintain|keep\s+.+\s+at\s+maintenance\b/.test(text)) return 'moderate_tradeoff';
  if (/\b(balance|balanced|without\s+sacrificing|keep\s+everything\s+moving)\b/.test(text)) return 'preserve_balance';
  return undefined;
}

function inferRacePriority(
  text: string,
  primaryFocus: CoachSemanticDiscipline | undefined,
): CoachSemanticStrategyChange['racePriority'] | undefined {
  const discipline = primaryFocus === 'strength' ? undefined : primaryFocus;
  if (/\bfastest\s+(?:swim|bike|run)\s+split\b|\bstrong\s+(?:swim|bike|run)\s+split\b/.test(text)) {
    return { discipline, objective: 'strong_split' };
  }
  if (/\b(personal\s+best|\bpr\b|\bpb\b)\b/.test(text)) return { discipline, objective: 'personal_best' };
  if (/\b(place|placement|podium)\b/.test(text)) return { discipline, objective: 'placement' };
  return undefined;
}

function parseStrategyWindow(text: string, referenceDate: string): Pick<CoachSemanticStrategyChange, 'startsAt' | 'endsAt'> {
  const duration = text.match(/\b(?:next|for\s+the\s+next)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(weeks?|months?)\b/);
  if (duration) {
    const amount = parseCount(duration[1]!);
    if (amount) {
      return {
        startsAt: referenceDate,
        endsAt: duration[2]!.startsWith('month') ? addMonths(referenceDate, amount) : addDays(referenceDate, amount * 7),
      };
    }
  }

  const isoEnd = text.match(/\buntil\s+(20\d{2}-\d{2}-\d{2})\b/);
  if (isoEnd) return { endsAt: isoEnd[1] };
  const monthEnd = text.match(/\buntil\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (monthEnd) return { endsAt: endOfNamedMonth(monthEnd[1]!, referenceDate) };
  return {};
}

function strategyHorizon(strategy: CoachSemanticStrategyChange, referenceDate: string): CoachTurnFrameV2['horizon'] {
  if (!strategy.endsAt) return 'long_term';
  const days = differenceDays(referenceDate, strategy.endsAt);
  return days >= 42 ? 'long_term' : 'future_block';
}

function mentionedDisciplines(text: string): CoachSemanticDiscipline[] {
  return (['swim', 'bike', 'run', 'strength'] as const).filter((discipline) => new RegExp(`\\b(?:${sportPattern(discipline)})\\b`).test(text));
}

function sportPattern(discipline: CoachSemanticDiscipline): string {
  if (discipline === 'swim') return 'swim|swimming|pool';
  if (discipline === 'bike') return 'bike|biking|cycle|cycling|ride|riding|trainer';
  if (discipline === 'run') return 'run|running|jog|jogging';
  return 'strength|lift|lifting|weights|gym';
}

function strategyClauses(text: string): string[] {
  return text
    .split(/\s+(?:while|but|whereas)\s+|[;,.]+|\s+and\s+(?=(?:i\s+|we\s+)?(?:maintain|develop|improve|build|maximize|maximise|prioriti[sz]e|keep|hold)\b)/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function buildSymptom(input: {
  message: string;
  fresh: ReturnType<typeof interpretCoachMessage>;
  movementChanged: boolean;
  trainingChanged: boolean;
  vagueBodyConcern: boolean;
  resolvedFunctionAnswer: boolean;
  functionDenied: boolean;
  functionAffirmed: boolean;
  activeConcern?: CoachSemanticFallbackContext['activeConcern'];
  sourceEventSemanticId?: string;
  turnId: string;
}): CoachSemanticSymptom | undefined {
  const { fresh } = input;
  if (input.resolvedFunctionAnswer) {
    return {
      semanticId: input.activeConcern?.semanticId ?? `turn:${input.turnId}:symptom`,
      bodyArea: input.activeConcern?.bodyArea ?? (fresh.affectedArea === 'unknown' ? undefined : fresh.affectedArea),
      category: input.activeConcern?.category ?? 'unknown',
      functionChanged: input.functionAffirmed,
      changedMovement: input.functionDenied ? false : input.movementChanged ? true : undefined,
      changedTraining: input.functionDenied ? false : input.trainingChanged ? true : undefined,
      stoppedTraining: input.functionDenied ? false : /\b(stopped|quit|couldn['’]?t\s+finish|could\s+not\s+finish)\b/i.test(input.message) || undefined,
      trajectory: 'unknown',
      sourceEventSemanticId: input.sourceEventSemanticId,
    };
  }

  if (fresh.painContext) {
    const functionalInterference = fresh.painContext.functionalInterference;
    const functionChanged = input.movementChanged || input.trainingChanged
      || functionalInterference === 'modified_session'
      || functionalInterference === 'stopped_session'
      || functionalInterference === 'daily_activity'
      || functionalInterference === 'rest_or_night';
    return {
      semanticId: `turn:${input.turnId}:symptom`,
      bodyArea: fresh.affectedArea === 'unknown' ? undefined : fresh.affectedArea,
      category: painCategory(fresh.painContext.kind),
      severity0to10: fresh.painContext.score0to10,
      functionChanged: functionChanged || undefined,
      changedMovement: input.movementChanged || functionalInterference === 'daily_activity' || functionalInterference === 'rest_or_night' || undefined,
      changedTraining: input.trainingChanged || functionalInterference === 'modified_session' || functionalInterference === 'stopped_session' || undefined,
      stoppedTraining: fresh.painContext.stoppedSession || undefined,
      trajectory: fresh.painContext.worsening ? 'worse' : 'unknown',
      sourceEventSemanticId: input.sourceEventSemanticId,
    };
  }

  if (input.movementChanged) {
    return {
      semanticId: `turn:${input.turnId}:symptom`,
      bodyArea: fresh.affectedArea === 'unknown' ? undefined : fresh.affectedArea,
      category: 'unknown',
      functionChanged: true,
      changedMovement: true,
      changedTraining: input.trainingChanged || undefined,
      trajectory: 'unknown',
      sourceEventSemanticId: input.sourceEventSemanticId,
    };
  }

  if (input.vagueBodyConcern) {
    return {
      semanticId: `turn:${input.turnId}:symptom`,
      bodyArea: fresh.affectedArea === 'unknown' ? undefined : fresh.affectedArea,
      category: 'unknown',
      trajectory: 'unknown',
    };
  }

  return undefined;
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
  resolvedFunctionAnswer: boolean,
  hasStrategyChange: boolean,
): CoachTurnFrameV2['intent'] {
  if (hasStrategyChange) return 'strategy_change';
  if (resolvedFunctionAnswer) return 'correct_previous_statement';
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

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

function parseCount(value: string): number | undefined {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  return words[value];
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function endOfNamedMonth(name: string, referenceDate: string): string {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const month = months.indexOf(name);
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  let year = reference.getUTCFullYear();
  const candidateEnd = new Date(Date.UTC(year, month + 1, 0, 12));
  if (candidateEnd.getTime() < reference.getTime()) year += 1;
  return new Date(Date.UTC(year, month + 1, 0, 12)).toISOString().slice(0, 10);
}

function differenceDays(left: string, right: string): number {
  const leftTime = new Date(`${left}T12:00:00Z`).getTime();
  const rightTime = new Date(`${right}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((rightTime - leftTime) / 86_400_000));
}
