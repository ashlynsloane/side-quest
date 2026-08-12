import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildAppliedPlanDecisionSnapshot,
  type AppliedPlanDecisionSnapshot,
} from '../../../apps/mobile/src/services/applied-plan-decision';
import {
  buildCoachDecisionBrief,
  type CoachDevelopmentPlanLike,
} from '../../../apps/mobile/src/services/coach-decision-brief';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

function session({
  id,
  date,
  discipline,
  title,
  durationMinutes,
  intensity = 'easy',
}: {
  id: string;
  date: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength';
  title: string;
  durationMinutes: number;
  intensity?: 'easy' | 'moderate' | 'hard';
}) {
  return {
    id,
    date,
    discipline,
    title,
    durationMinutes,
    intensity,
    keySession: intensity === 'hard',
    priority: 'normal',
    planningCommitment: discipline === 'strength' ? 'fixed' : 'generated',
    rationale: [],
    healthAdjusted: false,
  } as any;
}

function generated({
  currentBikeQuality = 105,
  currentLongRide = 220,
  previousBikeQuality = 105,
  previousLongRide = 220,
  currentRtr = 32,
  previousRtr = 32,
  currentStrength = 40,
  previousStrength = 40,
  loadIntent = 'build',
}: {
  currentBikeQuality?: number;
  currentLongRide?: number;
  previousBikeQuality?: number;
  previousLongRide?: number;
  currentRtr?: number;
  previousRtr?: number;
  currentStrength?: number;
  previousStrength?: number;
  loadIntent?: 'build' | 'absorb' | 'recovery' | 'taper' | 'race';
} = {}) {
  const rtr = (week: string, minutes: number) => [2, 4, 6].map((day, index) =>
    session({
      id: `rtr_${week}_${index}`,
      date: addDays(week, day),
      discipline: 'run',
      title: 'Easy Return to Run',
      durationMinutes: minutes,
    }));
  const strength = (week: string, minutes: number) => [2, 4].map((day, index) =>
    session({
      id: `strength_${week}_${index}`,
      date: addDays(week, day),
      discipline: 'strength',
      title: 'Full-body strength',
      durationMinutes: minutes,
    }));

  return {
    weeks: [
      {
        weekStartDate: '2026-08-03',
        sessions: [
          session({ id: 'prev_bq', date: '2026-08-04', discipline: 'bike', title: 'VO2 · 6 × 4', durationMinutes: previousBikeQuality, intensity: 'hard' }),
          session({ id: 'prev_long', date: '2026-08-08', discipline: 'bike', title: 'Long Ride · Fueling Practice', durationMinutes: previousLongRide }),
          ...rtr('2026-08-03', previousRtr),
          ...strength('2026-08-03', previousStrength),
        ],
      },
      {
        weekStartDate: '2026-08-10',
        sessions: [
          session({ id: 'cur_bq', date: '2026-08-11', discipline: 'bike', title: 'Threshold · Cruise Control', durationMinutes: currentBikeQuality, intensity: 'hard' }),
          session({ id: 'cur_long', date: '2026-08-15', discipline: 'bike', title: 'Long Ride · Aerobic', durationMinutes: currentLongRide }),
          ...rtr('2026-08-10', currentRtr),
          ...strength('2026-08-10', currentStrength),
        ],
      },
    ],
    generatedEvents: [],
    developmentPlan: {
      goalType: 'ironman_70_3',
      startDate: '2026-08-03',
      raceDate: '2026-12-05',
      weeks: [
        devWeek('2026-08-03', 1, 'build'),
        devWeek('2026-08-10', 2, loadIntent),
      ],
    },
  } as any;
}

function devWeek(
  weekStartDate: string,
  weekNumber: number,
  loadIntent: 'build' | 'absorb' | 'recovery' | 'taper' | 'race',
) {
  return {
    weekStartDate,
    weekNumber,
    totalWeeks: 16,
    phase: 'base',
    loadIntent,
    targetLoadFactor: loadIntent === 'recovery' ? 0.72 : 1,
    weekPurpose: loadIntent === 'recovery' ? 'Absorb the preceding work.' : 'Build aerobic durability.',
    runMode: 'return_to_run',
    bikeQuality: { title: 'VO2', objective: 'Build aerobic power.' },
    bikeSupport: { title: 'Support', objective: 'Support aerobic durability.' },
    longRide: { title: 'Long ride', objective: 'Build durability.' },
    runObjective: 'Return to run.',
    longRun: { title: 'RTR', objective: 'Duration before speed.' },
    swimObjective: 'Build swim durability.',
    strengthObjective: 'Retain strength.',
  };
}

