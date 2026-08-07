import type { PlannedStrengthSession } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import {
  applyCoachStrengthAdjustment,
  buildCoachMessageAdaptation,
  interpretCoachMessage,
} from '../src/coach-message-adaptation';
import { normalizeStrengthSession } from '../src/unified-training';

function strengthSession(overrides: Partial<PlannedStrengthSession> = {}): PlannedStrengthSession {
  return {
    id: 'strength-1',
    date: '2026-08-10',
    order: 1,
    title: 'Lower-body strength',
    purpose: 'single_leg_durability',
    intendedLoad: 'high',
    focusTargets: [{ region: 'quadriceps', emphasis: 'strong' }],
    workout: {
      id: 'workout-1',
      name: 'Lower-body strength',
      createdAt: '2026-08-01T12:00:00.000Z',
      randomSeed: 'coach-message-test',
      request: {
        workMinutes: 40,
        allowedStationMinutes: [4, 8, 12],
        restSeconds: 60,
        exercisesPerStation: 2,
        focusTargets: [{ region: 'quadriceps', emphasis: 'strong' }],
        excludedRegions: [],
        excludedMovementTags: [],
        availableEquipment: ['dumbbell'],
        workoutStyle: 'strength_amrap',
        difficulty: 'intermediate',
        maximumImpact: 2,
        recoveryAware: true,
        avoidPreviousWorkoutExercises: false,
        favorFamiliarExercises: true,
        allowUnfamiliarExercises: true,
        minimizeEquipmentChanges: true,
      },
      stations: [],
      totalWorkSeconds: 2400,
      totalRestSeconds: 0,
      estimatedElapsedSeconds: 2400,
      requiredEquipment: ['dumbbell'],
      targetRegions: ['quadriceps'],
      recentLoadAdjustments: [],
      source: 'generated',
    },
    rationale: 'Build lower-body durability.',
    completionStatus: 'planned',
    ...overrides,
  };
}

describe('coach message adaptation', () => {
  it('interprets sore legs as lower-body fatigue instead of pain', () => {
    const result = interpretCoachMessage('My legs are really sore from yesterday.');
    expect(result.reason).toBe('fatigue');
    expect(result.requestedAction).toBe('easier');
    expect(result.fatigueKind).toBe('muscle_soreness');
    expect(result.affectedArea).toBe('lower_body');
    expect(result.focalPain).toBeUndefined();
  });

  it('keeps both fatigue and a concrete time constraint', () => {
    const result = interpretCoachMessage('My legs feel heavy and I only have 25 minutes.');
    expect(result.reason).toBe('fatigue');
    expect(result.requestedAction).toBe('shorter');
    expect(result.fatigueKind).toBe('heavy_legs');
    expect(result.availableMinutes).toBe(25);
  });

  it('gives focal pain precedence over ordinary fatigue', () => {
    const result = interpretCoachMessage('I have a sharp pain in my knee and my legs are tired.');
    expect(result.reason).toBe('pain');
    expect(result.requestedAction).toBe('skip');
    expect(result.focalPain).toBe(true);
    expect(result.symptomSeverity).toBe(4);
    expect(result.affectedArea).toBe('lower_body');
  });

  it('turns a changed schedule into a move request', () => {
    const result = interpretCoachMessage('My schedule changed and I cannot do this today.');
    expect(result.reason).toBe('preference');
    expect(result.requestedAction).toBe('move');
  });

  it('uses the existing adjustment engine for a message proposal', () => {
    const session = strengthSession();
    const unified = normalizeStrengthSession(session);
    const proposal = buildCoachMessageAdaptation({
      message: 'My legs are sore and I am not feeling this workout.',
      session,
      weekSessions: [unified],
      availableDates: ['2026-08-11', '2026-08-12', '2026-08-13'],
      recentFatigueTrend: 'stable',
    });

    const recommended = proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId);
    expect(proposal.interpretation.reason).toBe('fatigue');
    expect(recommended?.id.startsWith('easier_')).toBe(true);
  });

  it('applies skip and move decisions to the real planned session', () => {
    const session = strengthSession();
    const skipped = applyCoachStrengthAdjustment(session, {
      id: 'skip_strength-1',
      action: 'skip',
      recommendationLevel: 'recommended',
      title: 'Recover and skip it',
      description: 'Recover today.',
      rationale: [],
      weeklyConsequences: [],
      protectsMentalHealth: true,
      protectsPhysicalHealth: true,
      requiresApproval: false,
      confidence: 'high',
    });
    expect(skipped.completionStatus).toBe('skipped');

    const moved = applyCoachStrengthAdjustment(session, {
      id: 'move_strength-1_2026-08-12',
      action: 'move',
      recommendationLevel: 'recommended',
      title: 'Move to 2026-08-12',
      description: 'Move the session.',
      targetDate: '2026-08-12',
      rationale: [],
      weeklyConsequences: [],
      protectsMentalHealth: true,
      protectsPhysicalHealth: true,
      requiresApproval: true,
      confidence: 'moderate',
    });
    expect(moved.date).toBe('2026-08-12');
    expect(moved.completionStatus).toBe('modified');
  });
});
