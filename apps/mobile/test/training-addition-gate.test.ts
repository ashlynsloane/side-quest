import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';
import type { DailyTrainingCeiling, TrainingEvent } from '@circuit/planner';

const db = vi.hoisted(() => ({
  getActiveTrainingCheckIn: vi.fn(),
  getLatestTrainingBlock: vi.fn(),
  listEnduranceActivitiesForGuardrails: vi.fn(),
  listWorkoutLedgerEntriesForGuardrails: vi.fn(),
}));
const persistence = vi.hoisted(() => ({
  loadDailyCeiling: vi.fn(),
  saveDailyCeiling: vi.fn(),
  loadTrainingEvents: vi.fn(),
  recordTrainingEvent: vi.fn(),
}));
vi.mock('../src/services/database', () => db);
vi.mock('../src/services/training-guardrail-storage', () => persistence);

import {
  assessTrainingAddition,
  assessWorkoutStart,
  getEffectiveDailyCeiling,
  recordActualWorkoutCompletion,
  reconcileCompletedWorkoutHistory,
} from '../src/services/training-addition-gate';

const date = '2026-11-09';
const now = '2026-11-09T20:00:00.000Z';
const athlete = 'athlete-1';
let ceilings: Map<string, DailyTrainingCeiling>;
let events: Map<string, TrainingEvent[]>;

function key(id: string, day: string) { return `${id}:${day}`; }
function workout(regions: string[] = ['core_anterior']): GeneratedWorkout {
  return {
    id: 'workout-1', name: 'Core strength', createdAt: now, randomSeed: 'seed',
    request: { restSeconds: 30 } as GeneratedWorkout['request'],
    stations: [{
      id: 'station-1', order: 0, format: 'amrap', durationSeconds: 1200,
      purpose: 'strength',
      exercises: [{
        exerciseId: 'exercise-1',
        exerciseSnapshot: {
          id: 'exercise-1', name: 'Core exercise',
          bodyRegions: regions.map((region) => ({ region, role: 'primary', load: 1 })),
          jointLoads: [], movementPatterns: [],
          impactLevel: 0, balanceDemand: 0, cardiovascularDemand: 0,
        },
        equipmentOptionId: 'bodyweight', prescriptionId: 'p',
        unit: 'total', target: 10, order: 0,
      }],
    }],
    totalWorkSeconds: 1200, totalRestSeconds: 0, estimatedElapsedSeconds: 1200,
    requiredEquipment: [], targetRegions: regions, recentLoadAdjustments: [],
    source: 'generated',
  } as unknown as GeneratedWorkout;
}
function scheduled(w = workout()) {
  db.getLatestTrainingBlock.mockResolvedValue({
    block: { weeks: [{ sessions: [{
      id: 'session-1', date, completionStatus: 'planned', workout: w,
    }] }] },
  });
}
function ready(w = workout()): DailyTrainingCeiling {
  return {
    date, planned: [{
      activity: 'strength', sessionId: 'session-1', minutes: 20,
      regions: w.targetRegions.includes('gastrocnemius')
        ? ['general', 'achilles'] : ['general'],
    }],
    recovery: { general: 'stable', achilles: 'stable', upper_back: 'stable' },
    restrictUnplanned: true,
    recoveryObservedAt: { general: now, achilles: now, upper_back: now },
  };
}
function completion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-1_2026-11-09T18:00:00.000Z',
    workout: workout(), plannedSessionId: 'session-1',
    startedAt: '2026-11-09T17:40:00.000Z',
    completedAt: '2026-11-09T18:00:00.000Z',
    completionFraction: 1, updatedAt: '2026-11-09T18:00:01.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  vi.resetAllMocks();
  ceilings = new Map();
  events = new Map();
  db.getLatestTrainingBlock.mockResolvedValue(null);
  db.getActiveTrainingCheckIn.mockResolvedValue({
    status: 'normal', createdAt: '2026-11-09T15:00:00.000Z', active: true,
  });
  db.listEnduranceActivitiesForGuardrails.mockResolvedValue([]);
  db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([]);
  persistence.loadDailyCeiling.mockImplementation(async (id: string, day: string) =>
    ceilings.get(key(id, day)) ?? null);
  persistence.saveDailyCeiling.mockImplementation(async (id: string, ceiling: DailyTrainingCeiling) => {
    if (!ceilings.has(key(id, ceiling.date))) ceilings.set(key(id, ceiling.date), ceiling);
  });
  persistence.loadTrainingEvents.mockImplementation(async (id: string, day: string) =>
    [...(events.get(key(id, day)) ?? [])]);
  persistence.recordTrainingEvent.mockImplementation(async (id: string, event: TrainingEvent, day: string) => {
    const existing = events.get(key(id, day)) ?? [];
    if (!existing.some((item) => item.id === event.id))
      events.set(key(id, day), [...existing, { ...event, trainingDate: day }]);
  });
});

