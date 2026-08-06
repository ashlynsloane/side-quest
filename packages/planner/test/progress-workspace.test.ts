import { describe, expect, it } from 'vitest';
import type { ProgressRegionalStatus } from '@circuit/domain';
import {
  assertProgressWorkspace,
  buildProgressWorkspace,
  progressEmptyState,
  progressPrimaryMessage,
  repeatableProgressWorkouts,
} from '../src/progress-workspace';

const regions: ProgressRegionalStatus[] = [
  {
    regionId: 'upper-back',
    regionLabel: 'Upper back',
    state: 'ready_to_progress',
    interpretation: 'Recent work was tolerated well and progression is reasonable.',
    nextStep: 'Add one or two reps before increasing load.',
    relatedSportLabels: ['Swim'],
  },
];

describe('Progress workspace', () => {
  it('shows concrete progress rather than pressure metrics', () => {
    const model = buildProgressWorkspace({
      headline: 'You are building durable strength',
      interpretation: 'Recent sessions show useful progress without elevated symptoms.',
      regionalStatus: regions,
      improvements: [
        {
          improvementId: 'goblet-reps',
          title: 'More goblet squat reps',
          explanation: 'You completed two additional reps per round at the same load.',
          occurredAtLabel: 'Today',
        },
      ],
      movementTrends: [
        {
          movementId: 'squat',
          movementLabel: 'Squat',
          direction: 'improving',
          summary: 'Repetition capacity is improving.',
          evidenceCount: 3,
          nextProgression: 'Keep the load and add one rep per round.',
        },
      ],
    });
    expect(progressPrimaryMessage(model)).toContain('additional reps');
    expect(() => assertProgressWorkspace(model)).not.toThrow();
  });

  it('prioritizes symptom review over celebratory messaging', () => {
    const model = buildProgressWorkspace({
      regionalStatus: [
        {
          ...regions[0]!,
          state: 'review_symptoms',
          interpretation: 'Review symptoms before adding load.',
        },
      ],
    });
    expect(progressPrimaryMessage(model)).toContain('Review symptoms');
  });

  it('offers repeat actions only for appropriate history', () => {
    const model = buildProgressWorkspace({
      recentHistory: [
        { workoutId: 'one', name: 'Ridgeline', completedAtLabel: 'Yesterday', durationMinutes: 40, focusLabel: 'Full body', status: 'completed', canRepeat: true },
        { workoutId: 'two', name: 'Stopped session', completedAtLabel: 'Monday', durationMinutes: 12, focusLabel: 'Lower body', status: 'stopped', canRepeat: true },
      ],
    });
    expect(repeatableProgressWorkouts(model).map((item) => item.workoutId)).toEqual(['one']);
  });

  it('provides a useful first-workout empty state', () => {
    const model = buildProgressWorkspace();
    expect(progressEmptyState(model)).toContain('first Side Quest');
  });
});
