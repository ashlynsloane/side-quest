import { describe, expect, it } from 'vitest';
import type { ProgressWorkspaceModel } from '@circuit/domain';
import { buildVisibleProgressWorkspace } from '../src/visible-progress-workspace';

const fixture: ProgressWorkspaceModel = {
  headline: 'Your training is supporting the next block',
  interpretation: 'Strength is being maintained while run loading returns gradually.',
  regionalStatus: [{
    regionId: 'quads',
    regionLabel: 'Quads',
    state: 'recover_before_loading',
    interpretation: 'Recent bike and strength work created meaningful load.',
    nextStep: 'Use an easier lower-body session next.',
    relatedSportLabels: ['Bike', 'Strength'],
  }],
  improvements: [{
    improvementId: 'modified-well',
    title: 'Modified appropriately',
    explanation: 'You reduced loading when symptoms changed instead of forcing the original session.',
    occurredAtLabel: 'Tuesday',
  }],
  movementTrends: [{
    movementId: 'split-squat',
    movementLabel: 'Split squat',
    direction: 'recovering',
    summary: 'Returning with controlled volume.',
    evidenceCount: 3,
  }],
  trainingBalance: {
    summary: 'Strength is maintained without crowding out endurance work.',
    substantialStimulus: ['Quads', 'Glutes'],
    maintained: ['Upper-body push'],
    opportunities: ['Calf capacity'],
    nextEmphasis: ['Single-leg control'],
  },
  recentHistory: [{
    workoutId: 'workout-1',
    name: 'Steady Climb',
    completedAtLabel: 'Yesterday',
    durationMinutes: 42,
    focusLabel: 'Full body',
    status: 'modified',
    canRepeat: true,
  }],
  milestones: [{
    milestoneId: 'return-1',
    kind: 'return',
    title: 'Returned to lower-body strength',
    detail: 'Completed two controlled sessions without symptom escalation.',
    achievedAtLabel: 'This week',
  }],
};

describe('buildVisibleProgressWorkspace', () => {
  it('uses athlete-first language for movement trends and modified sessions', () => {
    const model = buildVisibleProgressWorkspace(fixture);
    expect(model.movementTrends[0]?.directionLabel).toBe('Returning');
    expect(model.recentHistory[0]?.statusLabel).toBe('Modified appropriately');
  });

  it('allows repeat only for repeatable non-stopped workouts', () => {
    const model = buildVisibleProgressWorkspace(fixture);
    expect(model.recentHistory[0]?.actions.map((item) => item.kind)).toContain('repeat_workout');
  });

  it('prioritizes recovery and symptom interpretation over generic progress claims', () => {
    const model = buildVisibleProgressWorkspace(fixture);
    expect(model.overview.primaryMessage).toContain('Quads');
    expect(model.regionalStatus[0]?.stateLabel).toBe('Recover before loading');
  });
});
