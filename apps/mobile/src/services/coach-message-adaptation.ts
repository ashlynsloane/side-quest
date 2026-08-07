import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { normalizeCalendarEvent, normalizeStrengthSession, type UnifiedTrainingSession } from '@circuit/planner';
import {
  applyCoachStrengthAdjustment,
  buildCoachMessageAdaptation,
  interpretCoachMessage,
  type CoachMessageAdaptation,
  type CoachQuickSignal,
  type CoachTargetDiscipline,
} from '@circuit/planner/coach-message-adaptation';

import {
  getLatestTrainingBlock,
  getTrainingCalendarEvents,
  savePlanSnapshot,
  saveTrainingBlock,
} from './database';
import { saveSideQuestPlanSessionOverride } from './side-quest-plan-overrides';
import { isSideQuestGeneratedPlanEvent } from './whole-athlete-plan';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export type CoachMessageTargetKind = 'strength' | 'endurance';

export interface CoachMessageProposal {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  sessionDiscipline: 'swim' | 'bike' | 'run' | 'strength';
  targetKind: CoachMessageTargetKind;
  calendarEventId?: string;
  adaptation: CoachMessageAdaptation;
}

export type CoachMessageProposalResult =
  | { ok: true; proposal: CoachMessageProposal }
  | { ok: false; reason: 'empty_input' | 'no_plan' | 'no_adjustable_session'; message: string };

export interface AppliedCoachMessageAdaptation {
  targetKind: CoachMessageTargetKind;
  snapshotId: string;
  optionTitle: string;
  replanWarning?: string;
  session?: PlannedStrengthSession;
}

type AdjustableTarget =
  | {
      kind: 'strength';
      strengthSession: PlannedStrengthSession;
      unified: UnifiedTrainingSession;
    }
  | {
      kind: 'endurance';
      calendarEvent: TrainingCalendarEvent;
      unified: UnifiedTrainingSession;
    };

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

  const firstWeek = block.weeks[0];
  const lastWeek = block.weeks.at(-1);
  if (!firstWeek || !lastWeek) {
    return { ok: false, reason: 'no_adjustable_session', message: 'The active plan does not contain an adjustable training week.' };
  }

  const calendar = await getTrainingCalendarEvents({
    from: `${firstWeek.weekStartDate}T00:00:00.000Z`,
    to: `${addDays(lastWeek.weekStartDate, 6)}T23:59:59.999Z`,
  });
  const interpretation = interpretCoachMessage(message, quickSignal);
  const target = selectAdjustableTarget(block, calendar, interpretation.targetDiscipline);
  if (!target) {
    const discipline = interpretation.targetDiscipline ? `${interpretation.targetDiscipline} ` : '';
    return {
      ok: false,
      reason: 'no_adjustable_session',
      message: `There is no upcoming Side Quest ${discipline}session available to adjust. Imported calendar workouts stay fixed until you explicitly change their source plan.`,
    };
  }

  const sessionDate = target.unified.date;
  const owningWeek = block.weeks.find((week) => sessionDate >= week.weekStartDate && sessionDate <= addDays(week.weekStartDate, 6));
  if (!owningWeek) {
    return { ok: false, reason: 'no_adjustable_session', message: 'Side Quest could not locate this session inside the current block.' };
  }

  const weekEnd = addDays(owningWeek.weekStartDate, 6);
  const weekCalendar = calendar.filter((event) => event.startAt.slice(0, 10) >= owningWeek.weekStartDate && event.startAt.slice(0, 10) <= weekEnd);
  const weekSessions = buildUnifiedWeek(owningWeek.sessions, weekCalendar);
  const availableDates = datesAfter(sessionDate, weekEnd);
  const capacity = block.goal.capacityProfile;
  const recentBoneStress = capacity?.boneStressInjuryHistory === 'recent_or_current';
  const returnToRun = capacity?.runStatus === 'return_to_run';
  const fatigueTrend = /\b(worse|worsening|several\s+days|all\s+week|for\s+days)\b/i.test(message) ? 'worsening' as const : 'stable' as const;
  const availableDisciplines = target.kind === 'endurance'
    ? block.goal.disciplines.filter((discipline) => discipline !== target.unified.discipline)
    : [];

  const adaptation = buildCoachMessageAdaptation({
    message,
    quickSignal,
    session: target.unified,
    weekSessions,
    availableDates,
    availableDisciplines,
    recentFatigueTrend: fatigueTrend,
    recentBoneStress,
    returnToRun,
  });

  return {
    ok: true,
    proposal: {
      sessionId: target.unified.id,
      sessionTitle: target.unified.title,
      sessionDate,
      sessionDiscipline: target.unified.discipline as 'swim' | 'bike' | 'run' | 'strength',
      targetKind: target.kind,
      calendarEventId: target.kind === 'endurance' ? target.calendarEvent.id : undefined,
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

  const option = proposal.adaptation.adjustment.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error('The selected adaptation is no longer available.');

  const snapshot = await savePlanSnapshot(block, snapshotReason(proposal, option.title));
  let updatedSession: PlannedStrengthSession | undefined;

  if (proposal.targetKind === 'strength') {
    const session = block.weeks.flatMap((week) => week.sessions).find((candidate) => candidate.id === proposal.sessionId);
    if (!session) throw new Error('The planned strength session changed before this adaptation could be applied.');
    if (option.action === 'replace') throw new Error('Cross-sport replacement is only available for Side Quest endurance sessions.');

    updatedSession = applyCoachStrengthAdjustment(session, option);
    const updatedBlock: TrainingBlockPlan = {
      ...block,
      weeks: block.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((candidate) => candidate.id === session.id ? updatedSession! : candidate),
      })),
    };
    await saveTrainingBlock(updatedBlock);
  } else {
    const calendarEventId = proposal.calendarEventId;
    if (!calendarEventId) throw new Error('The endurance session reference is missing.');
    const firstWeek = block.weeks[0];
    const lastWeek = block.weeks.at(-1);
    if (!firstWeek || !lastWeek) throw new Error('The active training block is empty.');
    const calendar = await getTrainingCalendarEvents({
      from: `${firstWeek.weekStartDate}T00:00:00.000Z`,
      to: `${addDays(lastWeek.weekStartDate, 6)}T23:59:59.999Z`,
    });
    const event = calendar.find((candidate) => candidate.id === calendarEventId);
    if (!event || !isAdjustableEnduranceEvent(event)) {
      throw new Error('The Side Quest endurance session changed before this adaptation could be applied.');
    }
    saveSideQuestPlanSessionOverride(event, option);
  }

  let replanWarning: string | undefined;
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    replanWarning = caught instanceof Error
      ? `The session changed, but the rest of the week still needs a refresh: ${caught.message}`
      : 'The session changed, but the rest of the week still needs a refresh.';
  }

  return {
    targetKind: proposal.targetKind,
    session: updatedSession,
    snapshotId: snapshot.id,
    optionTitle: option.title,
    replanWarning,
  };
}

