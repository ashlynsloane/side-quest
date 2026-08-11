import { describe, expect, it } from 'vitest';

import {
  defaultRaceIntent,
  legacyPriorityForRaceIntent,
  mergeRaceIntentWithCoachStrategy,
  raceIntentToCoachStrategy,
  setRaceIntentDisciplinePriority,
  validateRaceIntent,
  type RaceIntentV2,
} from '../src/race-intent';

describe('Race Intent V2', () => {
  it('maps a normal performance goal into balanced maintenance rather than developing every sport', () => {
    const intent = defaultRaceIntent('ironman_70_3', ['swim', 'bike', 'run'], 'perform');
    expect(intent.overallObjective).toBe('strong_finish');
    expect(intent.tradeoffTolerance).toBe('preserve_balance');
    expect(intent.disciplinePriorities).toEqual({ swim: 'maintain', bike: 'maintain', run: 'maintain' });
    expect(intent.primaryDiscipline).toBeUndefined();
  });

  it('keeps explicit best-overall race intent development-oriented', () => {
    const intent = defaultRaceIntent('ironman_70_3', ['swim', 'bike', 'run'], 'race');
    expect(intent.overallObjective).toBe('best_overall');
    expect(intent.disciplinePriorities).toEqual({ swim: 'develop', bike: 'develop', run: 'develop' });
  });

  it('compiles a bike-focused 70.3 intent without prescribing sessions', () => {
    const intent: RaceIntentV2 = {
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'primary_focus', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
      disciplineTargets: { bike: { kind: 'pr' } },
    };
    const strategy = raceIntentToCoachStrategy(intent);
    expect(strategy.primaryFocus).toBe('bike');
    expect(strategy.disciplineObjectives).toEqual({ swim: 'maintain', bike: 'primary_focus', run: 'maintain' });
    expect(strategy.tradeoffTolerance).toBe('moderate_tradeoff');
    expect(strategy.racePriority).toEqual({ discipline: 'bike', objective: 'personal_best', target: undefined });
    expect(strategy).not.toHaveProperty('sessions');
  });

  it('allows a swim PR or run-focused Ironman without lowering other race disciplines below planner minimums itself', () => {
    const swim = raceIntentToCoachStrategy({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'swim',
      disciplinePriorities: { swim: 'maximize', bike: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'aggressive_specialization',
      disciplineTargets: { swim: { kind: 'pr' } },
    });
    expect(swim.primaryFocus).toBe('swim');
    expect(swim.disciplineObjectives.bike).toBe('maintain');
    expect(swim.disciplineObjectives.run).toBe('maintain');

    const run = raceIntentToCoachStrategy({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'run',
      disciplinePriorities: { swim: 'minimum_viable', bike: 'maintain', run: 'maximize' },
      tradeoffTolerance: 'aggressive_specialization',
    });
    expect(run.primaryFocus).toBe('run');
    expect(run.disciplineObjectives.swim).toBe('minimum_viable');
  });

  it('rejects two maximized disciplines and two top-focus disciplines', () => {
    const doubleMax = validateRaceIntent({
      version: 2,
      overallObjective: 'best_overall',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'maximize', run: 'maximize' },
      tradeoffTolerance: 'aggressive_specialization',
    }, ['swim', 'bike', 'run']);
    expect(doubleMax.valid).toBe(false);
    expect(doubleMax.errors).toContain('Only one discipline can be maximized at a time.');

    const twoTop = validateRaceIntent({
      version: 2,
      overallObjective: 'best_overall',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'maximize', run: 'primary_focus' },
      tradeoffTolerance: 'moderate_tradeoff',
    }, ['swim', 'bike', 'run']);
    expect(twoTop.valid).toBe(false);
    expect(twoTop.errors).toContain('Only one discipline can hold the top race-development priority at a time.');
  });

  it('moves the sole top focus when the athlete maximizes a different discipline', () => {
    const current: RaceIntentV2 = {
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'maximize', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    };
    const next = setRaceIntentDisciplinePriority(current, 'run', 'maximize');
    expect(next.primaryDiscipline).toBe('run');
    expect(next.disciplinePriorities.run).toBe('maximize');
    expect(next.disciplinePriorities.bike).toBe('develop');
    expect(validateRaceIntent(next, ['swim', 'bike', 'run']).valid).toBe(true);
  });

  it('lets an approved Strategy Coach directive override only the race-intent fields it changes', () => {
    const raceIntent: RaceIntentV2 = {
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'primary_focus', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    };
    const merged = mergeRaceIntentWithCoachStrategy(raceIntent, {
      disciplineObjectives: { run: 'develop' },
      endsAt: '2026-11-30',
    });
    expect(merged?.primaryFocus).toBe('bike');
    expect(merged?.disciplineObjectives).toEqual({ swim: 'maintain', bike: 'primary_focus', run: 'develop' });
    expect(merged?.tradeoffTolerance).toBe('moderate_tradeoff');
    expect(merged?.endsAt).toBe('2026-11-30');
  });

  it('moves an existing race maximum when Strategy Coach explicitly maximizes another discipline', () => {
    const raceIntent: RaceIntentV2 = {
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'maximize', run: 'maintain' },
      tradeoffTolerance: 'aggressive_specialization',
    };
    const merged = mergeRaceIntentWithCoachStrategy(raceIntent, {
      primaryFocus: 'run',
      disciplineObjectives: { run: 'maximize' },
    });
    expect(merged?.primaryFocus).toBe('run');
    expect(merged?.disciplineObjectives.run).toBe('maximize');
    expect(merged?.disciplineObjectives.bike).toBe('develop');
  });

  it('rejects a focus discipline that is not in the active race', () => {
    const result = validateRaceIntent({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'bike',
      disciplinePriorities: { bike: 'primary_focus', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    }, ['run']);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Primary discipline must be part of the active race goal.');
  });

  it('keeps legacy priority available for older planning surfaces', () => {
    expect(legacyPriorityForRaceIntent(defaultRaceIntent('ironman_70_3', ['swim', 'bike', 'run'], 'finish'))).toBe('finish');
    expect(legacyPriorityForRaceIntent({
      version: 2,
      overallObjective: 'placement_qualification',
      disciplinePriorities: { swim: 'develop', bike: 'develop', run: 'develop' },
      tradeoffTolerance: 'preserve_balance',
    })).toBe('race');
  });
});