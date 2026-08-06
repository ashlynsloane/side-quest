import type { CompletedWorkoutSummary, WorkoutShareCard } from '@circuit/domain';

export interface WorkoutCompletionCardModel {
  eyebrow: string;
  title: string;
  detail: string;
  facts: string[];
  frontMuscles: string[];
  backMuscles: string[];
  actions: Array<'favorite' | 'rename' | 'share' | 'done'>;
}

export function buildWorkoutCompletionCard(summary: CompletedWorkoutSummary): WorkoutCompletionCardModel {
  return {
    eyebrow: 'Quest complete',
    title: summary.displayName,
    detail: summary.athleteNote ?? 'Workout saved to your training history.',
    facts: [`${summary.actualMinutes} min`, `${summary.completedRoundLogs} rounds`],
    frontMuscles: summary.muscleRegions.filter((region) => region.view === 'front').map((region) => region.label),
    backMuscles: summary.muscleRegions.filter((region) => region.view === 'back').map((region) => region.label),
    actions: ['favorite', 'rename', 'share', 'done'],
  };
}

export function buildWorkoutSharePreview(card: WorkoutShareCard): {
  title: string;
  subtitle: string;
  chips: string[];
  privacyNote: string;
  canPublish: boolean;
} {
  return {
    title: card.displayName,
    subtitle: card.subtitle,
    chips: [...card.facts, ...card.muscleRegions.map((region) => region.label)],
    privacyNote: card.privacySummary,
    canPublish: card.audience !== 'private',
  };
}
