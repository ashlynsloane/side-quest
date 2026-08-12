import type { TrainingBlockPlan, TrainingCheckIn } from '@circuit/domain';
import type { CompletedDisciplineExposure } from '@circuit/planner/whole-athlete-progression';

import type { EnduranceHistoryItem, StrengthHistoryItem, TrainingHistoryItem } from './training-history';

export type SessionResponse =
  | 'well_tolerated'
  | 'tolerated_with_modification'
  | 'under_completed'
  | 'poorly_tolerated'
  | 'symptom_limited'
  | 'unknown';

export type PlannedSessionCompletionKind =
  | 'completed_as_planned'
  | 'completed_modified'
  | 'completed_partial'
  | 'skipped';

export type AdaptationAction = 'progress_eligible' | 'hold' | 'protect' | 'learning';

export interface StrengthSessionResponseEvidence {
  workoutInstanceId: string;
  plannedSessionId?: string;
  sessionTitle: string;
  occurredAt: string;
  completionKind: Exclude<PlannedSessionCompletionKind, 'skipped'>;
  response: SessionResponse;
  completionFraction: number;
  plannedDurationMinutes?: number;
  actualDurationMinutes?: number;
  modifiedFromPlan: boolean;
  rpe?: number;
  difficulty?: 'too_easy' | 'appropriate' | 'too_hard';
  energyAfter?: number;
  reasons: string[];
  progressionSignal: 'completed_as_planned' | 'not_completed_as_planned' | 'suppress';
}

export interface SkippedStrengthEvidence {
  plannedSessionId: string;
  sessionTitle: string;
  occurredAt: string;
  completionKind: 'skipped';
  response: 'unknown';
  reasons: string[];
}

export interface StrengthAdaptationSummary {
  action: AdaptationAction;
  actionLabel: string;
  title: string;
  body: string;
  evidenceCount: number;
  pendingEvidenceCount: number;
  appliedResponses: StrengthSessionResponseEvidence[];
  pendingResponses: StrengthSessionResponseEvidence[];
  skipped: SkippedStrengthEvidence[];
  healthOverride: 'none' | 'monitor' | 'protect';
  pendingNote?: string;
}

export type EnduranceDiscipline = 'swim' | 'bike' | 'run';
export type EnduranceSessionRole = 'quality' | 'long' | 'endurance' | 'support' | 'return_to_run';

export interface EnduranceSessionResponseEvidence {
  activityId: string;
  plannedEventId: string;
  discipline: EnduranceDiscipline;
  role: EnduranceSessionRole;
  sessionTitle: string;
  occurredAt: string;
  completionKind: Exclude<PlannedSessionCompletionKind, 'skipped'>;
  response: SessionResponse;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  completionRatio: number;
  plannedIntensity?: 'easy' | 'moderate' | 'hard';
  actualIntensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'race';
  modifiedFromPlan: boolean;
  athleteResponseRecorded: boolean;
  perceivedDifficulty?: 'too_easy' | 'about_right' | 'too_hard';
  sessionRpe?: number;
  symptomsDuring?: boolean;
  symptomsAfter?: boolean;
  nextDayStatus?: 'same_or_better' | 'worse';
  reasons: string[];
  progressionSignal: 'completed_as_planned' | 'not_completed_as_planned' | 'suppress';
}

export interface EnduranceResponseRequest {
  activityId: string;
  plannedEventId: string;
  discipline: EnduranceDiscipline;
  role: EnduranceSessionRole;
  sessionTitle: string;
  occurredAt: string;
  stage: 'post_session' | 'next_day';
}

export interface EnduranceAdaptationSummary {
  discipline: EnduranceDiscipline;
  scopeLabel: string;
  action: AdaptationAction;
  actionLabel: string;
  title: string;
  body: string;
  evidenceCount: number;
  pendingEvidenceCount: number;
  appliedResponses: EnduranceSessionResponseEvidence[];
  pendingResponses: EnduranceSessionResponseEvidence[];
  healthOverride: 'none' | 'monitor' | 'protect';
  pendingNote?: string;
}

export interface AdaptationStatusChip {
  label: string;
  actionLabel: string;
}

export interface AdaptationHeadline {
  action: AdaptationAction;
  actionLabel: string;
  title: string;
  body: string;
  pendingNote?: string;
}

export interface CompletedWorkoutAdaptationSnapshot {
  decisionCutoff: string;
  generatedAt: string;
  strength: StrengthAdaptationSummary;
  endurance: Record<EnduranceDiscipline, EnduranceAdaptationSummary>;
  returnToRun: EnduranceAdaptationSummary;
  primary: AdaptationHeadline;
  statusChips: AdaptationStatusChip[];
  hasEvidence: boolean;
  pendingResponseRequests: EnduranceResponseRequest[];
  responseByCompletedAt: Record<string, StrengthSessionResponseEvidence>;
  enduranceResponseByKey: Record<string, EnduranceSessionResponseEvidence>;
}

