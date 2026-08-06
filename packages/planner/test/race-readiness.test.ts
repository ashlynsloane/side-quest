import type { PerformanceGoal } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import { buildRaceChecklist } from '../src/index';

function goal(overrides: Partial<PerformanceGoal> = {}): PerformanceGoal {
  return {
    id: 'race_goal',
    type: 'ironman_70_3',
    name: 'Ironman 70.3',
    eventDate: '2026-08-02',
    weeksUntilEvent: 2,
    disciplines: ['swim', 'bike', 'run'],
    priority: 'perform',
    sessionsPerWeek: 2,
    defaultSessionMinutes: 24,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('race-readiness checklist', () => {
  it('includes triathlon equipment and transition items', () => {
    const items = buildRaceChecklist({ goal: goal(), phase: 'taper', today: '2026-07-20' });
    expect(items.some((item) => item.id === 'bike-safety-check')).toBe(true);
    expect(items.some((item) => item.id === 'swim-gear')).toBe(true);
    expect(items.some((item) => item.id === 'transition-layout')).toBe(true);
  });

  it('includes swimrun-specific transition preparation', () => {
    const items = buildRaceChecklist({
      goal: goal({ type: 'swimrun', name: 'Swimrun', disciplines: ['swim', 'run'] }),
      phase: 'taper',
      today: '2026-07-20',
    });
    expect(items.some((item) => item.id === 'swimrun-transitions')).toBe(true);
  });

  it('marks race-week items due inside seven days', () => {
    const items = buildRaceChecklist({ goal: goal(), phase: 'race_week', today: '2026-07-28' });
    expect(items.find((item) => item.id === 'reduce-strength-dose')?.due).toBe(true);
    expect(items.find((item) => item.id === 'race-day-plan')?.due).toBe(true);
  });
});
