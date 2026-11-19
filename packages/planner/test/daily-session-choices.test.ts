import { describe, expect, it } from 'vitest';
import { buildDailySessionChoices } from '../src/daily-session-choices';
import type { DailyFeedbackAdvice } from '../src/daily-feedback-advice';

const advice = (kind: DailyFeedbackAdvice['kind'],
  headline = kind === 'review' ? 'Review the next training dose' : 'Fixture'): DailyFeedbackAdvice => ({
  kind, headline, explanation: 'Fixture only', evidence: [],
  approvalRequired: true, autoChangedSessions: 0,
});
const session = {
  id: 'strength-a', date: '2026-11-14',
  status: 'planned' as const, estimatedMinutes: 40,
};
const options = (kind: DailyFeedbackAdvice['kind'],
  nextSession: Parameters<typeof buildDailySessionChoices>[0]['nextSession'] = session,
  headline?: string) => buildDailySessionChoices({
  advice: advice(kind, headline), nextSession, todayLocalDate: '2026-11-14',
});

describe('read-only bounded next session options', () => {
  it('protect mode never offers keeping full training or a substitute dose', () => {
    const result = options('protect');
    expect(result.state).toBe('symptom_hold');
    expect(result.options.map(item => item.kind)).toEqual(['defer']);
    expect(result.options[0]?.proposedMinutes).toBeNull();
    expect(result.caveat).toContain('not medical clearance');
  });
  it('difficult-workout review offers no increase and only bounded shorter dose', () => {
    const result = options('review');
    expect(result.options.map(item => item.kind)).toEqual(['reduce', 'defer']);
    expect(result.options[0]?.proposedMinutes).toBe(32);
    expect(result.options.every(item =>
      item.proposedMinutes === null || item.proposedMinutes <= 40)).toBe(true);
    expect(result.options[0]?.explanation).toContain('not a validated rehabilitation dose');
  });
  it('unknown or invalid source duration cannot yield invented reduced minutes', () => {
    for (const minutes of [null, 0, Number.NaN, -3, 15]) {
      const result = options('review', { ...session, estimatedMinutes: minutes });
      expect(result.options.map(item => item.kind)).toEqual(['defer']);
    }
  });
  it('invalid source duration never becomes a keep-dose review option', () => {
    for (const minutes of [null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const kind of ['maintain', 'review'] as const) {
        const result = options(kind, { ...session, estimatedMinutes: minutes });
        expect(result.state).toBe('needs_review');
        expect(result.options.map(item => item.kind)).toEqual(['defer']);
        expect(result.autoAppliedCount).toBe(0);
      }
    }
  });
  it('invalid dates and missing session identities cannot be targeted', () => {
    for (const date of ['2026-02-30', '2026-11-14T12:00:00Z', 'bad']) {
      const result = options('maintain', { ...session, date });
      expect(result.state).toBe('no_session');
      expect(result.options).toEqual([]);
    }
    expect(options('maintain', { ...session, id: '  ' }).state).toBe('no_session');
    const invalidToday = buildDailySessionChoices({
      advice: advice('maintain'), nextSession: session, todayLocalDate: '2026-11-31',
    });
    expect(invalidToday.state).toBe('no_session');
    expect(invalidToday.options).toEqual([]);
  });
  it('source conflicts prohibit a fabricated 20% reduction', () => {
    const result = options('review', session, 'Reconcile training records first');
    expect(result.state).toBe('needs_review');
    expect(result.options.map(item => item.kind)).toEqual(['defer']);
  });
  it('positive feedback maintains original plan as a review choice, never adds load', () => {
    const result = options('maintain');
    expect(result.options.map(item => item.kind)).toEqual(['keep', 'defer']);
    expect(result.options[0]?.proposedMinutes).toBe(40);
    expect(result.autoAppliedCount).toBe(0);
  });
  it('missing readiness and feedback does not fabricate a reduced session', () => {
    expect(options('hold').options.map(item => item.kind)).toEqual(['defer']);
  });
  it('past, completed and skipped sessions are not targets for replanning', () => {
    for (const next of [
      null,
      { ...session, date: '2026-11-13' },
      { ...session, status: 'completed' as const },
      { ...session, status: 'skipped' as const },
    ]) {
      const result = options('review', next);
      expect(result.state).toBe('no_session');
      expect(result.options).toEqual([]);
    }
  });
  it('every offered choice requires review and never mutates the original', () => {
    const original = JSON.stringify(session);
    for (const kind of ['protect', 'review', 'hold', 'maintain'] as const) {
      const result = options(kind);
      expect(result.options.every(item => item.requiresAthleteApproval)).toBe(true);
      expect(result.autoAppliedCount).toBe(0);
      expect(result.options.every(item => item.kind !== 'reduce'
        || item.proposedMinutes! < session.estimatedMinutes)).toBe(true);
    }
    expect(JSON.stringify(session)).toBe(original);
  });
});
