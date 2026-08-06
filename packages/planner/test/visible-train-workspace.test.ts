import { describe, expect, it } from 'vitest';
import type { TrainWorkspaceModel } from '@circuit/domain';
import { buildVisibleTrainWorkspace } from '../src/visible-train-workspace';

const base: TrainWorkspaceModel = {
  builder: {
    durationMinutes: 40,
    equipmentLabel: 'Dumbbells and bodyweight',
    focus: 'full_body',
    intensity: 'adaptive',
    locationLabel: 'Home',
    restrictionLabels: [],
  },
  quickPresets: [],
  recommended: [],
  savedAndRecent: [],
};

describe('visible Train workspace', () => {
  it('keeps workout creation as the primary open-state action', () => {
    const screen = buildVisibleTrainWorkspace({ workspace: base });
    expect(screen.builder.actions[0]).toMatchObject({ kind: 'build_workout', primary: true });
  });

  it('elevates an active workout above discovery', () => {
    const screen = buildVisibleTrainWorkspace({
      workspace: {
        ...base,
        activeWorkout: {
          workoutId: 'active-1',
          name: 'Ridgeline Reset',
          state: 'paused',
          elapsedSeconds: 840,
          currentStationLabel: 'Station 3',
          currentRound: 2,
          totalRounds: 4,
        },
      },
    });
    expect(screen.activeWorkout?.actions[0].label).toBe('Resume workout');
  });

  it('does not offer Start when a workout cannot start', () => {
    const screen = buildVisibleTrainWorkspace({
      workspace: {
        ...base,
        recommended: [{
          workoutId: 'limited',
          name: 'Trailhead Strength',
          source: 'generated',
          state: 'unavailable',
          durationMinutes: 30,
          focusLabel: 'Full body',
          equipmentLabel: 'Cable machine',
          muscleEmphasis: ['Trunk', 'Upper back'],
          canStart: false,
          canPreview: true,
          canSwap: true,
        }],
      },
    });
    expect(screen.recommended[0].actions.some((action) => action.kind === 'start_workout')).toBe(false);
  });
});
