/**
 * Daily training ceilings are decision-support policies, not medical clearance.
 * Planned and performed activities are deliberately represented separately.
 */
export type TrainingRegion = 'achilles' | 'upper_back' | 'general';
export type TrainingDecision = 'allow' | 'modify' | 'defer' | 'stop';
export type RecoveryStatus = 'stable' | 'uncertain' | 'worse' | 'red_flag';

export interface ActivityDose {
  activity: string;
  sessionId?: string;
  minutes?: number;
  sets?: number;
  regions: TrainingRegion[];
}

export interface DailyTrainingCeiling {
  date: string;
  planned: ActivityDose[];
  recovery: Partial<Record<TrainingRegion, RecoveryStatus>>;
  /** Timestamp of the athlete's last explicit response for each affected region. */
  recoveryObservedAt?: Partial<Record<TrainingRegion, string>>;
  /** Requires a new prescription before unplanned exercise can be added. */
  restrictUnplanned: boolean;
  /** A current explicit no-training check-in blocks starts and cannot be overridden. */
  pauseTraining?: boolean;
}

export interface ProposedActivity extends ActivityDose {
  /** True only for an explicitly scheduled exposure. */
  scheduled: boolean;
}

export interface TrainingGuardrailResult {
  decision: TrainingDecision;
  reasons: string[];
  requiresReassessment: boolean;
  /** False means the app requires rechecking or changing the plan, not a text-only exception. */
  overrideAllowed?: boolean;
}

