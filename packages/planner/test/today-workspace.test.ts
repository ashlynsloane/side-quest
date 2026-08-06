import { describe, expect, it } from 'vitest';
import type { TodayWorkspaceModel } from '@circuit/domain';
import { assertTodayWorkspace, buildTodayWorkspace, todayNeedsAttention } from '../src/today-workspace';

describe('Today workspace', () => {
  it('builds a useful empty-day state rather than a routing card', () => {
    const model = buildTodayWorkspace({ dateLabel: 'Wednesday, July 29' });
    expect(model.recommendation.state).toBe('empty');
    expect(model.recommendation.canReplace).toBe(true);
    expect(model.upcoming).toHaveLength(0);
    expect(() => assertTodayWorkspace(model)).not.toThrow();
  });

  it('surfaces timeline conflicts and coaching decisions', () => {
    const model: TodayWorkspaceModel = buildTodayWorkspace({
      dateLabel: 'Wednesday, July 29',
      timeline: [
        {
          id: 'work',
          kind: 'commitment',
          title: 'Work event',
          flexibility: 'fixed',
          conflict: true,
          conflictMessage: 'Overlaps the planned strength session.',
        },
      ],
      coachingResponse: {
        id: 'change',
        trigger: 'Schedule conflict',
        summary: 'Choose a shorter session or move it.',
        requiresDecision: true,
        options: [
          {
            id: 'shorten',
            label: 'Shorten',
            consequence: 'Keep a 24-minute stimulus.',
            recommended: true,
          },
        ],
      },
    });

    expect(todayNeedsAttention(model)).toBe(true);
  });
});
