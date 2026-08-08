import type { TrainingCalendarEvent } from '@circuit/domain';
import { reduceCoachDialogue, emptyCoachDialogueState, type CoachDialogueTransition, type CoachDialogueStateV2 } from '@circuit/planner/coach-dialogue-engine';
import { runCoachLanguageInterpreter, type CoachLanguageInterpreter } from '@circuit/planner/coach-language-interpreter';
import { buildDeterministicCoachTurnFrame } from '@circuit/planner/coach-semantic-fallback';
import { validateCoachTurnFrame, type CoachTurnFrameV2 } from '@circuit/planner/coach-semantic-frame';
import type { CoachQuickSignal } from '@circuit/planner/coach-message-adaptation';
import Storage from 'expo-sqlite/kv-store';

import { getLatestTrainingBlock, getTrainingCalendarEvents } from './database';
import type { CoachConversationState } from './coach-conversation-state';
import { isSideQuestGeneratedPlanEvent } from './whole-athlete-plan';

const COACH_DIALOGUE_V2_KEY = 'circuit.coach-dialogue.v2';
const MAX_AGE_DAYS = 14;
let registeredInterpreter: CoachLanguageInterpreter | null = null;

type KnownPlannedEvent = {
  eventId: string;
  title: string;
  discipline?: 'swim' | 'bike' | 'run' | 'strength';
  date: string;
};

interface PersistedCoachDialogueV2 {
  version: 2;
  blockId: string;
  dialogue: CoachDialogueStateV2;
  updatedAt: string;
}

export interface CoachSemanticTurnResult extends CoachDialogueTransition {
  frame: CoachTurnFrameV2;
  interpreterId: string;
  usedFallback: boolean;
}

export function registerCoachLanguageInterpreter(interpreter: CoachLanguageInterpreter | null): void {
  registeredInterpreter = interpreter;
}

export function loadCoachDialogueV2(blockId: string): CoachDialogueStateV2 {
  const raw = Storage.getItemSync(COACH_DIALOGUE_V2_KEY);
  if (!raw) return emptyCoachDialogueState();
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCoachDialogueV2>;
    if (parsed.version !== 2 || parsed.blockId !== blockId || !isFresh(parsed.updatedAt) || !isDialogueState(parsed.dialogue)) {
      return emptyCoachDialogueState();
    }
    return parsed.dialogue;
  } catch {
    return emptyCoachDialogueState();
  }
}

export function saveCoachDialogueV2(blockId: string, dialogue: CoachDialogueStateV2): CoachDialogueStateV2 {
  const state: PersistedCoachDialogueV2 = {
    version: 2,
    blockId,
    dialogue,
    updatedAt: new Date().toISOString(),
  };
  Storage.setItemSync(COACH_DIALOGUE_V2_KEY, JSON.stringify(state));
  return dialogue;
}

export function clearCoachDialogueV2(): void {
  Storage.removeItemSync(COACH_DIALOGUE_V2_KEY);
}