export function buildCompletedWorkoutAdaptationSnapshot({
  history,
  block,
  activeCheckIn,
  decisionCutoff,
  asOf,
}: {
  history: TrainingHistoryItem[];
  block: TrainingBlockPlan;
  activeCheckIn?: TrainingCheckIn | null;
  decisionCutoff: string;
  asOf: string;
}): CompletedWorkoutAdaptationSnapshot {
  const plannedById = new Map(
    block.weeks.flatMap((week) => week.sessions).map((session) => [session.id, session]),
  );

  const completedStrength = history
    .filter((item): item is StrengthHistoryItem => item.kind === 'strength')
    .filter((item) => !item.needsReview)
    .filter((item) => item.workout.relationToPlan === 'completed_planned')
    .map((item) => strengthResponseEvidence(item, plannedById.get(item.workout.plannedSessionId ?? '')))
    .filter((value): value is StrengthSessionResponseEvidence => value !== null)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const appliedStrength = completedStrength
    .filter((item) => item.occurredAt < decisionCutoff)
    .slice(0, 6);
  const pendingStrength = completedStrength
    .filter((item) => item.occurredAt >= decisionCutoff && item.occurredAt <= asOf)
    .slice(0, 6);

  const skippedStrength = block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.completionStatus === 'skipped')
    .filter((session) => `${session.date}T23:59:59.999Z` < decisionCutoff)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 4)
    .map((session) => ({
      plannedSessionId: session.id,
      sessionTitle: session.title,
      occurredAt: `${session.date}T12:00:00.000Z`,
      completionKind: 'skipped' as const,
      response: 'unknown' as const,
      reasons: ['Skipped sessions are not treated as evidence that the athlete could not tolerate the dose.'],
    }));

  const healthOverride = activeHealthOverride(activeCheckIn);
  const strength = summarizeStrengthAdaptation(
    appliedStrength,
    pendingStrength,
    skippedStrength,
    healthOverride,
  );

  const completedEndurance = history
    .filter((item): item is EnduranceHistoryItem => item.kind === 'endurance')
    .filter((item) => !item.needsReview)
    .filter((item) => !item.activity.deletedAt)
    .map(enduranceResponseEvidence)
    .filter((value): value is EnduranceSessionResponseEvidence => value !== null)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const appliedEndurance = completedEndurance
    .filter((item) => item.occurredAt < decisionCutoff);
  const pendingEndurance = completedEndurance
    .filter((item) => item.occurredAt >= decisionCutoff && item.occurredAt <= asOf);
  const pendingResponseRequests = buildEnduranceResponseRequests(history, asOf);

  const swim = summarizeEnduranceAdaptation(
    'swim',
    appliedEndurance.filter((item) => item.discipline === 'swim'),
    pendingEndurance.filter((item) => item.discipline === 'swim'),
    healthOverride,
  );
  const bike = summarizeEnduranceAdaptation(
    'bike',
    appliedEndurance.filter((item) => item.discipline === 'bike'),
    pendingEndurance.filter((item) => item.discipline === 'bike'),
    healthOverride,
  );
  const run = summarizeEnduranceAdaptation(
    'run',
    appliedEndurance.filter((item) => item.discipline === 'run' && item.role !== 'return_to_run'),
    pendingEndurance.filter((item) => item.discipline === 'run' && item.role !== 'return_to_run'),
    healthOverride,
  );
  const returnToRun = summarizeReturnToRunAdaptation(
    appliedEndurance.filter((item) => item.role === 'return_to_run'),
    pendingEndurance.filter((item) => item.role === 'return_to_run'),
    healthOverride,
    decisionCutoff,
  );

  const combinedPendingCount = strength.pendingEvidenceCount
    + swim.pendingEvidenceCount
    + bike.pendingEvidenceCount
    + run.pendingEvidenceCount
    + returnToRun.pendingEvidenceCount;
  const combinedPendingNote = combinedPendingCount
    ? `${combinedPendingCount} completed response${combinedPendingCount === 1 ? '' : 's'} from this week ${combinedPendingCount === 1 ? 'is' : 'are'} queued for the next planning decision.`
    : undefined;

  const summaries = [
    { label: 'RTR', summary: returnToRun },
    { label: 'RUN', summary: run },
    { label: 'BIKE', summary: bike },
    { label: 'STRENGTH', summary: strength },
    { label: 'SWIM', summary: swim },
  ].filter(({ summary }) =>
    summary.evidenceCount > 0
    || summary.pendingEvidenceCount > 0
    || summary.healthOverride !== 'none');

  const selected = choosePrimaryAdaptationSummary(summaries.map(({ label, summary }) => ({
    label,
    action: summary.action,
    actionLabel: summary.actionLabel,
    title: summary.title,
    body: summary.body,
    evidenceCount: summary.evidenceCount,
    pendingEvidenceCount: summary.pendingEvidenceCount,
  })));

  const primary: AdaptationHeadline = {
    action: selected?.action ?? strength.action,
    actionLabel: selected?.actionLabel ?? strength.actionLabel,
    title: selected?.title ?? strength.title,
    body: selected?.body ?? strength.body,
    ...(combinedPendingNote ? { pendingNote: combinedPendingNote } : {}),
  };

  return {
    decisionCutoff,
    generatedAt: asOf,
    strength,
    endurance: { swim, bike, run },
    returnToRun,
    primary,
    statusChips: summaries.map(({ label, summary }) => ({
      label,
      actionLabel: summary.actionLabel,
    })),
    hasEvidence: summaries.length > 0 || pendingResponseRequests.length > 0,
    pendingResponseRequests,
    responseByCompletedAt: Object.fromEntries(
      completedStrength.map((item) => [item.occurredAt, item]),
    ),
    enduranceResponseByKey: Object.fromEntries(
      completedEndurance.map((item) => [enduranceResponseKey(item.discipline, item.occurredAt), item]),
    ),
  };
}

/**
 * Applies the interpretation layer to the existing progression evidence without
 * replacing the progression engine.
 *
 * Important V1 rule: a completed workout that was exercise-swapped still counts
 * for continuity and duration, but it does not count as "completed exactly as
 * prescribed" for progression eligibility.
 */
