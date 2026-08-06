import { describe, expect, it } from 'vitest';
import type { TrainWorkoutCard } from '@circuit/domain';
import { assertTrainWorkspace, buildTrainWorkspace, trainPrimaryActionLabel } from '../src/train-workspace';

const workout = (id: string): TrainWorkoutCard => ({
  workoutId: id,
  name: 'Trailhead Circuit',
  source: 'generated',
  state: 'ready',
  durationMinutes: 40,
  focusLabel: 'Full body',
  equipmentLabel: 'Dumbbells',
  muscleEmphasis: ['glutes', 'upper back'],
  recommendationReason: 'Fits the available time and complements recent endurance work.',
  canStart: true,
  canPreview: true,
  canSwap: true,
});

describe('Train workspace', () => {
  it('builds a useful workout workspace instead of a routing menu', () => {
    const model = buildTrainWorkspace({ recommended: [workout('one')] });
    expect(model.builder.durationMinutes).toBe(40);
    expect(model.quickPresets.length).toBeGreaterThan(0);
    expect(model.recommended[0]?.recommendationReason).toContain('available time');
    expect(trainPrimaryActionLabel(model)).toBe('Build my workout');
    expect(() => assertTrainWorkspace(model)).not.toThrow();
  });

  it('prioritizes an interrupted workout', () => {
    const model = buildTrainWorkspace({
      activeWorkout: {
        workoutId: 'active-one',
        name: 'Ridgeline Relay',
        state: 'paused',
        elapsedSeconds: 720,
        currentStationLabel: 'Station 2',
        currentRound: 2,
        totalRounds: 4,
      },
    });
    expect(trainPrimaryActionLabel(model)).toBe('Resume workout');
  });

  it('caps recommendation rails to keep the page focused', () => {
    const many = Array.from({ length: 10 }, (_, index) => workout(`workout-${index}`));
    const model = buildTrainWorkspace({ recommended: many, savedAndRecent: many });
    expect(model.recommended).toHaveLength(4);
    expect(model.savedAndRecent).toHaveLength(8);
  });
});
