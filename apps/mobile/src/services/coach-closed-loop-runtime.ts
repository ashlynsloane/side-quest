import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import {
  buildCoachDecisionExplanation,
  findCoachInterventionEffectPattern,
  fingerprintCoachIntervention,
  scheduleCoachFollowUp,
  type CoachDecisionExplanation,
} from '@circuit/planner/coach-closed-loop';
import type { CoachQuickSignal } from '@circuit/planner/coach-message-adaptation';

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
  loadCoachConversationState,
  recordCoachReverted,
  saveCoachConversationState,
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
import {
  getSideQuestPlanSessionOverride,
  restoreSideQuestPlanSessionOverride,
} from './side-quest-plan-overrides';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

const COACH_AD_HOC_SOURCE_ID = 'side_quest_coach_ad_hoc';

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

export async function buildCoachMessageProposalClosedLoop(
  message: string,
  quickSignal?: CoachQuickSignal,
): Promise<CoachMessageProposalResult> {
  const result = await buildCoachMessageProposal(message, quickSignal);
  if (!result.ok) return result;
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
  const conversation = saveCoachConversationState({ ...result.conversation, pendingProposal: proposal });
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
  const decisionExplanation = proposal.decisionExplanation ?? buildCoachDecisionExplanation({
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

export function loadCoachClosedLoopDashboard(): CoachClosedLoopSummary {
  return getCoachClosedLoopSummary();
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
  return { message: responseText, summary: getCoachClosedLoopSummary() };
}

export async function undoLatestCoachIntervention(): Promise<CoachUndoResult> {
  const summary = getCoachClosedLoopSummary();
  const intervention = summary.latestUndoable;
  if (!intervention) throw new Error('There is no applied coach change available to undo.');
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');
  if (intervention.blockId !== block.id) throw new Error('The latest coach change belongs to an older training block and cannot be undone into the current plan.');

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
    const remaining = events.filter((event) => event.id !== current.id);
    await replaceTrainingCalendarEvents(COACH_AD_HOC_SOURCE_ID, remaining);
    rollback = async () => {
      const latest = await getTrainingCalendarEventsForSource(COACH_AD_HOC_SOURCE_ID);
      await replaceTrainingCalendarEvents(COACH_AD_HOC_SOURCE_ID, [...latest.filter((event) => event.id !== current.id), current]);
    };
  }

  let replanWarning: string | undefined;
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
  const message = `${intervention.optionTitle} was undone. Side Quest restored only that coach change and replanned the week around the current remaining edits.`;
  recordCoachReverted(loadCoachConversationState(block.id), intervention.snapshotId, message);
  return { interventionId: intervention.id, optionTitle: intervention.optionTitle, conversationMessage: message, replanWarning };
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
