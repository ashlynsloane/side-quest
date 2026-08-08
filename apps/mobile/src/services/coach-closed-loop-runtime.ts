import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import {
  decideCoachClarification,
  isCoachClarificationCorrection,
  resolveCoachClarificationAnswer,
  type CoachClarificationKind,
} from '@circuit/planner/coach-clarification';
import {
  buildCoachDecisionExplanation,
  findCoachInterventionEffectPattern,
  fingerprintCoachIntervention,
  scheduleCoachFollowUp,
  type CoachDecisionExplanation,
} from '@circuit/planner/coach-closed-loop';
import type { CoachPlannerDirectiveV2 } from '@circuit/planner/coach-dialogue-engine';
import { interpretCoachMessage, type CoachQuickSignal } from '@circuit/planner/coach-message-adaptation';
import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';

import {
  getLatestTrainingBlock,
  getTrainingCalendarEventsForSource,
  markPlanSnapshotRestored,
  replaceTrainingCalendarEvents,
  saveTrainingBlock,
} from './database';
import {
  applyCoachMessageProposal,
  buildCoachMessageProposal,
  type AppliedCoachMessageAdaptation,
  type CoachMessageProposal,
  type CoachMessageProposalResult,
} from './coach-message-adaptation';
import {
  appendCoachConversationTurn,
  clearCoachClarification,
  clearRecentCoachClarification,
  loadCoachConversationState,
  recordCoachClarification,
  recordCoachClarificationResolution,
  recordCoachReverted,
  saveCoachConversationState,
  type CoachConversationState,
} from './coach-conversation-state';
import {
  getCoachClosedLoopSummary,
  markCoachInterventionReverted,
  recordAppliedCoachIntervention,
  recordCoachFollowUpOutcome,
  type CoachAppliedInterventionRecord,
  type CoachClosedLoopSummary,
  type CoachFollowUpResponse,
} from './coach-closed-loop-state';
import { interpretCoachTurnV2 } from './coach-dialogue-v2';
import {
  getSideQuestPlanSessionOverride,
  restoreSideQuestPlanSessionOverride,
} from './side-quest-plan-overrides';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

const COACH_AD_HOC_SOURCE_ID = 'side_quest_coach_ad_hoc';
const CLARIFICATION_CORRECTION_WINDOW_HOURS = 6;

export interface ClosedLoopAppliedCoachMessageAdaptation extends AppliedCoachMessageAdaptation {
  intervention: CoachAppliedInterventionRecord;
  decisionExplanation: CoachDecisionExplanation;
}

export interface CoachUndoResult {
  interventionId: string;
  optionTitle: string;
  conversationMessage: string;
  replanWarning?: string;
}

export type CoachClosedLoopProposalResult = CoachMessageProposalResult | {
  ok: false;
  reason: 'needs_clarification';
  message: string;
  conversation: CoachConversationState;
};

