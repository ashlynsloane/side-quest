import type {
  PlannedStrengthSession,
  TrainingBlockPlan,
  TrainingCalendarEvent,
  Weekday,
} from '@circuit/domain';

export type PlanConflictSeverity = 'low' | 'moderate' | 'high';

export type PlanConflictKind =
  | 'same_day_endurance'
  | 'rest_day'
  | 'strength_cluster'
  | 'taper_overload'
  | 'race_proximity'
  | 'hard_day_density'
  | 'overdue';

export interface PlanConflict {
  id: string;
  kind: PlanConflictKind;
  severity: PlanConflictSeverity;
  sessionId: string;
  sessionTitle: string;
  date: string;
  headline: string;
  explanation: string;
}

export interface PlanMoveProposal {
  id: string;
  sessionId: string;
  sessionTitle: string;
  fromDate: string;
  toDate: string;
  severity: PlanConflictSeverity;
  reason: string;
}

export interface PlanHealthSummary {
  conflicts: PlanConflict[];
  highCount: number;
  moderateCount: number;
  lowCount: number;
  label: 'clear' | 'watch' | 'needs_attention';
  headline: string;
  context: string;
}

export function analyzePlanHealth({
  block,
  calendarEvents = [],
  today = new Date().toISOString().slice(0, 10),
}: {
  block: TrainingBlockPlan;
  calendarEvents?: TrainingCalendarEvent[];
  today?: string;
}): PlanHealthSummary {
  const conflicts: PlanConflict[] = [];
  const sessions = block.weeks
    .flatMap((week) => week.sessions.map((session) => ({ session, phase: week.phase })))
    .filter(({ session }) => session.completionStatus !== 'completed' && session.completionStatus !== 'skipped')
    .sort((left, right) => left.session.date.localeCompare(right.session.date));

  for (const { session, phase } of sessions) {
    if (session.date < today) {
      conflicts.push(conflict({
        kind: 'overdue',
        severity: 'moderate',
        session,
        headline: 'Planned session is overdue',
        explanation: 'This session is still marked planned even though its date has passed. Move it, skip it, or complete a rescue version rather than silently carrying it forward.',
      }));
    }

    const events = eventsOnDate(calendarEvents, session.date);
    const hasRest = events.some((event) => event.discipline === 'rest');
    if (hasRest) {
      conflicts.push(conflict({
        kind: 'rest_day',
        severity: 'high',
        session,
        headline: 'Strength overlaps a designated rest day',
        explanation: 'A calendar event marks this day for rest. Preserve the rest day or explicitly remove that designation before training.',
      }));
    }

    const lowerBodyEvents = events.filter((event) => event.discipline === 'run' || event.discipline === 'bike');
    const swimEvents = events.filter((event) => event.discipline === 'swim');
    if (lowerBodyEvents.length > 0 && session.intendedLoad === 'high') {
      conflicts.push(conflict({
        kind: 'same_day_endurance',
        severity: 'high',
        session,
        headline: 'High-load strength overlaps run or bike training',
        explanation: `${eventNames(lowerBodyEvents)} is scheduled on the same day. This is actionable because the strength session is explicitly high load; ordinary moderate pairings are not flagged.`,
      }));
    } else if (swimEvents.length > 0 && session.purpose === 'swim_support' && session.intendedLoad === 'high') {
      conflicts.push(conflict({
        kind: 'same_day_endurance',
        severity: 'moderate',
        session,
        headline: 'High-load swim-support strength overlaps swimming',
        explanation: `${eventNames(swimEvents)} is scheduled on the same day. Review shoulder and pulling volume if the swim is a key session.`,
      }));
    }

    if (phase === 'taper' && session.intendedLoad === 'high') {
      conflicts.push(conflict({
        kind: 'taper_overload',
        severity: 'high',
        session,
        headline: 'High strength load appears during taper',
        explanation: 'Taper strength should preserve familiar movement patterns while reducing fatigue. A high-load session is inconsistent with that goal.',
      }));
    }
    if (phase === 'race_week' && (session.intendedLoad !== 'light' || session.workout.request.workMinutes > 24)) {
      conflicts.push(conflict({
        kind: 'taper_overload',
        severity: 'high',
        session,
        headline: 'Race-week session is too demanding',
        explanation: 'Race-week strength should be brief, familiar, and low-fatigue. Use a minimum version or remove the session.',
      }));
    }

    if (block.goal.eventDate) {
      const daysBeforeEvent = differenceInDays(session.date, block.goal.eventDate);
      if (daysBeforeEvent >= 0 && daysBeforeEvent <= 2 && session.intendedLoad !== 'light') {
        conflicts.push(conflict({
          kind: 'race_proximity',
          severity: 'high',
          session,
          headline: 'Strength is too close to the event',
          explanation: `This ${session.intendedLoad}-load session is ${daysBeforeEvent === 0 ? 'on event day' : `${daysBeforeEvent} day${daysBeforeEvent === 1 ? '' : 's'} before the event`}. Freshness should take priority.`,
        }));
      }
    }
  }

  for (const week of block.weeks) {
    const activeWeekSessions = week.sessions.filter((session) => session.completionStatus !== 'completed' && session.completionStatus !== 'skipped');
    const highStrengthDays = new Set(activeWeekSessions.filter((session) => session.intendedLoad === 'high').map((session) => session.date));
    const hardEnduranceDays = new Set(calendarEvents
      .filter((event) => event.startAt.slice(0, 10) >= week.weekStartDate && event.startAt.slice(0, 10) <= addDays(week.weekStartDate, 6))
      .filter((event) => event.discipline === 'run' || event.discipline === 'bike' || event.discipline === 'swim')
      .filter((event) => /interval|threshold|tempo|race|long|vo2|hard/i.test(`${event.title} ${event.description ?? ''}`))
      .map((event) => event.startAt.slice(0, 10)));
    const hardDays = new Set([...highStrengthDays, ...hardEnduranceDays]);
    const maxHardDays = block.goal.strengthDoseMetadata?.maxTotalHardDays ?? 4;
    if (hardDays.size > maxHardDays) {
      const target = activeWeekSessions.find((session) => session.intendedLoad === 'high' && session.date >= today);
      if (target) conflicts.push(conflict({
        kind: 'hard_day_density',
        severity: 'high',
        session: target,
        headline: 'Too many high-load days in one week',
        explanation: `${hardDays.size} distinct high-load days were detected against a plan limit of ${maxHardDays}. Shorten or downgrade a strength session rather than stacking another demanding day.`,
      }));
    }
  }

  for (let index = 1; index < sessions.length; index += 1) {
    const previous = sessions[index - 1]?.session;
    const current = sessions[index]?.session;
    if (!previous || !current) continue;
    const gap = differenceInDays(previous.date, current.date);
    const sameDay = gap === 0;
    const consecutiveHighLoad = gap === 1 && previous.intendedLoad === 'high' && current.intendedLoad === 'high';
    if ((sameDay || consecutiveHighLoad) && previous.date >= today && current.date >= today) {
      conflicts.push(conflict({
        kind: 'strength_cluster',
        severity: sameDay ? 'high' : 'moderate',
        session: current,
        headline: sameDay ? 'Two strength sessions share one day' : 'Consecutive high-load strength sessions',
        explanation: `${previous.title} is scheduled ${sameDay ? 'on the same day' : 'the day before'}. Only same-day duplication and consecutive high-load sessions are treated as material conflicts.`,
      }));
    }
  }

  const uniqueConflicts = dedupeConflicts(conflicts);
  const highCount = uniqueConflicts.filter((item) => item.severity === 'high').length;
  const moderateCount = uniqueConflicts.filter((item) => item.severity === 'moderate').length;
  const lowCount = uniqueConflicts.filter((item) => item.severity === 'low').length;
  const label: PlanHealthSummary['label'] = highCount > 0
    ? 'needs_attention'
    : moderateCount > 1
      ? 'watch'
      : 'clear';
  return {
    conflicts: uniqueConflicts.sort(compareConflicts),
    highCount,
    moderateCount,
    lowCount,
    label,
    headline: label === 'clear'
      ? 'No meaningful scheduling conflict detected'
      : label === 'watch'
        ? 'A few sessions deserve review'
        : 'The remaining strength schedule needs adjustment',
    context: 'This scan shows only material, actionable placement problems: designated rest days, high-load overlap, same-day duplication, consecutive high-load strength, excess hard-day density, taper violations, overdue sessions, and event proximity. Ordinary clustering is not labeled a conflict. This is not an overall score of training, recovery, sleep, stress, or nutrition.',
  };
}

