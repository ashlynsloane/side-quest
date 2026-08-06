import type {
  EnduranceActivity,
  Exercise,
  GeneratedWorkout,
  PlannedStrengthSession,
  TrainingBlockPlan,
  WeeklyTrainingPlan,
  WorkoutExercisePrescription,
} from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import {
  applyStrengthAdjustmentProposal,
  assessEnduranceLoads,
  buildTrainingIntelligence,
} from '../src/training-intelligence';

const now = '2026-07-22T18:00:00.000Z';

function activity(overrides: Partial<EnduranceActivity> = {}): EnduranceActivity {
  return {
    id: 'run_1', source: 'strava', externalId: '1', name: 'Easy Run', discipline: 'run', sportType: 'Run',
    startAt: '2026-07-21T14:00:00.000Z', startLocal: '2026-07-21T07:00:00', movingTimeSeconds: 45 * 60,
    elapsedTimeSeconds: 46 * 60, distanceMeters: 8_000, elevationGainMeters: 50, intensity: 'easy',
    importedAt: now, updatedAt: now, ...overrides,
  };
}

function workout(): GeneratedWorkout {
  const exercise = (id: string, region: 'quadriceps' | 'hamstrings' | 'hip_abductors' | 'core_lateral'): WorkoutExercisePrescription => {
    const exerciseSnapshot: Exercise = {
      id, slug: id, name: id, aliases: [], status: 'active', classification: 'bodyweight', category: 'test', shortDescription: '',
      instructions: { setup: [], execution: [], cues: [], commonMistakes: [] },
      bodyRegions: [{ region, load: 1, role: 'primary' }], jointLoads: [], movementPatterns: [], avoidanceTags: [], laterality: 'bilateral', stationRoles: ['primary_strength'],
      equipmentOptions: [{ id: 'bodyweight', label: 'Bodyweight', items: [{ equipmentId: 'bodyweight', quantity: 1 }] }],
      prescriptions: [{ id: 'default', style: 'amrap', mode: 'reps', target: 10, unit: 'total', minimum: 4, maximum: 15, estimatedSeconds: 30 }],
      impactLevel: 1, balanceDemand: 1, cardiovascularDemand: 1, technicalComplexity: 1, suitableForAmrap: true,
      suitableForTravel: true, suitableForBeginners: true, substitutionGroupIds: [], compatibility: { maximumAppearancesPerWorkout: 1 }, media: [], defaultEnabled: true,
      contentVersion: 1, createdAt: now, updatedAt: now,
    };
    return { exerciseId: id, exerciseSnapshot, equipmentOptionId: 'bodyweight', prescriptionId: 'default', target: 10, unit: 'total', order: 1 };
  };
  const stations = [
    { id: 'quad', order: 1, durationSeconds: 720, format: 'amrap' as const, purpose: 'quad', exercises: [exercise('split-squat', 'quadriceps')] },
    { id: 'ham', order: 2, durationSeconds: 720, format: 'amrap' as const, purpose: 'ham', exercises: [exercise('hinge', 'hamstrings')] },
    { id: 'hip', order: 3, durationSeconds: 480, format: 'amrap' as const, purpose: 'hip', exercises: [exercise('band-walk', 'hip_abductors')] },
    { id: 'core', order: 4, durationSeconds: 480, format: 'amrap' as const, purpose: 'core', exercises: [exercise('side-plank', 'core_lateral')] },
  ];
  return {
    id: 'workout', name: 'Lower-body durability', createdAt: now, randomSeed: 'seed',
    request: { workMinutes: 40, allowedStationMinutes: [4, 8, 12], restSeconds: 60, exercisesPerStation: 2, focusTargets: [], excludedRegions: [], excludedMovementTags: [], availableEquipment: ['bodyweight'], workoutStyle: 'strength_amrap', difficulty: 'intermediate', maximumImpact: 1, recoveryAware: true, avoidPreviousWorkoutExercises: false, favorFamiliarExercises: true, allowUnfamiliarExercises: true, minimizeEquipmentChanges: true },
    stations, totalWorkSeconds: 2400, totalRestSeconds: 180, estimatedElapsedSeconds: 2580, requiredEquipment: ['bodyweight'], targetRegions: ['quadriceps', 'hamstrings'], recentLoadAdjustments: [], source: 'generated',
  };
}

function block(phase: WeeklyTrainingPlan['phase'] = 'offseason', sessionDate = '2026-07-22'): TrainingBlockPlan {
  const session: PlannedStrengthSession = {
    id: 'strength_1', date: sessionDate, order: 1, title: 'Durability strength', purpose: 'full_body', intendedLoad: 'high', focusTargets: [], workout: workout(), rationale: 'Build strength.', completionStatus: 'planned',
  };
  const week: WeeklyTrainingPlan = {
    id: 'week', createdAt: now, weekStartDate: '2026-07-20', weekNumber: 1, weeksUntilEvent: 12,
    goal: { id: 'goal', type: 'ironman_70_3', name: '70.3', weeksUntilEvent: 12, disciplines: ['swim', 'bike', 'run'], priority: 'perform', sessionsPerWeek: 3, defaultSessionMinutes: 40, createdAt: now, updatedAt: now },
    phase, headline: 'Test', phaseExplanation: '', sessions: [session], warnings: [],
  };
  return { id: 'block', createdAt: now, numberOfWeeks: 1, goal: week.goal, requestSnapshot: { availableEquipment: ['bodyweight'], excludedRegions: [], excludedMovementTags: [], difficulty: 'intermediate' }, weeks: [week] };
}

