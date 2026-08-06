import { describe, expect, it } from 'vitest';
import { evaluateGoalSpecificCoaching, getGoalSpecificProfile } from '../src/goal-specific-coaching';

describe('goal-specific coaching', () => {
  it('prioritizes bike durability and preserves strength for a 70.3', () => {
    const profile = getGoalSpecificProfile('half_ironman');
    expect(profile.disciplinePriorities.find((item) => item.discipline === 'bike')?.priority).toBe(100);
    expect(profile.strengthRules.join(' ')).toContain('Preserve direct strength');
  });

  it('does not enforce generic run frequency during return to run', () => {
    const result = evaluateGoalSpecificCoaching({
      generatedAt: '2026-07-29T00:00:00Z', goal: 'half_ironman', weeksUntilEvent: 18,
      currentPhase: 'base', sessions: [], currentlyRunning: false, returnToRun: true,
    });
    expect(result.findings.some((item) => item.category === 'safety' && item.message.includes('not enforced'))).toBe(true);
  });

  it('flags missing specificity inside the goal window', () => {
    const result = evaluateGoalSpecificCoaching({
      generatedAt: '2026-07-29T00:00:00Z', goal: 'marathon', weeksUntilEvent: 8,
      currentPhase: 'build', sessions: [], currentlyRunning: true,
    });
    expect(result.findings.some((item) => item.findingId === 'specificity:missing')).toBe(true);
    expect(result.requiresAthleteApproval).toBe(true);
  });

  it('includes explicit non-compensation safeguards', () => {
    const result = evaluateGoalSpecificCoaching({
      generatedAt: '2026-07-29T00:00:00Z', goal: 'trail_100k', currentPhase: 'base', sessions: [],
    });
    expect(result.safeguards.join(' ')).toContain('compensatory exercise');
  });
});
