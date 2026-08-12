import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  applyCompletedWorkoutAdaptationToProgressionHistory,
  buildCompletedWorkoutAdaptationSnapshot,
  enduranceResponseEvidence,
  enduranceSessionRole,
  summarizeEnduranceAdaptation,
  summarizeReturnToRunAdaptation,
  type EnduranceSessionResponseEvidence,
} from '../../../apps/mobile/src/services/completed-workout-adaptation';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

function strengthBlock() {
  return {
    id: 'block',
    goal: { name: 'Goal' },
    weeks: [{
      weekStartDate: '2026-08-03',
      sessions: [],
    }],
  } as any;
}

function event({
  id = 'sq_plan_bike',
  title = 'VO2 · 6 × 4',
  discipline = 'bike',
  minutes = 60,
  intensity = 'hard',
}: {
  id?: string;
  title?: string;
  discipline?: 'swim' | 'bike' | 'run';
  minutes?: number;
  intensity?: 'easy' | 'moderate' | 'hard';
} = {}) {
  return {
    id,
    sourceId: 'side_quest_plan',
    title,
    startAt: '2026-08-05T17:00:00.000Z',
    endAt: new Date(Date.parse('2026-08-05T17:00:00.000Z') + minutes * 60_000).toISOString(),
    allDay: false,
    discipline,
    description: `Side Quest generated · ${minutes} min · ${intensity}`,
  } as any;
}

