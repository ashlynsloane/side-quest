import { describe, expect, it } from 'vitest';
import { classifyCoachObservedExecution } from '../src/coach-observed-outcome';

describe('coach observed execution', () => {
  it('recognizes a completed adjusted session without claiming symptom improvement', () => {
    const result = classifyCoachObservedExecution({
      prescribedDurationMinutes: 45,
      actualDurationMinutes: 47,
      matchedPlannedSession: true,
      completed: true,
    });
    expect(result.status).toBe('followed');
    expect(result.completedAsPrescribed).toBe(true);
    expect(result.evidence.join(' ')).not.toContain('better');
  });

  it('flags a large duration overshoot after a protective cap', () => {
    const result = classifyCoachObservedExecution({
      prescribedDurationMinutes: 45,
      actualDurationMinutes: 100,
      matchedPlannedSession: true,
      completed: true,
    });
    expect(result.status).toBe('exceeded_prescription');
    expect(result.exceededDurationCeiling).toBe(true);
  });

  it('keeps partial adherence separate from intervention effectiveness', () => {
    const result = classifyCoachObservedExecution({
      prescribedDurationMinutes: 40,
      actualDurationMinutes: 20,
      matchedPlannedSession: true,
      completed: true,
      completionFraction: 0.5,
    });
    expect(result.status).toBe('partial');
    expect(result.completedAsPrescribed).toBe(false);
  });

  it('recognizes a different workout rather than treating it as compliance', () => {
    const result = classifyCoachObservedExecution({
      prescribedDurationMinutes: 30,
      actualDurationMinutes: 60,
      matchedPlannedSession: false,
      completed: true,
    });
    expect(result.status).toBe('different_session');
  });
});
