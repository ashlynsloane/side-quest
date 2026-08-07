import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent, TrainingCalendarSource } from '@circuit/domain';
import { normalizeCalendarEvent, normalizeStrengthSession, type UnifiedTrainingSession } from '@circuit/planner';
import {
  buildPainCalibration,
  evaluateProtectiveTrainingRequest,
  interpretAthleteContextMessage,
  type ProtectiveTrainingRequestDecision,
} from '@circuit/planner/athlete-context-intelligence';
import { resolveCoachConversationMessage } from '@circuit/planner/coach-conversation';
import {
  applyCoachStrengthAdjustment,
  buildCoachMessageAdaptation,
  type CoachQuickSignal,
  type CoachTargetDiscipline,
} from '@circuit/planner/coach-message-adaptation';

import { loadPainContextObservations, recordPainContextObservation } from './athlete-context-memory';
import {
  getLatestTrainingBlock,
  getTrainingCalendarEvents,
  savePlanSnapshot,
  saveTrainingBlock,
  saveTrainingCalendarSource,
  upsertManualCalendarEvent,
} from './database';
import {
  appendCoachConversationTurn,
  cancelPendingCoachProposal,
  loadCoachConversationState,
  recordCoachApplied,
  recordCoachProposal,
  updateCoachSelectedOption,
  type CoachConversationState,
  type PersistedCoachProposal,
} from './coach-conversation-state';
import { saveSideQuestPlanSessionOverride } from './side-quest-plan-overrides';
import { isSideQuestGeneratedPlanEvent } from './whole-athlete-plan';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

const CONTINUITY_WINDOW_HOURS = 48;
const COACH_AD_HOC_SOURCE_ID = 'side_quest_coach_ad_hoc';

export type CoachMessageTargetKind = 'strength' | 'endurance' | 'ad_hoc';
export type CoachMessageProposal = PersistedCoachProposal;

export type CoachMessageProposalResult =
  | { ok: true; proposal: CoachMessageProposal; autoApply?: boolean; conversation: CoachConversationState }
  | { ok: false; reason: 'empty_input' | 'no_plan' | 'no_adjustable_session' | 'cancelled' | 'no_pending_proposal'; message: string; conversation?: CoachConversationState };

export interface AppliedCoachMessageAdaptation {
  targetKind: CoachMessageTargetKind;
  snapshotId: string;
  optionTitle: string;
  replanWarning?: string;
  session?: PlannedStrengthSession;
  conversation: CoachConversationState;
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
    }
  | {
      kind: 'ad_hoc';
      unified: UnifiedTrainingSession;
    };

