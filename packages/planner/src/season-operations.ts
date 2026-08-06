import type {
  SeasonAdjustmentProposal,
  SeasonConstraintEvaluation,
  SeasonOperationEvent,
  SeasonSessionContext,
  SeasonTimeline,
} from '@circuit/domain';

function overlaps(date: string, event: SeasonOperationEvent): boolean {
  return date >= event.startsOn && date <= event.endsOn;
}

export function evaluateSeasonConstraints(
  session: SeasonSessionContext,
  timeline: SeasonTimeline,
): SeasonConstraintEvaluation {
  const active = timeline.events.filter((event) => overlaps(session.localDate, event));
  const blocking: string[] = [];
  const review: string[] = [];
  const reasons: string[] = [];

  for (const event of active) {
    const sportBlocked = Boolean(event.allowedSports?.length && !event.allowedSports.includes(session.sport));
    const equipmentBlocked = session.equipmentRequired.some((item) => event.unavailableEquipment.includes(item));
    const environmentBlocked = session.environmentRequired.some((item) =>
      event.environmentTags.includes(`unavailable:${item}`),
    );
    if (!sportBlocked && !equipmentBlocked && !environmentBlocked) continue;

    reasons.push(`${event.title} conflicts with the proposed ${session.sport} session.`);
    if (event.severity === 'hard') blocking.push(event.eventId);
    else review.push(event.eventId);
  }

  return {
    sessionId: session.sessionId,
    allowed: blocking.length === 0,
    blockingEventIds: blocking,
    reviewEventIds: review,
    reasons: reasons.length ? reasons : ['No season-level constraint conflicts with this session.'],
    auditable: true,
  };
}

export function buildSeasonAdjustmentProposal(
  event: SeasonOperationEvent,
  sessions: SeasonSessionContext[],
): SeasonAdjustmentProposal {
  const affected = sessions.filter((session) => overlaps(session.localDate, event));
  const blocked = affected.filter((session) => {
    const result = evaluateSeasonConstraints(session, {
      athleteId: event.athleteId,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      events: [event],
      protectedCommitmentIds: [],
      safeguards: [],
    });
    return !result.allowed || result.reviewEventIds.length > 0;
  });

  const move = blocked.filter((session) => session.movable).map((session) => session.sessionId);
  const remove = blocked.filter((session) => !session.movable).map((session) => session.sessionId);
  const replace = blocked
    .filter((session) => session.sport !== 'recovery' && Boolean(event.allowedSports?.length))
    .map((session) => session.sessionId);

  return {
    proposalId: `season-adjustment:${event.eventId}`,
    eventId: event.eventId,
    affectedSessionIds: affected.map((session) => session.sessionId),
    moveSessionIds: move,
    replaceSessionIds: replace,
    removeSessionIds: remove,
    volumeChangePercent: blocked.length ? -Math.min(25, blocked.length * 5) : 0,
    explanation: blocked.length
      ? [`${event.title} affects ${blocked.length} planned session${blocked.length === 1 ? '' : 's'}.`, 'The planner preserves the season goal while respecting the real-world constraint.']
      : [`${event.title} does not currently require a plan change.`],
    alternativesConsidered: ['Move sessions into open windows.', 'Substitute an allowed sport or available equipment.', 'Reduce load rather than creating compensatory overload.'],
    tradeoffs: ['Maintains continuity while accepting temporary loss of specificity.', 'Avoids stacking displaced sessions immediately before or after the event.'],
    confidence: blocked.length ? 'moderate' : 'high',
    requiresAthleteApproval: blocked.length > 0,
    auditable: true,
  };
}

export function buildSeasonTimeline(
  athleteId: string,
  startsOn: string,
  endsOn: string,
  events: SeasonOperationEvent[],
  protectedCommitmentIds: string[] = [],
): SeasonTimeline {
  return {
    athleteId,
    startsOn,
    endsOn,
    events: [...events].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    protectedCommitmentIds,
    safeguards: [
      'Protected recurring commitments remain immovable.',
      'Season adjustments require athlete approval unless a binding safety constraint applies.',
      'Displaced training is not automatically stacked into adjacent days.',
    ],
  };
}
