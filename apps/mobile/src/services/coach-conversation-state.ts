import type { CoachClarificationKind } from '@circuit/planner/coach-clarification';
import type { CoachDecisionExplanation } from '@circuit/planner/coach-closed-loop';
import type {
  CoachMessageAdaptation,
  CoachMessageInterpretation,
  CoachTargetDiscipline,
} from '@circuit/planner/coach-message-adaptation';
import Storage from 'expo-sqlite/kv-store';

const COACH_CONVERSATION_KEY = 'circuit.coach-conversation.v1';
const MAX_TURNS = 20;
const MAX_STATE_AGE_DAYS = 7;

export type PersistedCoachTargetKind = 'strength' | 'endurance' | 'ad_hoc';
export type CoachConversationTurnRole = 'athlete' | 'coach';
export type CoachConversationTurnKind = 'message' | 'proposal' | 'applied' | 'cancelled' | 'reverted' | 'follow_up' | 'system';

export interface PersistedCoachTarget {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  sessionDiscipline: CoachTargetDiscipline;
  targetKind: PersistedCoachTargetKind;
  calendarEventId?: string;
}

export interface PersistedCoachProposal extends PersistedCoachTarget {
  adaptation: CoachMessageAdaptation;
  decisionExplanation?: CoachDecisionExplanation;
}

export interface CoachConversationTurn {
  id: string;
  role: CoachConversationTurnRole;
  kind: CoachConversationTurnKind;
  text: string;
  createdAt: string;
}

export interface PendingCoachClarification {
  kind: Exclude<CoachClarificationKind, 'none'>;
  originalMessage: string;
  question: string;
  askedAt: string;
}

export interface ResolvedCoachClarification extends PendingCoachClarification {
  resolvedAt: string;
  outcome: 'no_training_change';
}

export interface CoachConversationState {
  version: 1;
  blockId: string;
  turns: CoachConversationTurn[];
  activeTarget?: PersistedCoachTarget;
  lastInterpretation?: CoachMessageInterpretation;
  pendingClarification?: PendingCoachClarification;
  recentClarification?: ResolvedCoachClarification;
  pendingProposal?: PersistedCoachProposal;
  selectedOptionId?: string;
  lastApplied?: {
    target: PersistedCoachTarget;
    optionTitle: string;
    snapshotId: string;
    appliedAt: string;
  };
  updatedAt: string;
}

export function loadCoachConversationState(blockId: string): CoachConversationState {
  const saved = Storage.getItemSync(COACH_CONVERSATION_KEY);
  if (!saved) return emptyState(blockId);
  try {
    const parsed = JSON.parse(saved) as Partial<CoachConversationState>;
    if (
      parsed.version !== 1
      || parsed.blockId !== blockId
      || !Array.isArray(parsed.turns)
      || isExpiredState(parsed.updatedAt)
    ) return emptyState(blockId);
    return {
      version: 1,
      blockId,
      turns: parsed.turns.filter(isValidTurn).slice(-MAX_TURNS),
      activeTarget: isValidTarget(parsed.activeTarget) ? parsed.activeTarget : undefined,
      lastInterpretation: isValidInterpretation(parsed.lastInterpretation) ? parsed.lastInterpretation : undefined,
      pendingClarification: isValidPendingClarification(parsed.pendingClarification) ? parsed.pendingClarification : undefined,
      recentClarification: isValidResolvedClarification(parsed.recentClarification) ? parsed.recentClarification : undefined,
      pendingProposal: isValidProposal(parsed.pendingProposal) ? parsed.pendingProposal : undefined,
      selectedOptionId: typeof parsed.selectedOptionId === 'string' ? parsed.selectedOptionId : undefined,
      lastApplied: isValidLastApplied(parsed.lastApplied) ? parsed.lastApplied : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyState(blockId);
  }
}

export function saveCoachConversationState(state: CoachConversationState): CoachConversationState {
  const next: CoachConversationState = {
    ...state,
    turns: state.turns.slice(-MAX_TURNS),
    updatedAt: new Date().toISOString(),
  };
  Storage.setItemSync(COACH_CONVERSATION_KEY, JSON.stringify(next));
  return next;
}

export function appendCoachConversationTurn(
  state: CoachConversationState,
  role: CoachConversationTurnRole,
  kind: CoachConversationTurnKind,
  text: string,
): CoachConversationState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const createdAt = new Date().toISOString();
  return saveCoachConversationState({
    ...state,
    turns: [
      ...state.turns,
      {
        id: `coach_turn_${createdAt.replace(/[^0-9]/g, '')}_${state.turns.length}`,
        role,
        kind,
        text: trimmed,
        createdAt,
      },
    ],
  });
}