export function evaluateTrainingAddition(
  ceiling: DailyTrainingCeiling,
  proposed: ProposedActivity,
  history: readonly TrainingEvent[] = [],
): TrainingGuardrailResult {
  const validRegions = new Set<TrainingRegion>(['general', 'achilles', 'upper_back']);
  const validStatuses = new Set<RecoveryStatus>(['stable', 'uncertain', 'worse', 'red_flag']);
  const validDose = (dose: ActivityDose, permitZero = false) => Boolean(
    dose && typeof dose.activity === 'string' && dose.activity.trim()
    && Array.isArray(dose.regions) && dose.regions.length > 0
    && dose.regions.every((region) => validRegions.has(region))
    && [dose.minutes, dose.sets].every((value) =>
      value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0))
    && (permitZero || (dose.minutes ?? 0) > 0 || (dose.sets ?? 0) > 0)
    && (dose.minutes !== undefined || dose.sets !== undefined)
  );
  if (!ceiling || !Array.isArray(ceiling.planned)
      || typeof ceiling.restrictUnplanned !== 'boolean'
      || !ceiling.recovery || typeof ceiling.recovery !== 'object'
      || Object.values(ceiling.recovery).some((status) => !validStatuses.has(status))
      || ceiling.planned.some((dose) => !validDose(dose))) {
    return {
      decision: 'stop',
      reasons: ['Training ceiling is incomplete or corrupted. Rebuild the plan before authorizing activity.'],
      requiresReassessment: true,
    };
  }
  if (!validDose(proposed)) {
    return {
      decision: 'stop',
      reasons: ['Activity dose or affected regions are missing or invalid.'],
      requiresReassessment: true,
    };
  }
  if (!proposed.activity.trim() || !proposed.regions.length ||
      [proposed.minutes, proposed.sets].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    return { decision: 'stop', reasons: ['Invalid activity dose or missing affected regions.'], requiresReassessment: true };
  }
  if (ceiling.pauseTraining) {
    return {
      decision: 'stop',
      reasons: ['An active check-in pauses training. Update the restriction before starting a workout.'],
      requiresReassessment: true,
    };
  }
  const matchingPlan = ceiling.planned.find((item) =>
    item.activity === proposed.activity && (!item.sessionId || item.sessionId === proposed.sessionId));
  const regions = [...new Set<TrainingRegion>([
    ...proposed.regions,
    ...(matchingPlan?.regions ?? []),
    'general',
  ])];
  if (regions.some((region) => ceiling.recovery[region] === 'red_flag')) {
    return {
      decision: 'stop',
      reasons: ['A reported red flag requires clinical assessment rather than additional training.'],
      requiresReassessment: true,
    };
  }
  if (regions.some((region) => ceiling.recovery[region] === 'worse')) {
    return {
      decision: 'defer',
      reasons: ['Symptoms worsened in a region loaded by this activity. Reassess before proceeding.'],
      requiresReassessment: true,
      overrideAllowed: false,
    };
  }
  if (regions.some((region) => !ceiling.recovery[region] || ceiling.recovery[region] === 'uncertain')) {
    return {
      decision: 'defer',
      reasons: ['Recovery is not confirmed for every affected region; missing data is not clearance.'],
      requiresReassessment: true,
      overrideAllowed: false,
    };
  }
  const retractedIds = new Set(history.filter((event) => event.kind === 'retracted')
    .map((event) => event.retractsEventId).filter((id): id is string => Boolean(id)));
  if (history.some((event) => (event.kind === 'completed' || event.kind === 'unplanned')
      && !retractedIds.has(event.id)
      && (event.trainingDate ?? event.occurredAt.slice(0, 10)) === ceiling.date
      && (!event.activity || !validDose(event.activity, true)))) {
    return {
      decision: 'stop',
      reasons: ['Completed-workout history contains an invalid exposure. Correct the training log first.'],
      requiresReassessment: true,
    };
  }
  const performedToday = history.filter((event) =>
    !retractedIds.has(event.id)
    && (event.kind === 'completed' || event.kind === 'unplanned')
    && (event.trainingDate ?? event.occurredAt.slice(0, 10)) === ceiling.date
    && !!event.activity
  );
  // The last recovery observation must come AFTER the last recorded exposure
  // to that region; otherwise feeling good before a workout could unlock more.
  for (const region of regions) {
    const observed = ceiling.recoveryObservedAt?.[region];
    const laterExposure = performedToday.some((event) =>
      (event.activity?.regions.includes(region) || region === 'general') &&
      (!observed || !Number.isFinite(Date.parse(observed)) ||
       Date.parse(event.occurredAt) > Date.parse(observed))
    );
    if (laterExposure) {
      return {
        decision: 'defer',
        reasons: [`A ${region.replaceAll('_', ' ')} recovery check is required after the latest completed training exposure.`],
        requiresReassessment: true,
        overrideAllowed: false,
      };
    }
  }
  const planned = matchingPlan;
  if (!proposed.scheduled || !planned) {
    const alreadyLoadedToday = hasRecordedTrainingLoadOnDate(history, ceiling.date);
    return {
      decision: ceiling.restrictUnplanned ? 'defer' : 'modify',
      reasons: [alreadyLoadedToday && ceiling.restrictUnplanned
        ? 'Additional unscheduled training after a completed exposure requires a new prescription, not just an exception.'
        : 'Feeling energetic does not automatically authorize additional training. Request a plan adjustment.'],
      requiresReassessment: true,
      overrideAllowed: !(alreadyLoadedToday && ceiling.restrictUnplanned),
    };
  }
  if (proposed.regions.some((region) => !planned.regions.includes(region))) {
    return { decision: 'defer', reasons: ['Proposed activity loads regions not covered by its prescription.'], requiresReassessment: true, overrideAllowed: false };
  }
  if ((proposed.minutes !== undefined && planned.minutes === undefined) ||
      (proposed.sets !== undefined && planned.sets === undefined)) {
    return { decision: 'modify', reasons: ['This dose dimension was not prescribed.'], requiresReassessment: true, overrideAllowed: false };
  }
  if (
    (proposed.minutes ?? 0) > (planned.minutes ?? 0) ||
    (proposed.sets ?? 0) > (planned.sets ?? 0)
  ) {
    return {
      decision: 'modify',
      reasons: ['Proposed activity exceeds the prescribed ceiling. Use the planned dose.'],
      requiresReassessment: false,
      overrideAllowed: false,
    };
  }
  const performed = performedToday.filter((event) =>
    event.activity?.activity === proposed.activity
  );
  // A saved session cannot be started twice merely because it used fewer
  // minutes than prescribed. Continuing requires a new explicit decision.
  if (planned.sessionId && performed.some((event) =>
    event.activity?.sessionId === planned.sessionId
  )) {
    return {
      decision: 'defer',
      reasons: ['This planned session already has completed activity recorded. Review its recovery before starting it again.'],
      requiresReassessment: true,
      overrideAllowed: false,
    };
  }
  const usedMinutes = performed.reduce((sum, event) => sum + (event.activity?.minutes ?? 0), 0);
  const usedSets = performed.reduce((sum, event) => sum + (event.activity?.sets ?? 0), 0);
  // Per-session bounds are checked above; the remaining daily budget includes
  // *all* logged exposures of the same activity, including unscheduled ones.
  const dailyPlans = ceiling.planned.filter((item) => item.activity === proposed.activity);
  const dailyMinuteLimit = dailyPlans.every((item) => item.minutes !== undefined)
    ? dailyPlans.reduce((sum, item) => sum + (item.minutes ?? 0), 0)
    : Infinity;
  const dailySetLimit = dailyPlans.every((item) => item.sets !== undefined)
    ? dailyPlans.reduce((sum, item) => sum + (item.sets ?? 0), 0)
    : Infinity;
  if (usedMinutes >= dailyMinuteLimit || usedSets >= dailySetLimit) {
    return { decision: 'defer', reasons: ['The prescribed activity ceiling has already been reached today.'], requiresReassessment: true };
  }
  if ((dailyMinuteLimit !== Infinity && (proposed.minutes ?? 0) + usedMinutes > dailyMinuteLimit) ||
      (dailySetLimit !== Infinity && (proposed.sets ?? 0) + usedSets > dailySetLimit)) {
    return { decision: 'modify', reasons: ["Previously completed training uses part of today's budget. Reduce the proposed dose."], requiresReassessment: false, overrideAllowed: false };
  }
  return { decision: 'allow', reasons: ['Within the remaining planned dose and reported recovery constraints.'], requiresReassessment: false };
}

