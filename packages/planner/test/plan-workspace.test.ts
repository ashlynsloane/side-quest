import { describe, expect, it } from 'vitest';
import type { PlanAlert, PlanDay, PlanPhaseSummary } from '@circuit/domain';
import {
  assertPlanWorkspace,
  buildPlanWorkspace,
  planEmptyState,
  planSportMinutes,
  planWeekMinutes,
} from '../src/plan-workspace';

const phase: PlanPhaseSummary = {
  phaseId: 'strength-emphasis',
  title: 'Strength emphasis',
  weekLabel: 'Week 3 of 8',
  objective: 'Build strength while run volume returns gradually.',
  goalLabel: 'December 70.3',
};

const days: PlanDay[] = [
  {
    dateKey: '2026-07-29',
    dayLabel: 'Wednesday',
    dateLabel: 'Jul 29',
    isToday: true,
    commitments: [],
    sessions: [
      {
        sessionId: 'strength-one',
        title: 'Ridgeline Strength',
        sport: 'strength',
        status: 'planned',
        durationMinutes: 45,
        purposeLabel: 'Full-body strength',
        flexibility: 'flexible',
        isPriority: true,
      },
      {
        sessionId: 'swim-one',
        title: 'Aerobic swim',
        sport: 'swim',
        status: 'planned',
        durationMinutes: 60,
        purposeLabel: 'Technique and aerobic support',
        flexibility: 'preferred',
        isPriority: false,
      },
    ],
  },
];

const alert: PlanAlert = {
  alertId: 'overlap-one',
  severity: 'attention',
  title: 'Two demanding sessions are close together',
  explanation: 'Moving strength later would preserve quality in both sessions.',
  affectedSessionIds: ['strength-one', 'swim-one'],
  actions: [{ actionId: 'move', label: 'Move strength', presentation: 'bottom_sheet' }],
};

describe('Plan workspace', () => {
  it('builds a week-centered planning workspace with direct information', () => {
    const model = buildPlanWorkspace({ phase, days, alerts: [alert] });
    expect(model.phase.objective).toContain('run volume');
    expect(model.days[0]?.sessions).toHaveLength(2);
    expect(model.controls.length).toBeGreaterThan(0);
    expect(() => assertPlanWorkspace(model)).not.toThrow();
  });

  it('summarizes planned time without completion or consistency scoring', () => {
    const model = buildPlanWorkspace({ phase, days });
    expect(planWeekMinutes(model)).toBe(105);
    expect(planSportMinutes(model).strength).toBe(45);
    expect(planSportMinutes(model).swim).toBe(60);
  });

  it('surfaces a useful open-week state', () => {
    const model = buildPlanWorkspace({ phase, days: [] });
    expect(planEmptyState(model)).toContain('availability');
  });

  it('requires alerts to offer a resolution', () => {
    const model = buildPlanWorkspace({ phase, days, alerts: [{ ...alert, actions: [] }] });
    expect(() => assertPlanWorkspace(model)).toThrow('resolution action');
  });
});