function adaptation({
  bikeAction = 'learning',
  rtrAction = 'learning',
  strengthAction = 'learning',
  priorBikeMinutes = 105,
  priorRtrMinutes = 32,
  priorStrengthMinutes = 40,
}: {
  bikeAction?: 'learning' | 'progress_eligible' | 'hold' | 'protect';
  rtrAction?: 'learning' | 'progress_eligible' | 'hold' | 'protect';
  strengthAction?: 'learning' | 'progress_eligible' | 'hold' | 'protect';
  priorBikeMinutes?: number;
  priorRtrMinutes?: number;
  priorStrengthMinutes?: number;
} = {}) {
  const endurance = (discipline: 'swim' | 'bike' | 'run', action: string, responses: any[] = []) => ({
    discipline,
    // Display label is intentionally broader than the discipline identifier.
    // Keep it as string so RTR can use "Return to run".
    scopeLabel: String(discipline),
    action,
    actionLabel: action === 'progress_eligible' ? 'PROGRESS ELIGIBLE' : action.toUpperCase(),
    title: `${discipline} state`,
    body: `${discipline} response state.`,
    evidenceCount: responses.length,
    pendingEvidenceCount: 0,
    appliedResponses: responses,
    pendingResponses: [],
    healthOverride: 'none',
  });
  const bikeResponse = {
    activityId: 'bike_prev',
    plannedEventId: 'bike_event',
    discipline: 'bike',
    role: 'quality',
    sessionTitle: 'VO2 · 6 × 4',
    occurredAt: '2026-08-08T17:00:00.000Z',
    completionKind: 'completed_as_planned',
    response: 'well_tolerated',
    plannedDurationMinutes: priorBikeMinutes,
    actualDurationMinutes: priorBikeMinutes,
    completionRatio: 1,
    modifiedFromPlan: false,
    athleteResponseRecorded: true,
    perceivedDifficulty: 'about_right',
    sessionRpe: 6,
    symptomsDuring: false,
    symptomsAfter: false,
    reasons: [],
    progressionSignal: bikeAction === 'progress_eligible' ? 'completed_as_planned' : 'suppress',
  };
  const rtrResponses = ['2026-08-09', '2026-08-07', '2026-08-05'].map((date, index) => ({
    ...bikeResponse,
    activityId: `rtr_${index}`,
    plannedEventId: `rtr_event_${index}`,
    discipline: 'run',
    role: 'return_to_run',
    sessionTitle: 'Easy Return to Run',
    occurredAt: `${date}T15:00:00.000Z`,
    plannedDurationMinutes: priorRtrMinutes,
    actualDurationMinutes: priorRtrMinutes,
    nextDayStatus: 'same_or_better',
    progressionSignal: 'suppress',
  }));
  const strengthResponses = strengthAction === 'learning' ? [] : [{
    workoutInstanceId: 'strength_prev',
    plannedSessionId: 'strength_plan',
    sessionTitle: 'Full-body strength',
    occurredAt: '2026-08-08T18:00:00.000Z',
    completionKind: 'completed_as_planned',
    response: strengthAction === 'hold' ? 'poorly_tolerated' : 'well_tolerated',
    completionFraction: 1,
    plannedDurationMinutes: priorStrengthMinutes,
    modifiedFromPlan: false,
    difficulty: strengthAction === 'hold' ? 'too_hard' : 'appropriate',
    rpe: strengthAction === 'hold' ? 9 : 6,
    reasons: [],
    progressionSignal: strengthAction === 'hold' ? 'suppress' : 'completed_as_planned',
  }];

  const strength = {
    action: strengthAction,
    actionLabel: strengthAction === 'progress_eligible' ? 'PROGRESS ELIGIBLE' : strengthAction.toUpperCase(),
    title: 'Strength state',
    body: 'Strength response state.',
    evidenceCount: strengthResponses.length,
    pendingEvidenceCount: 0,
    appliedResponses: strengthResponses,
    pendingResponses: [],
    skipped: [],
    healthOverride: 'none',
  };

  const bike = endurance('bike', bikeAction, bikeAction === 'learning' ? [] : [bikeResponse]);
  const run = endurance('run', 'learning', []);
  const swim = endurance('swim', 'learning', []);
  const rtr = endurance('run', rtrAction, rtrAction === 'learning' ? [] : rtrResponses);
  rtr.scopeLabel = 'Return to run';

  return {
    decisionCutoff: '2026-08-10T12:00:00.000Z',
    generatedAt: '2026-08-11T20:00:00.000Z',
    strength,
    endurance: { swim, bike, run },
    returnToRun: rtr,
    primary: { action: rtrAction, actionLabel: 'STATE', title: 'state', body: 'state' },
    statusChips: [],
    hasEvidence: true,
    pendingResponseRequests: [],
    responseByCompletedAt: {},
    enduranceResponseByKey: {},
  } as any;
}

