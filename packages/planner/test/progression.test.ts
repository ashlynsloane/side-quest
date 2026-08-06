import { describe, expect, it } from 'vitest';

import { nextAvailableLoad, recommendExerciseProgressions } from '../src/index';

function observation({
  load = 30,
  target = 10,
  date,
  equipmentId = 'kettlebell' as const,
}: {
  load?: number;
  target?: number;
  date: string;
  equipmentId?: 'kettlebell' | 'dumbbell';
}) {
  return {
    exerciseId: 'goblet_squat',
    exerciseName: 'Goblet Squat',
    loadValue: load,
    loadUnit: 'lb' as const,
    equipmentId,
    targetValue: target,
    targetUnit: 'total' as const,
    completionFraction: 1,
    completedAt: date,
  };
}

const metadata = [{
  exerciseId: 'goblet_squat',
  equipmentIds: ['kettlebell' as const],
  defaultTarget: 10,
  targetUnit: 'total' as const,
  minimumTarget: 6,
  maximumTarget: 15,
}];

describe('exercise progression recommendations', () => {
  it('collects more data after one observation', () => {
    const result = recommendExerciseProgressions({
      history: [observation({ date: '2026-07-20T10:00:00.000Z' })],
      exerciseMetadata: metadata,
    });
    expect(result[0]?.action).toBe('collect_more');
    expect(result[0]?.suggestedLoad).toBe(30);
  });

  it('holds after a recent load increase', () => {
    const result = recommendExerciseProgressions({
      history: [
        observation({ load: 35, date: '2026-07-20T10:00:00.000Z' }),
        observation({ load: 30, date: '2026-07-15T10:00:00.000Z' }),
        observation({ load: 30, date: '2026-07-10T10:00:00.000Z' }),
      ],
      exerciseMetadata: metadata,
      recentFeedback: ['appropriate'],
      recentRpe: [7],
    });
    expect(result[0]?.action).toBe('hold');
  });

  it('progresses reps before load', () => {
    const result = recommendExerciseProgressions({
      history: [
        observation({ target: 10, date: '2026-07-20T10:00:00.000Z' }),
        observation({ target: 10, date: '2026-07-15T10:00:00.000Z' }),
        observation({ target: 10, date: '2026-07-10T10:00:00.000Z' }),
      ],
      exerciseMetadata: metadata,
      recentFeedback: ['too_easy', 'appropriate'],
      recentRpe: [5, 6],
    });
    expect(result[0]?.strategy).toBe('reps_up');
    expect(result[0]?.suggestedTarget).toBe(12);
    expect(result[0]?.suggestedLoad).toBe(30);
  });

  it('uses a realistic kettlebell jump after the rep ceiling is controlled', () => {
    const result = recommendExerciseProgressions({
      history: [
        observation({ target: 15, date: '2026-07-20T10:00:00.000Z' }),
        observation({ target: 15, date: '2026-07-15T10:00:00.000Z' }),
        observation({ target: 15, date: '2026-07-10T10:00:00.000Z' }),
      ],
      exerciseMetadata: metadata,
      recentFeedback: ['too_easy'],
      recentRpe: [5],
    });
    expect(result[0]?.strategy).toBe('load_up');
    expect(result[0]?.suggestedLoad).toBe(35);
    expect(result[0]?.suggestedTarget).toBe(10);
    expect(nextAvailableLoad(30, 'kettlebell', 'lb')).toBe(35);
  });

  it('uses the next weight saved in the active equipment profile', () => {
    const result = recommendExerciseProgressions({
      history: [
        observation({ load: 7.5, target: 15, equipmentId: 'dumbbell', date: '2026-07-20T10:00:00.000Z' }),
        observation({ load: 7.5, target: 15, equipmentId: 'dumbbell', date: '2026-07-15T10:00:00.000Z' }),
        observation({ load: 7.5, target: 15, equipmentId: 'dumbbell', date: '2026-07-10T10:00:00.000Z' }),
      ],
      exerciseMetadata: [{ ...metadata[0]!, equipmentIds: ['dumbbell'] }],
      recentFeedback: ['too_easy'],
      recentRpe: [5],
      availableLoads: { dumbbell: { unit: 'lb', values: [5, 7.5, 10, 15, 20] } },
    });
    expect(result[0]?.strategy).toBe('load_up');
    expect(result[0]?.suggestedLoad).toBe(10);
  });

  it('uses re-entry after two weeks away', () => {
    const result = recommendExerciseProgressions({
      history: [
        observation({ load: 35, target: 12, date: '2026-07-01T10:00:00.000Z' }),
        observation({ load: 35, target: 12, date: '2026-06-25T10:00:00.000Z' }),
      ],
      exerciseMetadata: metadata,
      continuity: { daysSinceLastStrength: 16 },
    });
    expect(result[0]?.strategy).toBe('reentry');
    expect(result[0]?.action).toBe('reduce');
    expect(result[0]?.suggestedLoad).toBeLessThan(35);
    expect(result[0]?.suggestedTarget).toBeLessThan(12);
  });

  it('suggests a conservative dose reduction after hard feedback', () => {
    const result = recommendExerciseProgressions({
      history: [
        observation({ load: 40, target: 12, equipmentId: 'dumbbell', date: '2026-07-20T10:00:00.000Z' }),
        observation({ load: 40, target: 12, equipmentId: 'dumbbell', date: '2026-07-15T10:00:00.000Z' }),
        observation({ load: 40, target: 12, equipmentId: 'dumbbell', date: '2026-07-10T10:00:00.000Z' }),
      ],
      recentFeedback: ['too_hard', 'too_hard'],
      recentRpe: [9, 9],
    });
    expect(result[0]?.action).toBe('reduce');
    expect(result[0]?.suggestedTarget).toBeLessThan(12);
  });
});
