import { describe, expect, it } from 'vitest';
import { summarizeTrainingUrges } from '../src/training-urge-insights';
import { completedActivities, type TrainingEvent } from '../src/daily-training-guardrails';

const urge = (id: string, activityConsidered: string, reason: string): TrainingEvent => ({
  id, occurredAt: '2026-11-09T20:00:00Z', kind: 'urge',
  note: JSON.stringify({ category: 'post_workout_add_more', activityConsidered, reason }),
});
describe('post-workout motivation observations', () => {
  it('summarizes urges without ever treating them as training', () => {
    const events = [urge('1','calf','energy'), urge('2','cycling','energy'), urge('3','strength','restless')];
    expect(summarizeTrainingUrges(events)).toEqual({
      recordedUrges: 3,
      activities: { calf: 1, cycling: 1, strength: 1 },
      reasons: { energy: 2, restless: 1 },
      mostFrequentReason: 'energy',
    });
    expect(completedActivities(events)).toEqual([]);
  });
  it('ignores invalid and unrelated entries rather than inventing motivation', () => {
    const events: TrainingEvent[] = [
      { id: 'broken', kind: 'urge', occurredAt: '2026-11-09', note: '{' },
      { id: 'plan', kind: 'prescribed', occurredAt: '2026-11-09' },
      { id: 'different', kind: 'urge', occurredAt: '2026-11-09', note: JSON.stringify({ category: 'other' }) },
    ];
    expect(summarizeTrainingUrges(events).recordedUrges).toBe(0);
  });
});
