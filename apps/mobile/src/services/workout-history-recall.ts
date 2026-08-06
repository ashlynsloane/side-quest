import type { WorkoutHistoryRecord, WorkoutProgressionRecommendation } from '@circuit/domain';

export interface WorkoutHistoryCardModel {
  id: string;
  title: string;
  subtitle: string;
  favorite: boolean;
  badges: string[];
  progression?: WorkoutProgressionRecommendation;
}

export function buildWorkoutHistoryCard(
  record: WorkoutHistoryRecord,
  progression?: WorkoutProgressionRecommendation,
): WorkoutHistoryCardModel {
  return {
    id: record.historyId,
    title: record.displayName,
    subtitle: `${record.durationMinutes} min · ${new Date(record.completedAt).toLocaleDateString()}`,
    favorite: record.favorite,
    badges: record.collections.slice(0, 3).map((value) => value.replaceAll('_', ' ')),
    progression,
  };
}