export function applyCompletedWorkoutAdaptationToProgressionHistory(
  exposures: CompletedDisciplineExposure[],
  snapshot: CompletedWorkoutAdaptationSnapshot,
): CompletedDisciplineExposure[] {
  return exposures.map((exposure) => {
    if (exposure.discipline === 'strength') {
      const response = snapshot.responseByCompletedAt[exposure.completedAt];
      if (!response) return exposure;
      return applyProgressionSignal(exposure, response.progressionSignal);
    }

    if (
      exposure.discipline !== 'swim'
      && exposure.discipline !== 'bike'
      && exposure.discipline !== 'run'
    ) return exposure;

    const response = snapshot.enduranceResponseByKey[
      enduranceResponseKey(exposure.discipline, exposure.completedAt)
    ];
    if (!response) return exposure;

    if (response.role === 'return_to_run') {
      if (response.progressionSignal === 'not_completed_as_planned') {
        return { ...exposure, completedAsPlanned: false };
      }
      if (
        snapshot.returnToRun.action === 'progress_eligible'
        && response.completionKind === 'completed_as_planned'
        && response.response === 'well_tolerated'
      ) {
        return { ...exposure, completedAsPlanned: true };
      }
      return withoutCompletedAsPlanned(exposure);
    }

    return applyProgressionSignal(exposure, response.progressionSignal);
  });
}

