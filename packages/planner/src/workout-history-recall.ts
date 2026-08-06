import type {
  ActiveWorkoutDraft,
  WorkoutHistoryFilter,
  WorkoutHistoryRecord,
  WorkoutProgressionRecommendation,
  WorkoutRecallRequest,
} from '@circuit/domain';

export function filterWorkoutHistory(
  records: WorkoutHistoryRecord[],
  filter: WorkoutHistoryFilter,
): WorkoutHistoryRecord[] {
  const query = filter.query?.trim().toLowerCase();
  return records
    .filter((record) => !query || record.displayName.toLowerCase().includes(query))
    .filter((record) => !filter.collection || record.collections.includes(filter.collection))
    .filter((record) => !filter.favoriteOnly || record.favorite)
    .filter((record) => filter.minimumDurationMinutes == null || record.durationMinutes >= filter.minimumDurationMinutes)
    .filter((record) => filter.maximumDurationMinutes == null || record.durationMinutes <= filter.maximumDurationMinutes)
    .filter((record) => !filter.completedAfter || record.completedAt >= filter.completedAfter)
    .filter((record) => !filter.completedBefore || record.completedAt <= filter.completedBefore)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function recommendWorkoutProgression(
  record: WorkoutHistoryRecord,
  recentMatches: WorkoutHistoryRecord[],
): WorkoutProgressionRecommendation {
  const successful = recentMatches.filter((item) => (item.perceivedExertion ?? 7) <= 8).length;
  if (successful < 2 || (record.perceivedExertion ?? 7) > 8) {
    return {
      workoutId: record.workoutId,
      kind: 'none',
      rationale: 'Repeat the current prescription before progressing.',
      eligible: false,
      confidence: 'moderate',
    };
  }
  return {
    workoutId: record.workoutId,
    kind: 'reps',
    rationale: 'Multiple successful completions support a small repetition increase.',
    eligible: true,
    confidence: successful >= 3 ? 'high' : 'moderate',
    targetDelta: 1,
  };
}

export function recallWorkout(
  record: WorkoutHistoryRecord,
  request: WorkoutRecallRequest,
): ActiveWorkoutDraft {
  if (record.historyId !== request.historyId) throw new Error('Workout history record mismatch.');
  const source = request.mode === 'exact' ? record.completedDraft : record.originalDraft;
  return structuredClone(source);
}