export async function interpretCoachTurnV2(
  message: string,
  quickSignal: CoachQuickSignal | undefined,
  legacyConversation?: CoachConversationState | null,
): Promise<CoachSemanticTurnResult | null> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) return null;
  const first = block.weeks[0];
  const last = block.weeks.at(-1);
  if (!first || !last) return null;

  const calendar = await getTrainingCalendarEvents({
    from: `${first.weekStartDate}T00:00:00.000Z`,
    to: `${addDays(last.weekStartDate, 6)}T23:59:59.999Z`,
  });
  const knownPlannedEvents: KnownPlannedEvent[] = [
    ...block.weeks.flatMap((week) => week.sessions)
      .filter((session) => session.completionStatus === 'planned' || session.completionStatus === 'modified')
      .map((session) => ({ eventId: session.id, title: session.title, discipline: 'strength' as const, date: session.date })),
    ...calendar.filter(isAdjustableEnduranceEvent).map((event) => ({
      eventId: event.id,
      title: event.title,
      discipline: event.discipline as 'swim' | 'bike' | 'run',
      date: event.startAt.slice(0, 10),
    })),
  ];
  const previousDialogue = loadCoachDialogueV2(block.id);
  const turnId = `semantic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let frame: CoachTurnFrameV2 | undefined;
  let interpreterId = 'deterministic-fallback';
  let usedFallback = true;
  if (registeredInterpreter) {
    const interpreted = await runCoachLanguageInterpreter(registeredInterpreter, {
      message,
      referenceDate: localDate(),
      turnId,
      knownPlannedEvents,
      dialogueSummary: {
        activeConcern: previousDialogue.activeConcern
          ? [previousDialogue.activeConcern.bodyArea, previousDialogue.activeConcern.category].filter(Boolean).join(' ') || 'active symptom concern'
          : undefined,
        activeTargetEventId: previousDialogue.activePlannedTarget?.eventId,
        focusDate: previousDialogue.focusDate,
        pendingQuestion: previousDialogue.pendingQuestion?.prompt,
        strategyDraft: previousDialogue.strategyDraft,
      },
    });
    if (interpreted.ok && interpreted.frame && frameBindsToLivePlan(interpreted.frame, knownPlannedEvents)) {
      frame = { ...interpreted.frame, turnId, source: 'language_model' };
      interpreterId = interpreted.interpreterId;
      usedFallback = false;
    }
  }

  if (!frame) {
    frame = buildDeterministicCoachTurnFrame(message, quickSignal, {
      turnId,
      referenceDate: localDate(),
      previousInterpretation: legacyConversation?.lastInterpretation,
      previousTargetDiscipline: legacyConversation?.activeTarget?.sessionDiscipline,
      previousSessionDate: legacyConversation?.activeTarget?.sessionDate,
      previousTargetEventId: legacyConversation?.activeTarget?.sessionId,
      pendingQuestionKind: previousDialogue.pendingQuestion?.kind,
      activeConcern: previousDialogue.activeConcern ? {
        semanticId: previousDialogue.activeConcern.semanticId,
        bodyArea: previousDialogue.activeConcern.bodyArea,
        category: previousDialogue.activeConcern.category,
      } : undefined,
      knownPlannedEvents,
    });
  }

  const validation = validateCoachTurnFrame(frame);
  if (!validation.valid || !validation.frame) return null;
  const transition = reduceCoachDialogue(previousDialogue, validation.frame);
  saveCoachDialogueV2(block.id, transition.state);
  return { ...transition, frame: validation.frame, interpreterId, usedFallback };
}

function frameBindsToLivePlan(frame: CoachTurnFrameV2, known: KnownPlannedEvent[]): boolean {
  const byId = new Map(known.map((event) => [event.eventId, event]));
  for (const event of frame.events) {
    if ((event.temporalRole !== 'planned' && event.temporalRole !== 'current') || !event.eventId) continue;
    const live = byId.get(event.eventId);
    if (!live) return false;
    if (event.date && event.date !== live.date) return false;
    if (event.discipline && live.discipline && event.discipline !== live.discipline) return false;
  }

  const targetId = frame.requestedChange?.targetEventId;
  if (targetId && frame.requestedChange?.action !== 'add' && !byId.has(targetId)) return false;
  if (frame.requestedChange?.targetEventSemanticId) {
    const target = frame.events.find((event) => event.semanticId === frame.requestedChange?.targetEventSemanticId);
    if (!target) return false;
    if (target.temporalRole === 'completed' && frame.requestedChange.action !== 'evaluate') return false;
    if (target.eventId && target.temporalRole !== 'completed' && !byId.has(target.eventId)) return false;
  }
  return true;
}

function isAdjustableEnduranceEvent(event: TrainingCalendarEvent): boolean {
  return isSideQuestGeneratedPlanEvent(event)
    && (event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run');
}

function isDialogueState(value: unknown): value is CoachDialogueStateV2 {
  const item = value as Partial<CoachDialogueStateV2> | null | undefined;
  return Boolean(item && item.version === 2 && Array.isArray(item.events));
}

function isFresh(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