export function strengthResponseEvidence(
  item: StrengthHistoryItem,
  plannedSession: TrainingBlockPlan['weeks'][number]['sessions'][number] | undefined,
): StrengthSessionResponseEvidence | null {
  const workout = item.workout.workout;
  if (!workout) return null;

  const completionFraction = clamp01(item.workout.completionFraction);
  const actualDurationMinutes = elapsedMinutes(item.workout.startedAt, item.workout.completedAt);
  const plannedDurationMinutes = plannedSession
    ? Math.max(1, Math.round(plannedSession.workout.estimatedElapsedSeconds / 60))
    : undefined;
  const modifiedFromPlan = plannedSession
    ? workoutExerciseSignature(workout) !== workoutExerciseSignature(plannedSession.workout)
    : false;
  const rpe = validRpe(item.reflection?.rpe);
  const difficulty = item.feedback?.difficulty;
  const energyAfter = validEnergy(item.reflection?.energyAfter);
  const reasons: string[] = [];

  let completionKind: StrengthSessionResponseEvidence['completionKind'];
  if (completionFraction < 0.9) {
    completionKind = 'completed_partial';
    reasons.push(`Completed ${Math.round(completionFraction * 100)}% of the planned session.`);
  } else if (modifiedFromPlan) {
    completionKind = 'completed_modified';
    reasons.push('The completed exercise selection differed from the planned session.');
  } else {
    completionKind = 'completed_as_planned';
    reasons.push('Completed the planned session without an exercise substitution.');
  }

  if (difficulty === 'too_hard') reasons.push('The athlete rated the prescription too hard.');
  if (difficulty === 'too_easy') reasons.push('The athlete rated the prescription too easy.');
  if (difficulty === 'appropriate') reasons.push('The athlete rated the prescription about right.');
  if (rpe !== undefined) reasons.push(`Whole-session RPE was ${rpe}/10.`);
  if (energyAfter !== undefined) reasons.push(`Post-workout energy was ${energyAfter}/5.`);

  const response = classifyStrengthResponse({
    completionFraction,
    modifiedFromPlan,
    rpe,
    difficulty,
    energyAfter,
  });

  const progressionSignal: StrengthSessionResponseEvidence['progressionSignal'] =
    completionFraction < 0.75
      ? 'not_completed_as_planned'
      : completionFraction < 0.9 || modifiedFromPlan
        ? 'suppress'
        : 'completed_as_planned';

  return {
    workoutInstanceId: item.workout.id,
    plannedSessionId: item.workout.plannedSessionId,
    sessionTitle: plannedSession?.title ?? item.workout.name,
    occurredAt: item.occurredAt,
    completionKind,
    response,
    completionFraction,
    ...(plannedDurationMinutes !== undefined ? { plannedDurationMinutes } : {}),
    ...(actualDurationMinutes !== undefined ? { actualDurationMinutes } : {}),
    modifiedFromPlan,
    ...(rpe !== undefined ? { rpe } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    ...(energyAfter !== undefined ? { energyAfter } : {}),
    reasons,
    progressionSignal,
  };
}

export function classifyStrengthResponse({
  completionFraction,
  modifiedFromPlan,
  rpe,
  difficulty,
  energyAfter,
}: {
  completionFraction: number;
  modifiedFromPlan: boolean;
  rpe?: number;
  difficulty?: 'too_easy' | 'appropriate' | 'too_hard';
  energyAfter?: number;
}): SessionResponse {
  if (difficulty === 'too_hard' || (rpe !== undefined && rpe >= 9) || energyAfter === 1) {
    return 'poorly_tolerated';
  }
  if (completionFraction < 0.9) return 'under_completed';
  if (modifiedFromPlan) return 'tolerated_with_modification';
  if (
    difficulty === 'appropriate'
    || difficulty === 'too_easy'
    || (rpe !== undefined && rpe <= 7)
    || energyAfter === undefined
    || energyAfter >= 3
  ) {
    return 'well_tolerated';
  }
  return 'unknown';
}

export function summarizeStrengthAdaptation(
  appliedResponses: StrengthSessionResponseEvidence[],
  pendingResponses: StrengthSessionResponseEvidence[],
  skipped: SkippedStrengthEvidence[],
  healthOverride: StrengthAdaptationSummary['healthOverride'],
): StrengthAdaptationSummary {
  const latest = appliedResponses[0];
  const latestTwo = appliedResponses.slice(0, 2);
  const poorCount = latestTwo.filter((item) =>
    item.response === 'poorly_tolerated' || item.response === 'under_completed').length;
  const twoClean = latestTwo.length >= 2
    && latestTwo.every((item) => item.response === 'well_tolerated'
      && item.completionKind === 'completed_as_planned');
  const repeatedTooEasy = latestTwo.length >= 2
    && latestTwo.every((item) => item.difficulty === 'too_easy');

  let action: AdaptationAction = 'learning';
  let title = 'What Side Quest is learning';
  let body = 'There is not enough comparable completed strength evidence yet to change the dose.';
  let actionLabel = 'LEARNING';

  if (healthOverride === 'protect') {
    action = 'protect';
    title = 'Why strength is protected';
    body = 'A current training restriction overrides ordinary progression. Completed workouts still count, but the next dose stays protective while that restriction is active.';
    actionLabel = 'PROTECT';
  } else if (healthOverride === 'monitor') {
    action = 'hold';
    title = 'Why strength is holding';
    body = 'Current symptoms are being monitored, so Side Quest is not using otherwise positive workout evidence to increase strength dose right now.';
    actionLabel = 'HOLD';
  } else if (poorCount >= 2) {
    action = 'protect';
    title = 'Why strength is protected';
    body = 'Two recent planned strength responses were incomplete or harder than intended. Comparable dose should come down or stay protected before progression resumes.';
    actionLabel = 'PROTECT';
  } else if (
    latest?.response === 'poorly_tolerated'
    || latest?.response === 'under_completed'
    || latest?.response === 'tolerated_with_modification'
  ) {
    action = 'hold';
    title = 'Why strength is holding';
    body = latest.response === 'tolerated_with_modification'
      ? 'The latest planned strength workout was completed with an exercise substitution. It counts as training, but not as proof that the original prescription is ready to progress.'
      : 'The latest planned strength response was incomplete or harder than intended. Side Quest keeps comparable progression conservative until the response is clearer.';
    actionLabel = 'HOLD';
  } else if (twoClean || repeatedTooEasy) {
    action = 'progress_eligible';
    title = 'Why progression is available';
    body = repeatedTooEasy
      ? 'Two recent planned strength sessions were completed and rated too easy. Side Quest can use that repeated response as a progression signal when the rest of the week permits it.'
      : 'Two recent planned strength sessions were completed as prescribed and tolerated well. Normal progression is eligible when the rest of the training week permits it.';
    actionLabel = 'PROGRESS ELIGIBLE';
  } else if (latest?.response === 'well_tolerated') {
    action = 'learning';
    title = 'Why strength is staying steady';
    body = 'The latest planned session was tolerated well, but one response alone is not enough to force a progression. Side Quest is waiting for another comparable signal.';
    actionLabel = 'LEARNING';
  } else if (skipped.length > 0) {
    action = 'learning';
    title = 'Why a skip is not a failure signal';
    body = 'A skipped strength session is recorded as a scheduling fact, not evidence that the athlete could not tolerate the prescription. Progression waits for completed response evidence.';
    actionLabel = 'LEARNING';
  }

  const pendingNote = pendingResponses.length
    ? `${pendingResponses.length} strength response${pendingResponses.length === 1 ? '' : 's'} from this week ${pendingResponses.length === 1 ? 'is' : 'are'} queued for the next planning decision.`
    : undefined;

  return {
    action,
    actionLabel,
    title,
    body,
    evidenceCount: appliedResponses.length + skipped.length,
    pendingEvidenceCount: pendingResponses.length,
    appliedResponses,
    pendingResponses,
    skipped,
    healthOverride,
    ...(pendingNote ? { pendingNote } : {}),
  };
}


export function enduranceResponseKey(
  discipline: EnduranceDiscipline,
  occurredAt: string,
): string {
  return `${discipline}:${occurredAt}`;
}

export function enduranceResponseEvidence(
  item: EnduranceHistoryItem,
): EnduranceSessionResponseEvidence | null {
  if (item.plannedMatch?.status !== 'matched' || !item.plannedEvent) return null;
  const event = item.plannedEvent;
  if (!event.description?.includes('Side Quest generated ·')) return null;

  const discipline = enduranceDiscipline(item.activity.discipline);
  if (!discipline) return null;

  const plannedDurationMinutes = plannedEventDurationMinutes(event);
  if (!plannedDurationMinutes) return null;

  const actualDurationMinutes = Math.max(1, Math.round(item.activity.movingTimeSeconds / 60));
  const completionRatio = actualDurationMinutes / plannedDurationMinutes;
  const role = enduranceSessionRole(event.title, event.description ?? '', discipline);
  const plannedIntensity = plannedEventIntensity(event.description ?? '');
  const actualIntensity = enduranceActualIntensity(item.activity.intensity);
  const plannedDiscipline = enduranceDiscipline(event.discipline);
  const disciplineMismatch = Boolean(plannedDiscipline && plannedDiscipline !== discipline);
  const intensityMismatch = materialIntensityMismatch(plannedIntensity, actualIntensity, role);
  const durationOverrun = role === 'return_to_run'
    ? completionRatio > 1.10
    : role === 'support'
      ? completionRatio > 1.35
      : false;

  const athlete = item.response;
  const perceivedDifficulty = athlete?.perceivedDifficulty;
  const sessionRpe = validRpe(athlete?.sessionRpe);
  const symptomsDuring = athlete?.symptomsDuring;
  const symptomsAfter = athlete?.symptomsAfter;
  const nextDayStatus = athlete?.nextDayStatus;
  const athleteResponseRecorded = Boolean(athlete?.perceivedDifficulty)
    && athlete?.symptomsDuring !== undefined
    && athlete?.symptomsAfter !== undefined;
  const symptomSignal = symptomsDuring === true
    || symptomsAfter === true
    || nextDayStatus === 'worse';
  const tooHardSignal = perceivedDifficulty === 'too_hard'
    || (sessionRpe !== undefined && sessionRpe >= 9);

  const modifiedFromPlan = disciplineMismatch || intensityMismatch || durationOverrun;
  const reasons: string[] = [];

  let completionKind: EnduranceSessionResponseEvidence['completionKind'];
  if (completionRatio < 0.9) {
    completionKind = 'completed_partial';
    reasons.push(`Completed ${Math.round(completionRatio * 100)}% of the prescribed duration.`);
  } else if (modifiedFromPlan) {
    completionKind = 'completed_modified';
  } else {
    completionKind = 'completed_as_planned';
    reasons.push('Matched the planned session and completed the prescribed duration.');
  }

  if (disciplineMismatch) reasons.push('The matched activity used a different discipline than the planned session.');
  if (intensityMismatch) reasons.push('The recorded activity intensity materially differed from the planned intensity.');
  if (durationOverrun && role === 'return_to_run') {
    reasons.push('The return-to-run exposure exceeded the prescribed duration by more than 10%.');
  } else if (durationOverrun) {
    reasons.push('The support session materially exceeded its planned duration.');
  }
  if (!athleteResponseRecorded) reasons.push('Athlete response has not been captured yet.');
  if (perceivedDifficulty === 'too_hard') reasons.push('The athlete rated the session too hard.');
  if (perceivedDifficulty === 'too_easy') reasons.push('The athlete rated the session too easy.');
  if (perceivedDifficulty === 'about_right') reasons.push('The athlete rated the session about right.');
  if (sessionRpe !== undefined) reasons.push(`Whole-session RPE was ${sessionRpe}/10.`);
  if (symptomsDuring) reasons.push('Symptoms were reported during the session.');
  if (symptomsAfter) reasons.push('Symptoms were reported after the session.');
  if (nextDayStatus === 'worse') reasons.push('Symptoms or function were worse the next day.');
  if (nextDayStatus === 'same_or_better') reasons.push('Next-day status was the same or better.');

  let response: SessionResponse;
  if (symptomSignal) response = 'symptom_limited';
  else if (completionRatio < 0.9) response = 'under_completed';
  else if (modifiedFromPlan) response = 'tolerated_with_modification';
  else if (tooHardSignal) response = 'poorly_tolerated';
  else if (!athleteResponseRecorded) response = 'unknown';
  else if (role === 'return_to_run' && nextDayStatus !== 'same_or_better') response = 'unknown';
  else response = 'well_tolerated';

  let progressionSignal: EnduranceSessionResponseEvidence['progressionSignal'];
  if (role === 'support') {
    progressionSignal = 'suppress';
  } else if (role === 'return_to_run') {
    progressionSignal = completionRatio < 0.75 || symptomSignal
      ? 'not_completed_as_planned'
      : 'suppress';
  } else {
    progressionSignal = completionRatio < 0.75
      ? 'not_completed_as_planned'
      : completionRatio < 0.9
        || modifiedFromPlan
        || symptomSignal
        || tooHardSignal
        || !athleteResponseRecorded
          ? 'suppress'
          : 'completed_as_planned';
  }

  return {
    activityId: item.activity.id,
    plannedEventId: event.id,
    discipline,
    role,
    sessionTitle: event.title,
    occurredAt: item.occurredAt,
    completionKind,
    response,
    plannedDurationMinutes,
    actualDurationMinutes,
    completionRatio,
    ...(plannedIntensity ? { plannedIntensity } : {}),
    ...(actualIntensity ? { actualIntensity } : {}),
    modifiedFromPlan,
    athleteResponseRecorded,
    ...(perceivedDifficulty ? { perceivedDifficulty } : {}),
    ...(sessionRpe !== undefined ? { sessionRpe } : {}),
    ...(symptomsDuring !== undefined ? { symptomsDuring } : {}),
    ...(symptomsAfter !== undefined ? { symptomsAfter } : {}),
    ...(nextDayStatus ? { nextDayStatus } : {}),
    reasons,
    progressionSignal,
  };
}

export function summarizeEnduranceAdaptation(
  discipline: EnduranceDiscipline,
  appliedResponses: EnduranceSessionResponseEvidence[],
  pendingResponses: EnduranceSessionResponseEvidence[],
  healthOverride: 'none' | 'monitor' | 'protect',
): EnduranceAdaptationSummary {
  const label = disciplineLabel(discipline);
  const progressionBearing = appliedResponses
    .filter((item) => item.role !== 'support' && item.role !== 'return_to_run')
    .slice(0, 8);
  const latest = progressionBearing[0];
  const repeatedProblem = latestComparablePair(progressionBearing, (item) =>
    item.response === 'under_completed'
    || item.response === 'tolerated_with_modification'
    || item.response === 'poorly_tolerated'
    || item.response === 'symptom_limited');
  const repeatedClean = latestComparablePair(progressionBearing, (item) =>
    item.response === 'well_tolerated' && item.completionKind === 'completed_as_planned');
  const hasOnlySupport = appliedResponses.length > 0 && progressionBearing.length === 0;

  let action: AdaptationAction = 'learning';
  let actionLabel = 'LEARNING';
  let title = `What Side Quest is learning about ${label.toLowerCase()}`;
  let body = `There is not enough comparable completed ${label.toLowerCase()} evidence yet to change the next prescription.`;

  if (healthOverride === 'protect') {
    action = 'protect';
    actionLabel = 'PROTECT';
    title = `Why ${label.toLowerCase()} is protected`;
    body = 'A current training restriction overrides otherwise positive completion evidence. The session history still counts, but progression stays protective.';
  } else if (healthOverride === 'monitor') {
    action = 'hold';
    actionLabel = 'HOLD';
    title = `Why ${label.toLowerCase()} is holding`;
    body = 'Current symptoms are being monitored, so completed-session evidence is not being used to increase this discipline right now.';
  } else if (repeatedProblem) {
    action = 'protect';
    actionLabel = 'PROTECT';
    title = `Why ${label.toLowerCase()} is protected`;
    body = `Two recent comparable ${roleLabel(repeatedProblem.role).toLowerCase()} sessions were partial or materially modified. Side Quest suppresses progression from those responses until the intended dose is repeatable again.`;
  } else if (
    latest?.response === 'under_completed'
    || latest?.response === 'tolerated_with_modification'
    || latest?.response === 'poorly_tolerated'
    || latest?.response === 'symptom_limited'
  ) {
    action = 'hold';
    actionLabel = 'HOLD';
    title = `Why ${label.toLowerCase()} is holding`;
    body = latest.response === 'under_completed'
      ? `The latest progression-bearing ${label.toLowerCase()} session was shortened. It still counts as training load, but it does not justify increasing the next comparable dose.`
      : latest.response === 'poorly_tolerated'
        ? `The latest progression-bearing ${label.toLowerCase()} session was completed but felt harder than intended. Completion counts, but progression is suppressed until the response is repeatable.`
        : latest.response === 'symptom_limited'
          ? `Symptoms were reported around the latest progression-bearing ${label.toLowerCase()} session. Side Quest holds progression rather than interpreting completion as clean tolerance.`
          : `The latest progression-bearing ${label.toLowerCase()} session was materially different from the prescription. It counts as training, but not as clean evidence for progression.`;
  } else if (repeatedClean) {
    action = 'progress_eligible';
    actionLabel = 'PROGRESS ELIGIBLE';
    title = `Why ${label.toLowerCase()} progression is available`;
    body = `Two recent comparable ${roleLabel(repeatedClean.role).toLowerCase()} sessions matched the planned dose. Normal progression is eligible when the rest of the week permits it.`;
  } else if (latest?.response === 'well_tolerated') {
    action = 'learning';
    actionLabel = 'LEARNING';
    title = `Why ${label.toLowerCase()} is staying steady`;
    body = `The latest ${roleLabel(latest.role).toLowerCase()} session matched the prescription, but one clean response alone does not force an increase.`;
  } else if (hasOnlySupport) {
    action = 'learning';
    actionLabel = 'LEARNING';
    title = `Why easy ${label.toLowerCase()} does not drive progression`;
    body = `Easy/support ${label.toLowerCase()} sessions count toward continuity and total load, but Side Quest does not use them by themselves to unlock a harder or longer prescription.`;
  }

  const pendingNote = pendingResponses.length
    ? `${pendingResponses.length} ${label.toLowerCase()} response${pendingResponses.length === 1 ? '' : 's'} from this week ${pendingResponses.length === 1 ? 'is' : 'are'} queued for the next planning decision.`
    : undefined;

  return {
    discipline,
    scopeLabel: label,
    action,
    actionLabel,
    title,
    body,
    evidenceCount: appliedResponses.length,
    pendingEvidenceCount: pendingResponses.length,
    appliedResponses: appliedResponses.slice(0, 8),
    pendingResponses: pendingResponses.slice(0, 8),
    healthOverride,
    ...(pendingNote ? { pendingNote } : {}),
  };
}

export function summarizeReturnToRunAdaptation(
  appliedResponses: EnduranceSessionResponseEvidence[],
  pendingResponses: EnduranceSessionResponseEvidence[],
  healthOverride: 'none' | 'monitor' | 'protect',
  decisionCutoff: string,
): EnduranceAdaptationSummary {
  const ordered = appliedResponses
    .filter((item) => item.role === 'return_to_run')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 8);
  const latestThree = ordered.slice(0, 3);
  const cleared = latestThree.filter(isClearedReturnToRunResponse);
  const worseNextDay = latestThree.some((item) => item.nextDayStatus === 'worse');
  const symptomLimitedCount = latestThree.filter((item) => item.response === 'symptom_limited').length;
  const badCount = latestThree.filter((item) =>
    item.response === 'under_completed'
    || item.response === 'tolerated_with_modification'
    || item.response === 'poorly_tolerated'
    || item.response === 'symptom_limited').length;
  const threeClean = latestThree.length === 3
    && cleared.length === 3
    && returnToRunDatesAreSeparated(latestThree)
    && recentEnoughForRtrProgression(latestThree, decisionCutoff);

  let action: AdaptationAction = 'learning';
  let actionLabel = 'LEARNING';
  let title = 'Why return-to-run is staying steady';
  let body = 'Return-to-run progression waits for three separated prescribed exposures with no symptoms during or after and no next-day escalation. Duration progresses before speed.';

  if (healthOverride === 'protect') {
    action = 'protect';
    actionLabel = 'PROTECT';
    title = 'Why return-to-run is protected';
    body = 'A current symptom restriction overrides progression evidence. Side Quest keeps impact exposure protective until that restriction clears.';
  } else if (healthOverride === 'monitor') {
    action = 'hold';
    actionLabel = 'HOLD';
    title = 'Why return-to-run is holding';
    body = 'Current symptoms are being monitored, so Side Quest does not advance the return-to-run ladder even if recent sessions were completed.';
  } else if (worseNextDay) {
    action = 'protect';
    actionLabel = 'PROTECT';
    title = 'Why return-to-run is protected';
    body = 'A recent prescribed run was followed by worse next-day symptoms or function. Side Quest does not advance impact duration from that response.';
  } else if (symptomLimitedCount >= 2 || badCount >= 2) {
    action = 'protect';
    actionLabel = 'PROTECT';
    title = 'Why return-to-run is protected';
    body = 'At least two of the three most recent prescribed exposures were partial, modified, too hard, or symptom-limited. Impact progression stays protected.';
  } else if (badCount === 1) {
    action = 'hold';
    actionLabel = 'HOLD';
    title = 'Why return-to-run is holding';
    body = 'One of the three most recent prescribed exposures was partial, modified, too hard, or symptom-limited. Side Quest waits for a clean sequence before increasing impact duration.';
  } else if (threeClean) {
    action = 'progress_eligible';
    actionLabel = 'PROGRESS ELIGIBLE';
    title = 'Why return-to-run progression is available';
    body = 'Three recent, separated prescribed exposures were completed at the intended duration with no symptoms during or after and no next-day escalation. The next step may progress duration, not speed.';
  } else if (latestThree.length > 0) {
    action = 'learning';
    actionLabel = 'LEARNING';
    title = 'Why return-to-run is staying steady';
    body = `${cleared.length} of 3 recent prescribed exposures have complete symptom and next-day clearance. Side Quest does not advance the ladder early.`;
  }

  const pendingNote = pendingResponses.length
    ? `${pendingResponses.length} return-to-run response${pendingResponses.length === 1 ? '' : 's'} from this week ${pendingResponses.length === 1 ? 'is' : 'are'} queued for the next planning decision.`
    : undefined;

  return {
    discipline: 'run',
    scopeLabel: 'Return to run',
    action,
    actionLabel,
    title,
    body,
    evidenceCount: ordered.length,
    pendingEvidenceCount: pendingResponses.length,
    appliedResponses: ordered,
    pendingResponses: pendingResponses.slice(0, 8),
    healthOverride,
    ...(pendingNote ? { pendingNote } : {}),
  };
}

