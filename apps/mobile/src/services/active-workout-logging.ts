import type { ActiveWorkoutDraft, ActiveWorkoutProgress, WorkoutRoundLog } from '@circuit/domain';

export interface ActiveWorkoutLoggingCard {
  title: string;
  eyebrow: string;
  body: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
}

export function buildPreWorkoutEditCard(draft: ActiveWorkoutDraft): ActiveWorkoutLoggingCard {
  const totalMinutes = draft.stations.reduce((sum, station) => sum + station.durationMinutes, 0);
  return {
    title: draft.title,
    eyebrow: 'Before you start',
    body: `${draft.stations.length} stations · ${totalMinutes} planned minutes. Adjust station time, reps, or optional exercises now.`,
    primaryActionLabel: 'Edit workout',
    secondaryActionLabel: 'Start as planned',
  };
}

export function buildRestLoggingCard(log: WorkoutRoundLog): ActiveWorkoutLoggingCard {
  return {
    title: `Round ${log.roundNumber} recorded`,
    eyebrow: 'Rest interval',
    body: `${log.exerciseEntries.length} exercise entr${log.exerciseEntries.length === 1 ? 'y' : 'ies'} saved. Reps and load are recorded by exercise for this round.`,
    primaryActionLabel: 'Start next round',
    secondaryActionLabel: 'Edit entries',
  };
}

export function buildWorkoutProgressCard(progress: ActiveWorkoutProgress): ActiveWorkoutLoggingCard {
  return {
    title: 'Workout progress',
    eyebrow: 'Live summary',
    body: `${progress.completedRoundLogs} rounds logged across ${progress.exerciseTotals.length} exercises.`,
    primaryActionLabel: 'Continue workout',
  };
}