export async function buildCoachMessageProposalClosedLoop(
  message: string,
  quickSignal?: CoachQuickSignal,
): Promise<CoachClosedLoopProposalResult> {
  const saved = await getLatestTrainingBlock();
  const existingConversation = saved?.block ? loadCoachConversationState(saved.block.id) : null;
  let effectiveMessage = message;
  let rewriteAthleteTurn = false;

  if (existingConversation?.pendingClarification) {
    const pending = existingConversation.pendingClarification;
    const resolution = resolveCoachClarificationAnswer(pending.kind, pending.originalMessage, message);
    if (!resolution.resolved) {
      let conversation = appendCoachConversationTurn(existingConversation, 'athlete', 'message', message.trim());
      conversation = appendCoachConversationTurn(conversation, 'coach', 'system', pending.question);
      return { ok: false, reason: 'needs_clarification', message: pending.question, conversation };
    }
    if (resolution.noTrainingChange) {
      if (saved?.block) await interpretCoachTurnV2(message, quickSignal, existingConversation);
      let conversation = recordCoachClarificationResolution(existingConversation, pending);
      conversation = appendCoachConversationTurn(conversation, 'athlete', 'message', message.trim());
      const coachResponse = resolution.coachResponse ?? 'Okay. I would not change the plan from that information alone.';
      conversation = appendCoachConversationTurn(conversation, 'coach', 'system', coachResponse);
      return { ok: false, reason: 'needs_clarification', message: coachResponse, conversation };
    }
    effectiveMessage = resolution.effectiveMessage ?? message;
    rewriteAthleteTurn = effectiveMessage !== message;
    clearCoachClarification(existingConversation);
  } else if (
    existingConversation?.recentClarification
    && recentClarificationIsFresh(existingConversation.recentClarification.resolvedAt)
    && isCoachClarificationCorrection(existingConversation.recentClarification.kind, message)
  ) {
    const recent = existingConversation.recentClarification;
    const resolution = resolveCoachClarificationAnswer(recent.kind, recent.originalMessage, message);
    if (resolution.resolved && !resolution.noTrainingChange) {
      effectiveMessage = resolution.effectiveMessage ?? message;
      rewriteAthleteTurn = effectiveMessage !== message;
      clearRecentCoachClarification(existingConversation);
    }
  }

  const semanticTurn = saved?.block
    ? await interpretCoachTurnV2(effectiveMessage, quickSignal, existingConversation)
    : null;

  if (semanticTurn?.frame.intent === 'strategy_change' && saved?.block) {
    let conversation = loadCoachConversationState(saved.block.id);
    const semanticClarification = semanticTurn.directive.clarification;
    if (semanticClarification) {
      const question = semanticClarification.prompt;
      conversation = appendCoachConversationTurn(conversation, 'athlete', 'message', message.trim());
      conversation = appendCoachConversationTurn(conversation, 'coach', 'system', question);
      conversation = saveCoachConversationState({
        ...conversation,
        pendingClarification: undefined,
        recentClarification: undefined,
      });
      return { ok: false, reason: 'needs_clarification', message: question, conversation };
    }
    if (semanticTurn.state.strategyDraft) {
      const response = strategyDraftMessage(semanticTurn.state.strategyDraft);
      conversation = appendCoachConversationTurn(conversation, 'athlete', 'message', message.trim());
      conversation = appendCoachConversationTurn(conversation, 'coach', 'system', response);
      conversation = saveCoachConversationState({
        ...conversation,
        pendingClarification: undefined,
        recentClarification: undefined,
      });
      return { ok: false, reason: 'needs_clarification', message: response, conversation };
    }
  }

  const preview = interpretCoachMessage(effectiveMessage, quickSignal);
  const clarification = decideCoachClarification(effectiveMessage, preview);
  const semanticClarification = semanticTurn?.directive.clarification;
  const refreshedConversation = saved?.block ? loadCoachConversationState(saved.block.id) : existingConversation;
  const activeThread = Boolean(
    refreshedConversation
    && (refreshedConversation.pendingProposal || refreshedConversation.activeTarget || refreshedConversation.lastInterpretation)
    && refreshedConversation.turns.length > 0,
  );
  const clarificationCanInheritThread = activeThread
    && (clarification.kind === 'target_session' || clarification.kind === 'constraint');

  if (clarification.required && clarification.question && clarification.kind !== 'none' && !clarificationCanInheritThread && saved?.block) {
    let conversation = refreshedConversation ?? loadCoachConversationState(saved.block.id);
    conversation = appendCoachConversationTurn(conversation, 'athlete', 'message', message.trim());
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', clarification.question);
    conversation = recordCoachClarification(conversation, {
      kind: clarification.kind,
      originalMessage: effectiveMessage,
      question: clarification.question,
    });
    return { ok: false, reason: 'needs_clarification', message: clarification.question, conversation };
  }

  if (semanticClarification && !clarification.required && saved?.block) {
    let conversation = refreshedConversation ?? loadCoachConversationState(saved.block.id);
    const question = semanticClarification.prompt;
    conversation = appendCoachConversationTurn(conversation, 'athlete', 'message', message.trim());
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', question);
    conversation = recordCoachClarification(conversation, {
      kind: semanticClarificationKind(semanticClarification.kind),
      originalMessage: effectiveMessage,
      question,
    });
    return { ok: false, reason: 'needs_clarification', message: question, conversation };
  }

  const result = await buildCoachMessageProposal(effectiveMessage, quickSignal);
  if (!result.ok) return result;

  const semanticConflict = semanticTurn ? semanticProposalConflict(semanticTurn.directive, result.proposal) : undefined;
  if (semanticConflict && saved?.block) {
    let conversation = loadCoachConversationState(saved.block.id);
    const question = `${semanticConflict} Which planned workout do you want Side Quest to evaluate?`;
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', question);
    conversation = recordCoachClarification(conversation, {
      kind: 'target_session',
      originalMessage: effectiveMessage,
      question,
    });
    return { ok: false, reason: 'needs_clarification', message: question, conversation };
  }

  if (rewriteAthleteTurn) {
    const turns = [...result.conversation.turns];
    const lastAthleteIndex = turns.map((turn) => turn.role).lastIndexOf('athlete');
    if (lastAthleteIndex >= 0) turns[lastAthleteIndex] = { ...turns[lastAthleteIndex]!, text: message.trim() };
    result.conversation = saveCoachConversationState({
      ...result.conversation,
      pendingClarification: undefined,
      recentClarification: undefined,
      turns,
    });
  }
  const optionId = result.conversation.selectedOptionId ?? result.proposal.adaptation.adjustment.recommendedOptionId;
  const option = result.proposal.adaptation.adjustment.options.find((candidate) => candidate.id === optionId);
  if (!option) return result;
  const summary = getCoachClosedLoopSummary();
  const fingerprint = fingerprintCoachIntervention(result.proposal.sessionDiscipline, result.proposal.adaptation, option);
  const pattern = findCoachInterventionEffectPattern(fingerprint, summary.patterns);
  const decisionExplanation = buildCoachDecisionExplanation({
    discipline: result.proposal.sessionDiscipline,
    adaptation: result.proposal.adaptation,
    option,
    learnedPattern: pattern,
  });
  const proposal: CoachMessageProposal = { ...result.proposal, decisionExplanation };
  const conversation = saveCoachConversationState({
    ...result.conversation,
    pendingClarification: undefined,
    recentClarification: undefined,
    pendingProposal: proposal,
  });
  return { ...result, proposal, conversation };
}

