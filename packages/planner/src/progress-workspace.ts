import type {
  ProgressHistoryItem,
  ProgressImprovement,
  ProgressMilestone,
  ProgressMovementTrend,
  ProgressRegionalStatus,
  ProgressTrainingBalance,
  ProgressWorkspaceModel,
} from '@circuit/domain';

export interface BuildProgressWorkspaceInput {
  headline?: string;
  interpretation?: string;
  regionalStatus?: ProgressRegionalStatus[];
  improvements?: ProgressImprovement[];
  movementTrends?: ProgressMovementTrend[];
  trainingBalance?: Partial<ProgressTrainingBalance>;
  recentHistory?: ProgressHistoryItem[];
  milestones?: ProgressMilestone[];
}

const emptyBalance = (): ProgressTrainingBalance => ({
  summary: 'Keep training normally while Side Quest learns what is changing.',
  substantialStimulus: [],
  maintained: [],
  opportunities: [],
  nextEmphasis: [],
});

export function buildProgressWorkspace(input: BuildProgressWorkspaceInput = {}): ProgressWorkspaceModel {
  return {
    headline: input.headline?.trim() || 'Your training is taking shape',
    interpretation:
      input.interpretation?.trim() ||
      'Complete a few sessions to see regional status, concrete improvements, and useful progression guidance.',
    regionalStatus: dedupeBy(input.regionalStatus ?? [], (item) => item.regionId).slice(0, 12),
    improvements: dedupeBy(input.improvements ?? [], (item) => item.improvementId).slice(0, 6),
    movementTrends: dedupeBy(input.movementTrends ?? [], (item) => item.movementId).slice(0, 8),
    trainingBalance: { ...emptyBalance(), ...input.trainingBalance },
    recentHistory: dedupeBy(input.recentHistory ?? [], (item) => item.workoutId).slice(0, 8),
    milestones: dedupeBy(input.milestones ?? [], (item) => item.milestoneId).slice(0, 4),
  };
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function progressPrimaryMessage(model: ProgressWorkspaceModel): string {
  const review = model.regionalStatus.find((region) => region.state === 'review_symptoms');
  if (review) return `${review.regionLabel}: ${review.interpretation}`;
  const recover = model.regionalStatus.find((region) => region.state === 'recover_before_loading');
  if (recover) return `${recover.regionLabel}: ${recover.interpretation}`;
  return model.improvements[0]?.explanation ?? model.interpretation;
}

export function repeatableProgressWorkouts(model: ProgressWorkspaceModel): ProgressHistoryItem[] {
  return model.recentHistory.filter((workout) => workout.canRepeat && workout.status !== 'stopped');
}

export function progressEmptyState(model: ProgressWorkspaceModel): string | undefined {
  const hasEvidence =
    model.regionalStatus.length > 0 ||
    model.improvements.length > 0 ||
    model.movementTrends.some((trend) => trend.evidenceCount > 0) ||
    model.recentHistory.length > 0;
  if (hasEvidence) return undefined;
  return 'Complete your first Side Quest to start building a useful training picture.';
}

export function assertProgressWorkspace(model: ProgressWorkspaceModel): void {
  if (!model.headline.trim()) throw new Error('Progress requires a headline.');
  if (!model.interpretation.trim()) throw new Error('Progress requires an interpretation.');
  for (const region of model.regionalStatus) {
    if (!region.regionLabel.trim() || !region.interpretation.trim()) {
      throw new Error(`Progress region ${region.regionId} requires a label and interpretation.`);
    }
  }
  for (const improvement of model.improvements) {
    if (!improvement.title.trim() || !improvement.explanation.trim()) {
      throw new Error(`Progress improvement ${improvement.improvementId} requires direct evidence.`);
    }
  }
  for (const trend of model.movementTrends) {
    if (trend.evidenceCount < 0 || !Number.isInteger(trend.evidenceCount)) {
      throw new Error(`Progress trend ${trend.movementId} has an invalid evidence count.`);
    }
    if (!trend.summary.trim()) throw new Error(`Progress trend ${trend.movementId} requires a summary.`);
  }
  for (const workout of model.recentHistory) {
    if (workout.durationMinutes < 0 || !Number.isFinite(workout.durationMinutes)) {
      throw new Error(`Progress history ${workout.workoutId} has an invalid duration.`);
    }
  }
}