describe('V18.5 endurance load assessment', () => {
  it('treats a 30-mile run as an extreme high-confidence guardrail', () => {
    const assessed = assessEnduranceLoads({ activities: [activity({ name: '30 mile mountain run', movingTimeSeconds: 6 * 3600, distanceMeters: 48_300, elevationGainMeters: 2200, intensity: 'hard', relativeEffort: 320 })], now });
    expect(assessed[0]?.loadClass).toBe('extreme');
    expect(assessed[0]?.confidence).toBe('high');
    expect(assessed[0]?.extremeGuardrail).toBe(true);
  });

  it('uses Strava Relative Effort when enabled but can disable it', () => {
    const history = [activity({ id: 'old', startAt: '2026-07-10T14:00:00Z', startLocal: '2026-07-10T07:00:00', relativeEffort: 30 })];
    const target = activity({ id: 'new', name: 'Run', relativeEffort: 180, intensity: 'unknown' });
    expect(assessEnduranceLoads({ activities: [...history, target], useStravaRelativeEffort: true, now })[1]?.loadClass).toBe('hard');
    expect(assessEnduranceLoads({ activities: [...history, target], useStravaRelativeEffort: false, now })[1]?.relativeEffort).toBeUndefined();
  });
});

describe('V18.5 strength-priority recommendations', () => {
  it('keeps full strength after an easy run in offseason', () => {
    const snapshot = buildTrainingIntelligence({ block: block('offseason'), activities: [activity()], today: '2026-07-22', now });
    expect(snapshot.priority).toBe('strength_build');
    expect(snapshot.proposals[0]?.action).toBe('keep_strength');
  });

  it('reduces redundant volume after a hard run without removing all quad strength', () => {
    const run = activity({ name: '95 minute hilly run', movingTimeSeconds: 95 * 60, elevationGainMeters: 900, intensity: 'hard', relativeEffort: 135 });
    const snapshot = buildTrainingIntelligence({ block: block('build'), activities: [run], today: '2026-07-22', now });
    const proposal = snapshot.proposals[0]!;
    expect(proposal.action).toBe('reduce_strength_volume');
    expect(proposal.preservedStrengthRegions).toContain('quadriceps');
    const applied = applyStrengthAdjustmentProposal(block('build'), proposal, now);
    const exercises = applied.block.weeks[0]!.sessions[0]!.workout.stations.flatMap((station) => station.exercises);
    expect(exercises.some((item) => item.exerciseSnapshot.bodyRegions.some((load) => load.region === 'quadriceps'))).toBe(true);
    expect(applied.block.weeks[0]!.sessions[0]!.workout.totalWorkSeconds).toBeLessThan(2400);
  });

  it('automatically qualifies only the extreme guardrail and moves rather than deletes strength', () => {
    const extreme = activity({ name: 'Trail ultra', movingTimeSeconds: 6 * 3600, distanceMeters: 50_000, elevationGainMeters: 2500, intensity: 'race', relativeEffort: 330 });
    const plan = block('build', '2026-07-22');
    plan.weeks[0]!.weekStartDate = '2026-07-20';
    const snapshot = buildTrainingIntelligence({ block: plan, activities: [extreme], today: '2026-07-22', now });
    const proposal = snapshot.proposals[0]!;
    expect(proposal.confidence).toBe('high');
    expect(proposal.automaticEligible).toBe(true);
    expect(proposal.action).toBe('move_strength');
    const applied = applyStrengthAdjustmentProposal(plan, proposal, now);
    expect(applied.block.weeks[0]!.sessions).toHaveLength(1);
    expect(applied.block.weeks[0]!.sessions[0]!.date).not.toBe('2026-07-22');
  });

  it('does not auto-move a low-overlap upper-body session after an extreme run', () => {
    const extreme = activity({ name: 'Trail ultra', movingTimeSeconds: 6 * 3600, distanceMeters: 50_000, elevationGainMeters: 2500, intensity: 'race', relativeEffort: 330 });
    const plan = block('build', '2026-07-22');
    const session = plan.weeks[0]!.sessions[0]!;
    for (const station of session.workout.stations) {
      for (const item of station.exercises) {
        item.exerciseSnapshot.bodyRegions = [{ region: 'chest', load: 1, role: 'primary' }];
      }
    }
    session.intendedLoad = 'moderate';
    const snapshot = buildTrainingIntelligence({ block: plan, activities: [extreme], today: '2026-07-22', now });
    expect(snapshot.proposals[0]?.action).toBe('keep_strength');
    expect(snapshot.proposals[0]?.automaticEligible).toBe(false);
  });

  it('uses a race-specific phase to reduce dose while maintaining strength', () => {
    const hardRide = activity({ id: 'ride', discipline: 'bike', sportType: 'Ride', name: 'Long race-specific ride', movingTimeSeconds: 4 * 3600, distanceMeters: 130_000, intensity: 'hard', relativeEffort: 180 });
    const snapshot = buildTrainingIntelligence({ block: block('peak'), activities: [hardRide], today: '2026-07-22', now });
    expect(snapshot.priority).toBe('race_specific');
    expect(snapshot.proposals[0]?.action).toBe('reduce_strength_volume');
    expect(snapshot.proposals[0]?.explanation).toContain('strength exposure');
  });
});
