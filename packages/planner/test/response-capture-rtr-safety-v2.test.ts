import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildEnduranceResponseRequests,
  enduranceResponseEvidence,
  isClearedReturnToRunResponse,
  summarizeEnduranceAdaptation,
  summarizeReturnToRunAdaptation,
  type EnduranceSessionResponseEvidence,
} from '../../../apps/mobile/src/services/completed-workout-adaptation';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

function item({
  occurredAt = '2026-08-09T15:00:00.000Z',
  discipline = 'bike',
  title = 'VO2 · 6 × 4',
  plannedMinutes = 60,
  actualMinutes = 60,
  response = undefined,
}: {
  occurredAt?: string;
  discipline?: 'swim' | 'bike' | 'run';
  title?: string;
  plannedMinutes?: number;
  actualMinutes?: number;
  response?: any;
} = {}) {
  const activityId = `activity_${occurredAt}_${discipline}`;
  return {
    kind: 'endurance',
    id: `endurance:${activityId}`,
    occurredAt,
    needsReview: false,
    activity: {
      id: activityId,
      discipline,
      movingTimeSeconds: actualMinutes * 60,
      intensity: title.includes('VO2') ? 'hard' : 'easy',
      startAt: occurredAt,
    },
    plannedMatch: {
      id: `match_${activityId}`,
      activityId,
      calendarEventId: `event_${activityId}`,
      status: 'matched',
      confidence: 0.99,
      updatedAt: occurredAt,
    },
    plannedEvent: {
      id: `event_${activityId}`,
      sourceId: 'side_quest_plan',
      title,
      startAt: occurredAt,
      endAt: new Date(Date.parse(occurredAt) + plannedMinutes * 60_000).toISOString(),
      allDay: false,
      discipline,
      description: `Side Quest generated · ${plannedMinutes} min · ${title.includes('VO2') ? 'hard' : 'easy'}`,
    },
    response,
  } as any;
}

function cleanResponse(activityId: string, plannedEventId: string, nextDayStatus?: 'same_or_better' | 'worse') {
  return {
    activityId,
    plannedEventId,
    perceivedDifficulty: 'about_right',
    sessionRpe: 5,
    symptomsDuring: false,
    symptomsAfter: false,
    ...(nextDayStatus ? { nextDayStatus } : {}),
    createdAt: '2026-08-09T16:00:00.000Z',
    updatedAt: '2026-08-09T16:00:00.000Z',
  };
}

function evidence(overrides: Partial<EnduranceSessionResponseEvidence> = {}): EnduranceSessionResponseEvidence {
  return {
    activityId: Math.random().toString(),
    plannedEventId: Math.random().toString(),
    discipline: 'bike',
    role: 'quality',
    sessionTitle: 'VO2 · 6 × 4',
    occurredAt: '2026-08-09T15:00:00.000Z',
    completionKind: 'completed_as_planned',
    response: 'well_tolerated',
    plannedDurationMinutes: 60,
    actualDurationMinutes: 60,
    completionRatio: 1,
    modifiedFromPlan: false,
    athleteResponseRecorded: true,
    perceivedDifficulty: 'about_right',
    sessionRpe: 5,
    symptomsDuring: false,
    symptomsAfter: false,
    reasons: [],
    progressionSignal: 'completed_as_planned',
    ...overrides,
  };
}

