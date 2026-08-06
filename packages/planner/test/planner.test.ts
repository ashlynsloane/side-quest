import { describe, expect, it } from 'vitest';
import { exerciseSeed } from '@circuit/exercise-content';
import type { PerformanceGoal, WeeklyPlanRequest } from '@circuit/domain';
import { adaptTrainingBlock, determineTrainingPhase, generateTrainingBlock, generateWeeklyPlan, recommendToday, workoutForRecommendation } from '../src/index';

const equipment: WeeklyPlanRequest['availableEquipment'] = [
  'dumbbell',
  'kettlebell',
  'long_band',
  'mini_band',
  'bench',
  'box',
  'bosu',
];

function goal(overrides: Partial<PerformanceGoal> = {}): PerformanceGoal {
  return {
    id: 'goal_test',
    type: 'ironman_70_3',
    name: 'Ironman 70.3 in 8 weeks',
    weeksUntilEvent: 8,
    disciplines: ['swim', 'bike', 'run'],
    priority: 'perform',
    sessionsPerWeek: 3,
    defaultSessionMinutes: 40,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

function request(goalValue: PerformanceGoal): WeeklyPlanRequest {
  return {
    goal: goalValue,
    weekStartDate: '2026-07-20',
    availableEquipment: equipment,
    excludedRegions: [],
    excludedMovementTags: [],
    difficulty: 'intermediate',
    randomSeed: 'planner-test',
  };
}

describe('goal-based weekly planner', () => {
  it('maps common timelines to the intended training phase', () => {
    expect(determineTrainingPhase('ironman_70_3', 8)).toBe('build');
    expect(determineTrainingPhase('road_10k', 10)).toBe('build');
    expect(determineTrainingPhase('trail_100k', 15)).toBe('build');
    expect(determineTrainingPhase('road_10k', 1)).toBe('race_week');
    expect(determineTrainingPhase('general_offseason', 0)).toBe('offseason');
  });

  it('generates the requested number of coordinated 70.3 sessions', () => {
    const result = generateWeeklyPlan(request(goal()), { exercises: exerciseSeed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sessions).toHaveLength(3);
    expect(result.plan.phase).toBe('build');
    expect(result.plan.sessions[0].focusTargets.some((item) => item.region === 'hamstrings')).toBe(true);
    expect(result.plan.sessions[1].focusTargets.some((item) => item.region === 'upper_back')).toBe(true);
  });

  it('creates a trail-100K-specific week', () => {
    const result = generateWeeklyPlan(
      request(goal({
        type: 'trail_100k',
        name: 'Trail 100K',
        weeksUntilEvent: 20,
        disciplines: ['run'],
        sessionsPerWeek: 4,
      })),
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sessions).toHaveLength(4);
    expect(result.plan.sessions.some((session) =>
      session.focusTargets.some((target) => target.region === 'feet_ankles'),
    )).toBe(true);
    expect(result.plan.sessions.some((session) => session.title.includes('100K'))).toBe(true);
  });

  it('creates a swimrun plan with both swim and trail support', () => {
    const result = generateWeeklyPlan(
      request(goal({
        type: 'swimrun',
        name: 'Swimrun',
        weeksUntilEvent: 12,
        disciplines: ['swim', 'run'],
      })),
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sessions.some((session) => session.purpose === 'swim_support')).toBe(true);
    expect(result.plan.sessions.some((session) => session.purpose === 'trail_durability')).toBe(true);
  });

  it('creates a road-marathon durability plan', () => {
    const result = generateWeeklyPlan(
      request(goal({
        type: 'road_marathon',
        name: 'Road Marathon',
        weeksUntilEvent: 14,
        disciplines: ['run'],
      })),
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sessions.some((session) => session.title.includes('Marathon'))).toBe(true);
    expect(result.plan.sessions.some((session) =>
      session.focusTargets.some((target) => target.region === 'soleus'),
    )).toBe(true);
  });

  it('reduces race-week duration and removes jumping', () => {
    const result = generateWeeklyPlan(
      request(goal({
        type: 'road_10k',
        name: 'Road 10K',
        weeksUntilEvent: 1,
        disciplines: ['run'],
        sessionsPerWeek: 2,
        defaultSessionMinutes: 48,
      })),
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.phase).toBe('race_week');
    for (const session of result.plan.sessions) {
      expect(session.workout.totalWorkSeconds).toBe(24 * 60);
      expect(session.workout.request.excludedMovementTags).toContain('jumping');
      expect(session.workout.stations.flatMap((station) => station.exercises)
        .some((item) => item.exerciseSnapshot.avoidanceTags.includes('jumping'))).toBe(false);
    }
  });

  it('places lower-body strength away from the key run day when alternatives exist', () => {
    const result = generateWeeklyPlan(
      {
        ...request(goal()),
        preferredStrengthDays: ['monday', 'tuesday', 'thursday', 'friday'],
        enduranceSchedule: {
          keySwim: 'tuesday',
          keyBike: 'saturday',
          keyRun: 'sunday',
        },
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lowerBodySessions = result.plan.sessions.filter((session) => session.purpose !== 'swim_support');
    const lowerBodyDays = lowerBodySessions.map((session) => new Date(`${session.date}T12:00:00Z`).getUTCDay());
    expect(lowerBodyDays).not.toContain(0);
    expect(result.plan.sessions.every((session) => Boolean(session.placementNote))).toBe(true);
  });

  it('applies generalized PT restrictions to every generated session', () => {
    const result = generateWeeklyPlan(
      {
        ...request(goal()),
        excludedRegions: ['shoulders', 'shoulder'],
        excludedMovementTags: ['overhead', 'shoulder_weight_bearing'],
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const session of result.plan.sessions) {
      expect(session.workout.request.excludedRegions).toContain('shoulders');
      expect(session.workout.request.excludedMovementTags).toContain('overhead');
    }
  });

  it('generates an eight-week block whose phase advances toward the event', () => {
    const result = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 8, sessionsPerWeek: 2 })),
        numberOfWeeks: 8,
        preferredStrengthDays: ['tuesday', 'friday'],
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.weeks).toHaveLength(8);
    expect(result.block.weeks[0].phase).toBe('build');
    expect(result.block.weeks[7].phase).toBe('race_week');
    expect(result.block.weeks.map((week) => week.weeksUntilEvent)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('rejects a plan horizon that extends beyond the race', () => {
    const result = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 4, sessionsPerWeek: 2 })),
        numberOfWeeks: 8,
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('INVALID_GOAL');
  });

  it('includes power for an all-out sprint triathlon build', () => {
    const result = generateWeeklyPlan(
      request(goal({
        type: 'triathlon_sprint',
        name: 'Sprint Triathlon',
        weeksUntilEvent: 8,
        disciplines: ['swim', 'bike', 'run'],
        sessionsPerWeek: 3,
        priority: 'race',
      })),
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sessions.some((session) => session.purpose === 'power')).toBe(true);
  });

  it('adapts only upcoming sessions inside a temporary pain window', () => {
    const generated = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 8, sessionsPerWeek: 3 })),
        numberOfWeeks: 2,
        preferredStrengthDays: ['monday', 'wednesday', 'friday'],
      },
      { exercises: exerciseSeed },
    );
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const adapted = adaptTrainingBlock(
      generated.block,
      {
        id: 'checkin_knee',
        source: 'temporary_check_in',
        label: 'Temporary knee adjustment',
        activeFrom: '2026-07-22T08:00:00.000Z',
        activeUntil: '2026-07-26T23:59:59.000Z',
        excludedRegions: ['knee'],
        excludedMovementTags: ['deep_knee_flexion', 'jumping'],
        penalizedRegions: ['quadriceps'],
      },
      { exercises: exerciseSeed, now: '2026-07-22T08:00:00.000Z' },
    );
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) return;

    const affected = adapted.block.weeks
      .flatMap((week) => week.sessions)
      .filter((session) => session.date >= '2026-07-22' && session.date <= '2026-07-26');
    expect(affected.length).toBeGreaterThan(0);
    for (const session of affected) {
      expect(session.completionStatus).toBe('modified');
      expect(session.workout.request.excludedRegions).toContain('knee');
      expect(session.workout.request.excludedMovementTags).toContain('deep_knee_flexion');
    }
    const later = adapted.block.weeks
      .flatMap((week) => week.sessions)
      .filter((session) => session.date > '2026-07-26');
    expect(later.some((session) => !session.workout.request.excludedRegions.includes('knee'))).toBe(true);
  });

  it('can pause strength sessions inside a short check-in window', () => {
    const generated = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 8, sessionsPerWeek: 3 })),
        numberOfWeeks: 1,
        preferredStrengthDays: ['monday', 'wednesday', 'friday'],
      },
      { exercises: exerciseSeed },
    );
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const before = generated.block.weeks[0].sessions.length;
    const adapted = adaptTrainingBlock(
      generated.block,
      {
        id: 'pause_checkin',
        source: 'temporary_check_in',
        label: 'Temporary training pause',
        activeFrom: '2026-07-20T08:00:00.000Z',
        activeUntil: '2026-07-24T23:59:59.000Z',
        excludedRegions: [],
        excludedMovementTags: [],
        penalizedRegions: [],
        pauseStrengthTraining: true,
      },
      { exercises: exerciseSeed, now: '2026-07-20T08:00:00.000Z' },
    );
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) return;
    expect(adapted.block.weeks[0].sessions.length).toBeLessThan(before);
  });


  it('recommends a reduced version when soreness is active on a planned day', () => {
    const generated = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 8, sessionsPerWeek: 3 })),
        numberOfWeeks: 1,
        preferredStrengthDays: ['monday', 'wednesday', 'friday'],
      },
      { exercises: exerciseSeed },
    );
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const session = generated.block.weeks[0].sessions[0];
    const recommendation = recommendToday({
      block: generated.block,
      now: `${session.date}T08:00:00.000Z`,
      checkIn: {
        id: 'sore',
        status: 'muscle_soreness',
        severity: 3,
        affectedRegions: ['quadriceps'],
        aggravatedMovementTags: [],
        active: true,
        createdAt: `${session.date}T07:00:00.000Z`,
        activeUntil: `${session.date}T23:59:59.000Z`,
      },
    });
    expect(recommendation.status).toBe('planned_session');
    expect(recommendation.recommendedVariant).toBe('reduced');
    const workout = workoutForRecommendation(recommendation);
    expect(workout).not.toBeNull();
    expect(workout!.totalWorkSeconds).toBeLessThan(session.workout.totalWorkSeconds);
  });

  it('retains more anchor exercises across adjacent weeks in the same phase', () => {
    const generated = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 12, sessionsPerWeek: 2 })),
        numberOfWeeks: 2,
      },
      { exercises: exerciseSeed },
    );
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const first = new Set(generated.block.weeks[0].sessions[0].workout.stations.flatMap((station) => station.exercises.map((item) => item.exerciseId)));
    const second = generated.block.weeks[1].sessions[0].workout.stations.flatMap((station) => station.exercises.map((item) => item.exerciseId));
    expect(second.filter((id) => first.has(id)).length).toBeGreaterThan(0);
  });

  it('does not recommend a session that the athlete marked skipped', () => {
    const generated = generateTrainingBlock(
      {
        ...request(goal({ weeksUntilEvent: 8, sessionsPerWeek: 2 })),
        numberOfWeeks: 1,
        preferredStrengthDays: ['monday', 'friday'],
      },
      { exercises: exerciseSeed },
    );
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const session = generated.block.weeks[0].sessions[0];
    const skippedBlock = {
      ...generated.block,
      weeks: generated.block.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((item) => item.id === session.id
          ? { ...item, completionStatus: 'skipped' as const }
          : item),
      })),
    };
    const recommendation = recommendToday({
      block: skippedBlock,
      now: `${session.date}T08:00:00.000Z`,
    });
    expect(recommendation.status).toBe('no_strength_today');
    expect(recommendation.session?.id).not.toBe(session.id);
  });

});
