import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  applyCompletedWorkoutAdaptationToProgressionHistory,
  buildCompletedWorkoutAdaptationSnapshot,
  classifyStrengthResponse,
  summarizeStrengthAdaptation,
  type StrengthSessionResponseEvidence,
} from '../../../apps/mobile/src/services/completed-workout-adaptation';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

function workout(id: string, exercises = ['goblet_squat', 'row']) {
  return {
    id,
    name: id,
    source: 'generated',
    estimatedElapsedSeconds: 2400,
    request: { restSeconds: 60 },
    stations: [{
      id: `${id}_station`,
      order: 1,
      purpose: 'Strength',
      durationSeconds: 1200,
      exercises: exercises.map((exerciseId) => ({
        exerciseId,
        exerciseSnapshot: { name: exerciseId },
      })),
    }],
  } as any;
}

function block(status: 'planned' | 'completed' | 'skipped' = 'planned') {
  return {
    id: 'block',
    goal: { name: 'Goal' },
    weeks: [{
      weekStartDate: '2026-08-03',
      sessions: [{
        id: 'strength_1',
        date: '2026-08-05',
        title: 'Strength A',
        completionStatus: status,
        workout: workout('planned_workout'),
      }],
    }],
  } as any;
}

function history({
  completionFraction = 1,
  exercises = ['goblet_squat', 'row'],
  difficulty,
  rpe,
  energyAfter,
  occurredAt = '2026-08-05T18:00:00.000Z',
}: {
  completionFraction?: number;
  exercises?: string[];
  difficulty?: 'too_easy' | 'appropriate' | 'too_hard';
  rpe?: number;
  energyAfter?: number;
  occurredAt?: string;
} = {}) {
  return {
    kind: 'strength',
    id: 'strength:ledger_1',
    occurredAt,
    needsReview: false,
    workout: {
      id: 'ledger_1',
      name: 'Strength A',
      workout: workout('active_workout', exercises),
      startedAt: '2026-08-05T17:20:00.000Z',
      completedAt: occurredAt,
      completionFraction,
      plannedSessionId: 'strength_1',
      relationToPlan: 'completed_planned',
      exercises: [],
      stationRounds: {},
      source: 'side_quest',
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
    ...(difficulty ? {
      feedback: {
        workoutInstanceId: 'ledger_1',
        workoutId: 'active_workout',
        difficulty,
        createdAt: occurredAt,
      },
    } : {}),
    ...(rpe !== undefined || energyAfter !== undefined ? {
      reflection: {
        workoutInstanceId: 'ledger_1',
        workoutId: 'active_workout',
        workoutName: 'Strength A',
        ...(rpe !== undefined ? { rpe } : {}),
        ...(energyAfter !== undefined ? { energyAfter } : {}),
        completedAt: occurredAt,
        createdAt: occurredAt,
      },
    } : {}),
  } as any;
}

function evidence(
  response: StrengthSessionResponseEvidence['response'],
  overrides: Partial<StrengthSessionResponseEvidence> = {},
): StrengthSessionResponseEvidence {
  return {
    workoutInstanceId: Math.random().toString(),
    plannedSessionId: 'strength_1',
    sessionTitle: 'Strength A',
    occurredAt: '2026-08-05T18:00:00.000Z',
    completionKind: 'completed_as_planned',
    response,
    completionFraction: 1,
    modifiedFromPlan: false,
    reasons: [],
    progressionSignal: 'completed_as_planned',
    ...overrides,
  };
}

describe('completed-workout closed-loop adaptation V1', () => {
  it('classifies a fully completed manageable prescription as well tolerated', () => {
    expect(classifyStrengthResponse({
      completionFraction: 1,
      modifiedFromPlan: false,
      difficulty: 'appropriate',
      rpe: 6,
      energyAfter: 3,
    })).toBe('well_tolerated');
  });

  it('classifies a full workout with an exercise substitution separately from completed-as-planned', () => {
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [history({ exercises: ['split_squat', 'row'], difficulty: 'appropriate', rpe: 6 })],
      block: block(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T12:00:00.000Z',
    });
    const response = snapshot.strength.appliedResponses[0]!;
    expect(response.completionKind).toBe('completed_modified');
    expect(response.response).toBe('tolerated_with_modification');
    expect(response.progressionSignal).toBe('suppress');
  });

  it('does not let a modified completion unlock completed-as-planned progression evidence', () => {
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [history({ exercises: ['split_squat', 'row'], difficulty: 'appropriate', rpe: 6 })],
      block: block(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T12:00:00.000Z',
    });
    const adjusted = applyCompletedWorkoutAdaptationToProgressionHistory([{
      discipline: 'strength',
      completedAt: '2026-08-05T18:00:00.000Z',
      completedAsPlanned: true,
      rpe: 6,
    }], snapshot);
    expect(adjusted[0]?.completedAsPlanned).toBeUndefined();
    expect(adjusted[0]?.rpe).toBe(6);
  });

  it('keeps a clearly under-completed session as negative completion evidence', () => {
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [history({ completionFraction: 0.6 })],
      block: block(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T12:00:00.000Z',
    });
    const adjusted = applyCompletedWorkoutAdaptationToProgressionHistory([{
      discipline: 'strength',
      completedAt: '2026-08-05T18:00:00.000Z',
      completedAsPlanned: true,
    }], snapshot);
    expect(snapshot.strength.appliedResponses[0]?.response).toBe('under_completed');
    expect(adjusted[0]?.completedAsPlanned).toBe(false);
  });

  it('keeps explicit too-hard response distinct from completion status', () => {
    expect(classifyStrengthResponse({
      completionFraction: 1,
      modifiedFromPlan: false,
      difficulty: 'too_hard',
      rpe: 8,
    })).toBe('poorly_tolerated');
  });

  it('requires repeated clean evidence before calling progression available', () => {
    const one = summarizeStrengthAdaptation(
      [evidence('well_tolerated')],
      [],
      [],
      'none',
    );
    const two = summarizeStrengthAdaptation(
      [
        evidence('well_tolerated', { occurredAt: '2026-08-08T18:00:00.000Z' }),
        evidence('well_tolerated', { occurredAt: '2026-08-05T18:00:00.000Z' }),
      ],
      [],
      [],
      'none',
    );
    expect(one.action).toBe('learning');
    expect(two.action).toBe('progress_eligible');
  });

  it('treats repeated too-hard or incomplete responses as a protection signal', () => {
    const summary = summarizeStrengthAdaptation(
      [
        evidence('poorly_tolerated'),
        evidence('under_completed', { completionKind: 'completed_partial', progressionSignal: 'not_completed_as_planned' }),
      ],
      [],
      [],
      'none',
    );
    expect(summary.action).toBe('protect');
  });

  it('does not interpret a skip as inability to tolerate the workout', () => {
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [],
      block: block('skipped'),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T12:00:00.000Z',
    });
    expect(snapshot.strength.action).toBe('learning');
    expect(snapshot.strength.body).toMatch(/not evidence that the athlete could not tolerate/i);
  });

  it('lets an active symptom restriction override otherwise positive progression evidence', () => {
    const summary = summarizeStrengthAdaptation(
      [
        evidence('well_tolerated'),
        evidence('well_tolerated'),
      ],
      [],
      [],
      'monitor',
    );
    expect(summary.action).toBe('hold');
    expect(summary.title).toContain('holding');
  });

  it('freezes this week decision evidence at week entry and queues current-week responses for next week', () => {
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [
        history({ occurredAt: '2026-08-05T18:00:00.000Z', difficulty: 'appropriate', rpe: 6 }),
        history({ occurredAt: '2026-08-11T18:00:00.000Z', difficulty: 'appropriate', rpe: 6 }),
      ],
      block: block(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T20:00:00.000Z',
    });
    expect(snapshot.strength.appliedResponses).toHaveLength(1);
    expect(snapshot.strength.pendingResponses).toHaveLength(1);
    expect(snapshot.strength.pendingNote).toMatch(/next planning decision/i);
  });

  it('wires the interpretation layer before current-week progression persistence', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('buildCompletedWorkoutAdaptationSnapshot({');
    expect(runtime).toContain('const rawCompletedHistory = progressionHistoryFromTrainingHistory(trainingHistory)');
    expect(runtime).toContain('applyCompletedWorkoutAdaptationToProgressionHistory(');
    expect(runtime).toContain('historyEnteringWeek(allCompletedHistory, currentWeekStart)');
    expect(runtime.indexOf('applyCompletedWorkoutAdaptationToProgressionHistory('))
      .toBeLessThan(runtime.indexOf('applyCurrentWeekStrengthProgression('));
  });

  it('shows one compact explanation on Week instead of a new analytics surface', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('COMPLETED-WORKOUT ADAPTATION');
    expect(plan).toContain('signal.actionLabel');
    expect(plan).toContain('signal.pendingNote');
    expect(plan).toContain('getLatestCompletedWorkoutAdaptationSnapshot()');
  });
});
