import { describe, expect, it } from 'vitest';
import {
  attachDecisionOutcome,
  createCoachDecisionRecord,
  deriveDecisionLearning,
  excludeDecisionFromLearning,
  recordAthleteDecision,
} from '../src';

const base = () => createCoachDecisionRecord({
  decisionId: 'decision-1', athleteId: 'athlete-1', createdAt: '2026-07-29T10:00:00Z', source: 'recovery_guardrail',
  context: { capturedAt: '2026-07-29T10:00:00Z', athleteStateSummary: ['Fatigue elevated'], constraints: [], protectedSessionIds: ['ride-1'] },
  options: [
    { optionId: 'move', label: 'Move strength', constraintViolations: [], protectedSessionImpact: [], rationale: ['More recovery'] },
    { optionId: 'shorten', label: 'Shorten strength', constraintViolations: [], protectedSessionImpact: [], rationale: ['Preserve routine'] },
  ],
  recommendedOptionId: 'move',
  explanation: { headline: 'Adjust strength before key ride', mainReasons: ['Recovery'], confidence: 'moderate', safeguards: [] },
});

describe('coach decision ledger', () => {
  it('preserves captured context and records an athlete override without calling it failure', () => {
    const input = base();
    const recorded = recordAthleteDecision(input, { selectedAt: '2026-07-29T10:05:00Z', kind: 'modified', selectedOptionId: 'shorten', athleteReason: 'Friday evenings do not work.' });
    const outcome = attachDecisionOutcome(recorded, { observedAt: '2026-07-31', workoutCompleted: true, protectedSessionCompleted: true, notes: [] });
    const learning = deriveDecisionLearning(outcome, 3);
    expect(learning.observedOptionId).toBe('shorten');
    expect(learning.preferenceSignals.join(' ')).toContain('Friday evenings');
    expect(learning.safeguards.join(' ')).toContain('Unselected options');
    expect(input.selection).toBeUndefined();
  });

  it('does not fabricate outcome evidence for unselected options', () => {
    const selected = recordAthleteDecision(base(), { selectedAt: 'x', kind: 'accepted', selectedOptionId: 'move' });
    const outcome = attachDecisionOutcome(selected, { observedAt: 'y', workoutCompleted: true, notes: [] });
    const learning = deriveDecisionLearning(outcome, 1);
    expect(learning.observedOptionId).toBe('move');
    expect(learning.observedOptionId).not.toBe('shorten');
  });

  it('excludes athlete-designated decisions from learning', () => {
    const excluded = excludeDecisionFromLearning(base(), 'Unusual travel week');
    expect(excluded.reviewState).toBe('excluded_from_learning');
    expect(deriveDecisionLearning(excluded, 20).eligibleForLearning).toBe(false);
  });
});
