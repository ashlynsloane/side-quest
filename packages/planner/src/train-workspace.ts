import type {
  TrainBuilderPreferences,
  TrainQuickPreset,
  TrainWorkoutCard,
  TrainWorkspaceModel,
} from '@circuit/domain';

export interface BuildTrainWorkspaceInput {
  activeWorkout?: TrainWorkspaceModel['activeWorkout'];
  builder?: Partial<TrainBuilderPreferences>;
  quickPresets?: TrainQuickPreset[];
  recommended?: TrainWorkoutCard[];
  savedAndRecent?: TrainWorkoutCard[];
  workoutTogether?: TrainWorkspaceModel['workoutTogether'];
}

const defaultBuilder = (): TrainBuilderPreferences => ({
  durationMinutes: 40,
  equipmentLabel: 'Available equipment',
  focus: 'full_body',
  intensity: 'adaptive',
  locationLabel: 'Current location',
  restrictionLabels: [],
});

const defaultPresets = (): TrainQuickPreset[] => [
  {
    id: 'quick-20-reset',
    label: '20-minute reset',
    description: 'A compact full-body session when time is limited.',
    preferences: { durationMinutes: 20, focus: 'full_body', intensity: 'moderate' },
  },
  {
    id: 'quick-hotel-gym',
    label: 'Hotel gym',
    description: 'Build around common hotel-gym equipment.',
    preferences: { equipmentLabel: 'Hotel gym', locationLabel: 'Hotel gym' },
  },
  {
    id: 'quick-swim-support',
    label: 'Swim-support strength',
    description: 'Prioritize upper-body pulling, trunk control, and shoulder support.',
    preferences: { focus: 'swim_support' },
  },
  {
    id: 'quick-no-impact',
    label: 'No-impact session',
    description: 'Avoid jumping and other high-impact loading.',
    preferences: { intensity: 'adaptive' },
  },
];

export function buildTrainWorkspace(input: BuildTrainWorkspaceInput = {}): TrainWorkspaceModel {
  const builder = { ...defaultBuilder(), ...(input.builder ?? {}) };
  return {
    activeWorkout: input.activeWorkout,
    builder,
    quickPresets: (input.quickPresets ?? defaultPresets()).slice(0, 6),
    recommended: (input.recommended ?? []).slice(0, 4),
    savedAndRecent: (input.savedAndRecent ?? []).slice(0, 8),
    workoutTogether: input.workoutTogether,
  };
}

export function trainPrimaryActionLabel(model: TrainWorkspaceModel): string {
  if (model.activeWorkout?.state === 'paused') return 'Resume workout';
  if (model.activeWorkout?.state === 'active') return 'Return to workout';
  return 'Build my workout';
}

export function assertTrainWorkspace(model: TrainWorkspaceModel): void {
  if (!Number.isFinite(model.builder.durationMinutes) || model.builder.durationMinutes <= 0) {
    throw new Error('Train builder duration must be greater than zero.');
  }
  if (!model.builder.equipmentLabel.trim()) throw new Error('Train builder requires an equipment label.');
  if (!model.builder.locationLabel.trim()) throw new Error('Train builder requires a location label.');
  if (model.activeWorkout) {
    if (model.activeWorkout.elapsedSeconds < 0) throw new Error('Active workout elapsed time cannot be negative.');
    if (model.activeWorkout.currentRound < 1 || model.activeWorkout.totalRounds < model.activeWorkout.currentRound) {
      throw new Error('Active workout round state is invalid.');
    }
  }
  for (const workout of [...model.recommended, ...model.savedAndRecent]) {
    if (!workout.name.trim()) throw new Error('Workout cards require a name.');
    if (workout.durationMinutes <= 0) throw new Error(`Workout ${workout.workoutId} must have a positive duration.`);
  }
}
