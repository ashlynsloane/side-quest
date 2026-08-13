import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { applyApprovedFrequencySuppression } from '../src/frequency-suppression';
import { allocateStrengthTrainingSpaces } from '../src/strength-training-space-allocation';
import { resolveWeeklyFrequencyContract } from '../src/weekly-frequency-contract';
import { buildWholeAthleteWeek } from '../src/whole-athlete-week-block';
import type { WholeAthletePlannedSession } from '../src/whole-athlete-week';
import type { UnifiedTrainingSession } from '../src/unified-training';

function athleteSession(
  id: string,
  date: string,
  discipline: UnifiedTrainingSession['discipline'],
  durationMinutes: number,
  options: {
    intensity?: UnifiedTrainingSession['intensity'];
    priority?: UnifiedTrainingSession['priority'];
    keySession?: boolean;
    title?: string;
  } = {},
): UnifiedTrainingSession {
  const intensity = options.intensity ?? 'easy';
  const hard = intensity === 'hard' || intensity === 'max';

  return {
    id,
    date,
    title: options.title ?? id,
    discipline,
    durationMinutes,
    intensity,
    cardiovascularDemand: hard ? 'high' : 'low',
    musculoskeletalDemand:
      discipline === 'run' || discipline === 'strength'
        ? 'moderate'
        : 'low',
    lowerBodyDemand:
      discipline === 'bike'
      || discipline === 'run'
      || discipline === 'strength'
        ? 'moderate'
        : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 4 : 1,
    priority: options.priority ?? 'required',
    source: 'manual',
    keySession: options.keySession ?? hard,
  };
}

function count(
  sessions: WholeAthletePlannedSession[],
  discipline: 'swim' | 'bike' | 'run' | 'strength',
): number {
  return sessions.filter((session) => session.discipline === discipline).length;
}