export function buildReplanProposals({
  block,
  calendarEvents = [],
  today = new Date().toISOString().slice(0, 10),
}: {
  block: TrainingBlockPlan;
  calendarEvents?: TrainingCalendarEvent[];
  today?: string;
}): PlanMoveProposal[] {
  const health = analyzePlanHealth({ block, calendarEvents, today });
  const futureSessions = block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.completionStatus !== 'completed' && session.completionStatus !== 'skipped');
  const occupied = new Map<string, string[]>();
  for (const session of futureSessions) {
    const values = occupied.get(session.date) ?? [];
    values.push(session.id);
    occupied.set(session.date, values);
  }

  const proposals: PlanMoveProposal[] = [];
  const handled = new Set<string>();
  const conflicts = [...health.conflicts].sort(compareConflicts);
  for (const item of conflicts) {
    if (item.kind === 'overdue') continue;
    if (handled.has(item.sessionId)) continue;
    const located = locateSession(block, item.sessionId);
    if (!located) continue;
    const { session, weekStartDate } = located;
    const candidate = bestCandidateDate({
      block,
      session,
      weekStartDate,
      calendarEvents,
      occupied,
      today,
    });
    if (!candidate || candidate === session.date) continue;

    proposals.push({
      id: `move_${session.id}_${candidate}`,
      sessionId: session.id,
      sessionTitle: session.title,
      fromDate: session.date,
      toDate: candidate,
      severity: item.severity,
      reason: `${item.headline}. ${candidateReason(calendarEvents, candidate)}`,
    });
    handled.add(session.id);
    occupied.set(session.date, (occupied.get(session.date) ?? []).filter((id) => id !== session.id));
    occupied.set(candidate, [...(occupied.get(candidate) ?? []), session.id]);
  }
  return proposals.sort((left, right) => left.fromDate.localeCompare(right.fromDate));
}

