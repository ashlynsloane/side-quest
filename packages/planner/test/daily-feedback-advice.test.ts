import { describe, expect, it } from 'vitest';
import { buildDailyFeedbackAdvice } from '../src/daily-feedback-advice';
import type { DailyTrainingReview } from '../src/daily-training-review';

const daily: DailyTrainingReview = {
  asOfLocalDate: '2026-11-14',
  completedCount: 1, todayPlannedCount: 1, upcomingPlannedCount: 2,
  pastUnverifiedCount: 0, pastUnverifiedIds: [],
  needsSourceReview: false,
  autoRescheduledCount: 0,
  advice: 'Synthetic fixture',
};
const evaluate = (patch: Partial<Parameters<typeof buildDailyFeedbackAdvice>[0]> = {}) =>
  buildDailyFeedbackAdvice({
    daily, readinessBand: 'steady', recentDifficulty: 'appropriate',
    activeRestriction: false, historyIncomplete: false, ...patch,
  });

describe('daily feedback advice is conservative and auditable', () => {
  it('symptoms override a strong readiness score and easy prior workout', () => {
    const result = evaluate({
      readinessBand: 'ready', recentDifficulty: 'too_easy', activeRestriction: true,
    });
    expect(result.kind).toBe('protect');
    expect(result.explanation).toContain('restriction');
  });
  it('recover readiness triggers review of recovery, not automatic prescriptions', () => {
    expect(evaluate({ readinessBand: 'recover' }).kind).toBe('protect');
  });
  it('too-hard workout and reduced readiness each prompt review', () => {
    expect(evaluate({ recentDifficulty: 'too_hard' }).kind).toBe('review');
    expect(evaluate({ readinessBand: 'reduced' }).kind).toBe('review');
  });
  it('unlinked prior training and incomplete source capture block positive conclusions', () => {
    expect(evaluate({ daily: {
      ...daily, needsSourceReview: true, pastUnverifiedCount: 1,
      pastUnverifiedIds: ['calendar:past'],
    }, readinessBand: 'ready', recentDifficulty: 'too_easy' }).kind).toBe('review');
    expect(evaluate({ historyIncomplete: true }).kind).toBe('review');
  });
  it('missing feedback does not imply readiness or progression', () => {
    const result = evaluate({ readinessBand: null, recentDifficulty: null });
    expect(result.kind).toBe('hold');
    expect(result.explanation).toContain('without inventing');
  });
  it('positive feedback alone does not authorize load increase', () => {
    const result = evaluate({ readinessBand: 'ready', recentDifficulty: 'too_easy' });
    expect(result.kind).toBe('maintain');
    expect(result.explanation).toContain('not permission to increase');
  });
  it('all paths require athlete approval and make zero automatic changes', () => {
    for (const patch of [
      {}, { activeRestriction: true }, { readinessBand: 'recover' as const },
      { recentDifficulty: 'too_hard' as const }, { historyIncomplete: true },
      { readinessBand: null, recentDifficulty: null },
    ]) {
      const result = evaluate(patch);
      expect(result.approvalRequired).toBe(true);
      expect(result.autoChangedSessions).toBe(0);
    }
  });
});