function block() {
  return {
    id: 'block',
    goal: { name: '70.3' },
    weeks: [
      { weekStartDate: '2026-08-03', sessions: [] },
      { weekStartDate: '2026-08-10', sessions: [] },
    ],
  } as any;
}

function coachDevelopment(loadIntent: 'build' | 'recovery' = 'build'): CoachDevelopmentPlanLike {
  return {
    weeks: [
      {
        weekStartDate: '2026-08-03',
        weekNumber: 1,
        totalWeeks: 16,
        phase: 'base',
        loadIntent: 'build',
        weekPurpose: 'Build aerobic durability.',
        runMode: 'return_to_run',
        bikeQuality: { title: 'VO2 · 6 × 4', objective: 'Aerobic power.' },
        longRide: { title: 'Long Ride', objective: 'Durability.' },
        runObjective: 'RTR',
        strengthObjective: 'Strength',
      },
      {
        weekStartDate: '2026-08-10',
        weekNumber: 2,
        totalWeeks: 16,
        phase: 'base',
        loadIntent,
        weekPurpose: loadIntent === 'recovery' ? 'Absorb work.' : 'Build aerobic durability.',
        runMode: 'return_to_run',
        bikeQuality: { title: 'Threshold', objective: 'Threshold durability.' },
        longRide: { title: 'Long Ride', objective: 'Durability.' },
        runObjective: 'RTR',
        strengthObjective: 'Strength',
      },
    ],
  };
}