/**
 * Shared definition of performed loading for callers with and without a
 * daily prescription. Retracted events cannot reactivate a spent budget.
 */
export function hasRecordedTrainingLoadOnDate(
  history: readonly TrainingEvent[], date: string,
): boolean {
  const retracted = new Set(history.filter((event) => event.kind === 'retracted')
    .map((event) => event.retractsEventId));
  return history.some((event) =>
    (event.kind === 'completed' || event.kind === 'unplanned')
    && !retracted.has(event.id)
    && (event.trainingDate ?? event.occurredAt.slice(0, 10)) === date
    && ((event.activity?.minutes ?? 0) > 0 || (event.activity?.sets ?? 0) > 0)
  );
}

/** Append-only facts; prescriptions are never automatically logged as completed. */
export interface TrainingEvent {
  id: string;
  occurredAt: string;
  trainingDate?: string;
  kind: 'prescribed' | 'completed' | 'unplanned' | 'override' | 'recovery' | 'assessment' | 'retracted' | 'urge';
  /** Reference to a previously recorded activity event that no longer counts. */
  retractsEventId?: string;
  /** Stable source workout ledger ID for revision and deletion reconciliation. */
  sourceId?: string;
  activity?: ActivityDose;
  note?: string;
}

export function appendTrainingEvent(
  history: readonly TrainingEvent[],
  event: TrainingEvent,
): TrainingEvent[] {
  if (history.some((existing) => existing.id === event.id)) {
    throw new Error('Training event IDs must be unique');
  }
  return [...history, { ...event, activity: event.activity ? { ...event.activity, regions: [...event.activity.regions] } : undefined }];
}

export function completedActivities(history: readonly TrainingEvent[]): ActivityDose[] {
  const retractedIds = new Set(history.filter((event) => event.kind === 'retracted')
    .map((event) => event.retractsEventId).filter((id): id is string => Boolean(id)));
  return history.filter((event) => event.kind === 'completed' && event.activity && !retractedIds.has(event.id))
    .map((event) => event.activity as ActivityDose);
}

/**
 * A newly edited calendar must not silently increase an existing daily budget.
 * Retain previously approved session IDs only while they still belong to this
 * day; lower doses apply immediately, but higher doses require an explicit
 * new plan review. Completed planned sessions remain in the budget baseline
 * so their historical load is still counted against today's total.
 */
export function reconcileDailyCeilingPlan(
  previous: DailyTrainingCeiling,
  currentSessions: readonly ActivityDose[],
): DailyTrainingCeiling {
  const planned = previous.planned.flatMap((original) => {
    const current = currentSessions.find((item) =>
      item.activity === original.activity &&
      !!item.sessionId && item.sessionId === original.sessionId
    );
    if (!current) return [];
    return [{
      ...original,
      minutes: original.minutes === undefined ? current.minutes
        : current.minutes === undefined ? original.minutes
          : Math.min(original.minutes, current.minutes),
      sets: original.sets === undefined ? current.sets
        : current.sets === undefined ? original.sets
          : Math.min(original.sets, current.sets),
      regions: [...new Set<TrainingRegion>([...original.regions, ...current.regions])],
    }];
  });
  return { ...previous, planned };
}