export async function applyCoachMessageProposalClosedLoop(
  proposal: CoachMessageProposal,
  optionId: string,
): Promise<ClosedLoopAppliedCoachMessageAdaptation> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const option = proposal.adaptation.adjustment.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error('The selected adaptation is no longer available.');

  const originalStrengthSession = proposal.targetKind === 'strength'
    ? block.weeks.flatMap((week) => week.sessions).find((session) => session.id === proposal.sessionId)
    : undefined;
  const previousOverride = proposal.targetKind === 'endurance' && proposal.calendarEventId
    ? getSideQuestPlanSessionOverride(proposal.calendarEventId)
    : null;
  const previousAdHocEvent = proposal.targetKind === 'ad_hoc'
    ? (await getTrainingCalendarEventsForSource(COACH_AD_HOC_SOURCE_ID)).find((event) => event.id === proposal.sessionId)
    : undefined;

  const summary = getCoachClosedLoopSummary();
  const fingerprint = fingerprintCoachIntervention(proposal.sessionDiscipline, proposal.adaptation, option);
  const pattern = findCoachInterventionEffectPattern(fingerprint, summary.patterns);
  const decisionExplanation = option.id === proposal.adaptation.adjustment.recommendedOptionId && proposal.decisionExplanation
    ? proposal.decisionExplanation
    : buildCoachDecisionExplanation({
        discipline: proposal.sessionDiscipline,
        adaptation: proposal.adaptation,
        option,
        learnedPattern: pattern,
      });

  const applied = await applyCoachMessageProposal(proposal, optionId);
  const appliedAt = new Date().toISOString();
  const followUp = scheduleCoachFollowUp({
    appliedAt,
    sessionDate: proposal.sessionDate,
    adaptation: proposal.adaptation,
    option,
  });
  const intervention = recordAppliedCoachIntervention({
    id: `coach_intervention_${applied.snapshotId}`,
    blockId: block.id,
    target: targetFromProposal(proposal),
    optionId: option.id,
    optionTitle: option.title,
    optionAction: option.action,
    selectedOption: option,
    snapshotId: applied.snapshotId,
    appliedAt,
    fingerprint,
    explanation: decisionExplanation,
    followUp,
    previousOverride: previousOverride ?? undefined,
    previousAdHocEvent,
    originalStrengthSession,
  });

  return { ...applied, intervention, decisionExplanation };
}

export function loadCoachClosedLoopDashboard(blockId?: string): CoachClosedLoopSummary {
  return getCoachClosedLoopSummary(new Date().toISOString(), blockId);
}