function enduranceHistory({
  id = 'activity_1',
  occurredAt = '2026-08-05T17:00:00.000Z',
  discipline = 'bike',
  title = 'VO2 · 6 × 4',
  plannedMinutes = 60,
  actualMinutes = 60,
  plannedIntensity = 'hard',
  actualIntensity = 'hard',
}: {
  id?: string;
  occurredAt?: string;
  discipline?: 'swim' | 'bike' | 'run';
  title?: string;
  plannedMinutes?: number;
  actualMinutes?: number;
  plannedIntensity?: 'easy' | 'moderate' | 'hard';
  actualIntensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'race';
} = {}) {
  const plannedEvent = event({
    id: `sq_plan_${id}`,
    title,
    discipline,
    minutes: plannedMinutes,
    intensity: plannedIntensity,
  });
  return {
    kind: 'endurance',
    id: `endurance:${id}`,
    occurredAt,
    needsReview: false,
    activity: {
      id,
      discipline,
      movingTimeSeconds: actualMinutes * 60,
      intensity: actualIntensity,
      startAt: occurredAt,
    },
    plannedMatch: {
      id: `match_${id}`,
      activityId: id,
      calendarEventId: plannedEvent.id,
      status: 'matched',
      confidence: 0.99,
      updatedAt: occurredAt,
    },
    plannedEvent,
    response: {
      activityId: id,
      plannedEventId: plannedEvent.id,
      perceivedDifficulty: 'about_right',
      sessionRpe: 5,
      symptomsDuring: false,
      symptomsAfter: false,
      nextDayStatus: discipline === 'run' && /return to run/i.test(title) ? 'same_or_better' : undefined,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
  } as any;
}

function evidence(
  overrides: Partial<EnduranceSessionResponseEvidence> = {},
): EnduranceSessionResponseEvidence {
  return {
    activityId: Math.random().toString(),
    plannedEventId: Math.random().toString(),
    discipline: 'bike',
    role: 'quality',
    sessionTitle: 'Threshold · 4 × 10',
    occurredAt: '2026-08-05T17:00:00.000Z',
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
    nextDayStatus: 'same_or_better',
    reasons: [],
    progressionSignal: 'completed_as_planned',
    ...overrides,
  };
}

describe('endurance + RTR closed-loop adaptation V1', () => {
  it('recognizes quality, long, support, and return-to-run roles from generated prescriptions', () => {
    expect(enduranceSessionRole('VO2 · 6 × 4', '', 'bike')).toBe('quality');
    expect(enduranceSessionRole('Long Ride · Fueling Practice', '', 'bike')).toBe('long');
    expect(enduranceSessionRole('Easy Spin Club', 'recovery', 'bike')).toBe('support');
    expect(enduranceSessionRole('Easy Return to Run', '', 'run')).toBe('return_to_run');
  });

  it('turns a matched full quality session into progression-bearing completion evidence', () => {
    const response = enduranceResponseEvidence(enduranceHistory());
    expect(response?.completionKind).toBe('completed_as_planned');
    expect(response?.role).toBe('quality');
    expect(response?.athleteResponseRecorded).toBe(true);
    expect(response?.progressionSignal).toBe('completed_as_planned');
  });

  it('keeps a shortened quality session as negative completion evidence only when clearly under-completed', () => {
    expect(enduranceResponseEvidence(enduranceHistory({ actualMinutes: 42 }))?.progressionSignal)
      .toBe('not_completed_as_planned');
    expect(enduranceResponseEvidence(enduranceHistory({ actualMinutes: 50 }))?.progressionSignal)
      .toBe('suppress');
  });

  it('does not let easy/support duration become a fitness-progression verdict', () => {
    const shortSupport = enduranceResponseEvidence(enduranceHistory({
      title: 'Easy Spin Club',
      plannedIntensity: 'easy',
      actualIntensity: 'easy',
      actualMinutes: 30,
      plannedMinutes: 60,
    }));
    expect(shortSupport?.role).toBe('support');
    expect(shortSupport?.progressionSignal).toBe('suppress');
  });

  it('treats material intensity mismatch as modified rather than clean completion', () => {
    const response = enduranceResponseEvidence(enduranceHistory({
      plannedIntensity: 'hard',
      actualIntensity: 'easy',
    }));
    expect(response?.completionKind).toBe('completed_modified');
    expect(response?.response).toBe('tolerated_with_modification');
    expect(response?.progressionSignal).toBe('suppress');
  });

  it('requires two clean comparable quality sessions before discipline progression is available', () => {
    const one = summarizeEnduranceAdaptation('bike', [evidence()], [], 'none');
    const two = summarizeEnduranceAdaptation('bike', [
      evidence({ occurredAt: '2026-08-08T17:00:00.000Z' }),
      evidence({ occurredAt: '2026-08-05T17:00:00.000Z' }),
    ], [], 'none');
    expect(one.action).toBe('learning');
    expect(two.action).toBe('progress_eligible');
  });

  it('does not combine one clean quality session and one clean long session as comparable evidence', () => {
    const summary = summarizeEnduranceAdaptation('bike', [
      evidence({ role: 'quality', occurredAt: '2026-08-08T17:00:00.000Z' }),
      evidence({ role: 'long', occurredAt: '2026-08-05T17:00:00.000Z' }),
    ], [], 'none');
    expect(summary.action).toBe('learning');
  });

  it('gates return-to-run progression behind three recent separated clean exposures', () => {
    const rtr = (occurredAt: string) => evidence({
      discipline: 'run',
      role: 'return_to_run',
      occurredAt,
      sessionTitle: 'Easy Return to Run',
      progressionSignal: 'suppress',
    });
    const two = summarizeReturnToRunAdaptation([
      rtr('2026-08-09T15:00:00.000Z'),
      rtr('2026-08-07T15:00:00.000Z'),
    ], [], 'none', '2026-08-10T12:00:00.000Z');
    const three = summarizeReturnToRunAdaptation([
      rtr('2026-08-09T15:00:00.000Z'),
      rtr('2026-08-07T15:00:00.000Z'),
      rtr('2026-08-05T15:00:00.000Z'),
    ], [], 'none', '2026-08-10T12:00:00.000Z');
    expect(two.action).toBe('learning');
    expect(three.action).toBe('progress_eligible');
  });

  it('refuses to progress RTR from three clean exposures that were stacked on consecutive days', () => {
    const rtr = (occurredAt: string) => evidence({
      discipline: 'run',
      role: 'return_to_run',
      occurredAt,
      sessionTitle: 'Easy Return to Run',
      progressionSignal: 'suppress',
    });
    const summary = summarizeReturnToRunAdaptation([
      rtr('2026-08-09T15:00:00.000Z'),
      rtr('2026-08-08T15:00:00.000Z'),
      rtr('2026-08-07T15:00:00.000Z'),
    ], [], 'none', '2026-08-10T12:00:00.000Z');
    expect(summary.action).toBe('learning');
  });

  it('holds RTR when one of the recent prescribed exposures was partial or modified', () => {
    const summary = summarizeReturnToRunAdaptation([
      evidence({
        discipline: 'run',
        role: 'return_to_run',
        occurredAt: '2026-08-09T15:00:00.000Z',
        response: 'under_completed',
        completionKind: 'completed_partial',
        completionRatio: 0.8,
        progressionSignal: 'suppress',
      }),
      evidence({
        discipline: 'run',
        role: 'return_to_run',
        occurredAt: '2026-08-07T15:00:00.000Z',
        progressionSignal: 'suppress',
      }),
      evidence({
        discipline: 'run',
        role: 'return_to_run',
        occurredAt: '2026-08-05T15:00:00.000Z',
        progressionSignal: 'suppress',
      }),
    ], [], 'none', '2026-08-10T12:00:00.000Z');
    expect(summary.action).toBe('hold');
  });

  it('lets active symptoms override otherwise clean RTR progression evidence', () => {
    const rtr = (occurredAt: string) => evidence({
      discipline: 'run',
      role: 'return_to_run',
      occurredAt,
      progressionSignal: 'suppress',
    });
    const summary = summarizeReturnToRunAdaptation([
      rtr('2026-08-09T15:00:00.000Z'),
      rtr('2026-08-07T15:00:00.000Z'),
      rtr('2026-08-05T15:00:00.000Z'),
    ], [], 'monitor', '2026-08-10T12:00:00.000Z');
    expect(summary.action).toBe('hold');
  });

  it('only exposes clean RTR completions as completed-as-planned after the three-exposure gate', () => {
    const history = [
      enduranceHistory({
        id: 'rtr1',
        occurredAt: '2026-08-05T15:00:00.000Z',
        discipline: 'run',
        title: 'Easy Return to Run',
        plannedMinutes: 30,
        actualMinutes: 30,
        plannedIntensity: 'easy',
        actualIntensity: 'easy',
      }),
      enduranceHistory({
        id: 'rtr2',
        occurredAt: '2026-08-07T15:00:00.000Z',
        discipline: 'run',
        title: 'Easy Return to Run',
        plannedMinutes: 30,
        actualMinutes: 30,
        plannedIntensity: 'easy',
        actualIntensity: 'easy',
      }),
      enduranceHistory({
        id: 'rtr3',
        occurredAt: '2026-08-09T15:00:00.000Z',
        discipline: 'run',
        title: 'Easy Return to Run',
        plannedMinutes: 30,
        actualMinutes: 30,
        plannedIntensity: 'easy',
        actualIntensity: 'easy',
      }),
    ];
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history,
      block: strengthBlock(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T12:00:00.000Z',
    });
    const exposures = history.map((item) => ({
      discipline: 'run' as const,
      completedAt: item.occurredAt,
      durationMinutes: 30,
      completedAsPlanned: true,
    }));
    const adjusted = applyCompletedWorkoutAdaptationToProgressionHistory(exposures, snapshot);
    expect(snapshot.returnToRun.action).toBe('progress_eligible');
    expect(adjusted.every((item) => item.completedAsPlanned === true)).toBe(true);
  });

  it('suppresses clean RTR completion claims before the three-exposure gate', () => {
    const h = enduranceHistory({
      id: 'rtr1',
      occurredAt: '2026-08-09T15:00:00.000Z',
      discipline: 'run',
      title: 'Easy Return to Run',
      plannedMinutes: 30,
      actualMinutes: 30,
      plannedIntensity: 'easy',
      actualIntensity: 'easy',
    });
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [h],
      block: strengthBlock(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T12:00:00.000Z',
    });
    const adjusted = applyCompletedWorkoutAdaptationToProgressionHistory([{
      discipline: 'run',
      completedAt: h.occurredAt,
      durationMinutes: 30,
      completedAsPlanned: true,
    }], snapshot);
    expect(snapshot.returnToRun.action).toBe('learning');
    expect(adjusted[0]?.completedAsPlanned).toBeUndefined();
  });

  it('queues current-week endurance evidence instead of rewriting the current week', () => {
    const snapshot = buildCompletedWorkoutAdaptationSnapshot({
      history: [
        enduranceHistory({
          id: 'prior',
          occurredAt: '2026-08-08T17:00:00.000Z',
        }),
        enduranceHistory({
          id: 'current',
          occurredAt: '2026-08-11T17:00:00.000Z',
        }),
      ],
      block: strengthBlock(),
      activeCheckIn: null,
      decisionCutoff: '2026-08-10T12:00:00.000Z',
      asOf: '2026-08-11T20:00:00.000Z',
    });
    expect(snapshot.endurance.bike.appliedResponses).toHaveLength(1);
    expect(snapshot.endurance.bike.pendingResponses).toHaveLength(1);
    expect(snapshot.primary.pendingNote).toMatch(/next planning decision/i);
  });

  it('keeps the runtime ordering: interpretation before week-entry history and progression', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('covers strength plus matched Side Quest swim/bike/run sessions');
    expect(runtime.indexOf('applyCompletedWorkoutAdaptationToProgressionHistory('))
      .toBeLessThan(runtime.indexOf('historyEnteringWeek(allCompletedHistory, currentWeekStart)'));
    expect(runtime.indexOf('historyEnteringWeek(allCompletedHistory, currentWeekStart)'))
      .toBeLessThan(runtime.indexOf('buildWholeAthleteProgressionContextFromHistory({'));
  });

  it('keeps one combined Week explanation card with discipline status chips', () => {
    const plan = source('apps/mobile/src/app/(tabs)/plan.tsx');
    expect(plan).toContain('const signal = snapshot.primary');
    expect(plan).toContain('snapshot.statusChips');
    expect(plan).toContain('adaptationStatusChip');
    expect(plan).toContain('COMPLETED-WORKOUT ADAPTATION');
    expect(plan).not.toContain('const signal = snapshot.strength');
  });
});
