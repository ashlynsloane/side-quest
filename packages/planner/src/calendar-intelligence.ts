import type {
  AdaptiveDecisionConfidence,
  AthleteCalendarConstraint,
  CalendarAdjustmentProposal,
  CalendarIntelligenceInput,
  CalendarIntelligenceResult,
  CalendarPlanningSession,
  CalendarPlanningWindow,
  CapacityForecastConflict,
} from '@circuit/domain';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function overlaps(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return new Date(leftStart).getTime() < new Date(rightEnd).getTime()
    && new Date(rightStart).getTime() < new Date(leftEnd).getTime();
}

function sessionEnd(session: CalendarPlanningSession): string {
  return new Date(new Date(session.startsAt).getTime() + session.durationMinutes * 60_000).toISOString();
}

function equipmentFits(session: CalendarPlanningSession, window: CalendarPlanningWindow): boolean {
  const required = session.requiredEquipment ?? [];
  if (!required.length) return true;
  const available = new Set(window.availableEquipment ?? []);
  return required.every((item) => available.has(item));
}

function applicableConstraints(
  session: CalendarPlanningSession,
  constraints: AthleteCalendarConstraint[],
): AthleteCalendarConstraint[] {
  return constraints.filter((constraint) => overlaps(
    session.startsAt,
    sessionEnd(session),
    constraint.startsAt,
    constraint.endsAt,
  ));
}

function forecastConflicts(
  session: CalendarPlanningSession,
  conflicts: CapacityForecastConflict[],
): CapacityForecastConflict[] {
  return conflicts.filter((conflict) => conflict.affectedSessionId === session.sessionId);
}

function isProtected(session: CalendarPlanningSession): boolean {
  return session.priority === 'event' || session.priority === 'key' || !session.movable;
}

function candidateWindows(
  input: CalendarIntelligenceInput,
  session: CalendarPlanningSession,
): CalendarPlanningWindow[] {
  const generatedMs = new Date(input.generatedAt).getTime();
  const originalMs = new Date(session.startsAt).getTime();
  const noticeHours = input.minimumMoveNoticeHours ?? 12;
  const maxDays = input.maximumMoveDays ?? 4;
  return input.windows
    .filter((window) => window.availableMinutes >= session.durationMinutes)
    .filter((window) => equipmentFits(session, window))
    .filter((window) => new Date(window.startsAt).getTime() >= generatedMs + noticeHours * HOUR_MS)
    .filter((window) => Math.abs(new Date(window.startsAt).getTime() - originalMs) <= maxDays * DAY_MS)
    .filter((window) => !input.constraints.some((constraint) => constraint.severity === 'hard' && overlaps(
      window.startsAt,
      window.endsAt,
      constraint.startsAt,
      constraint.endsAt,
    )))
    .sort((left, right) => {
      const leftDistance = Math.abs(new Date(left.startsAt).getTime() - originalMs);
      const rightDistance = Math.abs(new Date(right.startsAt).getTime() - originalMs);
      return leftDistance - rightDistance || left.startsAt.localeCompare(right.startsAt);
    });
}

function confidenceFor(
  constraints: AthleteCalendarConstraint[],
  conflicts: CapacityForecastConflict[],
  hasWindow: boolean,
): AdaptiveDecisionConfidence {
  if (!hasWindow) return 'low';
  if (constraints.some((item) => item.severity === 'hard')) return 'high';
  if (conflicts.some((item) => item.severity === 'critical')) return 'high';
  return constraints.length || conflicts.length ? 'moderate' : 'low';
}

