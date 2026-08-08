import { describe, expect, it } from 'vitest';

import {
  applyCoachStrategyToFrequencyTargets,
  buildCoachStrategyPlanningPolicy,
  strategyIsActiveForWeek,
  type StrategyFrequencyPlan,
} from '../src/coach-strategy-policy';
import type { CoachSemanticStrategyChange } from '../src/coach-semantic-frame';

const triathlonBase: StrategyFrequencyPlan = {
  swim: { min: 2, preferred: 3, max: 4 },
  bike: { min: 2, preferred: 3, max: 5 },
  run: { min: 2, preferred: 3, max: 5 },
  strength: { min: 2, preferred: 2, max: 3 },
};

function strategy(overrides: Partial<CoachSemanticStrategyChange> = {}): CoachSemanticStrategyChange {
  return {
    disciplineObjectives: {},
    ...overrides,
  };
}

describe('Coach strategy planning policy', () => {
  it('gives a primary discipline first claim on discretionary frequency without exceeding configured maximums', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
        tradeoffTolerance: 'moderate_tradeoff',
      }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'build',
    });
    const adjusted = applyCoachStrategyToFrequencyTargets(triathlonBase, policy, {
      bike: { sessionsPerWeek: 3 },
      swim: { sessionsPerWeek: 2 },
      run: { sessionsPerWeek: 3 },
    });

    expect(policy.disciplinePriority[0]).toBe('bike');
    expect(policy.progressionPriority[0]).toBe('bike_volume');
    expect(adjusted.bike).toEqual({ min: 2, preferred: 4, max: 5 });
    expect(adjusted.swim).toEqual({ min: 2, preferred: 2, max: 4 });
    expect(adjusted.run).toEqual({ min: 2, preferred: 3, max: 5 });
  });

  it('never lets aggressive specialization drop race disciplines below their configured minimums', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'bike', disciplineObjectives: { bike: 'maximize' }, tradeoffTolerance: 'aggressive_specialization' }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'build',
    });
    const adjusted = applyCoachStrategyToFrequencyTargets(triathlonBase, policy);

    expect(policy.objectives.swim).toBe('minimum_viable');
    expect(policy.objectives.run).toBe('minimum_viable');
    expect(adjusted.swim?.preferred).toBe(adjusted.swim?.min);
    expect(adjusted.run?.preferred).toBe(adjusted.run?.min);
    expect(adjusted.swim?.min).toBe(2);
    expect(adjusted.run?.min).toBe(2);
  });

  it('caps maximize at the planner maximum instead of manufacturing unlimited sessions', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'bike', disciplineObjectives: { bike: 'maximize' } }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'build',
    });
    const adjusted = applyCoachStrategyToFrequencyTargets(triathlonBase, policy, { bike: { sessionsPerWeek: 5 } });
    expect(adjusted.bike).toEqual({ min: 2, preferred: 5, max: 5 });
  });

  it('does not create progression priorities during taper or race week', () => {
    const taper = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'run', disciplineObjectives: { run: 'maximize' } }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'taper',
    });
    const raceWeek = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'run', disciplineObjectives: { run: 'maximize' } }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'race_week',
    });
    expect(taper.progressionPriority).toEqual([]);
    expect(raceWeek.progressionPriority).toEqual([]);
    expect(taper.rationale.join(' ')).toContain('freshness');
  });

  it('keeps preserve-balance disciplines unchanged when the athlete did not explicitly trade them away', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'swim', disciplineObjectives: { swim: 'develop' }, tradeoffTolerance: 'preserve_balance' }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'base',
    });
    const adjusted = applyCoachStrategyToFrequencyTargets(triathlonBase, policy);
    expect(adjusted.bike).toEqual(triathlonBase.bike);
    expect(adjusted.run).toEqual(triathlonBase.run);
    expect(adjusted.swim?.preferred).toBe(4);
  });

  it('warns when a non-goal discipline is requested as primary rather than silently displacing the active goal', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'swim', disciplineObjectives: { swim: 'maximize' } }),
      goalType: 'road_half_marathon',
      goalDisciplines: ['run'],
      phase: 'build',
    });
    expect(policy.warnings.join(' ')).toContain('not part of the active performance goal');
    expect(policy.disciplinePriority).not.toContain('swim');
  });

  it('keeps strength specialization subordinate to race-specific work late in the cycle', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ primaryFocus: 'strength', disciplineObjectives: { strength: 'maximize' } }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'peak',
    });
    expect(policy.warnings.join(' ')).toContain('subordinate to race-specific endurance work');
  });

  it('activates and expires a strategy by its date window', () => {
    const scoped = strategy({ startsAt: '2026-08-10', endsAt: '2026-09-20', disciplineObjectives: { bike: 'develop' } });
    expect(strategyIsActiveForWeek(scoped, '2026-08-03')).toBe(false);
    expect(strategyIsActiveForWeek(scoped, '2026-08-10')).toBe(true);
    expect(strategyIsActiveForWeek(scoped, '2026-09-21')).toBe(false);
  });

  it('marks a meaningful strategy as athlete-approval territory', () => {
    const policy = buildCoachStrategyPlanningPolicy({
      strategy: strategy({ disciplineObjectives: { bike: 'develop' } }),
      goalType: 'ironman_70_3',
      goalDisciplines: ['swim', 'bike', 'run'],
      phase: 'base',
    });
    expect(policy.requiresAthleteApproval).toBe(true);
  });
});