export async function loadCurrentCoachConversation(): Promise<CoachConversationState | null> {
  const saved = await getLatestTrainingBlock();
  return saved?.block ? loadCoachConversationState(saved.block.id) : null;
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

  const firstWeek = block.weeks[0];
  const lastWeek = block.weeks.at(-1);
  if (!firstWeek || !lastWeek) {
    return { ok: false, reason: 'no_adjustable_session', message: 'The active plan does not contain an adjustable training week.' };
  }

  const freshAthleteContext = interpretAthleteContextMessage(message);
  const painHistory = loadPainContextObservations();
  const previousConversation = loadCoachConversationState(block.id);
  const continuePriorContext = hasFreshConversationContext(previousConversation);
  let conversation = appendCoachConversationTurn(
    previousConversation,
    'athlete',
    'message',
    message.trim() || quickSignalLabel(quickSignal),
  );

  const resolution = resolveCoachConversationMessage(message, quickSignal, {
    previousInterpretation: continuePriorContext ? previousConversation.lastInterpretation : undefined,
    previousTargetDiscipline: continuePriorContext ? previousConversation.activeTarget?.sessionDiscipline : undefined,
    previousSessionDate: continuePriorContext ? previousConversation.activeTarget?.sessionDate : undefined,
    referenceDate: localDate(),
  });

  if (resolution.cancelProposal) {
    conversation = cancelPendingCoachProposal(conversation);
    return { ok: false, reason: 'cancelled', message: 'Keeping the original plan.', conversation };
  }

  if (resolution.confirmProposal) {
    if (previousConversation.pendingProposal) {
      return {
        ok: true,
        proposal: previousConversation.pendingProposal,
        autoApply: true,
        conversation,
      };
    }
    const messageText = 'There is no pending coach change to apply.';
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', messageText);
    return { ok: false, reason: 'no_pending_proposal', message: messageText, conversation };
  }

  try {
    await refreshLatestWholeAthletePlan();
  } catch {
    // Proposal building can still use the latest persisted plan if refresh fails.
  }

  const calendar = await getTrainingCalendarEvents({
    from: `${firstWeek.weekStartDate}T00:00:00.000Z`,
    to: `${addDays(lastWeek.weekStartDate, 6)}T23:59:59.999Z`,
  });
  const preferredSessionId = resolution.keepPriorTarget && continuePriorContext ? previousConversation.activeTarget?.sessionId : undefined;
  let target = selectAdjustableTarget(block, calendar, resolution.targetDiscipline, preferredSessionId);
  if (!target) {
    target = buildProtectedAdHocCandidate(block, resolution.interpretation, resolution.preferredTargetDate, message);
  }
  if (!target) {
    const discipline = resolution.targetDiscipline ? `${resolution.targetDiscipline} ` : '';
    const messageText = `There is no upcoming Side Quest ${discipline}session available to adjust. Imported calendar workouts stay fixed until you explicitly change their source plan.`;
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', messageText);
    return {
      ok: false,
      reason: 'no_adjustable_session',
      message: messageText,
      conversation,
    };
  }

  const sessionDate = target.unified.date;
  const owningWeek = block.weeks.find((week) => sessionDate >= week.weekStartDate && sessionDate <= addDays(week.weekStartDate, 6));
  if (!owningWeek) {
    const messageText = 'Side Quest could not locate this session inside the current block.';
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', messageText);
    return { ok: false, reason: 'no_adjustable_session', message: messageText, conversation };
  }

  const weekEnd = addDays(owningWeek.weekStartDate, 6);
  const weekCalendar = calendar.filter((event) => event.startAt.slice(0, 10) >= owningWeek.weekStartDate && event.startAt.slice(0, 10) <= weekEnd);
  const baseWeekSessions = buildUnifiedWeek(owningWeek.sessions, weekCalendar);
  const weekSessions = target.kind === 'ad_hoc' ? [...baseWeekSessions, target.unified] : baseWeekSessions;
  const availableDates = datesInWeekExcept(owningWeek.weekStartDate, weekEnd, sessionDate, localDate());
  const capacity = block.goal.capacityProfile;
  const recentBoneStress = capacity?.boneStressInjuryHistory === 'recent_or_current';
  const returnToRun = capacity?.runStatus === 'return_to_run';
  const messageFatigueTrend = /\b(worse|worsening|several\s+days|all\s+week|for\s+days)\b/i.test(message) ? 'worsening' as const : undefined;
  const fatigueTrend = resolution.recentFatigueTrend ?? messageFatigueTrend ?? (resolution.interpretation.reason === 'fatigue' ? 'stable' as const : undefined);
  const availableDisciplines = target.kind === 'endurance'
    ? block.goal.disciplines.filter((discipline) => discipline !== target.unified.discipline)
    : [];
  const currentPainKind = resolution.interpretation.painContext?.kind;
  const sameKindPain = currentPainKind ? painHistory.filter((item) => item.kind === currentPainKind) : [];
  const painCalibration = buildPainCalibration(sameKindPain);
  const protectiveTrainingDecision = evaluateProtectiveTrainingRequest({
    now: new Date().toISOString(),
    recentPain: painHistory,
    requestedDiscipline: target.unified.discipline as 'swim' | 'bike' | 'run' | 'strength',
    requestedDurationMinutes: requestedTrainingDurationMinutes(message),
    requestedIntensity: requestedTrainingIntensity(message),
    requestedLargeTrainingLoad: resolution.interpretation.requestedLargeTrainingLoad,
    compensatoryTrainingIntent: resolution.interpretation.compensatoryTrainingIntent,
    headspace: resolution.interpretation.headspace,
  });

  if (target.kind === 'ad_hoc' && protectiveTrainingDecision.action === 'allow') {
    const messageText = 'Side Quest did not find an existing planned session to edit. Extra training is only auto-created from Coach when a recovery or safety constraint requires a bounded alternative; otherwise add the session to your calendar or plan first.';
    conversation = appendCoachConversationTurn(conversation, 'coach', 'system', messageText);
    return { ok: false, reason: 'no_adjustable_session', message: messageText, conversation };
  }

  const adaptation = buildCoachMessageAdaptation({
    message,
    quickSignal,
    session: target.unified,
    weekSessions,
    availableDates,
    availableDisciplines,
    interpretation: resolution.interpretation,
    preferredTargetDate: resolution.preferredTargetDate,
    preferredReplacementDiscipline: resolution.preferredReplacementDiscipline,
    painCalibration,
    protectiveTrainingDecision,
    recentFatigueTrend: fatigueTrend,
    recentBoneStress,
    returnToRun,
  });

  const proposal: CoachMessageProposal = {
    sessionId: target.unified.id,
    sessionTitle: target.unified.title,
    sessionDate,
    sessionDiscipline: target.unified.discipline as 'swim' | 'bike' | 'run' | 'strength',
    targetKind: target.kind,
    calendarEventId: target.kind === 'endurance' ? target.calendarEvent.id : undefined,
    adaptation,
  };
  const selectedOptionId = adaptation.adjustment.recommendedOptionId;
  conversation = recordCoachProposal(conversation, proposal, selectedOptionId);

  if (freshAthleteContext.pain && !reportsPainResolved(message)) {
    recordPainContextObservation(freshAthleteContext.pain, {
      occurredAt: painOccurredAt(message),
      discipline: painSourceDiscipline(message),
    });
  }

  return {
    ok: true,
    proposal,
    conversation,
  };
}

