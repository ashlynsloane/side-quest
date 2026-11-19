import { describe, expect, it } from 'vitest';
import {
  mustResumeFirstWeekSetup,
  type FirstWeekProgress,
} from '../../../apps/mobile/src/services/first-week-provenance';

describe('first-week crash recovery provenance', () => {
  const started: FirstWeekProgress = { firstWeekSetupStartedAt: '2026-11-02T14:00:00.000Z' };

  it('does not equate a partially persisted goal with a finished first week', () => {
    expect(mustResumeFirstWeekSetup(started)).toBe(true);
    // evaluateFirstRun must check this marker before counting goals, workouts,
    // calendars, or PT data as an established athlete.
  });

  it('keeps setup resumable after an interruption at any point before completion', () => {
    for (const variant of [started, { ...started, completedAt: undefined }]) {
      expect(mustResumeFirstWeekSetup(variant)).toBe(true);
    }
  });

  it('allows completed athletes to enter the app normally', () => {
    expect(mustResumeFirstWeekSetup({
      ...started, completedAt: '2026-11-02T14:10:00.000Z',
    })).toBe(false);
  });

  it('preserves the explicit historic-user bypass when a prior account already exists', () => {
    expect(mustResumeFirstWeekSetup({
      ...started, firstRunBypassedAt: '2026-11-01T14:00:00.000Z',
    })).toBe(false);
    expect(mustResumeFirstWeekSetup({ firstRunBypassedAt: '2026-11-01T14:00:00.000Z' }))
      .toBe(false);
  });

  it('does not invent interrupted setup for an account that never began', () => {
    expect(mustResumeFirstWeekSetup({})).toBe(false);
    expect(mustResumeFirstWeekSetup({ completedAt: '2026-11-02T14:10:00.000Z' })).toBe(false);
  });
});