function proposalFor(
  input: CalendarIntelligenceInput,
  session: CalendarPlanningSession,
): CalendarAdjustmentProposal | null {
  const constraints = applicableConstraints(session, input.constraints);
  const conflicts = forecastConflicts(session, input.capacityForecast?.conflicts ?? []);
  const hardConstraint = constraints.some((item) => item.severity === 'hard');
  const meaningfulForecast = conflicts.some((item) => item.severity !== 'watch');
  if (!constraints.length && !conflicts.length) return null;

  if (isProtected(session)) {
    return {
      proposalId: `calendar:${session.sessionId}:protect`,
      sessionId: session.sessionId,
      action: 'keep',
      originalStartsAt: session.startsAt,
      confidence: hardConstraint || meaningfulForecast ? 'high' : 'moderate',
      requiresAthleteApproval: false,
      reasons: [
        `${session.title} is protected because it is ${session.priority === 'event' ? 'an event' : 'a key or fixed session'}.`,
        'Supporting sessions should adapt around it rather than moving it automatically.',
      ],
      affectedConstraintIds: constraints.map((item) => item.constraintId),
      forecastConflictIds: conflicts.map((item) => item.id),
    };
  }

  const windows = candidateWindows(input, session);
  const selected = windows[0];
  if (selected) {
    return {
      proposalId: `calendar:${session.sessionId}:move:${selected.startsAt}`,
      sessionId: session.sessionId,
      action: 'move',
      originalStartsAt: session.startsAt,
      proposedStartsAt: selected.startsAt,
      proposedDurationMinutes: session.durationMinutes,
      confidence: confidenceFor(constraints, conflicts, true),
      requiresAthleteApproval: true,
      reasons: [
        ...constraints.map((item) => `${item.title} overlaps the original session window.`),
        ...conflicts.map((item) => `${item.resource} capacity is forecast at ${item.availableCapacity}% near the original session.`),
        `The proposed ${selected.source.replaceAll('_', ' ')} window preserves the full ${session.durationMinutes}-minute session.`,
      ],
      affectedConstraintIds: constraints.map((item) => item.constraintId),
      forecastConflictIds: conflicts.map((item) => item.id),
    };
  }

  const timeLimit = constraints
    .map((item) => item.availableMinutes)
    .filter((value): value is number => value !== undefined && value > 0)
    .sort((a, b) => b - a)[0];
  if (timeLimit && timeLimit >= 15 && timeLimit < session.durationMinutes && !hardConstraint) {
    return {
      proposalId: `calendar:${session.sessionId}:shorten`,
      sessionId: session.sessionId,
      action: 'shorten',
      originalStartsAt: session.startsAt,
      proposedDurationMinutes: timeLimit,
      confidence: 'moderate',
      requiresAthleteApproval: true,
      reasons: [
        `No suitable move window was found within ${input.maximumMoveDays ?? 4} days.`,
        `${timeLimit} minutes remain available, so a minimum effective version is proposed.`,
      ],
      affectedConstraintIds: constraints.map((item) => item.constraintId),
      forecastConflictIds: conflicts.map((item) => item.id),
    };
  }

  return {
    proposalId: `calendar:${session.sessionId}:remove`,
    sessionId: session.sessionId,
    action: 'remove',
    originalStartsAt: session.startsAt,
    confidence: hardConstraint ? 'high' : 'low',
    requiresAthleteApproval: true,
    reasons: [
      'No valid full or shortened training window was found.',
      'Removing a supporting session is safer than forcing it into a hard life constraint or low-capacity window.',
    ],
    affectedConstraintIds: constraints.map((item) => item.constraintId),
    forecastConflictIds: conflicts.map((item) => item.id),
  };
}

export function buildCalendarIntelligence(
  input: CalendarIntelligenceInput,
): CalendarIntelligenceResult {
  const proposals = input.sessions
    .map((session) => proposalFor(input, session))
    .filter((proposal): proposal is CalendarAdjustmentProposal => proposal !== null)
    .sort((left, right) => left.originalStartsAt.localeCompare(right.originalStartsAt));
  const proposedIds = new Set(proposals.map((proposal) => proposal.sessionId));
  return {
    generatedAt: input.generatedAt,
    proposals,
    unchangedSessionIds: input.sessions.filter((session) => !proposedIds.has(session.sessionId)).map((session) => session.sessionId),
    protectedSessionIds: input.sessions.filter(isProtected).map((session) => session.sessionId),
    explanations: [
      'Life constraints are evaluated before training convenience.',
      'Key sessions and events are protected; supporting work adapts around them.',
      'Moves, shortened sessions, and removals require athlete approval before the calendar changes.',
      'The engine does not create training time inside protected personal time or hard constraints.',
    ],
  };
}