export function enduranceSessionRole(
  title: string,
  description: string,
  discipline: EnduranceDiscipline,
): EnduranceSessionRole {
  const text = `${title} ${description}`.toLowerCase();

  if (
    discipline === 'run'
    && /return[\s-]*to[\s-]*run|run\s*\/\s*walk|walk[\s-]*run|rtr\b/.test(text)
  ) return 'return_to_run';

  if (
    /long ride|long aerobic|long endurance|fueling practice|hills \+ rolling|rolling terrain|full rehearsal/.test(text)
    || (discipline === 'run' && /\blong\b/.test(text))
  ) return 'long';

  if (/vo2|threshold|tempo|over\s*\/\s*under|interval|quality|race pace|surges/.test(text)) {
    return 'quality';
  }

  if (
    /recovery|easy|support|cadence|technique|drill|leg flush|aerobic reset/.test(text)
  ) return 'support';

  return 'endurance';
}

export function buildEnduranceResponseRequests(
  history: TrainingHistoryItem[],
  asOf: string,
): EnduranceResponseRequest[] {
  const requests: EnduranceResponseRequest[] = [];

  for (const item of history) {
    if (item.kind !== 'endurance' || item.needsReview || item.activity.deletedAt) continue;
    if (item.plannedMatch?.status !== 'matched' || !item.plannedEvent) continue;
    if (!item.plannedEvent.description?.includes('Side Quest generated ·')) continue;

    const discipline = enduranceDiscipline(item.activity.discipline);
    if (!discipline) continue;
    const role = enduranceSessionRole(
      item.plannedEvent.title,
      item.plannedEvent.description ?? '',
      discipline,
    );
    const ageDays = instantDayDifference(item.occurredAt, asOf);
    if (!Number.isFinite(ageDays) || ageDays < 0) continue;

    if (!item.response) {
      if (ageDays <= 3) {
        requests.push({
          activityId: item.activity.id,
          plannedEventId: item.plannedEvent.id,
          discipline,
          role,
          sessionTitle: item.plannedEvent.title,
          occurredAt: item.occurredAt,
          stage: 'post_session',
        });
      }
      continue;
    }

    if (
      role === 'return_to_run'
      && item.response.nextDayStatus === undefined
      && isNextDayEligible(item.occurredAt, asOf)
      && ageDays <= 5
    ) {
      requests.push({
        activityId: item.activity.id,
        plannedEventId: item.plannedEvent.id,
        discipline,
        role,
        sessionTitle: item.plannedEvent.title,
        occurredAt: item.occurredAt,
        stage: 'next_day',
      });
    }
  }

  return requests.sort((left, right) => {
    if (left.stage !== right.stage) return left.stage === 'next_day' ? -1 : 1;
    return right.occurredAt.localeCompare(left.occurredAt);
  });
}

