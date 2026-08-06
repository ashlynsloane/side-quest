import type {
  ActiveWorkoutDraft,
  MobilePreWorkoutEditorModel,
  MobileRestLoggingModel,
  MobileWorkoutCompletionModel,
  WorkoutRoundLog,
  WorkoutShareCard,
  CompletedWorkoutSummary,
} from '@circuit/domain';

function targetLabel(exercise: ActiveWorkoutDraft['stations'][number]['exercises'][number]): string {
  if (exercise.targetSeconds != null) return `${exercise.targetSeconds} sec`;
  if (exercise.targetReps != null) return exercise.sideMode === 'per_side' ? `${exercise.targetReps}/side` : `${exercise.targetReps} reps`;
  return 'Open target';
}

export function buildMobilePreWorkoutEditor(draft: ActiveWorkoutDraft): MobilePreWorkoutEditorModel {
  if (draft.status !== 'draft') throw new Error('Only a draft workout can be edited before starting.');
  return {
    workoutId: draft.workoutId,
    title: draft.title,
    totalPlannedMinutes: draft.stations.reduce((total, station) => total + station.durationMinutes, 0),
    stationCount: draft.stations.length,
    stations: draft.stations
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((station) => ({
        stationId: station.stationId,
        title: station.title,
        durationMinutes: station.durationMinutes,
        exerciseCount: station.exercises.length,
        editable: true,
      })),
    canAddFinisher: true,
    startLabel: 'Start workout',
  };
}

export function buildMobileRestLoggingModel(
  draft: ActiveWorkoutDraft,
  roundLog: WorkoutRoundLog,
): MobileRestLoggingModel {
  const station = draft.stations.find((candidate) => candidate.stationId === roundLog.stationId);
  if (!station) throw new Error('The rest log station does not exist in the workout.');
  return {
    workoutId: draft.workoutId,
    stationId: station.stationId,
    roundNumber: roundLog.roundNumber,
    exerciseRows: station.exercises.map((exercise) => {
      const entry = roundLog.exerciseEntries.find((candidate) => candidate.exerciseId === exercise.exerciseId);
      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        targetLabel: targetLabel(exercise),
        completedReps: entry?.completedReps,
        completedSeconds: entry?.completedSeconds,
        load: entry?.load,
        loadUnit: entry?.loadUnit ?? exercise.loadUnit,
      };
    }),
    saveLabel: 'Save round',
  };
}

export function buildMobileWorkoutCompletionModel(
  summary: CompletedWorkoutSummary,
  shareCard: WorkoutShareCard,
): MobileWorkoutCompletionModel {
  if (summary.workoutId !== shareCard.workoutId) throw new Error('The share card and workout summary must match.');
  return {
    summary,
    shareCard,
    actions: ['favorite', 'rename', 'share', 'done'],
    weightsShared: shareCard.weightsIncluded,
  };
}
