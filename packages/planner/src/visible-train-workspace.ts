import type {
  TrainBuilderPreferences,
  TrainFocus,
  TrainIntensity,
  TrainWorkoutCard,
  TrainWorkspaceModel,
  V29TrainAction,
  V29TrainVisibleScreenModel,
  V29TrainWorkoutVisibleCard,
} from '@circuit/domain';
import { assertTrainWorkspace } from './train-workspace';

export interface BuildVisibleTrainWorkspaceInput {
  workspace: TrainWorkspaceModel;
  bottomInsetForNavigation?: number;
}

const focusLabels: Record<TrainFocus, string> = {
  full_body: 'Full body',
  lower_body: 'Lower body',
  upper_body: 'Upper body',
  core: 'Core',
  swim_support: 'Swim support',
  bike_support: 'Bike support',
  run_support: 'Run support',
  mobility: 'Mobility',
};

const intensityLabels: Record<TrainIntensity, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  adaptive: 'Adaptive',
};

function builderSummary(builder: TrainBuilderPreferences): string {
  return `${builder.durationMinutes} min · ${focusLabels[builder.focus]} · ${intensityLabels[builder.intensity]}`;
}

function workoutActions(workout: TrainWorkoutCard): V29TrainAction[] {
  const actions: V29TrainAction[] = [];
  if (workout.canStart) {
    actions.push({
      actionId: `start-${workout.workoutId}`,
      kind: 'start_workout',
      label: 'Start',
      accessibilityLabel: `Start ${workout.name}`,
      workoutId: workout.workoutId,
      primary: true,
    });
  }
  if (workout.canPreview) {
    actions.push({
      actionId: `preview-${workout.workoutId}`,
      kind: 'preview_workout',
      label: 'Preview',
      accessibilityLabel: `Preview ${workout.name}`,
      workoutId: workout.workoutId,
    });
  }
  if (workout.canSwap) {
    actions.push({
      actionId: `swap-${workout.workoutId}`,
      kind: 'swap_workout',
      label: 'Swap',
      accessibilityLabel: `Swap ${workout.name}`,
      workoutId: workout.workoutId,
    });
  }
  return actions;
}

function visibleWorkout(workout: TrainWorkoutCard): V29TrainWorkoutVisibleCard {
  const sourceLabel = workout.source === 'saved'
    ? 'Saved workout'
    : workout.source === 'recent'
      ? 'Recent workout'
      : workout.source === 'coach'
        ? 'Coach suggestion'
        : workout.source === 'shared'
          ? 'Shared workout'
          : 'Built for you';
  return {
    workoutId: workout.workoutId,
    eyebrow: sourceLabel,
    title: workout.name,
    metaLine: `${workout.durationMinutes} min · ${workout.focusLabel} · ${workout.equipmentLabel}`,
    emphasisLabel: workout.muscleEmphasis.length > 0 ? workout.muscleEmphasis.join(' · ') : undefined,
    reason: workout.recommendationReason,
    unavailableMessage: workout.state === 'unavailable' ? 'This workout is not currently available with your selected equipment or restrictions.' : undefined,
    actions: workoutActions(workout),
  };
}

export function buildVisibleTrainWorkspace({
  workspace,
  bottomInsetForNavigation = 112,
}: BuildVisibleTrainWorkspaceInput): V29TrainVisibleScreenModel {
  assertTrainWorkspace(workspace);
  return {
    activeWorkout: workspace.activeWorkout
      ? {
          eyebrow: workspace.activeWorkout.state === 'paused' ? 'Paused workout' : 'Workout in progress',
          title: workspace.activeWorkout.name,
          progressLabel: `Round ${workspace.activeWorkout.currentRound} of ${workspace.activeWorkout.totalRounds}`,
          stationLabel: workspace.activeWorkout.currentStationLabel,
          actions: [{
            actionId: `resume-${workspace.activeWorkout.workoutId}`,
            kind: 'resume_workout',
            label: workspace.activeWorkout.state === 'paused' ? 'Resume workout' : 'Return to workout',
            accessibilityLabel: `${workspace.activeWorkout.state === 'paused' ? 'Resume' : 'Return to'} ${workspace.activeWorkout.name}`,
            workoutId: workspace.activeWorkout.workoutId,
            primary: true,
          }],
        }
      : undefined,
    builder: {
      title: 'Build a Side Quest',
      summary: builderSummary(workspace.builder),
      durationLabel: `${workspace.builder.durationMinutes} minutes`,
      equipmentLabel: workspace.builder.equipmentLabel,
      focusLabel: focusLabels[workspace.builder.focus],
      intensityLabel: intensityLabels[workspace.builder.intensity],
      locationLabel: workspace.builder.locationLabel,
      restrictionLabel: workspace.builder.restrictionLabels.length > 0
        ? workspace.builder.restrictionLabels.join(' · ')
        : undefined,
      actions: [{
        actionId: 'build-workout',
        kind: 'build_workout',
        label: 'Build my workout',
        accessibilityLabel: 'Build a workout using these preferences',
        primary: true,
      }],
    },
    presets: workspace.quickPresets.map((preset) => ({
      id: preset.id,
      title: preset.label,
      description: preset.description,
      action: {
        actionId: `preset-${preset.id}`,
        kind: 'apply_preset',
        label: 'Use preset',
        accessibilityLabel: `Use ${preset.label} preset`,
        presetId: preset.id,
      },
    })),
    recommended: workspace.recommended.map(visibleWorkout),
    savedAndRecent: workspace.savedAndRecent.map(visibleWorkout),
    workoutTogether: workspace.workoutTogether
      ? {
          title: workspace.workoutTogether.title,
          detail: workspace.workoutTogether.detail,
          action: {
            actionId: `together-${workspace.workoutTogether.invitationId}`,
            kind: 'open_together',
            label: workspace.workoutTogether.actionLabel,
            accessibilityLabel: `${workspace.workoutTogether.actionLabel}: ${workspace.workoutTogether.title}`,
          },
        }
      : undefined,
    bottomInsetForNavigation,
  };
}

export function assertVisibleTrainWorkspace(model: V29TrainVisibleScreenModel): void {
  if (!model.builder.title.trim()) throw new Error('Visible Train builder requires a title.');
  if (!model.builder.actions.some((action) => action.kind === 'build_workout')) {
    throw new Error('Visible Train builder requires a build action.');
  }
  if (model.bottomInsetForNavigation < 44) throw new Error('Visible Train navigation inset is too small.');
  for (const workout of [...model.recommended, ...model.savedAndRecent]) {
    if (!workout.title.trim()) throw new Error(`Visible Train workout ${workout.workoutId} requires a title.`);
  }
}
