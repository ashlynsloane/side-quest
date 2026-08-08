import { describe, expect, it } from 'vitest';

import { emptyCoachDialogueState, reduceCoachDialogue } from '../src/coach-dialogue-engine';
import { validateCoachTurnFrame, type CoachTurnFrameV2 } from '../src/coach-semantic-frame';

function strategyFrame(overrides: Partial<CoachTurnFrameV2> = {}): CoachTurnFrameV2 {
  return {
    version: 2,
    turnId: 'strategy-1',
    intent: 'strategy_change',
    horizon: 'long_term',
    events: [],
    symptoms: [],
    strategyChange: {
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    },
    constraints: [],
    unresolved: [],
    confidence: 0.9,
    source: 'test_fixture',
    ...overrides,
  };
}

describe('Strategy Coach semantic draft', () => {
  it('requires strategy details or an explicit unresolved slot', () => {
    const result = validateCoachTurnFrame(strategyFrame({ strategyChange: undefined, unresolved: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('strategy_change requires meaningful strategy details or unresolved fields.');
  });

  it('accepts discipline-specific long-horizon priorities', () => {
    const result = validateCoachTurnFrame(strategyFrame());
    expect(result.valid).toBe(true);
    expect(result.frame?.strategyChange?.primaryFocus).toBe('bike');
  });

  it('merges multi-turn strategy refinements instead of replacing the whole draft', () => {
    const first = reduceCoachDialogue(emptyCoachDialogueState(), strategyFrame());
    const second = reduceCoachDialogue(first.state, strategyFrame({
      turnId: 'strategy-2',
      strategyChange: {
        disciplineObjectives: { run: 'develop' },
        endsAt: '2026-11-30',
        tradeoffTolerance: 'preserve_balance',
      },
    }));

    expect(second.state.strategyDraft?.primaryFocus).toBe('bike');
    expect(second.state.strategyDraft?.disciplineObjectives).toEqual({
      bike: 'primary_focus',
      swim: 'maintain',
      run: 'develop',
    });
    expect(second.state.strategyDraft?.endsAt).toBe('2026-11-30');
    expect(second.state.strategyDraft?.tradeoffTolerance).toBe('preserve_balance');
    expect(second.directive.strategyChange).toEqual(second.state.strategyDraft);
  });

  it('replaces the previous top focus when a later turn maximizes a different discipline', () => {
    const first = reduceCoachDialogue(emptyCoachDialogueState(), strategyFrame({
      strategyChange: {
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'maximize', swim: 'maintain', run: 'maintain' },
      },
    }));
    const second = reduceCoachDialogue(first.state, strategyFrame({
      turnId: 'strategy-2',
      strategyChange: {
        primaryFocus: 'run',
        disciplineObjectives: { run: 'maximize' },
      },
    }));

    expect(second.state.strategyDraft?.primaryFocus).toBe('run');
    expect(second.state.strategyDraft?.disciplineObjectives.run).toBe('maximize');
    expect(second.state.strategyDraft?.disciplineObjectives.bike).toBe('develop');
  });

  it('creates a focused clarification for an unresolved top-focus conflict', () => {
    const transition = reduceCoachDialogue(emptyCoachDialogueState(), strategyFrame({
      strategyChange: undefined,
      unresolved: ['single_top_focus'],
    }));
    expect(transition.directive.clarification?.prompt).toContain('Only one discipline can be the top focus');
  });

  it('rejects an invalid strategy date window', () => {
    const result = validateCoachTurnFrame(strategyFrame({
      strategyChange: {
        startsAt: '2026-12-01',
        endsAt: '2026-10-01',
        disciplineObjectives: { bike: 'primary_focus' },
      },
    }));
    expect(result.valid).toBe(false);
  });
});
