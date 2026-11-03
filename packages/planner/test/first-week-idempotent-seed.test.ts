import { describe, expect, it } from 'vitest';
import {
  firstWeekAttemptSeed,
  type FirstWeekAnswers,
} from '../../../apps/mobile/src/services/first-week-provenance';

const answers: FirstWeekAnswers = {
  goal: 'ironman_70_3', priority: 'perform', hours: '10', days: '1,3,5',
  equipment: 'home', restriction: 'back', background: 'triathlon',
  runStatus: 'not_running', injury: 'recent_bone_stress',
  strength: 'intermediate',
};

describe('idempotent initial training-week request identity', () => {
  it('creates the same opaque seed for identical answers and original week', () => {
    const first = firstWeekAttemptSeed(answers, '2026-11-09');
    const second = firstWeekAttemptSeed({ ...answers }, '2026-11-09');
    expect(second).toBe(first);
    expect(first).toMatch(/^onboarding-first-week-v2-2026-11-09-[a-f0-9]{16}$/);
    expect(first).not.toContain('recent_bone_stress');
    expect(first).not.toContain('not_running');
  });

  it('is insensitive to object key insertion order, but sensitive to changed input', () => {
    const reversed = Object.fromEntries(Object.entries(answers).reverse()) as FirstWeekAnswers;
    expect(firstWeekAttemptSeed(reversed, '2026-11-09'))
      .toBe(firstWeekAttemptSeed(answers, '2026-11-09'));
    for (const [key, value] of [
      ['goal', 'general_offseason'], ['days', '1,2,3'],
      ['injury', 'none'], ['equipment', 'full_gym'], ['runStatus', 'normal'],
    ] as Array<[keyof FirstWeekAnswers, string]>) {
      expect(firstWeekAttemptSeed({ ...answers, [key]: value }, '2026-11-09'))
        .not.toBe(firstWeekAttemptSeed(answers, '2026-11-09'));
    }
  });

  it('does not overwrite a different first-week date across calendar boundaries', () => {
    expect(firstWeekAttemptSeed(answers, '2026-11-09'))
      .not.toBe(firstWeekAttemptSeed(answers, '2026-11-16'));
  });

  it('fails closed on malformed training-week keys', () => {
    expect(() => firstWeekAttemptSeed(answers, 'today')).toThrow(/ISO training week/);
  });
});