function selectAdjustableTarget(
  block: TrainingBlockPlan,
  calendar: TrainingCalendarEvent[],
  targetDiscipline?: CoachTargetDiscipline,
): AdjustableTarget | null {
  const today = localDate();
  const candidates: AdjustableTarget[] = [];

  for (const session of block.weeks.flatMap((week) => week.sessions)) {
    if (session.completionStatus !== 'planned' && session.completionStatus !== 'modified') continue;
    candidates.push({ kind: 'strength', strengthSession: session, unified: normalizeStrengthSession(session) });
  }

  for (const event of calendar) {
    if (!isAdjustableEnduranceEvent(event)) continue;
    candidates.push({ kind: 'endurance', calendarEvent: event, unified: normalizeCalendarEvent(event) });
  }

  const filtered = targetDiscipline
    ? candidates.filter((candidate) => candidate.unified.discipline === targetDiscipline)
    : candidates;
  const upcoming = filtered
    .filter((candidate) => candidate.unified.date >= today)
    .sort(compareTargets);
  if (upcoming[0]) return upcoming[0];
  return filtered.sort((left, right) => compareTargets(right, left))[0] ?? null;
}

function compareTargets(left: AdjustableTarget, right: AdjustableTarget): number {
  return left.unified.date.localeCompare(right.unified.date)
    || priorityRank(left.unified.priority) - priorityRank(right.unified.priority)
    || Number(right.unified.keySession) - Number(left.unified.keySession)
    || left.unified.id.localeCompare(right.unified.id);
}

function priorityRank(priority: UnifiedTrainingSession['priority']): number {
  if (priority === 'required') return 0;
  if (priority === 'recommended') return 1;
  return 2;
}

function isAdjustableEnduranceEvent(event: TrainingCalendarEvent): boolean {
  return isSideQuestGeneratedPlanEvent(event)
    && (event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run');
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
  return `Coach message adaptation · ${proposal.sessionDiscipline} · ${input} · ${optionTitle}`;
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
