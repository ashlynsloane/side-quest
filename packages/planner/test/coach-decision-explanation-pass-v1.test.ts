import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildCoachDecisionBrief,
  type CoachDevelopmentPlanLike,
} from '../../../apps/mobile/src/services/coach-decision-brief';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

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

function development(
  current: Partial<CoachDevelopmentPlanLike['weeks'][number]> = {},
): CoachDevelopmentPlanLike {
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
        bikeQuality: { title: 'VO2 · 6 × 4', objective: 'Raise aerobic ceiling.' },
        longRide: { title: 'Long Ride · Aerobic', objective: 'Build durability.' },
        runObjective: 'Three RTR exposures.',
        strengthObjective: 'Build durable strength.',
      },
      {
        weekStartDate: '2026-08-10',
        weekNumber: 2,
        totalWeeks: 16,
        phase: 'base',
        loadIntent: 'build',
        weekPurpose: 'Build aerobic durability.',
        runMode: 'return_to_run',
        bikeQuality: { title: 'Tempo · Aerobic Strength', objective: 'Build muscular endurance.' },
        longRide: { title: 'Long Ride · Fueling Practice', objective: 'Build durability and fueling.' },
        runObjective: 'Three RTR exposures.',
        strengthObjective: 'Build durable strength.',
        ...current,
      },
    ],
  };
}

function strengthSummary(action: any = 'learning') {
  return {
    action,
    actionLabel: action === 'progress_eligible' ? 'PROGRESS ELIGIBLE' : action.toUpperCase(),
    title: 'Strength state',
    body: 'Strength evidence explanation.',
    evidenceCount: action === 'learning' ? 0 : 2,
    pendingEvidenceCount: 0,
    appliedResponses: [],
    pendingResponses: [],
    skipped: [],
    healthOverride: 'none',
  } as any;
}

function enduranceSummary(
  discipline: 'swim' | 'bike' | 'run',
  action: any = 'learning',
  responses: any[] = [],
) {
  return {
    discipline,
    scopeLabel: discipline,
    action,
    actionLabel: action === 'progress_eligible' ? 'PROGRESS ELIGIBLE' : action.toUpperCase(),
    title: `${discipline} state`,
    body: `${discipline} evidence explanation.`,
    evidenceCount: responses.length || (action === 'learning' ? 0 : 2),
    pendingEvidenceCount: 0,
    appliedResponses: responses,
    pendingResponses: [],
    healthOverride: 'none',
  } as any;
}

function adaptation({
  rtrAction = 'learning',
  bikeAction = 'learning',
  strengthAction = 'learning',
  pending = 0,
  request = undefined,
}: {
  rtrAction?: any;
  bikeAction?: any;
  strengthAction?: any;
  pending?: number;
  request?: any;
} = {}) {
  const bikeResponses = bikeAction === 'learning' ? [] : [
    {
      activityId: 'b1',
      plannedEventId: 'e1',
      discipline: 'bike',
      role: 'quality',
      sessionTitle: 'VO2 · 6 × 4',
      occurredAt: '2026-08-08T17:00:00.000Z',
      completionKind: 'completed_as_planned',
      response: 'well_tolerated',
      plannedDurationMinutes: 60,
      actualDurationMinutes: 60,
      completionRatio: 1,
      modifiedFromPlan: false,
      athleteResponseRecorded: true,
      perceivedDifficulty: 'about_right',
      sessionRpe: 6,
      symptomsDuring: false,
      symptomsAfter: false,
      reasons: [],
      progressionSignal: 'completed_as_planned',
    },
    {
      activityId: 'b2',
      plannedEventId: 'e2',
      discipline: 'bike',
      role: 'quality',
      sessionTitle: 'Threshold · Cruise Control',
      occurredAt: '2026-08-05T17:00:00.000Z',
      completionKind: 'completed_as_planned',
      response: 'well_tolerated',
      plannedDurationMinutes: 60,
      actualDurationMinutes: 60,
      completionRatio: 1,
      modifiedFromPlan: false,
      athleteResponseRecorded: true,
      perceivedDifficulty: 'about_right',
      sessionRpe: 6,
      symptomsDuring: false,
      symptomsAfter: false,
      reasons: [],
      progressionSignal: 'completed_as_planned',
    },
  ];
  const rtr = enduranceSummary('run', rtrAction);
  rtr.scopeLabel = 'Return to run';
  rtr.pendingEvidenceCount = pending;
  const bike = enduranceSummary('bike', bikeAction, bikeResponses);
  const strength = strengthSummary(strengthAction);
  return {
    decisionCutoff: '2026-08-10T12:00:00.000Z',
    generatedAt: '2026-08-11T16:00:00.000Z',
    strength,
    endurance: {
      swim: enduranceSummary('swim'),
      bike,
      run: enduranceSummary('run'),
    },
    returnToRun: rtr,
    primary: { action: rtrAction, actionLabel: 'LEARNING', title: 'state', body: 'state' },
    statusChips: [
      ...(rtrAction !== 'learning' ? [{ label: 'RTR', actionLabel: rtrAction === 'protect' ? 'PROTECT' : 'HOLD' }] : []),
      ...(bikeAction !== 'learning' ? [{ label: 'BIKE', actionLabel: bikeAction === 'progress_eligible' ? 'PROGRESS ELIGIBLE' : 'HOLD' }] : []),
    ],
    hasEvidence: rtrAction !== 'learning' || bikeAction !== 'learning' || strengthAction !== 'learning' || pending > 0,
    pendingResponseRequests: request ? [request] : [],
    responseByCompletedAt: {},
    enduranceResponseByKey: {},
  } as any;
}

