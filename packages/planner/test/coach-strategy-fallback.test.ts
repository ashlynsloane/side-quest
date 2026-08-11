import { describe, expect, it } from 'vitest';

import { buildDeterministicCoachTurnFrame } from '../src/coach-semantic-fallback';

describe('Strategy Coach deterministic fallback', () => {
  it('builds a bounded long-horizon draft from an explicit discipline-focus statement', () => {
    const frame = buildDeterministicCoachTurnFrame(
      'For the next four months I want cycling to be my main focus while I maintain my swim and run.',
      undefined,
      { turnId: 'strategy-1', referenceDate: '2026-08-07' },
    );

    expect(frame.intent).toBe('strategy_change');
    expect(frame.horizon).toBe('long_term');
    expect(frame.strategyChange?.primaryFocus).toBe('bike');
    expect(frame.strategyChange?.disciplineObjectives.bike).toBe('primary_focus');
    expect(frame.strategyChange?.disciplineObjectives.swim).toBe('maintain');
    expect(frame.strategyChange?.disciplineObjectives.run).toBe('maintain');
    expect(frame.strategyChange?.tradeoffTolerance).toBe('moderate_tradeoff');
    expect(frame.strategyChange?.startsAt).toBe('2026-08-07');
    expect(frame.strategyChange?.endsAt).toBe('2026-12-07');
    expect(frame.requestedChange).toBeUndefined();
  });

  it('adds a multi-turn strategy refinement to the existing structured draft', () => {
    const frame = buildDeterministicCoachTurnFrame(
      'Actually I want to develop the run too.',
      undefined,
      {
        turnId: 'strategy-2',
        referenceDate: '2026-08-07',
        strategyDraft: {
          primaryFocus: 'bike',
          disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
          tradeoffTolerance: 'moderate_tradeoff',
        },
      },
    );

    expect(frame.intent).toBe('strategy_change');
    expect(frame.strategyChange?.disciplineObjectives.run).toBe('develop');
    expect(frame.requestedChange).toBeUndefined();
  });

  it('asks which discipline wins when one turn tries to maximize two disciplines', () => {
    const frame = buildDeterministicCoachTurnFrame(
      'For this build I want to maximize the bike and run.',
      undefined,
      { turnId: 'strategy-conflict', referenceDate: '2026-08-07' },
    );

    expect(frame.intent).toBe('strategy_change');
    expect(frame.strategyChange).toBeUndefined();
    expect(frame.unresolved).toContain('single_top_focus');
    expect(frame.requestedChange).toBeUndefined();
  });

  it('can update only the strategy window when a draft already exists', () => {
    const frame = buildDeterministicCoachTurnFrame(
      'Do that until November.',
      undefined,
      {
        turnId: 'strategy-3',
        referenceDate: '2026-08-07',
        strategyDraft: {
          primaryFocus: 'bike',
          disciplineObjectives: { bike: 'primary_focus' },
        },
      },
    );

    expect(frame.intent).toBe('strategy_change');
    expect(frame.strategyChange?.endsAt).toBe('2026-11-30');
  });

  it('captures an explicit race-split priority without prescribing sessions', () => {
    const frame = buildDeterministicCoachTurnFrame(
      'For this 70.3 I care most about getting the fastest bike split I can while I maintain the swim and run.',
      undefined,
      { turnId: 'strategy-4', referenceDate: '2026-08-07' },
    );

    expect(frame.intent).toBe('strategy_change');
    expect(frame.strategyChange?.primaryFocus).toBe('bike');
    expect(frame.strategyChange?.racePriority).toEqual({ discipline: 'bike', objective: 'strong_split' });
    expect(frame.requestedChange).toBeUndefined();
  });

  it('does not turn a same-day workout focus statement into a long-term strategy', () => {
    const frame = buildDeterministicCoachTurnFrame(
      'I want to focus on the bike today.',
      undefined,
      { turnId: 'strategy-5', referenceDate: '2026-08-07' },
    );

    expect(frame.intent).not.toBe('strategy_change');
    expect(frame.strategyChange).toBeUndefined();
  });
});
