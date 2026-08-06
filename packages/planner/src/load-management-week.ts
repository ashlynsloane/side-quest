import type {
  LoadManagementSessionAdjustment,
  LoadManagementTrigger,
  LoadManagementWeekDecision,
  LoadManagementWeekHistory,
  LoadManagementWeekInput,
  LoadManagementWeekKind,
} from '@circuit/domain';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function recent(history: LoadManagementWeekHistory[], count: number): LoadManagementWeekHistory[] {
  return [...history]
    .sort((left, right) => right.weekStartDate.localeCompare(left.weekStartDate))
    .slice(0, count);
}

function determineTriggers(input: LoadManagementWeekInput): LoadManagementTrigger[] {
  const latest = recent(input.recentWeeks, 1)[0];
  const lastThree = recent(input.recentWeeks, 3);
  const triggers: LoadManagementTrigger[] = [];

  if (input.athleteRequestedRecovery) triggers.push('athlete_request');
  if (input.returnToTraining) triggers.push('return_to_training');
  if ((input.weeksSinceLastDeload ?? 0) >= 4) triggers.push('scheduled_cycle');
  if (lastThree.reduce((sum, week) => sum + week.progressionCount, 0) >= 3) triggers.push('progression_streak');
  if (lastThree.reduce((sum, week) => sum + week.unfamiliarExerciseCount, 0) >= 4) triggers.push('novelty_accumulation');
  if (latest?.structuralAction && latest.structuralAction !== 'proceed') triggers.push('structural_exposure');
  if ((latest?.maximumSorenessResolvedHours ?? 0) > 48) triggers.push('persistent_soreness');
  if (latest?.painDuringOrAfter || latest?.affectedNextWorkout) triggers.push('pain_response');
  if (latest && latest.plannedStrengthSessions > 0 && latest.completedStrengthSessions / latest.plannedStrengthSessions < 0.67) {
    triggers.push('incomplete_sessions');
  }
  if (input.currentStructuralDecision && input.currentStructuralDecision.action !== 'proceed') {
    triggers.push('structural_exposure');
  }
  if (input.plannedProgression?.readiness === 'not_ready') triggers.push('pain_response');
  return unique(triggers);
}

function decideKind(triggers: LoadManagementTrigger[]): LoadManagementWeekKind {
  if (triggers.includes('pain_response')) return 'restriction';
  if (
    triggers.includes('athlete_request') ||
    triggers.includes('structural_exposure') ||
    triggers.includes('persistent_soreness') ||
    triggers.length >= 3
  ) return 'deload';
  if (
    triggers.includes('scheduled_cycle') ||
    triggers.includes('progression_streak') ||
    triggers.includes('novelty_accumulation') ||
    triggers.includes('return_to_training') ||
    triggers.includes('incomplete_sessions')
  ) return 'consolidation';
  return 'normal';
}

function scales(kind: LoadManagementWeekKind) {
  switch (kind) {
    case 'restriction': return { frequency: 0.5, duration: 0.6, mechanical: 0.5, novelty: 0, progress: false };
    case 'deload': return { frequency: 0.75, duration: 0.7, mechanical: 0.65, novelty: 0, progress: false };
    case 'consolidation': return { frequency: 1, duration: 0.85, mechanical: 0.8, novelty: 1, progress: false };
    default: return { frequency: 1, duration: 1, mechanical: 1, novelty: 2, progress: true };
  }
}

function sessionAdjustment(
  session: LoadManagementWeekInput['upcomingSessions'][number],
  kind: LoadManagementWeekKind,
): LoadManagementSessionAdjustment {
  if (kind === 'normal') {
    return { sessionId: session.sessionId, action: 'keep', durationScale: 1, intensityScale: 1, noveltyAllowed: true, rationale: ['No load-management reduction is required.'] };
  }

  if (session.priority === 'key') {
    const scale = kind === 'restriction' ? 0.85 : 1;
    return {
      sessionId: session.sessionId,
      action: scale < 1 ? 'reduce' : 'keep',
      durationScale: scale,
      intensityScale: scale,
      noveltyAllowed: false,
      rationale: ['Protect the key session while reducing supporting load around it.'],
    };
  }

  if (kind === 'restriction' && session.discipline === 'strength') {
    return {
      sessionId: session.sessionId,
      action: 'replace',
      durationScale: 0.5,
      intensityScale: 0.45,
      noveltyAllowed: false,
      rationale: ['Replace the planned strength dose with a familiar, region-safe minimum-effective session.'],
    };
  }

  if (kind === 'deload' && session.priority === 'supporting' && session.discipline === 'strength') {
    return {
      sessionId: session.sessionId,
      action: 'reduce',
      durationScale: 0.65,
      intensityScale: 0.6,
      noveltyAllowed: false,
      rationale: ['Reduce supporting strength volume and mechanical demand before changing key endurance work.'],
    };
  }

  const scale = kind === 'consolidation' ? 0.85 : 0.75;
  return {
    sessionId: session.sessionId,
    action: 'reduce',
    durationScale: scale,
    intensityScale: scale,
    noveltyAllowed: kind === 'consolidation',
    rationale: ['Preserve the session purpose at a lower recoverable dose.'],
  };
}

export function decideLoadManagementWeek(input: LoadManagementWeekInput): LoadManagementWeekDecision {
  const triggers = determineTriggers(input);
  const kind = decideKind(triggers);
  const scale = scales(kind);
  const protectedSessionIds = input.upcomingSessions.filter((session) => session.priority === 'key').map((session) => session.sessionId);
  const adjustments = input.upcomingSessions.map((session) => sessionAdjustment(session, kind));
  const explanations: string[] = [];

  if (kind === 'normal') explanations.push('Recent training response supports the planned week without an automatic recovery intervention.');
  if (kind === 'consolidation') explanations.push('Hold progression and slightly reduce dose so recent gains can consolidate without losing training continuity.');
  if (kind === 'deload') explanations.push('Reduce frequency, duration, mechanical demand, and novelty while preserving the most important sessions.');
  if (kind === 'restriction') explanations.push('Pain or carryover into another workout requires a region-safe restricted week rather than a routine deload.');
  if (protectedSessionIds.length > 0 && kind !== 'normal') explanations.push('Key sessions are protected; supporting strength and lower-priority work are reduced first.');

  return {
    kind,
    triggers,
    strengthFrequencyScale: scale.frequency,
    sessionDurationScale: scale.duration,
    mechanicalDemandScale: scale.mechanical,
    noveltyBudget: scale.novelty,
    progressionAllowed: scale.progress,
    protectedSessionIds,
    adjustments,
    explanations,
  };
}

export function shouldScheduleRecoveryWeek(decision: LoadManagementWeekDecision): boolean {
  return decision.kind === 'consolidation' || decision.kind === 'deload' || decision.kind === 'restriction';
}
