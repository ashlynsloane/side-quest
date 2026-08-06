import type {
  ActiveWorkoutCheckpoint,
  ActiveWorkoutDraft,
  CompletedWorkoutSummary,
  MobileWorkoutFlowState,
  WorkoutRoundLog,
} from '@circuit/domain';
import { startActiveWorkout } from './active-workout-logging';
import {
  commitActiveWorkoutCompletion,
  createActiveWorkoutCheckpoint,
  pauseActiveWorkoutCheckpoint,
  resumeActiveWorkoutCheckpoint,
  saveActiveWorkoutCheckpoint,
} from './active-workout-persistence';

export function createMobileWorkoutFlow(draft: ActiveWorkoutDraft): MobileWorkoutFlowState {
  if (draft.status !== 'draft') throw new Error('The mobile workout flow must begin with a draft workout.');
  return {
    workoutId: draft.workoutId,
    screen: 'pre_workout',
    draft,
    primaryAction: 'start',
    canEditStructure: true,
    canPause: false,
    canFinish: false,
    statusMessage: 'Review or edit the workout before starting.',
  };
}

export function startMobileWorkoutFlow(
  state: MobileWorkoutFlowState,
  startedAt: string,
): MobileWorkoutFlowState {
  if (state.screen !== 'pre_workout') throw new Error('The workout can only start from the pre-workout screen.');
  const draft = startActiveWorkout(state.draft, startedAt);
  const checkpoint = createActiveWorkoutCheckpoint({ draft, savedAt: startedAt });
  return {
    ...state,
    screen: 'active_station',
    draft,
    checkpoint,
    primaryAction: 'complete_round',
    canEditStructure: false,
    canPause: true,
    canFinish: false,
    statusMessage: 'Workout in progress. Complete the round, then log during rest.',
  };
}

export function openMobileRestLogging(
  state: MobileWorkoutFlowState,
  roundLog: WorkoutRoundLog,
): MobileWorkoutFlowState {
  if (!state.checkpoint || state.screen !== 'active_station') throw new Error('Rest logging requires an active workout.');
  if (roundLog.workoutId !== state.workoutId) throw new Error('The round log belongs to another workout.');
  return {
    ...state,
    screen: 'rest_logging',
    pendingRoundLog: roundLog,
    primaryAction: 'save_round',
    canPause: false,
    statusMessage: 'Record reps, time, and load before starting the next round.',
  };
}

export function saveMobileRestLog(
  state: MobileWorkoutFlowState,
  savedAt: string,
): MobileWorkoutFlowState {
  if (!state.checkpoint || !state.pendingRoundLog || state.screen !== 'rest_logging') {
    throw new Error('There is no pending rest-period log to save.');
  }
  const checkpoint = saveActiveWorkoutCheckpoint(
    state.checkpoint,
    {
      roundLogs: [...state.checkpoint.roundLogs, state.pendingRoundLog],
      currentStationId: state.pendingRoundLog.stationId,
      currentRoundNumber: state.pendingRoundLog.roundNumber + 1,
    },
    savedAt,
    state.checkpoint.revision,
  );
  return {
    ...state,
    screen: 'active_station',
    checkpoint,
    pendingRoundLog: undefined,
    primaryAction: 'complete_round',
    canPause: true,
    canFinish: checkpoint.roundLogs.length > 0,
    statusMessage: 'Round saved. Continue when ready.',
  };
}

export function pauseMobileWorkoutFlow(state: MobileWorkoutFlowState, savedAt: string): MobileWorkoutFlowState {
  if (!state.checkpoint || state.screen === 'completion_summary') throw new Error('There is no active workout to pause.');
  const checkpoint = pauseActiveWorkoutCheckpoint(state.checkpoint, savedAt);
  return {
    ...state,
    screen: 'paused',
    checkpoint,
    primaryAction: 'resume',
    canPause: false,
    statusMessage: 'Workout paused. Your progress is saved.',
  };
}

export function resumeMobileWorkoutFlow(state: MobileWorkoutFlowState, savedAt: string): MobileWorkoutFlowState {
  if (!state.checkpoint || state.screen !== 'paused') throw new Error('Only a paused workout can be resumed.');
  const checkpoint = resumeActiveWorkoutCheckpoint(state.checkpoint, savedAt);
  return {
    ...state,
    screen: 'active_station',
    checkpoint,
    primaryAction: 'complete_round',
    canPause: true,
    canFinish: checkpoint.roundLogs.length > 0,
    statusMessage: 'Workout resumed.',
  };
}

export function finishMobileWorkoutFlow(
  state: MobileWorkoutFlowState,
  summary: CompletedWorkoutSummary,
  completedAt: string,
): MobileWorkoutFlowState {
  if (!state.checkpoint) throw new Error('There is no active workout to finish.');
  if (state.pendingRoundLog) throw new Error('Save or discard the pending round log before finishing.');
  if (summary.workoutId !== state.workoutId) throw new Error('The completion summary belongs to another workout.');
  const completion = commitActiveWorkoutCompletion(state.checkpoint, completedAt);
  return {
    ...state,
    screen: 'completion_summary',
    checkpoint: completion.checkpoint,
    draft: completion.checkpoint.draft,
    completedSummary: summary,
    primaryAction: 'done',
    canEditStructure: false,
    canPause: false,
    canFinish: false,
    statusMessage: completion.alreadyCommitted ? 'Workout already saved.' : 'Workout completed and saved.',
  };
}