export function isClearedReturnToRunResponse(
  item: EnduranceSessionResponseEvidence,
): boolean {
  return item.role === 'return_to_run'
    && item.response === 'well_tolerated'
    && item.completionKind === 'completed_as_planned'
    && item.athleteResponseRecorded
    && item.symptomsDuring === false
    && item.symptomsAfter === false
    && item.nextDayStatus === 'same_or_better'
    && item.perceivedDifficulty !== 'too_hard'
    && (item.sessionRpe === undefined || item.sessionRpe <= 8);
}

function isNextDayEligible(occurredAt: string, asOf: string): boolean {
  const occurredDate = occurredAt.slice(0, 10);
  const asOfDate = asOf.slice(0, 10);
  return Boolean(occurredDate && asOfDate && asOfDate > occurredDate);
}

function choosePrimaryAdaptationSummary(
  candidates: Array<AdaptationHeadline & {
    label: string;
    evidenceCount: number;
    pendingEvidenceCount: number;
  }>,
): (AdaptationHeadline & { label: string }) | null {
  if (!candidates.length) return null;
  const actionScore: Record<AdaptationAction, number> = {
    protect: 40,
    hold: 30,
    progress_eligible: 20,
    learning: 10,
  };
  const labelScore: Record<string, number> = {
    RTR: 5,
    RUN: 4,
    BIKE: 3,
    STRENGTH: 2,
    SWIM: 1,
  };

  return [...candidates].sort((left, right) =>
    (actionScore[right.action] - actionScore[left.action])
    || (right.evidenceCount - left.evidenceCount)
    || (right.pendingEvidenceCount - left.pendingEvidenceCount)
    || ((labelScore[right.label] ?? 0) - (labelScore[left.label] ?? 0))
  )[0] ?? null;
}

