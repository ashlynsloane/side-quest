import { describe, expect, it } from 'vitest';
import type { PerformanceGoal, Weekday } from '@circuit/domain';
import {
  decideMultisportGovernance,
  generateGovernedMultisportWeek,
} from '../src/multisport-governance';

const goal: PerformanceGoal = {
  id: 'goal_70_3',
  type: 'ironman_70_3',
  name: 'December 70.3',
  eventDate: '2026-12-13',
  weeksUntilEvent: 18,
  disciplines: ['swim', 'bike', 'run'],
  priority: 'perform',
  sessionsPerWeek: 3,
  defaultSessionMinutes: 48,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
};

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as Weekday[];
const availability = days.map((day) => ({ day, minutes: 180, available: true }));

const normalCapacity = {
  totalWeeklyHours: 10,
  currentEnduranceHours: 6,
  runStatus: 'normal' as const,
  maxRunMilesLast12Weeks: 20,
  boneStressInjuryHistory: 'none' as const,
  swimProficiency: 'average' as const,
  bikeProficiency: 'average' as const,
  runProficiency: 'average' as const,
  strengthExperience: 'intermediate' as const,
};

describe('multisport governance', () => {
  it('does not invent return-to-run sessions with recent bone-stress history and no run baseline', () => {
    const capacity = {
      ...normalCapacity,
      runStatus: 'return_to_run' as const,
      maxRunMilesLast12Weeks: 0,
      boneStressInjuryHistory: 'recent_or_current' as const,
    };
    const governance = decideMultisportGovernance({ ...goal, capacityProfile: capacity }, { capacity });
    expect(governance.runMode).toBe('protocol_only');
    expect(governance.maxGeneratedRunSessions).toBe(0);

    const week = generateGovernedMultisportWeek({
      goal: { ...goal, capacityProfile: capacity },
      weekStartDate: '2026-08-10',
      phase: 'base',
      availability,
      health: { runStatus: 'return_to_run', boneStressInjuryHistory: 'recent_or_current', maxHardDaysPerWeek: 3, maxStrengthDaysPerWeek: 3 },
    }, { capacity });

    expect(week.sessions.filter((session) => session.discipline === 'run' && session.ownership !== 'fixed')).toHaveLength(0);
    expect(week.warnings.join(' ')).toContain('protocol-only');
  });

  it('preserves an explicitly fixed return-to-run session without creating extra runs', () => {
    const capacity = {
      ...normalCapacity,
      runStatus: 'return_to_run' as const,
      maxRunMilesLast12Weeks: 0,
      boneStressInjuryHistory: 'recent_or_current' as const,
    };
    const week = generateGovernedMultisportWeek({
      goal: { ...goal, capacityProfile: capacity },
      weekStartDate: '2026-08-10',
      phase: 'base',
      availability,
      fixedSessions: [{ id: 'prescribed-rtr', day: 'wednesday', discipline: 'run', title: 'Prescribed return-to-run', durationMinutes: 20, intensity: 'easy', priority: 'support' }],
      health: { runStatus: 'return_to_run', boneStressInjuryHistory: 'recent_or_current', maxHardDaysPerWeek: 3, maxStrengthDaysPerWeek: 3 },
    }, { capacity });

    const runs = week.sessions.filter((session) => session.discipline === 'run');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.ownership).toBe('fixed');
    expect(runs[0]?.durationMinutes).toBe(20);
  });

  it('caps generic return-to-run exposure when an explicit protocol is available', () => {
    const capacity = {
      ...normalCapacity,
      runStatus: 'return_to_run' as const,
      maxRunMilesLast12Weeks: 8,
      boneStressInjuryHistory: 'remote' as const,
    };
    const week = generateGovernedMultisportWeek({
      goal: { ...goal, capacityProfile: capacity },
      weekStartDate: '2026-08-10',
      phase: 'base',
      availability,
      health: { runStatus: 'return_to_run', boneStressInjuryHistory: 'remote', maxHardDaysPerWeek: 3, maxStrengthDaysPerWeek: 3 },
    }, { capacity, clinicianDefinedReturnToRun: true });

    const runs = week.sessions.filter((session) => session.discipline === 'run' && session.ownership !== 'fixed');
    expect(runs.length).toBeLessThanOrEqual(2);
    expect(runs.every((session) => session.durationMinutes <= 30)).toBe(true);
    expect(runs.every((session) => session.intensity === 'easy')).toBe(true);
    if (runs.length === 2) {
      const hours = Math.abs(new Date(`${runs[0]!.date}T12:00:00Z`).getTime() - new Date(`${runs[1]!.date}T12:00:00Z`).getTime()) / 3_600_000;
      expect(hours).toBeGreaterThanOrEqual(48);
    }
  });

  it('suppresses progression when menstrual or energy-availability recovery is the priority', () => {
    const governance = decideMultisportGovernance({ ...goal, capacityProfile: normalCapacity }, {
      capacity: normalCapacity,
      energyAvailability: 'recovery_priority',
      menstrualRecoveryPriority: true,
    });
    expect(governance.progressionAllowed).toBe(false);
    expect(governance.minimumCompleteRestDays).toBeGreaterThanOrEqual(1);
    expect(governance.allowCompensatoryExercise).toBe(false);
    expect(governance.maxHardDays).toBeLessThanOrEqual(2);
  });

  it('lets overwhelming life stress or depleted mental energy override progression', () => {
    const governance = decideMultisportGovernance({ ...goal, capacityProfile: normalCapacity }, {
      capacity: normalCapacity,
      lifeStress: 'overwhelming',
      mentalEnergy: 'depleted',
    });
    expect(governance.progressionAllowed).toBe(false);
    expect(governance.maxHardDays).toBe(1);
    expect(governance.minimumCompleteRestDays).toBe(2);
  });

  it('never removes fixed commitments to manufacture recovery space', () => {
    const week = generateGovernedMultisportWeek({
      goal: { ...goal, capacityProfile: normalCapacity },
      weekStartDate: '2026-08-10',
      phase: 'base',
      availability,
      fixedSessions: [
        { id: 'masters', day: 'tuesday', discipline: 'swim', title: 'Masters swim', durationMinutes: 60 },
        { id: 'long-ride', day: 'saturday', discipline: 'bike', title: 'Long ride', durationMinutes: 150, priority: 'key' },
      ],
      health: { runStatus: 'normal', maxHardDaysPerWeek: 3, maxStrengthDaysPerWeek: 3 },
    }, { capacity: normalCapacity, athleteRequestedRest: true });

    expect(week.sessions.some((session) => session.sourceSessionId === 'masters')).toBe(true);
    expect(week.sessions.some((session) => session.sourceSessionId === 'long-ride')).toBe(true);
  });
});
