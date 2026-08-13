import { describe, expect, it } from 'vitest';

import {
  allocateStrengthTrainingSpaces,
} from '../src/strength-training-space-allocation';

describe('strength training space allocation invariants', () => {
  it('assigns locations without changing weekly session structure', () => {
    const sessions = [
      {
        id: 'swim-tue',
        date: '2026-08-18',
        discipline: 'swim',
        title: 'Technique swim',
        durationMinutes: 45,
        intensity: 'easy',
        recoveryCost: 2,
        lowerBodyDemand: 'low',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
      },
      {
        id: 'strength-wed',
        date: '2026-08-19',
        discipline: 'strength',
        title: 'Full-body strength',
        durationMinutes: 40,
        intensity: 'moderate',
        recoveryCost: 4,
        lowerBodyDemand: 'moderate',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
        strengthPrescription: {
          gymValue: 'high',
          lowerBodyDose: 'moderate',
        },
      },
      {
        id: 'run-fri',
        date: '2026-08-21',
        discipline: 'run',
        title: 'Easy return-to-run',
        durationMinutes: 28,
        intensity: 'easy',
        recoveryCost: 2,
        lowerBodyDemand: 'moderate',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
      },
      {
        id: 'strength-sat',
        date: '2026-08-22',
        discipline: 'strength',
        title: 'Swim-support strength',
        durationMinutes: 36,
        intensity: 'easy',
        recoveryCost: 3,
        lowerBodyDemand: 'low',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
        strengthPrescription: {
          gymValue: 'low',
          lowerBodyDose: 'light',
        },
      },
    ] as any;

    const before = sessions.map((session: any) => ({
      id: session.id,
      date: session.date,
      discipline: session.discipline,
      durationMinutes: session.durationMinutes,
      title: session.title,
    }));

    const allocated = allocateStrengthTrainingSpaces({
      sessions,
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
      preferredHomeSessions: 1,
      preferredGymSessions: 1,
      preferGymOnSwimDays: true,
    });

    const after = allocated.map((session) => ({
      id: session.id,
      date: session.date,
      discipline: session.discipline,
      durationMinutes: session.durationMinutes,
      title: session.title,
    }));

    expect(after).toEqual(before);

    expect(allocated).toHaveLength(sessions.length);

    expect(
      allocated.filter((session) => session.discipline === 'strength'),
    ).toHaveLength(2);

    expect(
      allocated.filter((session) => session.trainingEnvironment === 'gym'),
    ).toHaveLength(1);

    expect(
      allocated.filter((session) => session.trainingEnvironment === 'home'),
    ).toHaveLength(1);
  });
});