function latestComparablePair(
  responses: EnduranceSessionResponseEvidence[],
  predicate: (item: EnduranceSessionResponseEvidence) => boolean,
): EnduranceSessionResponseEvidence | null {
  for (const role of ['quality', 'long', 'endurance'] as const) {
    const comparable = responses.filter((item) => item.role === role).slice(0, 2);
    if (comparable.length === 2 && comparable.every(predicate)) return comparable[0] ?? null;
  }
  return null;
}

function applyProgressionSignal(
  exposure: CompletedDisciplineExposure,
  signal: 'completed_as_planned' | 'not_completed_as_planned' | 'suppress',
): CompletedDisciplineExposure {
  if (signal === 'completed_as_planned') return { ...exposure, completedAsPlanned: true };
  if (signal === 'not_completed_as_planned') return { ...exposure, completedAsPlanned: false };
  return withoutCompletedAsPlanned(exposure);
}

function withoutCompletedAsPlanned(
  exposure: CompletedDisciplineExposure,
): CompletedDisciplineExposure {
  const { completedAsPlanned: _ignored, ...rest } = exposure;
  return rest;
}

function plannedEventDurationMinutes(
  event: EnduranceHistoryItem['plannedEvent'],
): number | undefined {
  if (!event) return undefined;
  const encoded = event.description?.match(/Side Quest generated · (\d+) min/i)?.[1];
  if (encoded) return Math.max(1, Number(encoded));
  if (!event.endAt) return undefined;
  return elapsedMinutes(event.startAt, event.endAt);
}

