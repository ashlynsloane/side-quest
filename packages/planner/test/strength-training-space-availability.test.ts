import { describe, expect, it } from 'vitest';
import type { WholeAthletePlannedSession } from '../src/whole-athlete-week';
import { allocateStrengthTrainingSpaces } from '../src/strength-training-space-allocation';

function strength(id: string, date: string): WholeAthletePlannedSession {
  return {
    id,
    date,
    title: id,
    discipline: 'strength',
    durationMinutes: 40,
    intensity: 'moderate',
    cardiovascularDemand: 'low',
    musculoskeletalDemand: 'moderate',
    lowerBodyDemand: 'moderate',
    upperBodyDemand: 'low',
    impact: 'low',
    technicalDemand: 'moderate',
    recoveryCost: 3,
    priority: 'recommended',
    source: 'side_quest',
    keySession: false,
    planningCommitment: 'generated',
    rationale: [],
    healthAdjusted: false,
  };
}

const sessions = [
  strength('strength-1', '2026-08-10'),
  strength('strength-2', '2026-08-12'),
  strength('strength-3', '2026-08-14'),
];

const home = { id: 'home', name: 'Home', environment: 'home' as const };
const gym = { id: 'gym', name: 'Gym', environment: 'gym' as const };

describe('strength training space availability', () => {
  it('supports athletes who train entirely at home', () => {
    const result = allocateStrengthTrainingSpaces({ sessions, homeSpace: home });
    expect(result.filter((session) => session.discipline === 'strength').every((session) => session.trainingEnvironment === 'home')).toBe(true);
  });

  it('supports athletes who train entirely at the gym', () => {
    const result = allocateStrengthTrainingSpaces({ sessions, gymSpace: gym });
    expect(result.filter((session) => session.discipline === 'strength').every((session) => session.trainingEnvironment === 'gym')).toBe(true);
  });

  it('does not invent a location when no training space is configured', () => {
    const result = allocateStrengthTrainingSpaces({ sessions });
    expect(result.every((session) => session.trainingEnvironment === undefined)).toBe(true);
  });

  it('allows an athlete to explicitly choose an all-gym split even when home exists', () => {
    const result = allocateStrengthTrainingSpaces({
      sessions,
      homeSpace: home,
      gymSpace: gym,
      preferredHomeSessions: 0,
      preferredGymSessions: 3,
    });
    expect(result.filter((session) => session.discipline === 'strength').every((session) => session.trainingEnvironment === 'gym')).toBe(true);
  });

  it('allows an athlete to explicitly choose an all-home split even when a gym exists', () => {
    const result = allocateStrengthTrainingSpaces({
      sessions,
      homeSpace: home,
      gymSpace: gym,
      preferredHomeSessions: 3,
      preferredGymSessions: 0,
    });
    expect(result.filter((session) => session.discipline === 'strength').every((session) => session.trainingEnvironment === 'home')).toBe(true);
  });
});
