import { describe, expect, it } from 'vitest';
import {
  firstWeekGoalReviewLabel, firstWeekPriorityForGoal, firstWeekUsesRacePriority,
} from '../../../apps/mobile/src/services/first-week-goal-policy';

describe('Milestone 1 native fast-start goal priority contract', () => {
  it('never assigns or displays race priority for general strength', () => {
    expect(firstWeekUsesRacePriority('general_offseason')).toBe(false);
    for (const priority of ['finish', 'perform', 'race'] as const) {
      expect(firstWeekPriorityForGoal('general_offseason', priority)).toBe('perform');
      expect(firstWeekGoalReviewLabel('general_offseason', 'General strength', priority))
        .toBe('General strength');
    }
  });
  it('retains existing priority behavior for race goals', () => {
    for (const goal of ['road_marathon', 'trail_50k', 'triathlon_olympic']) {
      expect(firstWeekUsesRacePriority(goal)).toBe(true);
      expect(firstWeekPriorityForGoal(goal, 'race')).toBe('race');
      expect(firstWeekGoalReviewLabel(goal, 'Race', 'race')).toBe('Race · A race priority');
      expect(firstWeekGoalReviewLabel(goal, 'Race', 'perform')).toBe('Race · B race priority');
      expect(firstWeekGoalReviewLabel(goal, 'Race', 'finish')).toBe('Race · C race priority');
    }
  });
});
