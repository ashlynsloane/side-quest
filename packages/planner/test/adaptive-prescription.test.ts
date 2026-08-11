import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';
import { decideAthleteProgression, type ProgressionDiscipline } from '../src/athlete-progression-engine';
import {
  applyProgressionToMultisportWeek,
  applyProgressionToStrengthWorkout,
  buildAdaptiveEndurancePrescription,
  type ProgressionDoseAssignment,
} from '../src/adaptive-prescription';
import type { MultisportWeekPlan, PlannedMultisportSession } from '../src/multisport';

const absorbed = [
  { completedAt: '2026-08-06T12:00:00.000Z', completedAsPlanned: true, rpe: 6 },
  { completedAt: '2026-08-03T12:00:00.000Z', completedAsPlanned: true, rpe: 6 },
];

function assignment(
  discipline: ProgressionDiscipline,
  baseline: ProgressionDoseAssignment['baseline'],
  options: {
    daysSinceExposure?: number;
    weeksSinceLastReload?: number;
    recentEvidence?: typeof absorbed;
  } = {},
): ProgressionDoseAssignment {
  return {
    baseline,
    decision: decideAthleteProgression({
      weekStartDate: '2026-08-10',
      discipline,
      baseline,
      continuity: { daysSinceExposure: options.daysSinceExposure ?? 2 },
      recentEvidence: options.recentEvidence ?? absorbed,
      ...(options.weeksSinceLastReload !== undefined ? { weeksSinceLastReload: options.weeksSinceLastReload } : {}),
    }),
  };
}

function session(values: Partial<PlannedMultisportSession> = {}): PlannedMultisportSession {
  return {
    id: 'bike-generated',
    date: '2026-08-15',
    day: 'saturday',
    discipline: 'bike',
    title: 'Bike · long aerobic endurance',
    durationMinutes: 120,
    intensity: 'moderate',
    priority: 'key',
    ownership: 'generated',
    rationale: ['Protected long-session slot.'],
    ...values,
  };
}

function week(sessions: PlannedMultisportSession[]): MultisportWeekPlan {
  return {
    id: 'week-1',
    weekStartDate: '2026-08-10',
    phase: 'base',
    sessions,
    warnings: [],
    decisions: [],
  };
}

