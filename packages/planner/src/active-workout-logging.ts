import type {
  ActiveWorkoutDraft,
  ActiveWorkoutEdit,
  ActiveWorkoutExercise,
  ActiveWorkoutProgress,
  ExercisePerformanceEntry,
  WorkoutRoundLog,
} from '@circuit/domain';

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
}

export function editActiveWorkoutBeforeStart(
  draft: ActiveWorkoutDraft,
  edits: ActiveWorkoutEdit[],
): ActiveWorkoutDraft {
  if (draft.status !== 'draft') throw new Error('A workout can only be structurally edited before it starts.');

  const stations = draft.stations.map((station) => {
    const stationEdits = edits.filter((edit) => edit.stationId === station.stationId);
    const durationEdit = stationEdits.find((edit) => edit.durationMinutes !== undefined);
    if (durationEdit?.durationMinutes !== undefined) assertPositiveInteger(durationEdit.durationMinutes, 'Station duration');

    const exercises = station.exercises.map((exercise) => {
      const edit = stationEdits.find((candidate) => candidate.exerciseId === exercise.exerciseId);
      if (!edit) return exercise;
      if (edit.targetReps !== undefined) assertPositiveInteger(edit.targetReps, 'Target reps');
      if (edit.targetSeconds !== undefined) assertPositiveInteger(edit.targetSeconds, 'Target seconds');
      return {
        ...exercise,
        targetReps: edit.targetReps ?? exercise.targetReps,
        targetSeconds: edit.targetSeconds ?? exercise.targetSeconds,
      };
    });

    return {
      ...station,
      durationMinutes: durationEdit?.durationMinutes ?? station.durationMinutes,
      exercises,
    };
  });

  return { ...draft, stations, editedBeforeStart: edits.length > 0 };
}

export function addOptionalExerciseBeforeStart(
  draft: ActiveWorkoutDraft,
  stationId: string,
  exercise: Omit<ActiveWorkoutExercise, 'optional' | 'order'>,
): ActiveWorkoutDraft {
  if (draft.status !== 'draft') throw new Error('Exercises can only be added before the workout starts.');
  const stationExists = draft.stations.some((station) => station.stationId === stationId);
  if (!stationExists) throw new Error(`Unknown station: ${stationId}`);

  return {
    ...draft,
    editedBeforeStart: true,
    stations: draft.stations.map((station) => station.stationId !== stationId ? station : {
      ...station,
      exercises: [
        ...station.exercises,
        { ...exercise, optional: true, order: station.exercises.length + 1 },
      ],
    }),
  };
}

export function startActiveWorkout(draft: ActiveWorkoutDraft, startedAt: string): ActiveWorkoutDraft {
  if (draft.status !== 'draft') throw new Error('Only a draft workout can be started.');
  return { ...draft, status: 'active', startedAt };
}

export function recordRoundDuringRest(input: {
  draft: ActiveWorkoutDraft;
  stationId: string;
  roundNumber: number;
  recordedAt: string;
  entries: ExercisePerformanceEntry[];
}): WorkoutRoundLog {
  if (input.draft.status !== 'active') throw new Error('Performance can only be recorded for an active workout.');
  assertPositiveInteger(input.roundNumber, 'Round number');
  const station = input.draft.stations.find((candidate) => candidate.stationId === input.stationId);
  if (!station) throw new Error(`Unknown station: ${input.stationId}`);

  const allowed = new Set(station.exercises.map((exercise) => exercise.exerciseId));
  const seen = new Set<string>();
  for (const entry of input.entries) {
    if (!allowed.has(entry.exerciseId)) throw new Error(`Exercise ${entry.exerciseId} is not in station ${input.stationId}.`);
    if (seen.has(entry.exerciseId)) throw new Error(`Exercise ${entry.exerciseId} was recorded more than once for the same round.`);
    seen.add(entry.exerciseId);
    if (entry.completedReps !== undefined && entry.completedReps < 0) throw new Error('Completed reps cannot be negative.');
    if (entry.completedSeconds !== undefined && entry.completedSeconds < 0) throw new Error('Completed seconds cannot be negative.');
    if (entry.load !== undefined && entry.load < 0) throw new Error('Load cannot be negative.');
  }

  return {
    roundLogId: `${input.draft.workoutId}:${input.stationId}:round-${input.roundNumber}`,
    workoutId: input.draft.workoutId,
    stationId: input.stationId,
    roundNumber: input.roundNumber,
    recordedDuringRest: true,
    recordedAt: input.recordedAt,
    exerciseEntries: input.entries,
  };
}

export function summarizeActiveWorkoutProgress(
  workoutId: string,
  logs: WorkoutRoundLog[],
): ActiveWorkoutProgress {
  const totals = new Map<string, ActiveWorkoutProgress['exerciseTotals'][number]>();
  for (const log of logs.filter((candidate) => candidate.workoutId === workoutId)) {
    for (const entry of log.exerciseEntries) {
      const current = totals.get(entry.exerciseId) ?? {
        exerciseId: entry.exerciseId,
        totalReps: 0,
        totalSeconds: 0,
        loadUnit: entry.loadUnit,
      };
      current.totalReps += entry.completedReps ?? 0;
      current.totalSeconds += entry.completedSeconds ?? 0;
      current.loadUnit = entry.loadUnit;
      if (entry.load !== undefined) current.latestLoad = entry.load;
      totals.set(entry.exerciseId, current);
    }
  }
  return { workoutId, completedRoundLogs: logs.filter((log) => log.workoutId === workoutId).length, exerciseTotals: [...totals.values()] };
}