export function applyReplanProposals(
  block: TrainingBlockPlan,
  proposals: PlanMoveProposal[],
  appliedAt = new Date().toISOString(),
): TrainingBlockPlan {
  if (proposals.length === 0) return block;
  const proposalBySession = new Map(proposals.map((proposal) => [proposal.sessionId, proposal]));
  const movedSessions = block.weeks.flatMap((week) => week.sessions).map((session) => {
    const proposal = proposalBySession.get(session.id);
    if (!proposal) return session;
    return {
      ...session,
      date: proposal.toDate,
      completionStatus: 'modified' as const,
      placementNote: `${session.placementNote ? `${session.placementNote} ` : ''}Automatically moved from ${proposal.fromDate}: ${proposal.reason}`,
    };
  });

  const weeks = block.weeks.map((week) => {
    const end = addDays(week.weekStartDate, 6);
    const sessions = movedSessions
      .filter((session) => session.date >= week.weekStartDate && session.date <= end)
      .sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order)
      .map((session, index) => ({ ...session, order: index + 1 }));
    const movedIntoWeek = proposals.filter((proposal) => proposal.toDate >= week.weekStartDate && proposal.toDate <= end);
    return {
      ...week,
      sessions,
      warnings: movedIntoWeek.length > 0
        ? [...week.warnings, `${movedIntoWeek.length} session${movedIntoWeek.length === 1 ? ' was' : 's were'} automatically rescheduled after a calendar-conflict scan.`]
        : week.warnings,
    };
  });

  return {
    ...block,
    id: `${block.id}_replan_${simpleHash(`${appliedAt}-${proposals.map((item) => item.id).join('|')}`)}`,
    createdAt: appliedAt,
    parentBlockId: block.id,
    weeks,
  };
}

