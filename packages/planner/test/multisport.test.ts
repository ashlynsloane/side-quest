import { describe, expect, it } from 'vitest';
import type { PerformanceGoal, Weekday } from '@circuit/domain';
import { generateMultisportWeek, type MultisportWeekRequest } from '../src/multisport';

const availability = (minutes = 180) => ([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as Weekday[]).map((day) => ({ day, minutes, available: true }));

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
  phaseStrengthSessions: { base: 3, build: 3, peak: 2, taper: 2, race_week: 1 },
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
};

function request(overrides: Partial<MultisportWeekRequest> = {}): MultisportWeekRequest {
  return {
    goal,
    weekStartDate: '2026-08-10',
    phase: 'base',
    availability: availability(),
    fixedSessions: [],
    preferences: {
      preferredSessionsPerWeek: { swim: 3, bike: 3, run: 3, strength: 3 },
    },
    health: {
      runStatus: 'normal',
      maxHardDaysPerWeek: 3,
      maxStrengthDaysPerWeek: 3,
    },
    ...overrides,
  };
}

describe('generateMultisportWeek', () => {
  it('preserves fixed sessions and fills the remaining disciplines', () => {
    const plan = generateMultisportWeek(request({
      fixedSessions: [
        {
          id: 'tuesday-swim',
          day: 'tuesday',
          discipline: 'swim',
          title: 'Masters swim',
          durationMinutes: 60,
          timeOfDay: 'evening',
        },
        {
          id: 'saturday-long-ride',
          day: 'saturday',
          discipline: 'bike',
          title: 'Long ride',
          durationMinutes: 150,
          priority: 'key',
        },
      ],
    }));

    expect(plan.sessions.find((session) => session.sourceSessionId === 'tuesday-swim')?.ownership).toBe('fixed');
    expect(plan.sessions.find((session) => session.sourceSessionId === 'saturday-long-ride')?.ownership).toBe('fixed');
    expect(plan.sessions.filter((session) => session.discipline === 'swim')).toHaveLength(3);
    expect(plan.sessions.filter((session) => session.discipline === 'bike')).toHaveLength(3);
    expect(plan.sessions.filter((session) => session.discipline === 'run')).toHaveLength(3);
    expect(plan.sessions.filter((session) => session.discipline === 'strength')).toHaveLength(3);
  });

  it('does not generate running when running is disabled', () => {
    const plan = generateMultisportWeek(request({
      health: {
        runStatus: 'not_running',
        boneStressInjuryHistory: 'recent_or_current',
        maxHardDaysPerWeek: 3,
        maxStrengthDaysPerWeek: 3,
      },
    }));

    expect(plan.sessions.filter((session) => session.discipline === 'run')).toHaveLength(0);
    expect(plan.decisions.some((decision) => decision.includes('Running generation is disabled'))).toBe(true);
  });

  it('does not place generated strength immediately before a fixed key bike or run session', () => {
    const plan = generateMultisportWeek(request({
      fixedSessions: [
        {
          id: 'saturday-key-ride',
          day: 'saturday',
          discipline: 'bike',
          title: 'Long ride',
          durationMinutes: 150,
          priority: 'key',
        },
      ],
    }));

    const fridayStrength = plan.sessions.find((session) => session.day === 'friday' && session.discipline === 'strength');
    expect(fridayStrength).toBeUndefined();
  });

  it('marks sessions placed on explicit preference days as preferred rather than generated', () => {
    const plan = generateMultisportWeek(request({
      preferences: {
        preferredSessionsPerWeek: { swim: 1, bike: 1, run: 0, strength: 1 },
        preferredDays: { swim: ['tuesday'], bike: ['saturday'], strength: ['monday'] },
      },
      health: {
        runStatus: 'not_running',
        maxHardDaysPerWeek: 3,
        maxStrengthDaysPerWeek: 3,
      },
    }));

    expect(plan.sessions.find((session) => session.discipline === 'swim')?.ownership).toBe('preferred');
    expect(plan.sessions.find((session) => session.discipline === 'bike')?.ownership).toBe('preferred');
    expect(plan.sessions.find((session) => session.discipline === 'strength')?.ownership).toBe('preferred');
  });
});