export async function saveCoachMessageProposalSelection(optionId: string): Promise<void> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) return;
  const state = loadCoachConversationState(saved.block.id);
  if (!state.pendingProposal?.adaptation.adjustment.options.some((option) => option.id === optionId)) return;
  updateCoachSelectedOption(state, optionId);
}

export async function cancelCoachMessageProposal(): Promise<CoachConversationState | null> {
  const saved = await getLatestTrainingBlock();
  if (!saved?.block) return null;
  return cancelPendingCoachProposal(loadCoachConversationState(saved.block.id));
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

  let currentStrength: PlannedStrengthSession | undefined;
  let currentEndurance: TrainingCalendarEvent | undefined;

  if (proposal.targetKind === 'strength') {
    currentStrength = block.weeks.flatMap((week) => week.sessions).find((candidate) => candidate.id === proposal.sessionId);
    if (!currentStrength) throw new Error('The planned strength session changed before this adaptation could be applied.');
    if (currentStrength.date !== proposal.sessionDate || currentStrength.title !== proposal.sessionTitle) {
      throw new Error('The plan changed after this proposal was created. Send the update again so Side Quest can re-check the current week.');
    }
    if (option.action === 'replace') throw new Error('Cross-sport replacement is only available for Side Quest endurance sessions.');
  } else if (proposal.targetKind === 'endurance') {
    const calendarEventId = proposal.calendarEventId;
    if (!calendarEventId) throw new Error('The endurance session reference is missing.');
    const firstWeek = block.weeks[0];
    const lastWeek = block.weeks.at(-1);
    if (!firstWeek || !lastWeek) throw new Error('The active training block is empty.');
    const calendar = await getTrainingCalendarEvents({
      from: `${firstWeek.weekStartDate}T00:00:00.000Z`,
      to: `${addDays(lastWeek.weekStartDate, 6)}T23:59:59.999Z`,
    });
    currentEndurance = calendar.find((candidate) => candidate.id === calendarEventId);
    if (!currentEndurance || !isAdjustableEnduranceEvent(currentEndurance)) {
      throw new Error('The Side Quest endurance session changed before this adaptation could be applied.');
    }
    if (currentEndurance.startAt.slice(0, 10) !== proposal.sessionDate || currentEndurance.discipline !== proposal.sessionDiscipline) {
      throw new Error('The plan changed after this proposal was created. Send the update again so Side Quest can re-check the current week.');
    }
  } else if (proposal.targetKind === 'ad_hoc') {
    if (proposal.sessionDiscipline === 'strength') throw new Error('Coach-created ad hoc sessions currently support endurance only.');
    if (option.action === 'replace') throw new Error('A protected ad hoc request cannot be replaced with another unplanned session.');
  }

  const snapshot = await savePlanSnapshot(block, snapshotReason(proposal, option.title));
  let updatedSession: PlannedStrengthSession | undefined;

  if (currentStrength) {
    updatedSession = applyCoachStrengthAdjustment(currentStrength, option);
    const updatedBlock: TrainingBlockPlan = {
      ...block,
      weeks: block.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((candidate) => candidate.id === currentStrength!.id ? updatedSession! : candidate),
      })),
    };
    await saveTrainingBlock(updatedBlock);
  } else if (currentEndurance) {
    saveSideQuestPlanSessionOverride(currentEndurance, option);
  } else if (proposal.targetKind === 'ad_hoc' && option.action !== 'skip') {
    await persistCoachApprovedAdHocSession(proposal, option);
  }

  let replanWarning: string | undefined;
  try {
    await refreshLatestWholeAthletePlan();
  } catch (caught) {
    replanWarning = caught instanceof Error
      ? `The session changed, but the rest of the week still needs a refresh: ${caught.message}`
      : 'The session changed, but the rest of the week still needs a refresh.';
  }

  const appliedMessage = replanWarning ?? `${option.title} applied. The rest of the week was replanned around it.`;
  const conversation = recordCoachApplied(
    loadCoachConversationState(block.id),
    proposal,
    option.title,
    snapshot.id,
    appliedMessage,
  );

  return {
    targetKind: proposal.targetKind,
    session: updatedSession,
    snapshotId: snapshot.id,
    optionTitle: option.title,
    replanWarning,
    conversation,
  };
}