describe('weekly planning priority scenarios', () => {
  it('uses the canonical triathlon rhythm for an unconstrained first week', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      plannedStrengthSessions: 0,
    });

    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 1200,
      goalType: 'ironman_70_3',
      phase: 'base',
      frequencyTargets: {
        ...contract,
        strength: { min: 0, preferred: 0, max: 0 },
      },
      preferredRestDayOffset: 0,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const weekday = (date: string) => {
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      return (day + 6) % 7;
    };

    const days = (discipline: 'swim' | 'bike' | 'run') =>
      plan.sessions
        .filter((session) => session.discipline === discipline)
        .map((session) => weekday(session.date))
        .sort((a, b) => a - b);

    expect(plan.recoveryDayDate).toBe('2026-08-10');
    expect(days('swim')).toEqual([1, 3, 4]);
    expect(days('bike')).toEqual([1, 3, 5]);
    expect(days('run')).toEqual([2, 4, 6]);
  });


  it('preserves Monday Masters as a low-load recovery anchor and keeps return-to-run and frequency contracts intact', () => {
    const masters = athleteSession(
      'masters-monday',
      '2026-08-10',
      'swim',
      60,
      {
        title: 'Masters swim',
        priority: 'required',
      },
    );

    const groupRide = athleteSession(
      'group-ride-saturday',
      '2026-08-15',
      'bike',
      120,
      {
        title: 'Saturday group ride',
        intensity: 'moderate',
        priority: 'required',
        keySession: true,
      },
    );

    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      fixedCounts: {
        swim: 1,
        bike: 1,
      },
      plannedStrengthSessions: 3,
    });

    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 1200,
      goalType: 'ironman_70_3',
      phase: 'base',
      fixedSessions: [masters, groupRide],
      frequencyTargets: contract,
      returnToRun: true,
      preferredRestDayOffset: 0,
      health: {
        energyAvailability: 'adequate',
        boneStress: 'recent',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    // Explicit athlete commitments outrank defaults.
    expect(
      plan.sessions.find((session) => session.id === 'masters-monday')
        ?.planningCommitment,
    ).toBe('fixed');

    expect(
      plan.sessions.find((session) => session.id === 'group-ride-saturday')
        ?.planningCommitment,
    ).toBe('fixed');

    // A single low-cost fixed Masters session can occupy the preferred
    // recovery anchor without forcing an entirely separate blank day.
    expect(plan.recoveryDayDate).toBe('2026-08-10');

    // Side Quest does not pile generated work onto that low-load anchor.
    expect(
      plan.sessions.some(
        (session) =>
          session.date === '2026-08-10'
          && session.planningCommitment === 'generated',
      ),
    ).toBe(false);

    // Weekly frequency contract survives placement.
    expect(count(plan.sessions, 'bike')).toBe(3);
    expect(count(plan.sessions, 'run')).toBe(2);
    expect(count(plan.sessions, 'strength')).toBe(3);

    // Return-to-run remains separated.
    const runDates = plan.sessions
      .filter((session) => session.discipline === 'run')
      .map((session) => Date.parse(`${session.date}T12:00:00Z`))
      .sort((a, b) => a - b);

    expect(runDates).toHaveLength(2);
    expect((runDates[1]! - runDates[0]!) / 86_400_000)
      .toBeGreaterThanOrEqual(2);
  });

  it('allocates a three-session strength week as exactly two Home and one Gym', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      plannedStrengthSessions: 3,
    });

    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 1200,
      goalType: 'ironman_70_3',
      phase: 'base',
      frequencyTargets: contract,
      returnToRun: true,
      preferredRestDayOffset: 0,
      health: {
        energyAvailability: 'adequate',
        boneStress: 'recent',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const allocated = allocateStrengthTrainingSpaces({
      sessions: plan.sessions,
      homeSpace: {
        id: 'home',
        name: 'Home',
        environment: 'home',
      },
      gymSpace: {
        id: 'gym',
        name: 'Gym',
        environment: 'gym',
      },
      preferredHomeSessions: 2,
      preferredGymSessions: 1,
      preferGymOnSwimDays: true,
    });

    const strength = allocated.filter(
      (session) => session.discipline === 'strength',
    );

    expect(strength).toHaveLength(3);

    expect(
      strength.filter(
        (session) => session.trainingEnvironment === 'home',
      ),
    ).toHaveLength(2);

    expect(
      strength.filter(
        (session) => session.trainingEnvironment === 'gym',
      ),
    ).toHaveLength(1);
  });

  it('does not repay an athlete-approved suppressed run with extra bike volume', () => {
    const strengthSessions = [
      athleteSession(
        'strength-1',
        '2026-08-12',
        'strength',
        40,
        { title: 'Strength 1', priority: 'required' },
      ),
      athleteSession(
        'strength-2',
        '2026-08-14',
        'strength',
        40,
        { title: 'Strength 2', priority: 'required' },
      ),
      athleteSession(
        'strength-3',
        '2026-08-15',
        'strength',
        40,
        { title: 'Strength 3', priority: 'required' },
      ),
    ];

    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      fixedCounts: {
        strength: 3,
      },
      plannedStrengthSessions: 3,
    });

    const suppressed = applyApprovedFrequencySuppression(
      contract,
      {
        swim: 2,
        bike: 4,
        run: 3,
        strength: 3,
      },
      {
        run: 1,
      },
    );

    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 1200,
      goalType: 'ironman_70_3',
      phase: 'base',
      fixedSessions: strengthSessions,
      frequencyTargets: suppressed,
      preferredRestDayOffset: 0,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    // The athlete-approved run reduction is discipline-local.
    expect(count(plan.sessions, 'run')).toBe(2);

    // Bike does not grow to compensate for the removed run.
    expect(count(plan.sessions, 'bike')).toBe(3);

    // Prebuilt Side Quest strength sessions are fixed planner inputs,
    // exactly as they are in the mobile production pipeline.
    expect(count(plan.sessions, 'strength')).toBe(3);
    expect(
      strengthSessions.every((strength) =>
        plan.sessions.some(
          (session) =>
            session.id === strength.id
            && session.planningCommitment === 'fixed',
        ),
      ),
    ).toBe(true);
  });

  it('keeps space assignment above outing convenience in the final reconciliation pipeline', () => {
    const runtime = readFileSync(
      new URL(
        '../../../apps/mobile/src/services/whole-athlete-plan-runtime.ts',
        import.meta.url,
      ),
      'utf8',
    );

    const outings = readFileSync(
      new URL(
        '../../../apps/mobile/src/services/training-outings.ts',
        import.meta.url,
      ),
      'utf8',
    );

    const spaceIndex = runtime.indexOf(
      'applyTrainingSpacesToGeneratedBlock(generated)',
    );
    const outingIndex = runtime.indexOf(
      'applyTrainingOutingsToGeneratedBlock(',
    );

    expect(spaceIndex).toBeGreaterThanOrEqual(0);
    expect(outingIndex).toBeGreaterThan(spaceIndex);

    // A Home-assigned workout is not eligible for gym facility stacking.
    expect(outings).toContain(
      "if (strength.trainingEnvironment !== 'gym') return false;",
    );
  });
});
