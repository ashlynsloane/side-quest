/**
 * Daily training ceilings are decision-support policies, not medical clearance.
 * Planned and performed activities are deliberately represented separately.
 */
export type TrainingRegion = 'achilles' | 'upper_back' | 'general';
export type TrainingDecision = 'allow' | 'modify' | 'defer' | 'stop';
export type RecoveryStatus = 'stable' | 'uncertain' | 'worse' | 'red_flag';

export interface ActivityDose {
  activity: string;
  minutes?: number;
  sets?: number;
  regions: TrainingRegion[];
}

export interface DailyTrainingCeiling {
  date: string;
  planned: ActivityDose[];
  recovery: Partial<Record<TrainingRegion, RecoveryStatus>>;
  /** Requires a new prescription before unplanned exercise can be added. */
  restrictUnplanned: boolean;
}

export interface ProposedActivity extends ActivityDose {
  /** True only for an explicitly scheduled exposure. */
  scheduled: boolean;
}

export interface TrainingGuardrailResult {
  decision: TrainingDecision;
  reasons: string[];
  requiresReassessment: boolean;
}

export function evaluateTrainingAddition(
  ceiling: DailyTrainingCeiling,
  proposed: ProposedActivity,
): TrainingGuardrailResult {
  if (!proposed.activity.trim() || !proposed.regions.length ||
      [proposed.minutes, proposed.sets].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    return { decision: 'stop', reasons: ['Invalid activity dose or missing affected regions.'], requiresReassessment: true };
  }
  const regions = [...new Set<TrainingRegion>([...proposed.regions, 'general'])];
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
    };
  }
  if (regions.some((region) => !ceiling.recovery[region] || ceiling.recovery[region] === 'uncertain')) {
    return {
      decision: 'defer',
      reasons: ['Recovery is not confirmed for every affected region; missing data is not clearance.'],
      requiresReassessment: true,
    };
  }
  const planned = ceiling.planned.find((item) => item.activity === proposed.activity);
  if (!proposed.scheduled || !planned) {
    return {
      decision: ceiling.restrictUnplanned ? 'defer' : 'modify',
      reasons: ['Feeling energetic does not automatically authorize additional training. Request a plan adjustment.'],
      requiresReassessment: true,
    };
  }
  if (proposed.regions.some((region) => !planned.regions.includes(region))) {
    return { decision: 'defer', reasons: ['Proposed activity loads regions not covered by its prescription.'], requiresReassessment: true };
  }
  if ((proposed.minutes !== undefined && planned.minutes === undefined) ||
      (proposed.sets !== undefined && planned.sets === undefined)) {
    return { decision: 'modify', reasons: ['This dose dimension was not prescribed.'], requiresReassessment: true };
  }
  if (
    (proposed.minutes ?? 0) > (planned.minutes ?? 0) ||
    (proposed.sets ?? 0) > (planned.sets ?? 0)
  ) {
    return {
      decision: 'modify',
      reasons: ['Proposed activity exceeds the prescribed ceiling. Use the planned dose.'],
      requiresReassessment: false,
    };
  }
  return { decision: 'allow', reasons: ['Within the planned dose and reported recovery constraints.'], requiresReassessment: false };
}

/** Append-only facts; prescriptions are never automatically logged as completed. */
export interface TrainingEvent {
  id: string;
  occurredAt: string;
  kind: 'prescribed' | 'completed' | 'unplanned' | 'override' | 'recovery';
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
  return history.filter((event) => event.kind === 'completed' && event.activity)
    .map((event) => event.activity as ActivityDose);
}
