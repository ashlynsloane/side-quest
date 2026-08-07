import type { PlannedStrengthSession } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import {
  applyCoachStrengthAdjustment,
  buildCoachMessageAdaptation,
  interpretCoachMessage,
} from '../src/coach-message-adaptation';
import { normalizeStrengthSession, type UnifiedTrainingSession } from '../src/unified-training';

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

function enduranceSession(
  discipline: 'swim' | 'bike' | 'run',
  overrides: Partial<UnifiedTrainingSession> = {},
): UnifiedTrainingSession {
  const hard = overrides.intensity === 'hard';
  return {
    id: `${discipline}-1`,
    date: '2026-08-10',
    title: discipline === 'swim' ? 'Threshold swim' : discipline === 'bike' ? 'Bike intervals' : 'Tempo run',
    discipline,
    durationMinutes: discipline === 'bike' ? 75 : 50,
    intensity: hard ? 'hard' : 'moderate',
    cardiovascularDemand: hard ? 'high' : 'moderate',
    musculoskeletalDemand: discipline === 'run' ? 'moderate' : 'low',
    lowerBodyDemand: discipline === 'bike' || discipline === 'run' ? 'moderate' : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: discipline === 'swim' ? 'high' : 'moderate',
    recoveryCost: hard ? 4 : 2,
    priority: hard ? 'required' : 'recommended',
    source: 'calendar',
    keySession: hard,
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
    expect(result.painContext?.kind).toBe('post_exercise_soreness');
  });

  it('treats ordinary tightness as soreness unless pain language is present', () => {
    const result = interpretCoachMessage('My calves are tight after yesterday.');
    expect(result.reason).toBe('fatigue');
    expect(result.fatigueKind).toBe('muscle_soreness');
    expect(result.focalPain).toBeUndefined();
  });

  it('keeps both fatigue and a concrete time constraint', () => {
    const result = interpretCoachMessage('My legs feel heavy and I only have 25 minutes.');
    expect(result.reason).toBe('fatigue');
    expect(result.requestedAction).toBe('shorter');
    expect(result.fatigueKind).toBe('heavy_legs');
    expect(result.availableMinutes).toBe(25);
  });

  it('recommends the explicit shorter constraint even when fatigue is also present', () => {
    const session = enduranceSession('bike', { durationMinutes: 75 });
    const proposal = buildCoachMessageAdaptation({
      message: 'My legs feel heavy and I only have 25 minutes.',
      session,
      weekSessions: [session],
      availableDates: ['2026-08-11'],
    });

    expect(proposal.adjustment.recommendedOptionId).toContain('shorten');
    expect(proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId)?.durationMinutes).toBe(25);
  });

  it('gives focal pain precedence over ordinary fatigue', () => {
    const result = interpretCoachMessage('I have a sharp pain in my knee and my legs are tired.');
    expect(result.reason).toBe('pain');
    expect(result.requestedAction).toBe('skip');
    expect(result.focalPain).toBe(true);
    expect(result.symptomSeverity).toBe(4);
    expect(result.affectedArea).toBe('lower_body');
  });

  it('protects explicit bone-stress context even with a modest pain number', () => {
    const run = enduranceSession('run');
    const proposal = buildCoachMessageAdaptation({
      message: 'I have a stress fracture in my foot and it is only 4/10.',
      session: run,
      weekSessions: [run],
      availableDates: ['2026-08-11'],
    });

    expect(proposal.interpretation.painContext?.score0to10).toBe(4);
    expect(proposal.painAssessment?.level).toBe('protect');
    expect(proposal.adjustment.options).toHaveLength(1);
    expect(proposal.adjustment.options[0]?.action).toBe('skip');
  });

  it('does not equate a higher-number minor focal injury report with bone-stress protection', () => {
    const run = enduranceSession('run');
    const proposal = buildCoachMessageAdaptation({
      message: 'I sprained my pinky toe. It is 6/10 but I can walk normally and it did not stop the workout.',
      session: run,
      weekSessions: [run],
      availableDates: ['2026-08-11', '2026-08-12'],
    });

    expect(proposal.interpretation.painContext?.score0to10).toBe(6);
    expect(proposal.painAssessment?.level).toBe('modify');
    expect(proposal.adjustment.safetyMessage).toBeUndefined();
    expect(proposal.adjustment.options.some((option) => option.action === 'move' || option.action === 'skip')).toBe(true);
  });

  it('turns a changed schedule into a move request', () => {
    const result = interpretCoachMessage('My schedule changed and I cannot do this today.');
    expect(result.reason).toBe('preference');
    expect(result.requestedAction).toBe('move');
  });

  it('targets a bike session when the athlete names the ride', () => {
    const result = interpretCoachMessage('I only have 30 minutes for my bike ride today.');
    expect(result.targetDiscipline).toBe('bike');
    expect(result.reason).toBe('time');
    expect(result.availableMinutes).toBe(30);
  });

  it('does not interpret requested training duration as available-time constraint', () => {
    const result = interpretCoachMessage('I want to ride 3 hours tomorrow.');
    expect(result.targetDiscipline).toBe('bike');
    expect(result.availableMinutes).toBeUndefined();
    expect(result.requestedAction).not.toBe('shorter');
  });

  it('recognizes a pool closure as a swim access problem', () => {
    const result = interpretCoachMessage('The pool is closed so I cannot swim today.');
    expect(result.targetDiscipline).toBe('swim');
    expect(result.reason).toBe('access');
    expect(result.requestedAction).toBe('different');
  });

  it('recognizes weather that blocks an outdoor ride', () => {
    const result = interpretCoachMessage('It is icy and I cannot ride outside today.');
    expect(result.targetDiscipline).toBe('bike');
    expect(result.reason).toBe('weather');
    expect(result.requestedAction).toBe('different');
  });

  it('does not turn low motivation into pain', () => {
    const result = interpretCoachMessage('I really do not want to do this workout today.');
    expect(result.reason).toBe('fatigue');
    expect(result.fatigueKind).toBe('low_motivation');
    expect(result.focalPain).toBeUndefined();
  });

  it('uses the existing adjustment engine for a strength message proposal', () => {
    const session = normalizeStrengthSession(strengthSession());
    const proposal = buildCoachMessageAdaptation({
      message: 'My legs are sore and I am not feeling this workout.',
      session,
      weekSessions: [session],
      availableDates: ['2026-08-11', '2026-08-12', '2026-08-13'],
      recentFatigueTrend: 'stable',
    });

    const recommended = proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId);
    expect(proposal.interpretation.reason).toBe('fatigue');
    expect(recommended?.id.startsWith('easier_')).toBe(true);
  });

  it('builds a direct shorter-bike proposal from the same adjustment engine', () => {
    const bike = enduranceSession('bike', { durationMinutes: 75, intensity: 'hard', keySession: true, priority: 'required' });
    const proposal = buildCoachMessageAdaptation({
      message: 'I only have 30 minutes for my bike ride.',
      session: bike,
      weekSessions: [bike],
      availableDates: ['2026-08-11', '2026-08-12'],
      availableDisciplines: ['swim', 'bike', 'run', 'strength', 'mobility'],
    });

    const recommended = proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId);
    expect(proposal.interpretation.targetDiscipline).toBe('bike');
    expect(recommended?.action).toBe('modify');
    expect(recommended?.durationMinutes).toBe(30);
  });

  it('can propose a safe replacement when swim access disappears', () => {
    const swim = enduranceSession('swim');
    const proposal = buildCoachMessageAdaptation({
      message: 'The pool is closed and I cannot swim.',
      session: swim,
      weekSessions: [swim],
      availableDates: ['2026-08-11', '2026-08-12'],
      availableDisciplines: ['bike', 'run', 'strength', 'mobility'],
    });

    expect(proposal.adjustment.options.some((option) => option.action === 'replace' || option.action === 'move')).toBe(true);
  });

  it('turns an active cycle preference into an indoor bike proposal', () => {
    const bike = enduranceSession('bike', { durationMinutes: 75, intensity: 'hard' });
    const proposal = buildCoachMessageAdaptation({
      message: 'I am on my period with cramps and I would rather ride easy indoors.',
      session: bike,
      weekSessions: [bike],
      availableDates: ['2026-08-11'],
      availableDisciplines: ['swim', 'run'],
    });

    const recommended = proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId);
    expect(proposal.interpretation.menstrualContext?.active).toBe(true);
    expect(recommended?.id.startsWith('cycle_indoor_')).toBe(true);
    expect(recommended?.title.toLowerCase()).toContain('indoors');
  });

  it('can reduce run intensity for active cycle symptoms without classifying them as injury pain', () => {
    const run = enduranceSession('run', { intensity: 'hard' });
    const proposal = buildCoachMessageAdaptation({
      message: 'I am on my period with cramps and want to run less hard today.',
      session: run,
      weekSessions: [run],
      availableDates: ['2026-08-11'],
    });

    const recommended = proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId);
    expect(proposal.interpretation.painContext?.kind).toBe('menstrual');
    expect(proposal.interpretation.focalPain).toBeUndefined();
    expect(recommended?.id.startsWith('cycle_easy_run_')).toBe(true);
  });

  it('respects an active cycle preference to avoid swimming', () => {
    const swim = enduranceSession('swim');
    const proposal = buildCoachMessageAdaptation({
      message: 'I am on my period and I do not want to swim today.',
      session: swim,
      weekSessions: [swim],
      availableDates: ['2026-08-11'],
      availableDisciplines: ['bike', 'run'],
    });

    const recommended = proposal.adjustment.options.find((option) => option.id === proposal.adjustment.recommendedOptionId);
    expect(recommended?.action === 'replace' || recommended?.action === 'move' || recommended?.action === 'skip').toBe(true);
  });

  it('applies skip and move decisions to the real planned strength session', () => {
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
