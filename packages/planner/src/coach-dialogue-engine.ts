import type {
  CoachConversationHorizon,
  CoachSemanticAction,
  CoachSemanticCorrection,
  CoachSemanticDiscipline,
  CoachSemanticStrategyChange,
  CoachSemanticSymptom,
  CoachSemanticTrainingEvent,
  CoachTurnFrameV2,
} from './coach-semantic-frame';

export interface CoachDialogueQuestion {
  kind: 'clarify_target' | 'clarify_function' | 'clarify_time' | 'clarify_request';
  prompt: string;
  missing: string[];
}

export interface CoachDialogueConcern {
  semanticId: string;
  bodyArea?: string;
  category?: CoachSemanticSymptom['category'];
  functionChanged?: boolean;
  changedMovement?: boolean;
  changedTraining?: boolean;
  stoppedTraining?: boolean;
  trajectory?: CoachSemanticSymptom['trajectory'];
  sourceEventSemanticId?: string;
  updatedAtTurnId: string;
}

export interface CoachDialogueStateV2 {
  version: 2;
  activeConcern?: CoachDialogueConcern;
  events: CoachSemanticTrainingEvent[];
  activePlannedTarget?: {
    semanticId: string;
    eventId?: string;
    discipline?: CoachSemanticDiscipline;
    date?: string;
  };
  strategyDraft?: CoachSemanticStrategyChange;
  focusDate?: string;
  horizon: CoachConversationHorizon;
  pendingQuestion?: CoachDialogueQuestion;
  lastTurnFrame?: CoachTurnFrameV2;
  updatedAtTurnId?: string;
}

export interface CoachPlannerDirectiveV2 {
  intent: CoachTurnFrameV2['intent'];
  horizon: CoachConversationHorizon;
  action: CoachSemanticAction;
  targetEventId?: string;
  targetEventSemanticId?: string;
  targetDiscipline?: CoachSemanticDiscipline;
  focusDate?: string;
  requestedDate?: string;
  requestedDurationMinutes?: number;
  requestedIntensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'max';
  strategyChange?: CoachSemanticStrategyChange;
  safetyFacts: {
    functionChanged: boolean;
    changedMovement: boolean;
    changedTraining: boolean;
    stoppedTraining: boolean;
    bodyArea?: string;
  };
  clarification?: CoachDialogueQuestion;
  blockedReasons: string[];
}

export interface CoachDialogueTransition {
  state: CoachDialogueStateV2;
  directive: CoachPlannerDirectiveV2;
}

export function emptyCoachDialogueState(): CoachDialogueStateV2 {
  return { version: 2, events: [], horizon: 'unknown' };
}

export function reduceCoachDialogue(
  previous: CoachDialogueStateV2 | undefined,
  frame: CoachTurnFrameV2,
): CoachDialogueTransition {
  const base = previous?.version === 2 ? previous : emptyCoachDialogueState();
  const events = mergeEvents(base.events, frame.events);
  const correctedConcern = applyConcernCorrection(base.activeConcern, frame.correction, frame.symptoms, frame.turnId);
  const activeConcern = correctedConcern ?? deriveConcern(base.activeConcern, frame.symptoms, frame.turnId);
  const strategyDraft = mergeStrategyDraft(base.strategyDraft, frame.strategyChange);
  const focusDate = deriveFocusDate(base.focusDate, frame);
  const activePlannedTarget = deriveActiveTarget(base.activePlannedTarget, events, frame, focusDate);
  const pendingQuestion = deriveQuestion(frame, activePlannedTarget, activeConcern);
  const state: CoachDialogueStateV2 = {
    version: 2,
    events,
    activeConcern,
    activePlannedTarget,
    strategyDraft,
    focusDate,
    horizon: frame.horizon,
    pendingQuestion,
    lastTurnFrame: frame,
    updatedAtTurnId: frame.turnId,
  };

  return { state, directive: buildPlannerDirective(state, frame) };
}