function plannedEventIntensity(
  description: string,
): 'easy' | 'moderate' | 'hard' | undefined {
  const encoded = description.match(/Side Quest generated · \d+ min · ([a-z_]+)/i)?.[1]?.toLowerCase();
  if (encoded === 'hard' || encoded === 'max') return 'hard';
  if (encoded === 'moderate') return 'moderate';
  if (encoded === 'easy' || encoded === 'recovery') return 'easy';
  return undefined;
}

function enduranceActualIntensity(
  value: EnduranceHistoryItem['activity']['intensity'],
): EnduranceSessionResponseEvidence['actualIntensity'] | undefined {
  if (
    value === 'recovery'
    || value === 'easy'
    || value === 'moderate'
    || value === 'hard'
    || value === 'race'
  ) return value;
  return undefined;
}

function materialIntensityMismatch(
  planned: EnduranceSessionResponseEvidence['plannedIntensity'] | undefined,
  actual: EnduranceSessionResponseEvidence['actualIntensity'] | undefined,
  role: EnduranceSessionRole,
): boolean {
  if (!actual) return false;
  if (role === 'return_to_run' && (actual === 'hard' || actual === 'race')) return true;
  if (!planned) return false;
  if (planned === 'hard' && (actual === 'easy' || actual === 'recovery')) return true;
  if (planned === 'moderate' && (actual === 'hard' || actual === 'race')) return true;
  if (planned === 'easy' && (actual === 'hard' || actual === 'race')) return true;
  return false;
}

function enduranceDiscipline(
  value: string | null | undefined,
): EnduranceDiscipline | null {
  if (value === 'swim' || value === 'bike' || value === 'run') return value;
  return null;
}

function disciplineLabel(discipline: EnduranceDiscipline): string {
  if (discipline === 'bike') return 'Bike';
  if (discipline === 'run') return 'Run';
  return 'Swim';
}

function roleLabel(role: EnduranceSessionRole): string {
  if (role === 'quality') return 'Quality';
  if (role === 'long') return 'Long-duration';
  if (role === 'return_to_run') return 'Return-to-run';
  if (role === 'support') return 'Support';
  return 'Endurance';
}

function returnToRunDatesAreSeparated(
  responses: EnduranceSessionResponseEvidence[],
): boolean {
  const dates = [...new Set(responses.map((item) => item.occurredAt.slice(0, 10)))].sort();
  if (dates.length !== 3) return false;
  return dates.slice(1).every((date, index) =>
    calendarDayDifference(dates[index]!, date) >= 2);
}

function recentEnoughForRtrProgression(
  responses: EnduranceSessionResponseEvidence[],
  decisionCutoff: string,
): boolean {
  const sorted = [...responses].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const newest = sorted[0];
  const oldest = sorted.at(-1);
  if (!newest || !oldest) return false;
  const spanDays = instantDayDifference(oldest.occurredAt, newest.occurredAt);
  const daysSinceNewest = instantDayDifference(newest.occurredAt, decisionCutoff);
  return spanDays <= 10 && daysSinceNewest <= 4;
}

function calendarDayDifference(left: string, right: string): number {
  const a = Date.parse(`${left}T12:00:00.000Z`);
  const b = Date.parse(`${right}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function instantDayDifference(left: string, right: string): number {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return Number.POSITIVE_INFINITY;
  return (b - a) / 86_400_000;
}

function activeHealthOverride(
  checkIn: TrainingCheckIn | null | undefined,
): StrengthAdaptationSummary['healthOverride'] {
  if (!checkIn) return 'none';
  if (checkIn.status === 'unable_to_train') return 'protect';
  if (checkIn.status === 'tightness_pain') {
    return (checkIn.severity ?? 0) >= 4 ? 'protect' : 'monitor';
  }
  return 'none';
}

function workoutExerciseSignature(
  workout: NonNullable<StrengthHistoryItem['workout']['workout']>,
): string {
  return workout.stations
    .flatMap((station) => station.exercises.map((exercise) => exercise.exerciseId))
    .join('|');
}

function elapsedMinutes(startAt: string, endAt: string): number | undefined {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return Math.max(1, Math.round((end - start) / 60_000));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function validRpe(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 1 || value > 10) return undefined;
  return value;
}

function validEnergy(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 1 || value > 5) return undefined;
  return value;
}
