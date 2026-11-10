import { describe, expect, it, vi } from 'vitest';
import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import {
  navigateRecommendedTraining,
  resolveRecommendedTrainingRoute,
  todayLocalDate,
} from '../src/services/guarded-workout-navigation';

const day = '2026-11-10';
function session(date: string, order: number, status = 'planned'): PlannedStrengthSession {
  return {
    id: `session-${date}-${order}`,
    date, order, completionStatus: status,
    workout: { id: `workout-${order}` },
    title: 'Strength A', purpose: 'maintenance', intendedLoad: 'moderate',
    focusTargets: [], rationale: 'Plan',
  } as unknown as PlannedStrengthSession;
}
function plan(...sessions: PlannedStrengthSession[]): TrainingBlockPlan {
  return { weeks: [{ sessions }] } as unknown as TrainingBlockPlan;
}

describe('Train tab guarded navigation', () => {
  it('opens a current-day session with the exact plan session identity retained', () => {
    const workout = session(day, 1);
    const decision = resolveRecommendedTrainingRoute(plan(workout), day);
    expect(decision).toEqual({ kind: 'scheduled_today', session: workout });
    const calls: string[] = [];
    navigateRecommendedTraining(decision, {
      openPlannedWorkoutPreview: (value) => calls.push(`plan:${value.id}`),
      navigate: (route) => calls.push(`route:${route}`),
    });
    expect(calls).toEqual([
      `plan:${workout.id}`, 'route:/workout-preview',
    ]);
  });

  it('never presents tomorrow\'s session as scheduled today', () => {
    const future = session('2026-11-11', 0);
    const decision = resolveRecommendedTrainingRoute(plan(future), day);
    expect(decision.kind).toBe('upcoming_plan');
    const open = vi.fn();
    const navigate = vi.fn();
    navigateRecommendedTraining(decision, { openPlannedWorkoutPreview: open, navigate });
    expect(open).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/(tabs)/plan');
  });

  it('skips completed and canceled sessions and honors order on the same date', () => {
    const decision = resolveRecommendedTrainingRoute(plan(
      session(day, 2), session(day, 0), session('2026-11-09', 0),
      session(day, 1, 'completed'), session(day, 3, 'skipped'),
    ), day);
    expect(decision.kind).toBe('scheduled_today');
    if (decision.kind === 'scheduled_today') expect(decision.session.order).toBe(0);
  });

  it('falls back to the workout builder when there is no valid plan', () => {
    const decision = resolveRecommendedTrainingRoute(null, day);
    const navigate = vi.fn();
    navigateRecommendedTraining(decision, {
      openPlannedWorkoutPreview: vi.fn(), navigate,
    });
    expect(navigate).toHaveBeenCalledWith('/generate');
  });

  it('uses device-local dates rather than UTC calendar slices', () => {
    const timestamp = new Date('2026-11-11T00:30:00Z');
    const expected = [
      timestamp.getFullYear(),
      String(timestamp.getMonth() + 1).padStart(2, '0'),
      String(timestamp.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayLocalDate(timestamp)).toBe(expected);
  });
});
