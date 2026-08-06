import { describe, expect, it } from 'vitest';
import { assessSessionReadiness, summarizeSessionExecution } from '../src/session-execution-loop';

describe('session execution loop', () => {
  it('preserves a protected session time by shortening instead of delaying', () => {
    const result = assessSessionReadiness({ sessionId:'masters', checkedAt:'2026-08-04T06:50:00Z', energy:'good', soreness:'none', pain:'none', availableMinutes:35, plannedMinutes:60, equipmentAvailable:true, environmentFeasible:true, protected:true });
    expect(result.recommendation).toBe('shorten');
  });
  it('requires review for high pain', () => {
    const result = assessSessionReadiness({ sessionId:'run', checkedAt:'2026-08-04T06:50:00Z', energy:'good', soreness:'none', pain:'high', availableMinutes:60, plannedMinutes:45, equipmentAvailable:true, environmentFeasible:true, protected:false });
    expect(result.requiresClinicalReview).toBe(true);
  });
  it('never applies a plan change from a post-session summary', () => {
    const summary = summarizeSessionExecution({ executionId:'x', sessionId:'run', status:'stopped', painDuring:'moderate', actualMinutes:12 });
    expect(summary.nextAction).toBe('offer_plan_change');
    expect(summary.planChangeApplied).toBe(false);
  });
});
