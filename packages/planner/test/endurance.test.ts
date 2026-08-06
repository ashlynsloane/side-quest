import type { EnduranceActivity, StrengthWorkoutLinkCandidate, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import {
  buildPostEnduranceReplanProposals,
  calculateEnduranceContributions,
  inferEnduranceIntensity,
  isMatchEligibleCalendarEvent,
  matchCompletedActivities,
  matchExternalTrainingToWorkouts,
} from '../src/endurance';

function activity(overrides: Partial<EnduranceActivity> = {}): EnduranceActivity {
  return {
    id: 'activity_1', source: 'strava', externalId: '123', name: 'Tuesday Threshold Run',
    discipline: 'run', sportType: 'Run', startAt: '2026-07-21T14:00:00.000Z',
    movingTimeSeconds: 3_600, elapsedTimeSeconds: 3_720, intensity: 'hard',
    importedAt: '2026-07-21T16:00:00.000Z', updatedAt: '2026-07-21T16:00:00.000Z',
    ...overrides,
  };
}

function event(overrides: Partial<TrainingCalendarEvent> = {}): TrainingCalendarEvent {
  return {
    id: 'event_1', sourceId: 'trainingpeaks', title: 'Threshold Run',
    startAt: '2026-07-21T13:30:00.000Z', endAt: '2026-07-21T14:30:00.000Z',
    allDay: false, discipline: 'run', externalUid: 'tp-1', ...overrides,
  };
}

describe('endurance matching', () => {
  it('canonically matches a close same-discipline planned event', () => {
    const [match] = matchCompletedActivities({ activities: [activity()], events: [event()] });
    expect(match?.status).toBe('matched');
    expect(match?.calendarEventId).toBe('event_1');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.68);
  });

  it('matches a Strava HIIT class to a planned Onix session', () => {
    const [match] = matchCompletedActivities({
      activities: [activity({ discipline: 'hiit', sportType: 'HighIntensityIntervalTraining', name: 'HIIT', startAt: '2026-07-21T14:00:00.000Z', classification: 'unclassified' })],
      events: [event({ discipline: 'other', title: 'X-Train: Onix', startAt: '2026-07-21T13:55:00.000Z', endAt: '2026-07-21T14:55:00.000Z' })],
    });
    expect(match?.status).toBe('matched');
    expect(match?.calendarEventId).toBe('event_1');
    expect(isMatchEligibleCalendarEvent(event({ discipline: 'other', title: 'X-Train: Onix' }))).toBe(true);
  });

  it('does not force an ambiguous match', () => {
    const events = [
      event({ id: 'event_a', title: 'Morning Run', startAt: '2026-07-21T13:00:00.000Z' }),
      event({ id: 'event_b', title: 'Evening Run', startAt: '2026-07-21T15:00:00.000Z' }),
    ];
    const [match] = matchCompletedActivities({ activities: [activity({ name: 'Run' })], events });
    expect(['ambiguous', 'unmatched']).toContain(match?.status);
  });
});