describe('mobile workout authorization — service integration', () => {
  it('starts only scheduled activity with a current prescription and persists an assessment', async () => {
    const w = workout();
    scheduled(w);
    ceilings.set(key(athlete, date), ready(w));
    const authorized = await assessWorkoutStart({
      userId: athlete, workout: w, sessionId: 'session-1',
    });
    expect(authorized.result.decision).toBe('allow');
    expect(authorized.authorized).toBe(true);
    expect(events.get(key(athlete, date))?.map((event) => event.kind)).toEqual(['assessment']);
  });

  it('does not permit a second scheduled start after completed exposure without a fresh check', async () => {
    const w = workout();
    scheduled(w);
    ceilings.set(key(athlete, date), ready(w));
    db.listWorkoutLedgerEntriesForGuardrails.mockImplementation(async () => [completion()]);
    const response = await assessWorkoutStart({
      userId: athlete, workout: w, sessionId: 'session-1',
      overrideReason: 'I have energy and want to add more training',
    });
    expect(response.authorized).toBe(false);
    expect(response.result.overrideAllowed).toBe(false);
    expect(events.get(key(athlete, date))?.map((event) => event.kind)).toEqual([
      'completed', 'assessment',
    ]);
  });

  it('logs an explicit discretionary exception only for a first unscheduled session', async () => {
    const w = workout();
    const before = await assessWorkoutStart({ userId: athlete, workout: w });
    expect(before.authorized).toBe(false);
    const after = await assessWorkoutStart({
      userId: athlete, workout: w,
      overrideReason: 'I reviewed recovery and have a documented reason for this unplanned session',
    });
    expect(after.authorized).toBe(true);
    expect(events.get(key(athlete, date))?.filter((event) => event.kind === 'override')).toHaveLength(1);
  });

  it('does not let an override bypass the missing-plan guard after recorded activity', async () => {
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([completion()]);
    const result = await assessWorkoutStart({
      userId: athlete, workout: workout(),
      overrideReason: 'I insist on training again despite the limit',
    });
    expect(result.authorized).toBe(false);
    expect(result.result.overrideAllowed).toBe(false);
  });

  it('respects a current no-training check-in without any scheduled workout', async () => {
    db.getActiveTrainingCheckIn.mockResolvedValue({
      status: 'unable_to_train', active: true, createdAt: now,
    });
    const result = await assessWorkoutStart({
      userId: athlete, workout: workout(), overrideReason: 'More exercise',
    });
    expect(result.result.decision).toBe('stop');
    expect(result.authorized).toBe(false);
  });

  it('keeps Achilles exposure independent and reviews yesterday\'s ride', async () => {
    const w = workout(['gastrocnemius']);
    scheduled(w);
    ceilings.set(key(athlete, date), ready(w));
    db.listEnduranceActivitiesForGuardrails.mockResolvedValue([{
      id: 'ride', discipline: 'bike', startAt: '2026-11-08T20:00:00.000Z',
      movingTimeSeconds: 900, classification: 'conditioning',
    }]);
    const result = await assessWorkoutStart({
      userId: athlete, workout: w, sessionId: 'session-1',
    });
    expect(result.authorized).toBe(false);
    expect(result.result.decision).toBe('defer');
    expect(result.result.reasons.join(' ')).toContain('overlaps');
  });

  it('does not create or authorize a workout when the history read fails', async () => {
    scheduled();
    db.listWorkoutLedgerEntriesForGuardrails.mockRejectedValue(new Error('database unavailable'));
    await expect(assessWorkoutStart({
      userId: athlete, workout: workout(), sessionId: 'session-1',
    })).rejects.toThrow('database unavailable');
    expect(persistence.recordTrainingEvent).not.toHaveBeenCalled();
  });

  it('does not claim authorization when the assessment event cannot be committed', async () => {
    scheduled();
    ceilings.set(key(athlete, date), ready());
    persistence.recordTrainingEvent.mockRejectedValue(new Error('disk full'));
    await expect(assessWorkoutStart({
      userId: athlete, workout: workout(), sessionId: 'session-1',
    })).rejects.toThrow('disk full');
  });
});

describe('mobile completed history — persistence integration', () => {
  it('reconciles a completed workout idempotently and verifies its source ID', async () => {
    const entry = completion();
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([entry]);
    await recordActualWorkoutCompletion({
      userId: athlete, workout: workout(), completedAt: entry.completedAt,
      completionFraction: 1,
    });
    await recordActualWorkoutCompletion({
      userId: athlete, workout: workout(), completedAt: entry.completedAt,
      completionFraction: 1,
    });
    expect(events.get(key(athlete, date))?.filter((event) => event.kind === 'completed')).toHaveLength(1);
  });

  it('does not claim completion when no corresponding ledger source exists', async () => {
    await expect(recordActualWorkoutCompletion({
      userId: athlete, workout: workout(),
      completedAt: '2026-11-09T18:00:00.000Z', completionFraction: 1,
    })).rejects.toThrow('could not be verified');
  });

  it('retracts deleted workout data before the next start assessment', async () => {
    const entry = completion();
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([entry]);
    await reconcileCompletedWorkoutHistory(athlete, date);
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([]);
    await reconcileCompletedWorkoutHistory(athlete, date);
    expect(events.get(key(athlete, date))?.map((item) => item.kind)).toEqual([
      'completed', 'retracted',
    ]);
  });

  it('does not confuse one athlete\'s recovery budget and event log with another\'s', async () => {
    scheduled();
    ceilings.set(key(athlete, date), ready());
    const first = await getEffectiveDailyCeiling(athlete, date);
    const second = await getEffectiveDailyCeiling('athlete-2', date);
    expect(first).not.toBeNull();
    expect(second?.date).toBe(date);
    expect(ceilings.size).toBe(2);
    await assessTrainingAddition({
      userId: athlete, date, requestId: 'review-1', occurredAt: now,
      proposed: { activity: 'strength', sessionId: 'session-1', minutes: 20,
        regions: ['general'], scheduled: true },
    });
    expect(events.get(key('athlete-2', date))).toBeUndefined();
  });
});