export async function answerCoachFollowUp(
  interventionId: string,
  response: CoachFollowUpResponse,
): Promise<{ message: string; summary: CoachClosedLoopSummary }> {
  const observation = recordCoachFollowUpOutcome(interventionId, response);
  if (!observation) throw new Error('This coach follow-up is no longer available.');
  const saved = await getLatestTrainingBlock();
  const responseText = response === 'better'
    ? 'That adjustment helped. Side Quest will count it as one positive personal outcome, not a universal rule.'
    : response === 'same'
      ? 'No clear improvement or worsening. Side Quest will keep this outcome neutral and avoid over-learning from it.'
      : response === 'worse'
        ? 'You felt worse after the adjustment. Side Quest will lower confidence in this approach; send a fresh symptom update before progression.'
        : 'Marked as not completed. Side Quest will not treat non-completion as evidence that the adjustment helped or hurt.';
  if (saved?.block) {
    appendCoachConversationTurn(loadCoachConversationState(saved.block.id), 'coach', 'follow_up', responseText);
  }
  return { message: responseText, summary: getCoachClosedLoopSummary(new Date().toISOString(), saved?.block.id) };
}

export async function undoLatestCoachIntervention(): Promise<CoachUndoResult> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  const summary = getCoachClosedLoopSummary(new Date().toISOString(), block.id);
  const intervention = summary.latestUndoable;
  if (!intervention) throw new Error('There is no applied coach change available to undo in the current training block.');

  let rollback: (() => Promise<void>) | undefined;
  if (intervention.target.targetKind === 'strength') {
    const original = intervention.originalStrengthSession;
    if (!original) throw new Error('The original strength session is unavailable for this undo.');
    const current = findStrengthSession(block, intervention.target.sessionId);
    if (!current) throw new Error('The strength session is no longer in the current plan.');
    if (current.completionStatus === 'completed') throw new Error('This session has already been completed, so the old coach change cannot be restored over the training record.');
    if (!current.placementNote?.includes(`Coach adaptation: ${intervention.optionTitle}`)) {
      throw new Error('The strength session changed again after the coach adjustment. Undo is blocked so a newer edit is not overwritten.');
    }
    const beforeUndo = block;
    const restored = replaceStrengthSession(block, current.id, original);
    await saveTrainingBlock(restored);
    rollback = async () => { await saveTrainingBlock(beforeUndo); };
  } else if (intervention.target.targetKind === 'endurance') {
    const eventId = intervention.target.calendarEventId;
    if (!eventId) throw new Error('The endurance session reference is missing.');
    const currentOverride = getSideQuestPlanSessionOverride(eventId);
    if (!currentOverride || currentOverride.option.id !== intervention.optionId) {
      throw new Error('This endurance session changed again after the coach adjustment. Undo is blocked so a newer edit is not overwritten.');
    }
    restoreSideQuestPlanSessionOverride(eventId, intervention.previousOverride);
    rollback = async () => { restoreSideQuestPlanSessionOverride(eventId, currentOverride); };
  } else {
    const events = await getTrainingCalendarEventsForSource(COACH_AD_HOC_SOURCE_ID);
    const current = events.find((event) => event.id === intervention.target.sessionId);
    if (!current) throw new Error('The coach-created session is no longer present, so there is nothing to undo.');
    const restoredEvents = [
      ...events.filter((event) => event.id !== current.id),
      ...(intervention.previousAdHocEvent ? [intervention.previousAdHocEvent] : []),
    ];
    await replaceTrainingCalendarEvents(COACH_AD_HOC_SOURCE_ID, restoredEvents);
    rollback = async () => {
      const latest = await getTrainingCalendarEventsForSource(COACH_AD_HOC_SOURCE_ID);
      await replaceTrainingCalendarEvents(COACH_AD_HOC_SOURCE_ID, [...latest.filter((event) => event.id !== current.id), current]);
    };
  }

  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    try { await rollback?.(); await refreshLatestWholeAthletePlan(); } catch { /* best-effort rollback */ }
    throw new Error(caught instanceof Error
      ? `Undo could not be completed safely: ${caught.message}`
      : 'Undo could not be completed safely, so Side Quest restored the newer plan state.');
  }

  await markPlanSnapshotRestored(intervention.snapshotId);
  markCoachInterventionReverted(intervention.id);
  const response = `${intervention.optionTitle} was undone. Side Quest restored only that coach change and replanned the week around the current remaining edits.`;
  recordCoachReverted(loadCoachConversationState(block.id), intervention.snapshotId, response);
  return { interventionId: intervention.id, optionTitle: intervention.optionTitle, conversationMessage: response };
}

