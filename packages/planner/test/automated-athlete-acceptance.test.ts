import { describe, expect, it } from 'vitest';
import type { PerformanceGoal, TrainingCalendarEvent } from '@circuit/domain';
import { resolveFirstWeekCapacity } from '../src/first-week-capacity';
import { buildFirstWeekTrainingSummary } from '../src/first-week-training-summary';
import { createManualEnduranceActivity } from '../src/manual-endurance';

const WEEK = '2026-11-02';
const capacity = (overrides: Record<string, unknown> = {}) => ({
  totalWeeklyHours: 10,
  currentEnduranceHours: 5,
  enduranceHoursEvidence: 'athlete_reported',
  runStatus: 'normal',
  maxRunMilesLast12Weeks: 20,
  runMileageEvidence: 'athlete_reported',
  boneStressInjuryHistory: 'none',
  swimProficiency: 'average',
  bikeProficiency: 'average',
  runProficiency: 'average',
  strengthExperience: 'intermediate',
  ...overrides,
});
const goal = (profile?: Record<string, unknown>): PerformanceGoal => ({
  type: 'ironman_70_3',
  sessionsPerWeek: 3,
  defaultSessionMinutes: 40,
  disciplines: ['swim', 'bike', 'run'],
  ...(profile === undefined ? {} : { capacityProfile: profile }),
} as unknown as PerformanceGoal);
const event = (id: string, date: string, discipline: 'run' | 'bike' | 'swim',
  duration?: number, sourceId = 'side_quest_generated_plan'): TrainingCalendarEvent => ({
  id, sourceId, title: id, discipline, allDay: true,
  startAt: date + 'T12:00:00.000Z', endAt: date + 'T13:00:00.000Z',
  description: duration === undefined ? 'Unmeasured plan'
    : 'Side Quest generated · ' + duration + ' min · easy',
});
const recorded = (overrides: Record<string, unknown> = {}) => ({
  id: 'athlete-a:run:1',
  name: 'Actual run',
  discipline: 'run',
  localDate: '2026-10-28',
  durationMinutes: 40,
  intensity: 'easy',
  recordedAt: '2026-10-30T12:00:00.000Z',
  ...overrides,
} as Parameters<typeof createManualEnduranceActivity>[0]);

describe('Synthetic athlete acceptance matrix: provenance', () => {
  const athletes = [
    { name: 'unobserved beginner', profile: undefined, expected: 'unknown' },
    { name: 'reported triathlete', profile: capacity(), expected: 'athlete_reported' },
    { name: 'observed endurance', profile: capacity({
      enduranceHoursEvidence: 'source_observed',
    }), expected: 'source_observed' },
    { name: 'return-to-running athlete', profile: capacity({
      runStatus: 'return_to_run',
      enduranceHoursEvidence: 'unverified_planning_assumption',
    }), expected: 'provisional_availability' },
    { name: 'athlete with absent source coverage', profile: capacity({
      enduranceHoursEvidence: 'unknown',
    }), expected: 'unknown' },
  ];
  it.each(athletes)('$name preserves provenance rather than inventing observations',
    ({ profile, expected }) => {
      const result = resolveFirstWeekCapacity(goal(profile));
      expect(result.evidence).toBe(expected);
      expect(result.needsRecentTrainingReview).toBe(expected !== 'source_observed');
      expect(result.currentEnduranceHours).toBe(profile?.currentEnduranceHours ?? 0);
    });
  it('legacy scheduling allowance is not labeled observed training', () => {
    const result = resolveFirstWeekCapacity(goal());
    expect(result.totalWeeklyHours).toBeGreaterThan(0);
    expect(result.currentEnduranceHours).toBe(0);
    expect(result.evidence).toBe('unknown');
    expect(result.runStatus).toBe('not_running');
    expect(result.needsRecentTrainingReview).toBe(true);
  });
  it('preserves current restriction context when provided', () => {
    const result = resolveFirstWeekCapacity(goal(capacity({
      runStatus: 'not_running', boneStressInjuryHistory: 'recent_or_current',
    })));
    expect(result.runStatus).toBe('not_running');
    expect(result.boneStressInjuryHistory).toBe('recent_or_current');
  });
});

describe('Synthetic planning: do not conflate intention, source or observation', () => {
  it('creates a seven-day multisport proposal without claiming completed training', () => {
    const summary = buildFirstWeekTrainingSummary({
      weekStartDate: WEEK, timezone: 'America/Denver', strengthSessions: [],
      generatedEvents: [
        event('swim', '2026-11-02', 'swim', 45),
        event('ride', '2026-11-04', 'bike', 90),
        event('run', '2026-11-06', 'run', 30),
      ],
    });
    expect(summary.days).toHaveLength(7);
    expect(summary.counts).toEqual({ strength: 0, swim: 1, bike: 1, run: 1 });
    expect(summary.knownPlannedMinutes).toBe(165);
    expect(summary.evidenceStatus).toBe('provisional_unverified');
  });
  it('keeps missing planned dose unknown rather than interpreting it as zero', () => {
    const summary = buildFirstWeekTrainingSummary({
      weekStartDate: WEEK, timezone: 'America/Denver', strengthSessions: [],
      generatedEvents: [event('unknown-run', '2026-11-03', 'run')],
    });
    expect(summary.unknownDurationCount).toBe(1);
    expect(summary.sessions[0]?.plannedMinutes).toBeNull();
  });
  it('never credits an external calendar entry as a generated activity', () => {
    const summary = buildFirstWeekTrainingSummary({
      weekStartDate: WEEK, timezone: 'America/Denver', strengthSessions: [],
      generatedEvents: [event('calendar', '2026-11-03', 'bike', 100, 'trainingpeaks_ics')],
    });
    expect(summary.sessions).toHaveLength(0);
  });
  it('does not absorb previous or following week workouts', () => {
    const summary = buildFirstWeekTrainingSummary({
      weekStartDate: WEEK, timezone: 'America/Denver', strengthSessions: [],
      generatedEvents: [
        event('previous', '2026-11-01', 'run', 35),
        event('following', '2026-11-09', 'run', 35),
      ],
    });
    expect(summary.sessions).toHaveLength(0);
  });
});

describe('Synthetic completion: manual endurance records', () => {
  it.each(['run', 'bike', 'swim'] as const)(
    'records an actual %s session with stable identity and dose', sport => {
      const result = createManualEnduranceActivity(recorded({ discipline: sport }));
      expect(result.source).toBe('manual');
      expect(result.id).toBe('athlete-a:run:1');
      expect(result.movingTimeSeconds).toBe(2400);
      expect(result.manual).toBe(true);
    });
  it('preserves missing distance without inferring speed or mileage', () => {
    const result = createManualEnduranceActivity(recorded({ distanceKm: null }));
    expect(result.distanceMeters).toBeUndefined();
  });
  it('rejects future-dated completed training', () => {
    expect(() => createManualEnduranceActivity(recorded({
      localDate: '2026-11-05',
    }))).toThrow(/future/i);
  });
  it.each([0, -1, 1441, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid observed duration %s', minutes => {
      expect(() => createManualEnduranceActivity(recorded({
        durationMinutes: minutes,
      }))).toThrow();
    });
  it('rejects nonexistent dates rather than normalizing them', () => {
    expect(() => createManualEnduranceActivity(recorded({
      localDate: '2026-02-30',
    }))).toThrow(/Invalid local workout date/);
  });
  it('is deterministic for identical observed activity inputs', () => {
    const input = recorded();
    expect(createManualEnduranceActivity(input)).toEqual(createManualEnduranceActivity(input));
  });
});