export function recordCoachClarification(
  state: CoachConversationState,
  input: Omit<PendingCoachClarification, 'askedAt'>,
): CoachConversationState {
  const askedAt = new Date().toISOString();
  return saveCoachConversationState({
    ...state,
    pendingClarification: { ...input, askedAt },
    recentClarification: undefined,
    pendingProposal: undefined,
    selectedOptionId: undefined,
  });
}

export function recordCoachClarificationResolution(
  state: CoachConversationState,
  clarification: PendingCoachClarification,
): CoachConversationState {
  return saveCoachConversationState({
    ...state,
    pendingClarification: undefined,
    recentClarification: {
      ...clarification,
      resolvedAt: new Date().toISOString(),
      outcome: 'no_training_change',
    },
  });
}

export function clearCoachClarification(state: CoachConversationState): CoachConversationState {
  return saveCoachConversationState({ ...state, pendingClarification: undefined });
}

export function clearRecentCoachClarification(state: CoachConversationState): CoachConversationState {
  return saveCoachConversationState({ ...state, recentClarification: undefined });
}

export function recordCoachProposal(
  state: CoachConversationState,
  proposal: PersistedCoachProposal,
  selectedOptionId: string,
): CoachConversationState {
  const target = targetFromProposal(proposal);
  const recommended = proposal.adaptation.adjustment.options.find((option) => option.id === selectedOptionId);
  const coachText = proposalText(proposal, recommended?.title);
  return appendCoachConversationTurn({
    ...state,
    activeTarget: target,
    lastInterpretation: proposal.adaptation.interpretation,
    pendingClarification: undefined,
    recentClarification: undefined,
    pendingProposal: proposal,
    selectedOptionId,
  }, 'coach', 'proposal', coachText);
}

export function updateCoachSelectedOption(state: CoachConversationState, optionId: string): CoachConversationState {
  return saveCoachConversationState({ ...state, selectedOptionId: optionId });
}

export function recordCoachApplied(
  state: CoachConversationState,
  proposal: PersistedCoachProposal,
  optionTitle: string,
  snapshotId: string,
  message: string,
): CoachConversationState {
  const target = targetFromProposal(proposal);
  return appendCoachConversationTurn({
    ...state,
    activeTarget: target,
    lastInterpretation: proposal.adaptation.interpretation,
    pendingClarification: undefined,
    recentClarification: undefined,
    pendingProposal: undefined,
    selectedOptionId: undefined,
    lastApplied: {
      target,
      optionTitle,
      snapshotId,
      appliedAt: new Date().toISOString(),
    },
  }, 'coach', 'applied', message);
}

export function recordCoachReverted(
  state: CoachConversationState,
  snapshotId: string,
  message: string,
): CoachConversationState {
  return appendCoachConversationTurn({
    ...state,
    pendingClarification: undefined,
    recentClarification: undefined,
    pendingProposal: undefined,
    selectedOptionId: undefined,
    lastApplied: state.lastApplied?.snapshotId === snapshotId ? undefined : state.lastApplied,
  }, 'coach', 'reverted', message);
}

export function cancelPendingCoachProposal(state: CoachConversationState, message = 'Keeping the original plan.'): CoachConversationState {
  return appendCoachConversationTurn({
    ...state,
    pendingClarification: undefined,
    recentClarification: undefined,
    pendingProposal: undefined,
    selectedOptionId: undefined,
  }, 'coach', 'cancelled', message);
}

export function clearCoachConversationState(): void {
  Storage.removeItemSync(COACH_CONVERSATION_KEY);
}

function emptyState(blockId: string): CoachConversationState {
  return {
    version: 1,
    blockId,
    turns: [],
    updatedAt: new Date().toISOString(),
  };
}