export function buildPlannerDirective(state: CoachDialogueStateV2, frame: CoachTurnFrameV2): CoachPlannerDirectiveV2 {
  const change = frame.requestedChange;
  const target = resolveEditableTarget(state, frame);
  const blockedReasons: string[] = [];

  if (change?.targetEventSemanticId) {
    const explicit = state.events.find((event) => event.semanticId === change.targetEventSemanticId);
    if (explicit?.temporalRole === 'completed') blockedReasons.push('Completed training cannot be rewritten.');
  }
  if (change?.targetEventId) {
    const explicit = state.events.find((event) => event.eventId === change.targetEventId);
    if (explicit?.temporalRole === 'completed') blockedReasons.push('Completed training cannot be rewritten.');
  }

  const concern = state.activeConcern;
  return {
    intent: frame.intent,
    horizon: frame.horizon,
    action: blockedReasons.length ? 'none' : change?.action ?? (frame.intent === 'ask_about_future_training' ? 'evaluate' : 'none'),
    targetEventId: blockedReasons.length ? undefined : target?.eventId,
    targetEventSemanticId: blockedReasons.length ? undefined : target?.semanticId,
    targetDiscipline: blockedReasons.length ? undefined : change?.discipline ?? target?.discipline,
    focusDate: state.focusDate,
    requestedDate: change?.date,
    requestedDurationMinutes: change?.durationMinutes,
    requestedIntensity: change?.intensity,
    strategyChange: frame.intent === 'strategy_change' ? state.strategyDraft : undefined,
    safetyFacts: {
      functionChanged: Boolean(concern?.functionChanged ?? concern?.changedMovement ?? concern?.changedTraining ?? concern?.stoppedTraining),
      changedMovement: Boolean(concern?.changedMovement),
      changedTraining: Boolean(concern?.changedTraining),
      stoppedTraining: Boolean(concern?.stoppedTraining),
      bodyArea: concern?.bodyArea,
    },
    clarification: state.pendingQuestion,
    blockedReasons,
  };
}

function mergeEvents(previous: CoachSemanticTrainingEvent[], incoming: CoachSemanticTrainingEvent[]): CoachSemanticTrainingEvent[] {
  const merged = new Map(previous.map((event) => [event.semanticId, event]));
  for (const event of incoming) {
    const prior = merged.get(event.semanticId);
    merged.set(event.semanticId, prior ? { ...prior, ...defined(event) } : event);
  }
  return [...merged.values()].slice(-40);
}

function mergeStrategyDraft(
  previous: CoachSemanticStrategyChange | undefined,
  incoming: CoachSemanticStrategyChange | undefined,
): CoachSemanticStrategyChange | undefined {
  if (!incoming) return previous;
  return {
    ...previous,
    ...incoming,
    disciplineObjectives: {
      ...(previous?.disciplineObjectives ?? {}),
      ...incoming.disciplineObjectives,
    },
    racePriority: incoming.racePriority
      ? { ...(previous?.racePriority ?? {}), ...incoming.racePriority }
      : previous?.racePriority,
  };
}

function deriveConcern(
  previous: CoachDialogueConcern | undefined,
  symptoms: CoachSemanticSymptom[],
  turnId: string,
): CoachDialogueConcern | undefined {
  const latest = symptoms.at(-1);
  if (!latest) return previous;
  return {
    semanticId: latest.semanticId,
    bodyArea: latest.bodyArea ?? previous?.bodyArea,
    category: latest.category ?? previous?.category,
    functionChanged: latest.functionChanged ?? previous?.functionChanged,
    changedMovement: latest.changedMovement ?? previous?.changedMovement,
    changedTraining: latest.changedTraining ?? previous?.changedTraining,
    stoppedTraining: latest.stoppedTraining ?? previous?.stoppedTraining,
    trajectory: latest.trajectory ?? previous?.trajectory,
    sourceEventSemanticId: latest.sourceEventSemanticId ?? previous?.sourceEventSemanticId,
    updatedAtTurnId: turnId,
  };
}

function applyConcernCorrection(
  previous: CoachDialogueConcern | undefined,
  correction: CoachSemanticCorrection | undefined,
  symptoms: CoachSemanticSymptom[],
  turnId: string,
): CoachDialogueConcern | undefined {
  if (!correction || !previous) return undefined;
  const latest = symptoms.at(-1);
  if (!latest) return previous;
  if (correction.target === 'symptom_function') {
    return {
      ...previous,
      functionChanged: latest.functionChanged ?? previous.functionChanged,
      changedMovement: latest.changedMovement ?? previous.changedMovement,
      changedTraining: latest.changedTraining ?? previous.changedTraining,
      stoppedTraining: latest.stoppedTraining ?? previous.stoppedTraining,
      updatedAtTurnId: turnId,
    };
  }
  if (correction.target === 'symptom_trajectory') {
    return { ...previous, trajectory: latest.trajectory ?? previous.trajectory, updatedAtTurnId: turnId };
  }
  return deriveConcern(previous, symptoms, turnId);
}

