import { describe, expect, it } from 'vitest';
import type { PlanWorkspaceModel } from '@circuit/domain';
import { buildVisiblePlanWorkspace } from '../src/visible-plan-workspace';

const model: PlanWorkspaceModel = {
  phase: {
    phaseId: 'base-one',
    title: 'Strength emphasis',
    weekLabel: 'Week 3 of 8',
    objective: 'Build strength while run volume returns gradually.',
    goalLabel: 'December 70.3',
  },
  days: [
    {
      dateKey: '2026-07-29',
      dayLabel: 'Wednesday',
      dateLabel: 'Jul 29',
      isToday: true,
      commitments: [{ commitmentId: 'lab', title: 'Lab', protected: true }],
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
      ],
    },
  ],
  alerts: [
    {
      alertId: 'close-load',
      severity: 'attention',
      title: 'Demanding sessions are close together',
      explanation: 'Moving strength later would preserve quality.',
      affectedSessionIds: ['strength-one'],
      actions: [{ actionId: 'move', label: 'Move strength', presentation: 'bottom_sheet' }],
    },
  ],
  controls: [{ controlId: 'availability', label: 'Adjust weekly availability', presentation: 'bottom_sheet' }],
  roadmap: [{ blockId: 'base', title: 'Strength foundation', dateRangeLabel: 'Jul–Aug', emphasis: 'Build durable strength', state: 'current' }],
};

describe('visible Plan workspace', () => {
  it('creates a week-centered plan screen with direct actions', () => {
    const screen = buildVisiblePlanWorkspace(model);
    expect(screen.phase.title).toBe('Strength emphasis');
    expect(screen.days[0]?.sessions[0]?.actions.map((item) => item.label)).toEqual(['View', 'Move', 'Edit']);
    expect(screen.alerts[0]?.actions[0]?.primary).toBe(true);
    expect(screen.controls[0]?.kind).toBe('adjust_availability');
  });

  it('summarizes time without completion or consistency scoring', () => {
    const screen = buildVisiblePlanWorkspace(model);
    expect(screen.totalTimeLabel).toBe('45 min scheduled');
    expect(screen.sportSummary).toContain('Strength 45 min');
    expect(JSON.stringify(screen)).not.toMatch(/consistency|completion percentage/i);
  });

  it('presents open days neutrally', () => {
    const screen = buildVisiblePlanWorkspace({ ...model, days: [{ ...model.days[0]!, sessions: [] }] });
    expect(screen.days[0]?.emptyMessage).toBe('Open training day');
  });
});
