import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { normalizeCalendarEvent, normalizeStrengthSession, type UnifiedTrainingSession } from '@circuit/planner';
import {
  applyCoachStrengthAdjustment,
  buildCoachMessageAdaptation,
  type CoachMessageAdaptation,
  type CoachQuickSignal,
} from '@circuit/planner/coach-message-adaptation';

import {
  getLatestTrainingBlock,
  getTrainingCalendarEvents,
  savePlanSnapshot,
  saveTrainingBlock,
} from './database';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export interface CoachMessageProposal {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  adaptation: CoachMessageAdaptation;
}

export type CoachMessageProposalResult =
  | { ok: true; proposal: CoachMessageProposal }
  | { ok: false; reason: 'empty_input' | 'no_plan' | 'no_adjustable_session'; message: string };

export interface AppliedCoachMessageAdaptation {
  session: PlannedStrengthSession;
  snapshotId: string;
  optionTitle: string;
  replanWarning?: string;
}

export async function buildCoachMessageProposal(
  message: string,
  quickSignal?: CoachQuickSignal,
): Promise<CoachMessageProposalResult> {
  if (!message.trim() && !quickSignal) {
    return { ok: false, reason: 'empty_input', message: 'Tell Side Quest what changed or choose a quick signal.' };
  }

  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) return { ok: false, reason: 'no_plan', message: 'Create a training plan before asking Side Quest to adapt it.' };

  const session = selectAdjustableStrengthSession(block);
  if (!session) {
    return { ok: false, reason: 'no_adjustable_session', message: 'There is no upcoming strength session available to adjust.' };
  }

  const owningWeek = block.weeks.find((week) => week.sessions.some((candidate) => candidate.id === session.id));
  if (!owningWeek) {
    return { ok: false, reason: 'no_adjustable_session', message: 'Side Quest could not locate this session inside the current block.' };
  }

  const weekEnd = addDays(owningWeek.weekStartDate, 6);
  const calendar = await getTrainingCalendarEvents({
    from: `${owningWeek.weekStartDate}T00:00:00.000Z`,
    to: `${weekEnd}T23:59:59.999Z`,
  });
  const weekSessions = buildUnifiedWeek(owningWeek.sessions, calendar);
  const availableDates = datesAfter(session.date, weekEnd);
  const capacity = block.goal.capacityProfile;
  const recentBoneStress = capacity?.boneStressInjuryHistory === 'recent_or_current';
  const returnToRun = capacity?.runStatus === 'return_to_run';
  const fatigueTrend = /\b(worse|worsening|several\s+days|all\s+week|for\s+days)\b/i.test(message) ? 'worsening' as const : 'stable' as const;

  const adaptation = buildCoachMessageAdaptation({
    message,
    quickSignal,
    session,
    weekSessions,
    availableDates,
    recentFatigueTrend: fatigueTrend,
    recentBoneStress,
    returnToRun,
  });

  return {
    ok: true,
    proposal: {
      sessionId: session.id,
      sessionTitle: session.title,
      sessionDate: session.date,
      adaptation,
    },
  };
}

export async function applyCoachMessageProposal(
  proposal: CoachMessageProposal,
  optionId: string,
): Promise<AppliedCoachMessageAdaptation> {
  const saved = await getLatestTrainingBlock();
  const block = saved?.block;
  if (!block) throw new Error('The active training plan is no longer available.');

  const session = block.weeks.flatMap((week) => week.sessions).find((candidate) => candidate.id === proposal.sessionId);
  if (!session) throw new Error('The planned session changed before this adaptation could be applied.');

  const option = proposal.adaptation.adjustment.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error('The selected adaptation is no longer available.');
  if (option.action === 'replace') throw new Error('Cross-sport replacement needs a fresh whole-athlete proposal.');

  const snapshot = await savePlanSnapshot(block, snapshotReason(proposal, option.title));
  const updatedSession = applyCoachStrengthAdjustment(session, option);
  const updatedBlock: TrainingBlockPlan = {
    ...block,
    weeks: block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((candidate) => candidate.id === session.id ? updatedSession : candidate),
    })),
  };
  await saveTrainingBlock(updatedBlock);

  let replanWarning: string | undefined;
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    replanWarning = caught instanceof Error
      ? `The session changed, but the rest of the week still needs a refresh: ${caught.message}`
      : 'The session changed, but the rest of the week still needs a refresh.';
  }

  return {
    session: updatedSession,
    snapshotId: snapshot.id,
    optionTitle: option.title,
    replanWarning,
  };
}

function selectAdjustableStrengthSession(block: TrainingBlockPlan): PlannedStrengthSession | null {
  const today = localDate();
  const planned = block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.completionStatus === 'planned' || session.completionStatus === 'modified');
  const upcoming = planned
    .filter((session) => session.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order);
  return upcoming[0] ?? planned.sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
}

function buildUnifiedWeek(strength: PlannedStrengthSession[], calendar: TrainingCalendarEvent[]): UnifiedTrainingSession[] {
  const strengthSessions = strength
    .filter((session) => session.completionStatus !== 'skipped')
    .map(normalizeStrengthSession);
  const calendarSessions = calendar
    .filter((event) => event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run' || event.discipline === 'strength' || event.discipline === 'rest')
    .map(normalizeCalendarEvent);
  return [...strengthSessions, ...calendarSessions];
}

function datesAfter(sessionDate: string, weekEnd: string): string[] {
  const dates: string[] = [];
  for (let offset = 1; offset <= 6; offset += 1) {
    const candidate = addDays(sessionDate, offset);
    if (candidate > weekEnd) break;
    dates.push(candidate);
  }
  return dates;
}

function snapshotReason(proposal: CoachMessageProposal, optionTitle: string): string {
  const input = proposal.adaptation.message || proposal.adaptation.quickSignal || 'coach update';
  return `Coach message adaptation · ${input} · ${optionTitle}`;
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