describe('Coach decision + explanation pass V1', () => {
  it('says no reactive change when no evidence justifies one', () => {
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development(),
      adaptation: adaptation(),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.decisionLevel).toBe('maintain');
    expect(brief.headline).toMatch(/stay the course/i);
    expect(brief.whatChanged[0]?.text).toMatch(/no reactive plan change/i);
  });

  it('surfaces RTR protect above positive fitness signals elsewhere', () => {
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development(),
      adaptation: adaptation({ rtrAction: 'protect', bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.decisionLevel).toBe('protect');
    expect(brief.headline).toMatch(/protect return to run/i);
    expect(brief.whatChanged.some((item) => /Protect return to run progression/i.test(item.text))).toBe(true);
  });

  it('explains that recovery week banks a positive progression signal', () => {
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development({ loadIntent: 'recovery' }),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.decisionLevel).toBe('maintain');
    expect(brief.headline).toMatch(/bank the positive bike signal/i);
    expect(brief.whatChanged.some((item) => /progression-eligible.*banks/i.test(item.text))).toBe(true);
    expect(brief.keptStable.some((item) => /Recovery week stays intact/i.test(item.text))).toBe(true);
  });

  it('shows real completed-session evidence rather than generic coaching copy', () => {
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development(),
      adaptation: adaptation({ bikeAction: 'progress_eligible' }),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.evidence.some((item) => item.label === 'VO2 · 6 × 4')).toBe(true);
    expect(brief.evidence.some((item) => /60\/60 min.*about right.*RPE 6\/10/i.test(item.text))).toBe(true);
  });

  it('explicitly narrows strength evidence before reading strength-only fields', () => {
    const service = source('apps/mobile/src/services/coach-decision-brief.ts');
    const strengthStart = service.indexOf("if (scope.label === 'STRENGTH')");
    const enduranceStart = service.indexOf('const summary = scope.summary as EnduranceAdaptationSummary', strengthStart);
    const strengthBranch = service.slice(strengthStart, enduranceStart);
    expect(strengthBranch).toContain('const summary = scope.summary as StrengthAdaptationSummary');
    expect(strengthBranch).toContain('response.difficulty');
    expect(strengthBranch).toContain('response.rpe');
    expect(strengthBranch).not.toContain('scope.summary.appliedResponses');
  });

  it('makes week-boundary deferral explicit instead of implying midweek replanning', () => {
    const snapshot = adaptation({ rtrAction: 'hold', pending: 2 });
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development(),
      adaptation: snapshot,
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.evidence.some((item) => /intentionally waiting for the next planning decision/i.test(item.text))).toBe(true);
    expect(brief.nextCheck).toMatch(/week-boundary planning decision/i);
  });

  it('does not silently treat an unanswered next-day RTR check as clearance', () => {
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development(),
      adaptation: adaptation({
        request: {
          activityId: 'r1',
          plannedEventId: 'er1',
          discipline: 'run',
          role: 'return_to_run',
          sessionTitle: 'Easy Return to Run',
          occurredAt: '2026-08-10T15:00:00.000Z',
          stage: 'next_day',
        },
      }),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.nextCheck).toMatch(/next-day RTR check/i);
    expect(brief.keptStable.some((item) => /unanswered.*not.*positive tolerance/i.test(item.text))).toBe(true);
  });

  it('makes the macrocycle phase transition visible when it actually changes', () => {
    const plan = development({ phase: 'build' });
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: plan,
      adaptation: adaptation(),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.whatChanged.some((item) => /Base → Build/.test(item.text))).toBe(true);
  });

  it('keeps RTR duration-before-speed visible in the decision trace', () => {
    const brief = buildCoachDecisionBrief({
      block: block(),
      developmentPlan: development(),
      adaptation: adaptation({ rtrAction: 'hold' }),
      asOf: '2026-08-11T16:00:00.000Z',
    });
    expect(brief.keptStable.some((item) => /duration-before-speed/i.test(item.text))).toBe(true);
    expect(brief.keptStable.some((item) => /three-cleared-exposure gate/i.test(item.text))).toBe(true);
  });

  it('wires the brief into Coach above the conversation', () => {
    const coach = source('apps/mobile/src/components/coach-screen-v2.tsx');
    expect(coach).toContain('CoachDecisionBriefCard');
    expect(coach).toContain('buildCoachDecisionBrief({');
    expect(coach).toContain('refreshLatestWholeAthletePlan()');
    expect(coach).toContain('getLatestCompletedWorkoutAdaptationSnapshot()');
    expect(coach.indexOf('<CoachDecisionBriefCard brief={decisionBrief} />'))
      .toBeLessThan(coach.indexOf('<View style={styles.conversationSection}>'));
  });

  it('renders the three required explanation questions and an expandable trace', () => {
    const card = source('apps/mobile/src/components/coach-decision-brief-card.tsx');
    expect(card).toContain('WHAT CHANGED');
    expect(card).toContain('WHY');
    expect(card).toContain('KEPT STABLE');
    expect(card).toContain('NEXT CHECK');
    expect(card).toContain('See decision trace');
  });
});