function targetFromProposal(proposal: CoachMessageProposal) {
  return {
    sessionId: proposal.sessionId,
    sessionTitle: proposal.sessionTitle,
    sessionDate: proposal.sessionDate,
    sessionDiscipline: proposal.sessionDiscipline,
    targetKind: proposal.targetKind,
    calendarEventId: proposal.calendarEventId,
  };
}

function findStrengthSession(block: TrainingBlockPlan, sessionId: string): PlannedStrengthSession | undefined {
  return block.weeks.flatMap((week) => week.sessions).find((session) => session.id === sessionId);
}

function replaceStrengthSession(block: TrainingBlockPlan, sessionId: string, replacement: PlannedStrengthSession): TrainingBlockPlan {
  return {
    ...block,
    weeks: block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => session.id === sessionId ? replacement : session),
    })),
  };
}

function recentClarificationIsFresh(resolvedAt: string): boolean {
  const ageMs = Date.now() - new Date(resolvedAt).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= CLARIFICATION_CORRECTION_WINDOW_HOURS * 60 * 60 * 1000;
}

function semanticClarificationKind(kind: 'clarify_target' | 'clarify_function' | 'clarify_time' | 'clarify_request'): Exclude<CoachClarificationKind, 'none'> {
  if (kind === 'clarify_target') return 'target_session';
  if (kind === 'clarify_function') return 'function';
  return 'constraint';
}

function strategyDraftMessage(strategy: CoachSemanticStrategyChange): string {
  const objectives = Object.entries(strategy.disciplineObjectives)
    .map(([discipline, objective]) => `${discipline}: ${String(objective).replaceAll('_', ' ')}`);
  const focus = strategy.primaryFocus ? `${strategy.primaryFocus} is the primary focus` : objectives[0] ?? 'training priorities updated';
  const maintenance = objectives.filter((line) => line.includes('maintain') || line.includes('minimum viable'));
  const window = strategy.startsAt || strategy.endsAt
    ? ` Window: ${strategy.startsAt ?? 'now'} to ${strategy.endsAt ?? 'open-ended'}.`
    : '';
  const tradeoff = strategy.tradeoffTolerance
    ? ` Tradeoff: ${strategy.tradeoffTolerance.replaceAll('_', ' ')}.`
    : '';
  const supporting = maintenance.length ? ` ${maintenance.join('; ')}.` : '';
  return `Strategy draft updated: ${focus}.${supporting}${window}${tradeoff} Nothing changed yet—review the Strategy Coach card and approve it before Side Quest reallocates training.`;
}

function semanticProposalConflict(directive: CoachPlannerDirectiveV2, proposal: CoachMessageProposal): string | undefined {
  if (directive.blockedReasons.length) return directive.blockedReasons[0];
  if (directive.targetEventId && proposal.sessionId !== directive.targetEventId) {
    return 'I understood one planned workout, but the legacy planner resolved a different one, so I will not apply that proposal.';
  }
  if (directive.focusDate && directive.action === 'evaluate' && proposal.sessionDate !== directive.focusDate) {
    return `I understood the question as being about ${directive.focusDate}, but the legacy planner selected a different day, so I will not guess.`;
  }
  if (directive.action === 'add' && proposal.targetKind !== 'ad_hoc') {
    return 'I understood this as a request for additional training, but the legacy planner tried to edit an existing workout.';
  }

  const expectedLegacyAction = semanticToLegacyAction(directive.action);
  if (expectedLegacyAction && proposal.adaptation.interpretation.requestedAction !== expectedLegacyAction) {
    return 'The semantic request and the legacy adjustment action disagree, so I will not change the plan until the target is clear.';
  }
  return undefined;
}

function semanticToLegacyAction(action: CoachPlannerDirectiveV2['action']): 'move' | 'shorter' | 'different' | 'skip' | undefined {
  if (action === 'move') return 'move';
  if (action === 'shorten') return 'shorter';
  if (action === 'replace') return 'different';
  if (action === 'skip') return 'skip';
  return undefined;
}