function bestCandidateDate({
  block,
  session,
  weekStartDate,
  calendarEvents,
  occupied,
  today,
}: {
  block: TrainingBlockPlan;
  session: PlannedStrengthSession;
  weekStartDate: string;
  calendarEvents: TrainingCalendarEvent[];
  occupied: Map<string, string[]>;
  today: string;
}): string | null {
  const preferred = new Set(block.requestSnapshot?.preferredStrengthDays ?? []);
  const candidates = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index))
    .filter((date) => date >= today)
    .filter((date) => !block.goal.eventDate || date < block.goal.eventDate)
    .filter((date) => (occupied.get(date) ?? []).length === 0)
    .map((date) => ({
      date,
      score: candidateScore({
        date,
        originalDate: session.date,
        session,
        events: eventsOnDate(calendarEvents, date),
        occupied,
        preferred,
      }),
    }))
    .sort((left, right) => left.score - right.score || left.date.localeCompare(right.date));
  return candidates[0]?.date ?? null;
}

function candidateScore({
  date,
  originalDate,
  session,
  events,
  occupied,
  preferred,
}: {
  date: string;
  originalDate: string;
  session: PlannedStrengthSession;
  events: TrainingCalendarEvent[];
  occupied: Map<string, string[]>;
  preferred: Set<Weekday>;
}): number {
  let score = Math.abs(differenceInDays(originalDate, date)) * 0.7;
  if (events.some((event) => event.discipline === 'rest')) score += 100;
  if (events.some((event) => event.discipline === 'run' || event.discipline === 'bike')) score += session.intendedLoad === 'high' ? 35 : 18;
  if (events.some((event) => event.discipline === 'swim') && session.purpose === 'swim_support') score += 16;
  if (events.some((event) => event.discipline === 'strength')) score += 24;
  const previousDay = addDays(date, -1);
  const nextDay = addDays(date, 1);
  if ((occupied.get(previousDay) ?? []).length > 0) score += 9;
  if ((occupied.get(nextDay) ?? []).length > 0) score += 9;
  if (preferred.has(weekdayFromIsoDate(date))) score -= 4;
  return score;
}

function conflict({
  kind,
  severity,
  session,
  headline,
  explanation,
}: {
  kind: PlanConflictKind;
  severity: PlanConflictSeverity;
  session: PlannedStrengthSession;
  headline: string;
  explanation: string;
}): PlanConflict {
  return {
    id: `${kind}_${session.id}_${session.date}`,
    kind,
    severity,
    sessionId: session.id,
    sessionTitle: session.title,
    date: session.date,
    headline,
    explanation,
  };
}

function locateSession(block: TrainingBlockPlan, sessionId: string) {
  for (const week of block.weeks) {
    const session = week.sessions.find((item) => item.id === sessionId);
    if (session) return { session, weekStartDate: week.weekStartDate };
  }
  return null;
}

function eventsOnDate(events: TrainingCalendarEvent[], date: string) {
  return events.filter((event) => event.startAt.slice(0, 10) === date);
}

function eventNames(events: TrainingCalendarEvent[]) {
  return events.map((event) => event.title).join(' and ');
}

function candidateReason(events: TrainingCalendarEvent[], date: string) {
  const dayEvents = eventsOnDate(events, date).filter((event) => event.discipline && event.discipline !== 'other');
  return dayEvents.length === 0
    ? 'The proposed day has no imported key training event.'
    : `The proposed day contains ${eventNames(dayEvents)}, but it has the lowest available conflict score within the week.`;
}

function compareConflicts(left: PlanConflict, right: PlanConflict) {
  const rank: Record<PlanConflictSeverity, number> = { high: 0, moderate: 1, low: 2 };
  return rank[left.severity] - rank[right.severity] || left.date.localeCompare(right.date);
}

function dedupeConflicts(conflicts: PlanConflict[]) {
  const seen = new Set<string>();
  return conflicts.filter((item) => {
    const key = `${item.kind}:${item.sessionId}:${item.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function weekdayFromIsoDate(value: string): Weekday {
  const weekdays: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return weekdays[new Date(`${value}T12:00:00Z`).getUTCDay()] ?? 'monday';
}

function differenceInDays(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