describe('endurance response capture + RTR safety V2', () => {
  it('does not treat duration-only quality completion as clean tolerance', () => {
    const response = enduranceResponseEvidence(item());
    expect(response?.completionKind).toBe('completed_as_planned');
    expect(response?.response).toBe('unknown');
    expect(response?.athleteResponseRecorded).toBe(false);
    expect(response?.progressionSignal).toBe('suppress');
  });

  it('turns an about-right symptom-free response into clean quality evidence', () => {
    const base = item();
    base.response = cleanResponse(base.activity.id, base.plannedEvent.id);
    const response = enduranceResponseEvidence(base);
    expect(response?.response).toBe('well_tolerated');
    expect(response?.progressionSignal).toBe('completed_as_planned');
  });

  it('suppresses progression when the completed session was rated too hard', () => {
    const base = item();
    base.response = {
      ...cleanResponse(base.activity.id, base.plannedEvent.id),
      perceivedDifficulty: 'too_hard',
      sessionRpe: 9,
    };
    const response = enduranceResponseEvidence(base);
    expect(response?.response).toBe('poorly_tolerated');
    expect(response?.progressionSignal).toBe('suppress');
  });

  it('treats symptoms around a completed endurance session as symptom-limited evidence', () => {
    const base = item();
    base.response = {
      ...cleanResponse(base.activity.id, base.plannedEvent.id),
      symptomsDuring: true,
    };
    const response = enduranceResponseEvidence(base);
    expect(response?.response).toBe('symptom_limited');
    expect(response?.progressionSignal).toBe('suppress');
  });

  it('requires an athlete response before two clean quality sessions can unlock progression', () => {
    const noResponse = evidence({
      athleteResponseRecorded: false,
      response: 'unknown',
      progressionSignal: 'suppress',
    });
    const clean = evidence({ occurredAt: '2026-08-07T15:00:00.000Z' });
    expect(summarizeEnduranceAdaptation('bike', [noResponse, clean], [], 'none').action).toBe('learning');
    expect(summarizeEnduranceAdaptation('bike', [
      evidence(),
      evidence({ occurredAt: '2026-08-07T15:00:00.000Z' }),
    ], [], 'none').action).toBe('progress_eligible');
  });

  it('does not clear RTR immediately after the run, even with no symptoms', () => {
    const rtr = item({ discipline: 'run', title: 'Easy Return to Run' });
    rtr.response = cleanResponse(rtr.activity.id, rtr.plannedEvent.id);
    const response = enduranceResponseEvidence(rtr)!;
    expect(response.response).toBe('unknown');
    expect(response.nextDayStatus).toBeUndefined();
    expect(isClearedReturnToRunResponse(response)).toBe(false);
  });

  it('requires explicit same-or-better next-day status for RTR clearance', () => {
    const rtr = item({ discipline: 'run', title: 'Easy Return to Run' });
    rtr.response = cleanResponse(rtr.activity.id, rtr.plannedEvent.id, 'same_or_better');
    const response = enduranceResponseEvidence(rtr)!;
    expect(response.response).toBe('well_tolerated');
    expect(isClearedReturnToRunResponse(response)).toBe(true);
  });

  it('protects RTR immediately after worse next-day status', () => {
    const bad = evidence({
      discipline: 'run',
      role: 'return_to_run',
      response: 'symptom_limited',
      nextDayStatus: 'worse',
      progressionSignal: 'not_completed_as_planned',
    });
    const summary = summarizeReturnToRunAdaptation([bad], [], 'none', '2026-08-10T12:00:00.000Z');
    expect(summary.action).toBe('protect');
    expect(summary.body).toMatch(/worse next-day/i);
  });

  it('only allows RTR progression after three separated fully cleared exposures', () => {
    const cleared = (occurredAt: string) => evidence({
      discipline: 'run',
      role: 'return_to_run',
      occurredAt,
      nextDayStatus: 'same_or_better',
      progressionSignal: 'suppress',
    });
    const summary = summarizeReturnToRunAdaptation([
      cleared('2026-08-09T15:00:00.000Z'),
      cleared('2026-08-07T15:00:00.000Z'),
      cleared('2026-08-05T15:00:00.000Z'),
    ], [], 'none', '2026-08-10T12:00:00.000Z');
    expect(summary.action).toBe('progress_eligible');
    expect(summary.body).toMatch(/no symptoms during or after/i);
  });

  it('surfaces a quick response request for a newly matched completed session', () => {
    const requests = buildEnduranceResponseRequests(
      [item({ occurredAt: '2026-08-10T15:00:00.000Z' })],
      '2026-08-11T15:00:00.000Z',
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.stage).toBe('post_session');
  });

  it('surfaces the next-day RTR check after the immediate response is already saved', () => {
    const rtr = item({
      occurredAt: '2026-08-10T15:00:00.000Z',
      discipline: 'run',
      title: 'Easy Return to Run',
    });
    rtr.response = cleanResponse(rtr.activity.id, rtr.plannedEvent.id);
    const requests = buildEnduranceResponseRequests([rtr], '2026-08-11T15:00:00.000Z');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.stage).toBe('next_day');
  });

  it('does not nag for old unmatched or already-complete responses', () => {
    const old = item({ occurredAt: '2026-07-01T15:00:00.000Z' });
    const complete = item({ occurredAt: '2026-08-10T15:00:00.000Z' });
    complete.response = cleanResponse(complete.activity.id, complete.plannedEvent.id);
    const unmatched = item({ occurredAt: '2026-08-10T15:00:00.000Z' });
    unmatched.plannedMatch.status = 'unmatched';
    expect(buildEnduranceResponseRequests(
      [old, complete, unmatched],
      '2026-08-11T15:00:00.000Z',
    )).toHaveLength(0);
  });

  it('persists response data in a dedicated local table and hydrates endurance history', () => {
    const db = source('apps/mobile/src/services/database.ts');
    const history = source('apps/mobile/src/services/training-history.ts');
    expect(db).toContain('CREATE TABLE IF NOT EXISTS endurance_session_responses');
    expect(db).toContain('saveEnduranceSessionResponse(');
    expect(db).toContain("'endurance_session_responses'");
    expect(history).toContain('listEnduranceSessionResponses()');
    expect(history).toContain('response: enduranceResponseByActivity.get(activity.id)');

    const strengthStart = history.indexOf('export interface StrengthHistoryItem');
    const enduranceStart = history.indexOf('export interface EnduranceHistoryItem');
    const unionStart = history.indexOf('export type TrainingHistoryItem');
    const strengthInterface = history.slice(strengthStart, enduranceStart);
    const enduranceInterface = history.slice(enduranceStart, unionStart);
    expect(strengthInterface).not.toContain('response?: EnduranceSessionResponseRecord');
    expect(enduranceInterface).toContain('response?: EnduranceSessionResponseRecord');
  });

  it('wires a focused response screen and a Week prompt into the real app', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    const screen = source('apps/mobile/src/app/endurance-response.tsx');
    const layout = source('apps/mobile/src/app/_layout.tsx');
    expect(plan).toContain('How did this session go?');
    expect(plan).toContain('NEXT-DAY RTR CHECK');
    expect(plan).toContain('/endurance-response?');
    expect(screen).toContain('saveEnduranceSessionResponse(response)');
    expect(screen).toContain('Return-to-run only progresses after the next day is stable');
    expect(screen).toContain('Same or better');
    expect(layout).toContain('name="endurance-response"');
  });

  it('keeps week-boundary adaptation intact after response capture', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('decisionCutoff: progressionAsOf');
    expect(runtime).toContain('historyEnteringWeek(allCompletedHistory, currentWeekStart)');
    expect(runtime).toContain('explicit next-day clearance');
  });
});