function targetFromProposal(proposal: PersistedCoachProposal): PersistedCoachTarget {
  return {
    sessionId: proposal.sessionId,
    sessionTitle: proposal.sessionTitle,
    sessionDate: proposal.sessionDate,
    sessionDiscipline: proposal.sessionDiscipline,
    targetKind: proposal.targetKind,
    calendarEventId: proposal.calendarEventId,
  };
}

function proposalText(proposal: PersistedCoachProposal, recommendedTitle?: string): string {
  if (!recommendedTitle) return `I found an adjustment for ${proposal.sessionTitle}. Review it before anything changes.`;
  const recommendation = lowerFirst(recommendedTitle.replace(/\.$/, ''));
  const protective = proposal.adaptation.painAssessment?.level === 'protect'
    || Boolean(proposal.adaptation.adjustment.safetyMessage);
  if (protective) {
    return `Because this changed your movement or training, I’m treating the next decision conservatively. For ${proposal.sessionTitle}, I recommend ${recommendation}. Nothing changes until you approve it.`;
  }
  return `For ${proposal.sessionTitle}, I recommend ${recommendation}. Review the reasoning before anything changes.`;
}

function lowerFirst(value: string): string {
  return value ? `${value[0]!.toLowerCase()}${value.slice(1)}` : value;
}

function isExpiredState(updatedAt: unknown): boolean {
  if (typeof updatedAt !== 'string') return true;
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const ageMs = Date.now() - timestamp;
  return ageMs > MAX_STATE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function isValidTurn(value: unknown): value is CoachConversationTurn {
  const item = value as Partial<CoachConversationTurn> | null | undefined;
  return Boolean(item?.id && item?.text && item?.createdAt && (item.role === 'athlete' || item.role === 'coach'));
}

function isValidTarget(value: unknown): value is PersistedCoachTarget {
  const item = value as Partial<PersistedCoachTarget> | null | undefined;
  return Boolean(
    item?.sessionId
    && item?.sessionTitle
    && item?.sessionDate
    && (item.sessionDiscipline === 'swim' || item.sessionDiscipline === 'bike' || item.sessionDiscipline === 'run' || item.sessionDiscipline === 'strength')
    && (item.targetKind === 'strength' || item.targetKind === 'endurance' || item.targetKind === 'ad_hoc'),
  );
}

function isValidProposal(value: unknown): value is PersistedCoachProposal {
  if (!isValidTarget(value)) return false;
  const proposal = value as Partial<PersistedCoachProposal>;
  return Boolean(
    proposal.adaptation?.adjustment?.recommendedOptionId
    && proposal.adaptation?.interpretation?.summary,
  );
}

function isValidInterpretation(value: unknown): value is CoachMessageInterpretation {
  const item = value as Partial<CoachMessageInterpretation> | null | undefined;
  return Boolean(
    item
    && typeof item.summary === 'string'
    && Array.isArray(item.signals)
    && (item.reason === 'fatigue' || item.reason === 'time' || item.reason === 'access' || item.reason === 'weather' || item.reason === 'pain' || item.reason === 'illness' || item.reason === 'preference' || item.reason === 'travel' || item.reason === 'other'),
  );
}

function isValidPendingClarification(value: unknown): value is PendingCoachClarification {
  const item = value as Partial<PendingCoachClarification> | null | undefined;
  return Boolean(
    item?.originalMessage
    && item.question
    && item.askedAt
    && (item.kind === 'function' || item.kind === 'pain_type' || item.kind === 'target_session' || item.kind === 'constraint'),
  );
}

function isValidResolvedClarification(value: unknown): value is ResolvedCoachClarification {
  const item = value as Partial<ResolvedCoachClarification> | null | undefined;
  return Boolean(
    item?.originalMessage
    && item.question
    && item.askedAt
    && (item.kind === 'function' || item.kind === 'pain_type' || item.kind === 'target_session' || item.kind === 'constraint')
    && item.resolvedAt
    && item.outcome === 'no_training_change',
  );
}

function isValidLastApplied(value: unknown): value is NonNullable<CoachConversationState['lastApplied']> {
  const item = value as Partial<NonNullable<CoachConversationState['lastApplied']>> | null | undefined;
  return Boolean(item?.target && isValidTarget(item.target) && item.optionTitle && item.snapshotId && item.appliedAt);
}
