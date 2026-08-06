import { describe, expect, it } from 'vitest';
import type { TodayWorkspaceModel } from '@circuit/domain';
import { buildVisibleTodayWorkspace } from '../src/visible-today-workspace';

const base: TodayWorkspaceModel = {
  dateLabel: 'Wednesday, July 29',
  greeting: 'Your training today',
  recommendation: {
    id: 'w1', name: 'Trailhead Strength', workoutType: 'Full body', durationMinutes: 42,
    purpose: 'Support swim and bike durability.', timingLabel: 'Flexible after 4 PM', equipmentLabel: 'Dumbbells + bench',
    whyToday: 'Supports swim volume without adding unnecessary lower-body fatigue.', state: 'ready',
    canStart: true, canEdit: true, canMove: true, canReplace: true,
  },
  readiness: { state: 'ready_as_planned', title: 'Ready as planned', interpretation: 'No active restriction conflicts with this session.' },
  timeline: [], upcoming: [], unresolvedInboxCount: 0,
};

describe('visible Today workspace', () => {
  it('renders direct workout and readiness actions without reroute cards', () => {
    const model = buildVisibleTodayWorkspace({ workspace: base, phaseContext: 'Strength emphasis · Race in 19 weeks' });
    expect(model.hero.title).toBe('Trailhead Strength');
    expect(model.hero.actions.map((item) => item.kind)).toEqual(['start', 'edit', 'move', 'replace']);
    expect(model.readiness.actions.some((item) => item.kind === 'add_restriction')).toBe(true);
  });

  it('builds a useful open-day hero', () => {
    const model = buildVisibleTodayWorkspace({
      workspace: {
        ...base,
        recommendation: { ...base.recommendation, name: 'Your day is open', durationMinutes: 0, state: 'empty', canStart: false, canEdit: false, canMove: false },
      },
    });
    expect(model.hero.tone).toBe('open');
    expect(model.hero.actions.map((item) => item.kind)).toContain('recovery_day');
  });

  it('moves safety-relevant readiness before the workout hero', () => {
    const model = buildVisibleTodayWorkspace({
      workspace: { ...base, readiness: { state: 'review', title: 'Review shoulder symptoms', interpretation: 'Upper-body loading needs review.' } },
    });
    expect(model.screenReaderOrder.slice(0, 3)).toEqual(['date', 'readiness', 'hero']);
  });
});
