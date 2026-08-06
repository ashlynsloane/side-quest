import type {
  ActiveWorkoutDraft,
  ActiveWorkoutProgress,
  CompletedWorkoutSummary,
  SavedWorkoutReference,
  WorkoutMuscleRegion,
  WorkoutNameTone,
  WorkoutRoundLog,
  WorkoutShareCard,
  WorkoutSharePreferences,
} from '@circuit/domain';

const TONE_WORDS: Record<WorkoutNameTone, readonly string[]> = {
  adventure: ['Trailhead', 'Summit', 'Switchback', 'Ridgeline'],
  playful: ['Sneaky Strong', 'Good Chaos', 'Leg Day Detour', 'Core Memory'],
  focused: ['Strength Builder', 'Durability Session', 'Full-Body Work', 'Race Support'],
  minimal: ['Strength Session', 'Circuit Session', 'Full Body', 'Training Day'],
};

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

export function generateWorkoutDisplayName(input: {
  workoutId: string;
  tone: WorkoutNameTone;
  dominantRegion?: string;
}): string {
  const names = TONE_WORDS[input.tone];
  const base = names[stableIndex(input.workoutId, names.length)];
  return input.dominantRegion && input.tone !== 'minimal' ? `${base}: ${input.dominantRegion}` : base;
}

export function completeActiveWorkout(input: {
  draft: ActiveWorkoutDraft;
  progress: ActiveWorkoutProgress;
  logs: WorkoutRoundLog[];
  completedAt: string;
  actualMinutes: number;
  displayName: string;
  muscleRegions: WorkoutMuscleRegion[];
  athleteNote?: string;
}): CompletedWorkoutSummary {
  if (input.draft.status !== 'active') throw new Error('Only an active workout can be completed.');
  if (!Number.isFinite(input.actualMinutes) || input.actualMinutes <= 0) throw new Error('Actual workout minutes must be positive.');
  if (input.progress.workoutId !== input.draft.workoutId) throw new Error('Workout progress does not match the active workout.');
  const exerciseNames = new Map(
    input.draft.stations.flatMap((station) => station.exercises.map((exercise) => [exercise.exerciseId, exercise.name] as const)),
  );
  const workoutLogs = input.logs.filter((log) => log.workoutId === input.draft.workoutId);
  const uniqueLogIds = new Set(workoutLogs.map((log) => log.roundLogId));
  if (uniqueLogIds.size !== workoutLogs.length) throw new Error('Duplicate round logs cannot be used to complete a workout.');

  return {
    workoutId: input.draft.workoutId,
    originalTitle: input.draft.title,
    displayName: input.displayName.trim() || input.draft.title,
    completedAt: input.completedAt,
    actualMinutes: input.actualMinutes,
    completedRoundLogs: input.progress.completedRoundLogs,
    exercises: input.progress.exerciseTotals.map((total) => ({
      ...total,
      name: exerciseNames.get(total.exerciseId) ?? 'Exercise',
    })),
    muscleRegions: input.muscleRegions,
    editedBeforeStart: input.draft.editedBeforeStart,
    athleteNote: input.athleteNote?.trim() || undefined,
  };
}

export function buildWorkoutShareCard(input: {
  summary: CompletedWorkoutSummary;
  preferences: WorkoutSharePreferences;
  generatedAt: string;
}): WorkoutShareCard {
  const { summary, preferences } = input;
  const facts: string[] = [];
  if (preferences.includeDuration) facts.push(`${summary.actualMinutes} min`);
  if (preferences.includeRoundCount) facts.push(`${summary.completedRoundLogs} rounds logged`);
  const exerciseNames = preferences.includeExerciseNames ? summary.exercises.map((exercise) => exercise.name) : [];
  const muscleRegions = preferences.includeMuscleMap ? summary.muscleRegions : [];
  const athleteNote = preferences.includeAthleteNote ? summary.athleteNote : undefined;
  return {
    shareCardId: `share:${summary.workoutId}:${input.generatedAt}`,
    workoutId: summary.workoutId,
    displayName: summary.displayName,
    subtitle: 'Side Quest completed',
    facts,
    muscleRegions,
    exerciseNames,
    athleteNote,
    weightsIncluded: preferences.includeWeights,
    audience: preferences.audience,
    generatedAt: input.generatedAt,
    privacySummary: preferences.includeWeights
      ? 'Weights are included because the athlete explicitly enabled them.'
      : 'Weights are hidden by default.',
  };
}

export function saveCompletedWorkoutReference(input: {
  summary: CompletedWorkoutSummary;
  savedAt: string;
  favorite?: boolean;
}): SavedWorkoutReference {
  return {
    savedWorkoutId: `saved:${input.summary.workoutId}`,
    sourceWorkoutId: input.summary.workoutId,
    displayName: input.summary.displayName,
    originalTitle: input.summary.originalTitle,
    savedAt: input.savedAt,
    completedVersion: true,
    favorite: input.favorite ?? true,
  };
}