function strengthWorkout(): GeneratedWorkout {
  const exercise = {
    id: 'goblet-squat',
    slug: 'goblet-squat',
    name: 'Goblet Squat',
    aliases: [],
    status: 'active',
    classification: 'equipment',
    category: 'strength',
    shortDescription: '',
    instructions: { setup: [], execution: [], cues: [], commonMistakes: [] },
    bodyRegions: [],
    jointLoads: [],
    movementPatterns: ['squat'],
    avoidanceTags: [],
    laterality: 'bilateral',
    stationRoles: ['primary_strength'],
    equipmentOptions: [{ id: 'db', label: 'Dumbbell', items: [{ equipmentId: 'dumbbell', quantity: 1 }] }],
    prescriptions: [],
    impactLevel: 1,
    balanceDemand: 1,
    cardiovascularDemand: 1,
    technicalComplexity: 1,
    suitableForAmrap: true,
    suitableForTravel: true,
    suitableForBeginners: true,
    substitutionGroupIds: [],
    compatibility: { maximumAppearancesPerWorkout: 1 },
    media: [],
    defaultEnabled: true,
    contentVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as GeneratedWorkout['stations'][number]['exercises'][number]['exerciseSnapshot'];

  return {
    id: 'workout-1',
    name: 'Strength',
    createdAt: '2026-08-10T12:00:00.000Z',
    randomSeed: 'seed',
    request: {
      workMinutes: 20,
      allowedStationMinutes: [4, 6, 8, 12],
      restSeconds: 60,
      exercisesPerStation: 2,
      focusTargets: [],
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
    stations: [
      {
        id: 'station-1',
        order: 1,
        durationSeconds: 12 * 60,
        format: 'amrap',
        purpose: 'Strength',
        exercises: [{
          exerciseId: exercise.id,
          exerciseSnapshot: exercise,
          equipmentOptionId: 'db',
          prescriptionId: 'reps',
          target: 10,
          unit: 'total',
          order: 1,
          userLoadValue: 100,
          userLoadUnit: 'lb',
        }],
      },
      {
        id: 'station-2',
        order: 2,
        durationSeconds: 8 * 60,
        format: 'amrap',
        purpose: 'Support',
        exercises: [{
          exerciseId: 'split-squat',
          exerciseSnapshot: { ...exercise, id: 'split-squat', slug: 'split-squat', name: 'Split Squat' },
          equipmentOptionId: 'db',
          prescriptionId: 'reps',
          target: 10,
          unit: 'per_side',
          order: 1,
          userLoadValue: 100,
          userLoadUnit: 'lb',
        }],
      },
    ],
    totalWorkSeconds: 20 * 60,
    totalRestSeconds: 60,
    estimatedElapsedSeconds: 21 * 60,
    requiredEquipment: ['dumbbell'],
    targetRegions: [],
    recentLoadAdjustments: [],
    source: 'generated',
  };
}

describe('adaptive progression prescription integration', () => {
  it('turns a two-week bike gap into a shorter, easier generated session', () => {
    const bike = assignment('bike', { durationMinutes: 120, rpeLow: 4, rpeHigh: 6 }, { daysSinceExposure: 14 });
    const plan = applyProgressionToMultisportWeek(
      week([session()]),
      { disciplineAssignments: { bike } },
      [{ day: 'saturday', minutes: 180, available: true }],
    );
    const adjusted = plan.sessions[0]!;

    expect(adjusted.progression?.decision.phase).toBe('rebuild');
    expect(adjusted.durationMinutes).toBeLessThan(120);
    expect(adjusted.intensity).toBe('easy');
    expect(adjusted.rationale.join(' ')).toMatch(/never adds missed-session volume/i);
  });

  it('does not silently rewrite an athlete-fixed session', () => {
    const bike = assignment('bike', { durationMinutes: 150, rpeLow: 4, rpeHigh: 6 }, { daysSinceExposure: 14 });
    const fixed = session({
      id: 'fixed-long-ride',
      sourceSessionId: 'long-ride',
      ownership: 'fixed',
      durationMinutes: 150,
      title: 'Club long ride',
    });
    const plan = applyProgressionToMultisportWeek(
      week([fixed]),
      { sessionAssignments: { 'long-ride': bike } },
    );

    expect(plan.sessions[0]?.durationMinutes).toBe(150);
    expect(plan.sessions[0]?.progression?.recommendedDurationMinutes).toBeLessThan(150);
    expect(plan.sessions[0]?.progression?.fixedSessionPreserved).toBe(true);
    expect(plan.warnings.join(' ')).toMatch(/preserved the fixed session/i);
  });

  it('applies absorbed endurance progression to duration without increasing intensity', () => {
    const bike = assignment('bike', { durationMinutes: 60, rpeLow: 4, rpeHigh: 6 });
    const plan = applyProgressionToMultisportWeek(
      week([session({ durationMinutes: 60, intensity: 'moderate' })]),
      { disciplineAssignments: { bike } },
      [{ day: 'saturday', minutes: 90, available: true }],
    );

    expect(bike.decision.phase).toBe('build');
    expect(plan.sessions[0]?.durationMinutes).toBeGreaterThan(60);
    expect(plan.sessions[0]?.intensity).toBe('moderate');
  });

  it('never expands a return-to-run placeholder even when evidence supports progression', () => {
    const run = assignment('run', { durationMinutes: 20, rpeLow: 2, rpeHigh: 4 });
    const plan = applyProgressionToMultisportWeek(
      week([session({
        id: 'return-run',
        discipline: 'run',
        day: 'wednesday',
        title: 'Run · return-to-run progression',
        durationMinutes: 20,
        intensity: 'easy',
        priority: 'support',
      })]),
      { disciplineAssignments: { run } },
      [{ day: 'wednesday', minutes: 60, available: true }],
    );

    expect(run.decision.direction).toBe('increase');
    expect(plan.sessions[0]?.durationMinutes).toBe(20);
  });

  it('writes a session-specific re-entry interval target into the endurance prescription', () => {
    const bike = assignment('bike', {
      durationMinutes: 90,
      intervalCount: 4,
      intervalMinutes: 10,
      rpeLow: 6,
      rpeHigh: 7,
    }, { daysSinceExposure: 14 });
    const adjusted = applyProgressionToMultisportWeek(
      week([session({ id: 'bike-quality', title: 'Bike · quality intervals', durationMinutes: 90, intensity: 'hard' })]),
      { sessionAssignments: { 'bike-quality': bike } },
      [{ day: 'saturday', minutes: 120, available: true }],
    ).sessions[0]!;
    const prescription = buildAdaptiveEndurancePrescription(adjusted);

    expect(prescription?.progressionPhase).toBe('rebuild');
    expect(prescription?.steps.find((step) => step.label === 'Main set')?.instruction).toContain('3 × 8 min');
    expect(JSON.stringify(prescription).toLowerCase()).not.toContain('watts');
  });

  it('makes a two-week strength return shorter, lower-rep, and lower-load when prior load exists', () => {
    const strength = assignment('strength', { durationMinutes: 20, reps: 10, load: 100 }, { daysSinceExposure: 14 });
    const adjusted = applyProgressionToStrengthWorkout(strengthWorkout(), strength);

    expect(strength.decision.phase).toBe('rebuild');
    expect(adjusted.totalWorkSeconds).toBeLessThan(20 * 60);
    expect(adjusted.stations[0]?.exercises[0]?.target).toBe(8);
    expect(adjusted.stations[0]?.exercises[0]?.userLoadValue).toBe(90);
    expect(adjusted.request.allowUnfamiliarExercises).toBe(false);
    expect(adjusted.variantLabel).toBe('Return-to-strength session');
  });

  it('materializes a scheduled reload as lower strength volume rather than a label-only week', () => {
    const strength = assignment(
      'strength',
      { durationMinutes: 20, reps: 10, load: 100 },
      { weeksSinceLastReload: 4 },
    );
    const adjusted = applyProgressionToStrengthWorkout(strengthWorkout(), strength);

    expect(strength.decision.phase).toBe('reload');
    expect(strength.decision.progressionAllowed).toBe(false);
    expect(adjusted.totalWorkSeconds).toBeLessThan(20 * 60);
    expect(adjusted.stations[0]?.exercises[0]?.target).toBeLessThanOrEqual(10);
    expect(adjusted.variantLabel).toBe('Reload session');
  });
});