describe('Applied Decision + Plan Delta V1', () => {
  it('records an actual bike quality increase when progression is eligible and generated dose grows', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentBikeQuality: 110 }),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const bike = snapshot.decisions.find((item) => item.domain === 'bike_quality')!;
    expect(bike.previousDose?.sessionMinutes).toBe(105);
    expect(bike.currentDose?.sessionMinutes).toBe(110);
    expect(bike.delta.sessionMinutes).toBe(5);
    expect(bike.action).toBe('progress');
    expect(bike.reason).toBe('response_progression_applied');
    expect(bike.consistency).toBe('consistent');
  });

  it('banks a positive bike signal when recovery week holds the actual dose', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentBikeQuality: 105, loadIntent: 'recovery' }),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const bike = snapshot.decisions.find((item) => item.domain === 'bike_quality')!;
    expect(bike.action).toBe('hold');
    expect(bike.reason).toBe('response_progression_banked');
    expect(bike.explanation).toMatch(/banked rather than converted into more load/i);
  });

  it('distinguishes eligibility from applied progression on an ordinary build week', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentBikeQuality: 105 }),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const bike = snapshot.decisions.find((item) => item.domain === 'bike_quality')!;
    expect(bike.action).toBe('hold');
    expect(bike.reason).toBe('eligible_not_applied');
    expect(bike.explanation).toMatch(/permission, not a forced increase/i);
  });

  it('records the actual 32 → 35 minute RTR progression only after RTR is eligible', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentRtr: 35 }),
      adaptation: adaptation({ rtrAction: 'progress_eligible' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const rtr = snapshot.decisions.find((item) => item.domain === 'return_to_run')!;
    expect(rtr.previousDose?.sessionMinutes).toBe(32);
    expect(rtr.currentDose?.sessionMinutes).toBe(35);
    expect(rtr.delta.sessionMinutes).toBe(3);
    expect(rtr.delta.frequency).toBe(0);
    expect(rtr.action).toBe('progress');
    expect(rtr.consistency).toBe('consistent');
  });

  it('flags an RTR increase if the cleared-response gate says HOLD', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentRtr: 35 }),
      adaptation: adaptation({ rtrAction: 'hold' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const rtr = snapshot.decisions.find((item) => item.domain === 'return_to_run')!;
    expect(rtr.action).toBe('progress');
    expect(rtr.consistency).toBe('review');
    expect(rtr.reason).toBe('guardrail_conflict');
    expect(snapshot.warnings.some((warning) => /return to run/i.test(warning))).toBe(true);
  });

  it('flags strength growth when the response state is HOLD after a too-hard session', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentStrength: 45 }),
      adaptation: adaptation({ strengthAction: 'hold', priorStrengthMinutes: 40 }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const strength = snapshot.decisions.find((item) => item.domain === 'strength')!;
    expect(strength.action).toBe('progress');
    expect(strength.consistency).toBe('review');
  });

  it('uses completed prescription dose before a regenerated previous-week estimate', () => {
    const snapshot = buildAppliedPlanDecisionSnapshot({
      generated: generated({ previousBikeQuality: 95, currentBikeQuality: 110 }),
      adaptation: adaptation({ bikeAction: 'progress_eligible', priorBikeMinutes: 105 }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const bike = snapshot.decisions.find((item) => item.domain === 'bike_quality')!;
    expect(bike.previousSource).toBe('completed_prescription');
    expect(bike.previousDose?.sessionMinutes).toBe(105);
    expect(bike.previousDose?.frequency).toBe(1);
  });

  it('Coach describes the actual held dose instead of saying eligible means progressed', () => {
    const applied = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentBikeQuality: 105, loadIntent: 'recovery' }),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: coachDevelopment('recovery'),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      appliedPlan: applied,
      asOf: '2026-08-11T20:00:00.000Z',
    });
    expect(brief.headline).toMatch(/105 → 105 min.*Hold applied/i);
    expect(brief.whatChanged.some((item) => /105 → 105 min.*HOLD/i.test(item.text))).toBe(true);
    expect(brief.evidence.some((item) => item.label === 'Applied plan delta')).toBe(true);
  });

  it('Coach reports a real 32 → 35 RTR increase without claiming speed changed', () => {
    const applied = buildAppliedPlanDecisionSnapshot({
      generated: generated({ currentRtr: 35 }),
      adaptation: adaptation({ rtrAction: 'progress_eligible' }),
      asOf: '2026-08-11T20:00:00.000Z',
    });
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: coachDevelopment(),
      adaptation: adaptation({ rtrAction: 'progress_eligible' }),
      appliedPlan: applied,
      asOf: '2026-08-11T20:00:00.000Z',
    });
    expect(brief.headline).toMatch(/Return to run: 32 → 35 min.*Progress applied/i);
    expect(brief.keptStable.some((item) => /duration-before-speed/i.test(item.text))).toBe(true);
  });

  it('runtime computes applied decisions after final training-outings shaping', () => {
    const runtime = source('apps/mobile/src/services/whole-athlete-plan-runtime.ts');
    expect(runtime).toContain('getLatestAppliedPlanDecisionSnapshot');
    expect(runtime).toContain('buildAppliedPlanDecisionSnapshot({');
    expect(runtime.indexOf('applyTrainingOutingsToGeneratedBlock('))
      .toBeLessThan(runtime.indexOf('buildAppliedPlanDecisionSnapshot({'));
    expect(runtime.indexOf('const shapedWithDevelopment'))
      .toBeLessThan(runtime.indexOf('buildAppliedPlanDecisionSnapshot({'));
  });

  it('Coach consumes the runtime applied snapshot from the same reconciliation', () => {
    const coach = source('apps/mobile/src/components/coach-screen-v2.tsx');
    expect(coach).toContain('getLatestAppliedPlanDecisionSnapshot');
    expect(coach).toContain('const appliedPlan = wholeAthlete');
    expect(coach).toContain('appliedPlan,');
  });

  it('keeps plan delta read-only and downstream of the generated prescription', () => {
    const service = source('apps/mobile/src/services/applied-plan-decision.ts');
    expect(service).toContain('buildAppliedPlanDecisionSnapshot');
    expect(service).not.toContain('saveTrainingBlock');
    expect(service).not.toContain('replaceTrainingCalendarEvents');
    expect(service).not.toContain('generateAndPersistWholeAthleteBlock');
  });
});

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