function selectAdjustableTarget(
  block: TrainingBlockPlan,
  calendar: TrainingCalendarEvent[],
  targetDiscipline?: CoachTargetDiscipline,
  preferredSessionId?: string,
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

  if (preferredSessionId) {
    const exact = candidates.find((candidate) => candidate.unified.id === preferredSessionId && candidate.unified.date >= today);
    if (exact) return exact;
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

function buildProtectedAdHocCandidate(
  block: TrainingBlockPlan,
  interpretation: ReturnType<typeof resolveCoachConversationMessage>['interpretation'],
  preferredTargetDate: string | undefined,
  message: string,
): AdjustableTarget | null {
  const discipline = interpretation.targetDiscipline;
  if (discipline !== 'swim' && discipline !== 'bike' && discipline !== 'run') return null;
  const requestedMinutes = requestedTrainingDurationMinutes(message);
  const requestedIntensity = requestedTrainingIntensity(message);
  const isPotentiallyProtectiveRequest = Boolean(
    interpretation.compensatoryTrainingIntent
    || interpretation.requestedLargeTrainingLoad
    || requestedIntensity === 'hard'
    || requestedIntensity === 'max'
    || (requestedMinutes ?? 0) >= 120,
  );
  if (!isPotentiallyProtectiveRequest) return null;

  const date = preferredTargetDate ?? addDays(localDate(), 1);
  const firstWeek = block.weeks[0];
  const lastWeek = block.weeks.at(-1);
  if (!firstWeek || !lastWeek) return null;
  if (date < firstWeek.weekStartDate || date > addDays(lastWeek.weekStartDate, 6)) return null;

  const durationMinutes = Math.max(60, Math.min(360, requestedMinutes ?? (interpretation.requestedLargeTrainingLoad ? 180 : 90)));
  const intensity = requestedIntensity ?? (interpretation.requestedLargeTrainingLoad ? 'hard' as const : 'moderate' as const);
  const hard = intensity === 'hard' || intensity === 'max';
  const id = `coach_adhoc_${discipline}_${date}_${stableMessageId(message)}`;
  return {
    kind: 'ad_hoc',
    unified: {
      id,
      date,
      title: `Proposed extra ${disciplineLabel(discipline)}`,
      discipline,
      durationMinutes,
      intensity,
      cardiovascularDemand: hard ? 'high' : 'moderate',
      musculoskeletalDemand: discipline === 'run' ? (hard ? 'high' : 'moderate') : discipline === 'bike' ? 'moderate' : 'low',
      lowerBodyDemand: discipline === 'run' || discipline === 'bike' ? (hard ? 'high' : 'moderate') : 'none',
      upperBodyDemand: discipline === 'swim' ? (hard ? 'high' : 'moderate') : 'none',
      impact: discipline === 'run' ? (hard ? 'high' : 'moderate') : 'none',
      technicalDemand: discipline === 'swim' ? 'high' : 'moderate',
      recoveryCost: hard ? 4 : 3,
      priority: 'optional',
      source: 'manual',
      keySession: false,
    },
  };
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

async function persistCoachApprovedAdHocSession(
  proposal: CoachMessageProposal,
  option: CoachMessageProposal['adaptation']['adjustment']['options'][number],
): Promise<void> {
  const discipline = proposal.sessionDiscipline;
  if (discipline !== 'swim' && discipline !== 'bike' && discipline !== 'run') return;
  const durationMinutes = Math.max(15, option.durationMinutes ?? 45);
  const date = option.action === 'move' && option.targetDate ? option.targetDate : proposal.sessionDate;
  const startAt = `${date}T12:00:00.000Z`;
  const endAt = new Date(new Date(startAt).getTime() + durationMinutes * 60_000).toISOString();
  await saveTrainingCalendarSource(coachAdHocSource());
  await upsertManualCalendarEvent({
    id: proposal.sessionId,
    sourceId: COACH_AD_HOC_SOURCE_ID,
    title: `Coach-approved easy ${disciplineLabel(discipline)}`,
    startAt,
    endAt,
    allDay: true,
    discipline,
    description: [
      `Side Quest coach-approved ad hoc · ${durationMinutes} min · easy`,
      option.description,
      'This bounded session replaced a larger requested training escalation; it does not repay missed training.',
    ].join('\n'),
    externalUid: proposal.sessionId,
  });
}

function coachAdHocSource(): TrainingCalendarSource {
  const now = new Date().toISOString();
  return {
    id: COACH_AD_HOC_SOURCE_ID,
    name: 'Side Quest Coach',
    sourceType: 'manual',
    active: true,
    autoRefresh: false,
    syncStatus: 'success',
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function datesInWeekExcept(weekStart: string, weekEnd: string, sessionDate: string, today: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= 6; offset += 1) {
    const candidate = addDays(weekStart, offset);
    if (candidate > weekEnd) break;
    if (candidate === sessionDate || candidate < today) continue;
    dates.push(candidate);
  }
  return dates;
}

function hasFreshConversationContext(state: CoachConversationState): boolean {
  if (state.pendingProposal) return true;
  const lastTurn = state.turns.at(-1);
  if (!lastTurn) return false;
  const ageMs = Date.now() - new Date(lastTurn.createdAt).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= CONTINUITY_WINDOW_HOURS * 60 * 60 * 1000;
}

function requestedTrainingDurationMinutes(message: string): number | undefined {
  const text = message.toLowerCase();
  const minuteMatch = text.match(/\b(?:do|ride|run|swim|train|workout\s+for|make\s+it)\s+(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (minuteMatch?.[1]) return Number(minuteMatch[1]);
  const hourMatch = text.match(/\b(?:do|ride|run|swim|train|workout\s+for|ride\s+for|run\s+for|swim\s+for)\s+(\d(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/);
  if (hourMatch?.[1]) return Math.round(Number(hourMatch[1]) * 60);
  return undefined;
}

function requestedTrainingIntensity(message: string): 'recovery' | 'easy' | 'moderate' | 'hard' | 'max' | undefined {
  const text = message.toLowerCase();
  if (/\b(all\s*out|max(?:imal)?|race\s+effort)\b/.test(text)) return 'max';
  if (/\b(hard|threshold|vo2|intervals?|hammer|race\s+pace)\b/.test(text)) return 'hard';
  if (/\b(moderate|steady)\b/.test(text)) return 'moderate';
  if (/\b(easy|recovery|gentle)\b/.test(text)) return 'easy';
  return undefined;
}

function painOccurredAt(message: string): string {
  const text = message.toLowerCase();
  if (/\byesterday\b/.test(text)) return `${addDays(localDate(), -1)}T12:00:00.000Z`;
  return new Date().toISOString();
}

function painSourceDiscipline(message: string): 'swim' | 'bike' | 'run' | 'strength' | undefined {
  const text = message.toLowerCase();
  const matches: Array<'swim' | 'bike' | 'run' | 'strength'> = [];
  if (/\b(?:during|after|on|in)\s+(?:my\s+|the\s+)?(?:swim|swimming|pool)\b/.test(text)) matches.push('swim');
  if (/\b(?:during|after|on|in)\s+(?:my\s+|the\s+)?(?:bike|ride|cycling|trainer)\b/.test(text)) matches.push('bike');
  if (/\b(?:during|after|on|in)\s+(?:my\s+|the\s+)?(?:run|running|track\s+workout|track\s+session)\b/.test(text) || /\bquit\s+(?:my\s+|the\s+)?track\s+workout\b/.test(text)) matches.push('run');
  if (/\b(?:during|after|on|in)\s+(?:my\s+|the\s+)?(?:strength|lifting|lift|gym\s+workout)\b/.test(text)) matches.push('strength');
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

function reportsPainResolved(message: string): boolean {
  return /\b(no\s+(?:more\s+)?pain|pain\s+(?:is\s+)?gone|doesn['’]?t\s+hurt\s+(?:now|anymore)|does\s+not\s+hurt\s+(?:now|anymore)|symptoms?\s+(?:are\s+)?gone)\b/i.test(message);
}

function snapshotReason(proposal: CoachMessageProposal, optionTitle: string): string {
  const input = proposal.adaptation.message || proposal.adaptation.quickSignal || 'coach update';
  return `Coach message adaptation · ${proposal.sessionDiscipline} · ${input} · ${optionTitle}`;
}

function quickSignalLabel(signal?: CoachQuickSignal): string {
  if (!signal) return '';
  return signal.replaceAll('_', ' ');
}

function disciplineLabel(discipline: 'swim' | 'bike' | 'run'): string {
  if (discipline === 'bike') return 'ride';
  return discipline;
}

function stableMessageId(message: string): string {
  let hash = 2166136261;
  for (let index = 0; index < message.length; index += 1) {
    hash ^= message.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
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