function deriveFocusDate(previous: string | undefined, frame: CoachTurnFrameV2): string | undefined {
  if (frame.intent === 'ask_about_future_training') {
    return frame.requestedChange?.date
      ?? frame.events.find((event) => event.temporalRole === 'planned' || event.temporalRole === 'proposed')?.date
      ?? previous;
  }
  if (frame.requestedChange?.action === 'evaluate' && frame.requestedChange.date) return frame.requestedChange.date;
  return previous;
}

function deriveActiveTarget(
  previous: CoachDialogueStateV2['activePlannedTarget'],
  events: CoachSemanticTrainingEvent[],
  frame: CoachTurnFrameV2,
  focusDate: string | undefined,
): CoachDialogueStateV2['activePlannedTarget'] {
  const explicit = frame.requestedChange?.targetEventSemanticId
    ? events.find((event) => event.semanticId === frame.requestedChange?.targetEventSemanticId)
    : frame.requestedChange?.targetEventId
      ? events.find((event) => event.eventId === frame.requestedChange?.targetEventId)
      : undefined;
  if (explicit && explicit.temporalRole !== 'completed') return targetFromEvent(explicit);

  const changeTarget = frame.events.find((event) => event.relationToTurn === 'change_target' && event.temporalRole !== 'completed');
  if (changeTarget) return targetFromEvent(changeTarget);

  if (frame.intent === 'ask_about_future_training' && focusDate) {
    const onDate = frame.events.filter((event) => event.date === focusDate && event.temporalRole !== 'completed');
    return onDate.length === 1 ? targetFromEvent(onDate[0]!) : undefined;
  }

  if (frame.intent === 'report_completed_training' || frame.intent === 'report_symptom') return previous;
  return previous;
}

function deriveQuestion(
  frame: CoachTurnFrameV2,
  target: CoachDialogueStateV2['activePlannedTarget'],
  concern: CoachDialogueConcern | undefined,
): CoachDialogueQuestion | undefined {
  if (frame.unresolved.length) {
    return { kind: 'clarify_request', prompt: 'I need one more detail before I change the plan.', missing: frame.unresolved };
  }
  if (
    frame.intent === 'report_symptom'
    && concern
    && concern.functionChanged === undefined
    && concern.changedMovement === undefined
    && concern.changedTraining === undefined
  ) {
    return { kind: 'clarify_function', prompt: 'Did it change your movement or training?', missing: ['symptom_function'] };
  }
  if (frame.intent === 'modify_planned_session' && !target) {
    return { kind: 'clarify_target', prompt: 'Which planned workout do you want to change?', missing: ['target_session'] };
  }
  return undefined;
}

function resolveEditableTarget(state: CoachDialogueStateV2, frame: CoachTurnFrameV2): CoachSemanticTrainingEvent | undefined {
  const change = frame.requestedChange;
  const explicit = change?.targetEventSemanticId
    ? state.events.find((event) => event.semanticId === change.targetEventSemanticId)
    : change?.targetEventId
      ? state.events.find((event) => event.eventId === change.targetEventId)
      : undefined;
  if (explicit) return explicit.temporalRole === 'completed' ? undefined : explicit;

  if ((frame.intent === 'report_symptom' || frame.intent === 'report_completed_training') && !change) return undefined;

  const focusDate = change?.date ?? (frame.intent === 'ask_about_future_training' ? state.focusDate : undefined);
  if (focusDate) {
    const onDate = state.events.filter((event) => event.date === focusDate && event.temporalRole !== 'completed');
    if (change?.discipline) {
      const matching = onDate.find((event) => event.discipline === change.discipline);
      if (matching) return matching;
    }
    if (onDate.length === 1) return onDate[0];
    const directContext = onDate.find((event) => event.relationToTurn === 'change_target');
    if (directContext) return directContext;
  }

  if (state.activePlannedTarget) {
    const target = state.events.find((event) => event.semanticId === state.activePlannedTarget?.semanticId);
    if (target?.temporalRole !== 'completed') return target;
  }
  return frame.events.find((event) => event.relationToTurn === 'change_target' && event.temporalRole !== 'completed');
}

function targetFromEvent(event: CoachSemanticTrainingEvent): NonNullable<CoachDialogueStateV2['activePlannedTarget']> {
  return { semanticId: event.semanticId, eventId: event.eventId, discipline: event.discipline, date: event.date };
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