describe('canonical watch and Side Quest linking', () => {
  const workout: StrengthWorkoutLinkCandidate = {
    id: 'workout_1', name: 'Side Quest full-body strength', source: 'side_quest',
    startedAt: '2026-07-21T14:05:00.000Z', completedAt: '2026-07-21T15:00:00.000Z',
  };

  it('links an overlapping watch HIIT record to one Side Quest workout', () => {
    const [link] = matchExternalTrainingToWorkouts({
      activities: [activity({ discipline: 'hiit', name: 'HIIT', startAt: '2026-07-21T14:00:00.000Z', movingTimeSeconds: 3_600, elapsedTimeSeconds: 3_600 })],
      workouts: [workout],
    });
    expect(link?.status).toBe('linked');
    expect(link?.workoutId).toBe('workout_1');
    expect(link?.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('does not link a watch record several hours away', () => {
    const links = matchExternalTrainingToWorkouts({
      activities: [activity({ discipline: 'strength', startAt: '2026-07-21T08:00:00.000Z' })],
      workouts: [workout],
    });
    expect(links).toHaveLength(0);
  });

  it('keeps one-to-one workout linking when two watch records overlap', () => {
    const links = matchExternalTrainingToWorkouts({
      activities: [
        activity({ id: 'activity_a', discipline: 'hiit', startAt: '2026-07-21T14:00:00.000Z' }),
        activity({ id: 'activity_b', externalId: '456', discipline: 'strength', startAt: '2026-07-21T14:03:00.000Z' }),
      ],
      workouts: [workout],
    });
    expect(links.filter((link) => link.status === 'linked')).toHaveLength(1);
  });
});

describe('endurance contributions', () => {
  it('keeps endurance as a bounded conservative layer', () => {
    const summary = calculateEnduranceContributions(activity({ movingTimeSeconds: 7_200 }));
    expect(summary.contributions.length).toBeGreaterThan(4);
    expect(summary.totalContribution).toBeLessThanOrEqual(12);
    expect(summary.contributions.every((item) => item.rationale.includes('not treated as equivalent'))).toBe(true);
  });

  it('does not assign muscle credit to an unclassified external class', () => {
    const unclassified = calculateEnduranceContributions(activity({ discipline: 'hiit', classification: 'unclassified' }));
    expect(unclassified.totalContribution).toBe(0);
    expect(unclassified.contributions).toHaveLength(0);

    const classified = calculateEnduranceContributions(activity({ discipline: 'hiit', classification: 'full_body_strength' }));
    expect(classified.totalContribution).toBeGreaterThan(0);
    expect(classified.totalContribution).toBeLessThanOrEqual(4);
    expect(classified.contributions.every((item) => item.confidence === 'low')).toBe(true);
  });

  it('infers hard sessions from workout semantics', () => {
    expect(inferEnduranceIntensity({ name: '5 x 5 VO2 intervals', movingTimeSeconds: 3_000 })).toBe('hard');
    expect(inferEnduranceIntensity({ name: 'Recovery spin', movingTimeSeconds: 2_400 })).toBe('recovery');
  });
});

describe('post-endurance replanning', () => {
  it('moves a high-load strength session after a hard completed run', () => {
    const block = {
      id: 'block', createdAt: '2026-07-01T00:00:00.000Z', numberOfWeeks: 1,
      goal: { id: 'goal', type: 'road_half_marathon', name: 'Half', weeksUntilEvent: 10, disciplines: ['run'], priority: 'perform', sessionsPerWeek: 2, defaultSessionMinutes: 40, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
      weeks: [{
        id: 'week', createdAt: '2026-07-01T00:00:00.000Z', weekStartDate: '2026-07-20', goal: undefined as never,
        phase: 'build', headline: '', phaseExplanation: '', warnings: [],
        sessions: [{
          id: 'strength_1', date: '2026-07-22', order: 1, title: 'Lower-body strength', purpose: 'max_strength', intendedLoad: 'high', focusTargets: [], workout: { id: 'w' } as never,
          rationale: '', completionStatus: 'planned',
        }],
      }],
    } as TrainingBlockPlan;
    block.weeks[0]!.goal = block.goal;
    const proposals = buildPostEnduranceReplanProposals({
      block,
      activity: activity({ startAt: '2026-07-21T14:00:00.000Z', movingTimeSeconds: 5_400 }),
      today: '2026-07-21',
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.fromDate).toBe('2026-07-22');
    expect(proposals[0]?.toDate).toBe('2026-07-23');
  });

  it('does not automatically replan from an external HIIT class', () => {
    const block = {
      id: 'block', createdAt: '2026-07-01T00:00:00.000Z', numberOfWeeks: 1,
      goal: { id: 'goal', type: 'road_half_marathon', name: 'Half', weeksUntilEvent: 10, disciplines: ['run'], priority: 'perform', sessionsPerWeek: 2, defaultSessionMinutes: 40, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
      weeks: [{ id: 'week', createdAt: '2026-07-01T00:00:00.000Z', weekStartDate: '2026-07-20', goal: undefined as never, phase: 'build', headline: '', phaseExplanation: '', warnings: [], sessions: [{ id: 'strength_1', date: '2026-07-22', order: 1, title: 'Strength', purpose: 'full_body', intendedLoad: 'high', focusTargets: [], workout: { id: 'w' } as never, rationale: '', completionStatus: 'planned' }] }],
    } as TrainingBlockPlan;
    block.weeks[0]!.goal = block.goal;
    expect(buildPostEnduranceReplanProposals({ block, activity: activity({ discipline: 'hiit', classification: 'full_body_strength' }), today: '2026-07-21' })).toHaveLength(0);
  });
});
